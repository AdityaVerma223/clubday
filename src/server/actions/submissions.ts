"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/db";
import { activities, attendance, auditLog, clubMembers, clubStaff, clubs, evaluations, notifications, submissions, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { can } from "@/lib/policy";
import { env } from "@/env";

const linkSubmissionInput = z.object({ activityId: z.string().uuid(), url: z.url().max(2048) });
const evaluationInput = z.object({
  submissionId: z.string().uuid(),
  content: z.number().int().min(0).max(5),
  presentation: z.number().int().min(0).max(5),
  participation: z.number().int().min(0).max(5),
  comment: z.string().trim().max(1000).optional(),
});
const activityIdInput = z.object({ activityId: z.string().uuid() });
const uploadInput = z.object({ activityId: z.string().uuid(), fileName: z.string().trim().min(1).max(180), mimeType: z.string().min(1).max(120), sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024) });
const uploadedFileInput = uploadInput.extend({ fileKey: z.string().min(1).max(500) });
const allowedFiles: Record<string, string[]> = {
  pdf: ["application/pdf"],
  ppt: ["application/vnd.ms-powerpoint", "application/octet-stream"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
};
const submissionBucket = "clubday-submissions";
const gracePeriodMs = 2 * 60 * 60 * 1000;

async function currentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Sign in to continue.");
  return session;
}

export async function openActivitySubmissions(input: z.infer<typeof activityIdInput>) {
  const { activityId } = activityIdInput.parse(input);
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, activityId) });
  if (!activity) throw new Error("Activity not found.");
  const session = await currentSession();
  if (session.user.role !== "admin") {
    if (session.user.role !== "coordinator") throw new Error("Only this club's coordinator can open submissions.");
    const assignment = await db.query.clubStaff.findFirst({
      where: and(eq(clubStaff.clubId, activity.clubId), eq(clubStaff.userId, session.user.id), eq(clubStaff.role, "coordinator")),
    });
    if (!assignment) throw new Error("You are not assigned to this club.");
  }
  if (!await can({ action: "activity.manage", resource: { type: "activity", id: activityId }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You are not allowed to open submissions for this activity.");
  if (activity.status !== "check_in_closed") throw new Error("Close check-in before opening submissions.");
  await db.update(activities).set({ status: "submissions_open" }).where(eq(activities.id, activityId));
  return { success: true };
}

export async function submitActivityLink(input: z.infer<typeof linkSubmissionInput>) {
  const values = linkSubmissionInput.parse(input);
  const session = await currentSession();
  if (session.user.role !== "student") throw new Error("Only students can submit activity work.");
  if (!await can({ action: "submission.submit", resource: { type: "activity", id: values.activityId }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You are not allowed to submit to this activity.");
  const url = new URL(values.url);
  if (!(["http:", "https:"].includes(url.protocol))) throw new Error("Use a secure http or https link.");
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, values.activityId) });
  if (!activity || !["submissions_open", "evaluating"].includes(activity.status)) throw new Error("Submissions are not open for this activity.");
  const submittedAt = new Date();
  if (submittedAt.getTime() > activity.submissionDeadline.getTime() + gracePeriodMs) throw new Error("The submission window closed two hours after the deadline.");
  const [member, checkin] = await Promise.all([
    db.query.clubMembers.findFirst({ where: and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.userId, session.user.id), eq(clubMembers.status, "approved")) }),
    db.query.attendance.findFirst({ where: and(eq(attendance.activityId, activity.id), eq(attendance.userId, session.user.id), eq(attendance.status, "present")) }),
  ]);
  if (!member || !checkin) throw new Error("You must be an approved member who checked in to submit work.");
  const late = submittedAt > activity.submissionDeadline;
  await db.insert(submissions).values({
    activityId: activity.id,
    userId: session.user.id,
    kind: "link",
    url: url.toString(),
    late,
    submittedAt,
  }).onConflictDoUpdate({
    target: [submissions.activityId, submissions.userId],
    set: { kind: "link", url: url.toString(), fileKey: null, fileName: null, mimeType: null, sizeBytes: null, late, submittedAt, updatedAt: submittedAt },
  });
  return { success: true, late };
}

export async function createSubmissionUpload(input: z.infer<typeof uploadInput>) {
  const values = uploadInput.parse(input);
  const extension = values.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedFiles[extension]?.includes(values.mimeType)) throw new Error("Upload a PDF, PPT, PPTX, PNG, or JPG file.");
  const session = await currentSession();
  if (session.user.role !== "student") throw new Error("Only students can submit activity work.");
  if (!await can({ action: "submission.submit", resource: { type: "activity", id: values.activityId }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You are not allowed to submit to this activity.");
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, values.activityId) });
  if (!activity || !["submissions_open", "evaluating"].includes(activity.status)) throw new Error("Submissions are not open for this activity.");
  if (Date.now() > activity.submissionDeadline.getTime() + gracePeriodMs) throw new Error("The submission window closed two hours after the deadline.");
  const path = `${activity.id}/${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/upload/sign/${submissionBucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not prepare upload. Check that the private clubday-submissions Storage bucket exists.");
  const signed = await response.json() as { url?: string; token?: string };
  if (!signed.url || !signed.token) throw new Error("Storage did not return a signed upload URL.");
  return { uploadUrl: new URL(signed.url, env.SUPABASE_URL).toString(), token: signed.token, fileKey: path, bucket: submissionBucket, fileName: values.fileName, mimeType: values.mimeType, sizeBytes: values.sizeBytes };
}

export async function saveUploadedSubmission(input: z.infer<typeof uploadedFileInput>) {
  const values = uploadedFileInput.parse(input);
  const session = await currentSession();
  if (session.user.role !== "student") throw new Error("Only students can submit activity work.");
  if (!values.fileKey.startsWith(`${values.activityId}/${session.user.id}/`)) throw new Error("That upload does not belong to your account and activity.");
  const extension = values.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedFiles[extension]?.includes(values.mimeType)) throw new Error("The uploaded file type is not allowed.");
  if (!await can({ action: "submission.submit", resource: { type: "activity", id: values.activityId }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You are not allowed to submit to this activity.");
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, values.activityId) });
  if (!activity || !["submissions_open", "evaluating"].includes(activity.status)) throw new Error("Submissions are not open for this activity.");
  const submittedAt = new Date();
  if (submittedAt.getTime() > activity.submissionDeadline.getTime() + gracePeriodMs) throw new Error("The submission window closed two hours after the deadline.");
  const objectPath = values.fileKey.split("/").map(encodeURIComponent).join("/");
  const storedObject = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${submissionBucket}/${objectPath}`, {
    method: "HEAD",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    cache: "no-store",
  });
  if (!storedObject.ok) throw new Error("Upload the file successfully before saving the submission.");
  const actualBytes = Number(storedObject.headers.get("content-length"));
  const actualMime = storedObject.headers.get("content-type")?.split(";")[0];
  if (!actualBytes || actualBytes > 25 * 1024 * 1024 || actualBytes !== values.sizeBytes || (actualMime && actualMime !== values.mimeType)) throw new Error("The uploaded file details do not match the selected file.");
  const late = submittedAt > activity.submissionDeadline;
  await db.insert(submissions).values({ activityId: activity.id, userId: session.user.id, kind: "file", fileKey: values.fileKey, fileName: values.fileName, mimeType: values.mimeType, sizeBytes: actualBytes, url: null, late, submittedAt })
    .onConflictDoUpdate({ target: [submissions.activityId, submissions.userId], set: { kind: "file", fileKey: values.fileKey, fileName: values.fileName, mimeType: values.mimeType, sizeBytes: actualBytes, url: null, late, submittedAt, updatedAt: submittedAt } });
  return { success: true, late };
}

export async function getSubmissionFileUrl(input: { submissionId: string }) {
  const submissionId = z.string().uuid().parse(input.submissionId);
  const session = await currentSession();
  const [row] = await db.select({ id: submissions.id, userId: submissions.userId, fileKey: submissions.fileKey, clubId: activities.clubId })
    .from(submissions).innerJoin(activities, eq(submissions.activityId, activities.id)).where(eq(submissions.id, submissionId)).limit(1);
  if (!row?.fileKey) throw new Error("This submission has no uploaded file.");
  if (session.user.id !== row.userId && !await can({ action: "submission.evaluate", resource: { type: "submission", id: row.id }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You cannot view this submission file.");
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${submissionBucket}/${row.fileKey.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not create a secure download link.");
  const signed = await response.json() as { signedURL?: string };
  if (!signed.signedURL) throw new Error("Storage did not return a secure download link.");
  return { url: new URL(signed.signedURL, env.SUPABASE_URL).toString() };
}

export async function evaluateActivitySubmission(input: z.infer<typeof evaluationInput>) {
  const values = evaluationInput.parse(input);
  const session = await currentSession();
  if (!["admin", "advisor", "coordinator"].includes(session.user.role)) throw new Error("Students cannot score submissions.");
  const [submission] = await db.select({
    id: submissions.id,
    userId: submissions.userId,
    activityId: activities.id,
    clubId: activities.clubId,
    status: activities.status,
  }).from(submissions).innerJoin(activities, eq(submissions.activityId, activities.id)).where(eq(submissions.id, values.submissionId)).limit(1);
  if (!submission) throw new Error("Submission not found.");
  if (!(["evaluating", "submissions_open"].includes(submission.status))) throw new Error("This activity is not accepting scores.");
  if (session.user.role !== "admin") {
    const staffRole = session.user.role as "advisor" | "coordinator";
    const assignment = await db.query.clubStaff.findFirst({ where: and(
      eq(clubStaff.clubId, submission.clubId), eq(clubStaff.userId, session.user.id), eq(clubStaff.role, staffRole),
    ) });
    if (!assignment) throw new Error("You are not assigned to this club.");
  }
  if (session.user.role !== "admin" && !await can({ action: "submission.evaluate", resource: { type: "submission", id: submission.id }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You are not allowed to score this submission.");
  const evaluatedAt = new Date();
  const previous = await db.query.evaluations.findFirst({ where: eq(evaluations.submissionId, submission.id) });
  await db.insert(evaluations).values({
    submissionId: submission.id,
    content: values.content,
    presentation: values.presentation,
    participation: values.participation,
    comment: values.comment || null,
    evaluatorId: session.user.id,
    evaluatedAt,
  }).onConflictDoUpdate({
    target: evaluations.submissionId,
    set: { content: values.content, presentation: values.presentation, participation: values.participation, comment: values.comment || null, evaluatorId: session.user.id, evaluatedAt, updatedAt: evaluatedAt },
  });
  await db.insert(auditLog).values({ actorId: session.user.id, action: previous ? "evaluation.update" : "evaluation.create", entityType: "evaluation", entityId: submission.id, before: previous ?? null, after: { content: values.content, presentation: values.presentation, participation: values.participation, comment: values.comment || null }, reason: "Rubric scoring" });
  await db.insert(notifications).values({
    userId: submission.userId,
    type: "score_ready",
    title: "Your activity score is ready",
    body: `Your rubric score is ${values.content + values.presentation + values.participation} out of 15.`,
    link: "/submissions",
    dedupeKey: `score:${submission.id}:${evaluatedAt.toISOString()}`,
  }).onConflictDoNothing();
  return { success: true, total: values.content + values.presentation + values.participation };
}

export async function getSubmissionDashboard() {
  const session = await currentSession();
  const role = session.user.role;
  let clubIds: string[] = [];
  if (role === "student") {
    clubIds = (await db.query.clubMembers.findMany({ where: and(eq(clubMembers.userId, session.user.id), eq(clubMembers.status, "approved")), columns: { clubId: true } })).map((row) => row.clubId);
  } else if (["advisor", "coordinator"].includes(role)) {
    clubIds = (await db.query.clubStaff.findMany({ where: and(eq(clubStaff.userId, session.user.id), eq(clubStaff.role, role as "advisor" | "coordinator")), columns: { clubId: true } })).map((row) => row.clubId);
  } else if (role !== "admin") {
    throw new Error("This account cannot access submissions.");
  }

  const base = db.select({ id: activities.id, topic: activities.topic, clubId: clubs.id, clubName: clubs.name, status: activities.status, deadline: activities.submissionDeadline })
    .from(activities).innerJoin(clubs, eq(activities.clubId, clubs.id));
  const activityRows = role === "admin" ? await base.orderBy(asc(activities.submissionDeadline))
    : clubIds.length ? await base.where(inArray(activities.clubId, clubIds)).orderBy(asc(activities.submissionDeadline)) : [];

  if (role === "student") {
    const rows = await Promise.all(activityRows.map(async (activity) => {
      const [checkin, submission] = await Promise.all([
        db.query.attendance.findFirst({ where: and(eq(attendance.activityId, activity.id), eq(attendance.userId, session.user.id)) }),
        db.select({ id: submissions.id, url: submissions.url, fileKey: submissions.fileKey, fileName: submissions.fileName, late: submissions.late, submittedAt: submissions.submittedAt, content: evaluations.content, presentation: evaluations.presentation, participation: evaluations.participation, comment: evaluations.comment })
          .from(submissions).leftJoin(evaluations, eq(evaluations.submissionId, submissions.id))
          .where(and(eq(submissions.activityId, activity.id), eq(submissions.userId, session.user.id))).then((result) => result[0] ?? null),
      ]);
      return { ...activity, canSubmit: Boolean(checkin?.status === "present" && ["submissions_open", "evaluating"].includes(activity.status)), submission };
    }));
    return { role: "student" as const, activities: rows };
  }

  const rows = await Promise.all(activityRows.map(async (activity) => {
    const work = await db.select({ id: submissions.id, userId: submissions.userId, studentName: user.name, studentId: user.studentId, url: submissions.url, fileKey: submissions.fileKey, fileName: submissions.fileName, late: submissions.late, submittedAt: submissions.submittedAt, content: evaluations.content, presentation: evaluations.presentation, participation: evaluations.participation, comment: evaluations.comment })
      .from(submissions).innerJoin(user, eq(submissions.userId, user.id)).leftJoin(evaluations, eq(evaluations.submissionId, submissions.id)).where(eq(submissions.activityId, activity.id));
    return { ...activity, submissions: work };
  }));
  return { role: role as "admin" | "advisor" | "coordinator", activities: rows };
}

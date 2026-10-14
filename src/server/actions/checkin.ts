"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { activities, attendance, attendanceCorrections, clubMembers, clubStaff } from "@/db/schema";
import { auth } from "@/lib/auth";
import { can } from "@/lib/policy";
import { env } from "@/env";
import { createCheckinCode, createCheckinToken, verifyCheckinCode, verifyCheckinToken } from "@/lib/checkin-token";

const activityInput = z.object({ activityId: z.string().uuid() });
const scanInput = activityInput.extend({ token: z.string().min(20).max(300) });
const correctionInput = activityInput.extend({
  userId: z.string().min(1),
  status: z.enum(["present", "absent"]),
  late: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

async function currentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Sign in to continue.");
  return session;
}

async function requireCoordinator(activityId: string) {
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, activityId) });
  if (!activity) throw new Error("Activity not found.");
  const session = await currentSession();
  if (session.user.role !== "admin") {
    if (session.user.role !== "coordinator") throw new Error("Only this club's coordinator can manage check-in.");
    const assignment = await db.query.clubStaff.findFirst({
      where: and(eq(clubStaff.clubId, activity.clubId), eq(clubStaff.userId, session.user.id), eq(clubStaff.role, "coordinator")),
    });
    if (!assignment) throw new Error("You are not assigned to this club.");
  }
  const allowed = await can({ action: "activity.manage", resource: { type: "activity", id: activityId }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined });
  if (!allowed) throw new Error("You are not allowed to manage this activity.");
  return { activity, session };
}

export async function createActivityCheckinLink(input: z.infer<typeof activityInput>) {
  const { activityId } = activityInput.parse(input);
  const { activity } = await requireCoordinator(activityId);
  if (activity.status !== "check_in_open" || !activity.checkInOpensAt) throw new Error("Open check-in before showing its QR code.");
  if (activity.checkInClosesAt && Date.now() > activity.checkInClosesAt.getTime()) throw new Error("The check-in window has closed.");
  const token = createCheckinToken(activity.id, env.CHECKIN_SECRET);
  const code = createCheckinCode(activity.id, env.CHECKIN_SECRET);
  const url = new URL("/check-in", env.APP_URL);
  url.searchParams.set("activityId", activity.id);
  url.searchParams.set("token", token);
  const manualUrl = new URL("/check-in", env.APP_URL);
  manualUrl.searchParams.set("activityId", activity.id);
  return { url: url.toString(), manualUrl: manualUrl.toString(), code, expiresInSeconds: Math.max(1, Math.ceil((60_000 - (Date.now() % 60_000)) / 1_000)) };
}

async function saveStudentCheckin(activityId: string, proofIsValid: boolean, method: "qr" | "code") {
  const session = await currentSession();
  if (session.user.role !== "student") throw new Error("Sign in with a student account to check in.");
  if (!await can({ action: "attendance.checkin", resource: { type: "activity", id: activityId }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You are not allowed to check in to this activity.");
  if (!proofIsValid) throw new Error("This QR code or one-time code expired. Ask the coordinator to refresh it.");
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, activityId) });
  if (!activity || activity.status !== "check_in_open" || !activity.checkInOpensAt) throw new Error("Check-in is not open for this activity.");
  const now = new Date();
  if (activity.checkInClosesAt && now > activity.checkInClosesAt) throw new Error("The check-in window has closed.");
  const membership = await db.query.clubMembers.findFirst({
    where: and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.userId, session.user.id), eq(clubMembers.status, "approved")),
  });
  if (!membership) throw new Error("Only approved members of this club can check in.");

  const late = now.getTime() >= activity.checkInOpensAt.getTime() + activity.lateAfterMinutes * 60_000;
  const [inserted] = await db.insert(attendance).values({
    activityId: activity.id,
    userId: session.user.id,
    method,
    status: "present",
    late,
    checkedInAt: now,
  }).onConflictDoNothing().returning({ id: attendance.id });
  if (!inserted) throw new Error("Your attendance is already recorded.");
  return { success: true, late };
}

export async function scanActivityCheckin(input: z.infer<typeof scanInput>) {
  const values = scanInput.parse(input);
  return saveStudentCheckin(values.activityId, verifyCheckinToken(values.token, values.activityId, env.CHECKIN_SECRET), "qr");
}

export async function checkInWithOneTimeCode(input: z.infer<typeof activityInput> & { code: string }) {
  const values = activityInput.extend({ code: z.string().regex(/^\d{6}$/) }).parse(input);
  return saveStudentCheckin(values.activityId, verifyCheckinCode(values.code, values.activityId, env.CHECKIN_SECRET), "code");
}

export async function correctActivityAttendance(input: z.infer<typeof correctionInput>) {
  const values = correctionInput.parse(input);
  const { activity, session } = await requireCoordinator(values.activityId);
  if (session.user.role !== "admin" && !await can({ action: "attendance.correct", resource: { type: "activity", id: activity.id }, userId: session.user.id, userRole: session.user.role, userCampusId: session.user.campusId ?? undefined })) throw new Error("You are not allowed to correct attendance for this activity.");
  const member = await db.query.clubMembers.findFirst({
    where: and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.userId, values.userId), eq(clubMembers.status, "approved")),
  });
  if (!member) throw new Error("Only approved members can have attendance corrected.");
  const [old] = await db.select().from(attendance).where(and(eq(attendance.activityId, activity.id), eq(attendance.userId, values.userId))).limit(1);

  let attendanceId = old?.id;
  if (old) {
    await db.update(attendance).set({ status: values.status, late: values.late }).where(eq(attendance.id, old.id));
  } else {
    const [created] = await db.insert(attendance).values({
      activityId: activity.id,
      userId: values.userId,
      method: "manual",
      status: values.status,
      late: values.late,
    }).returning({ id: attendance.id });
    attendanceId = created.id;
  }

  await db.insert(attendanceCorrections).values({
    attendanceId: attendanceId!,
    oldStatus: old?.status ?? null,
    newStatus: values.status,
    oldLate: old?.late ?? null,
    newLate: values.late,
    reason: values.reason,
    correctedBy: session.user.id,
  });
  return { success: true };
}

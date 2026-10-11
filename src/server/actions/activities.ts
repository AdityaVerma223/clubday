"use server";

import { z } from "zod";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  attendance,
  clubDays,
  clubMembers,
  clubs,
  clubStaff,
  campuses,
  notifications,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { can } from "@/lib/policy";
import { headers } from "next/headers";

const daySchema = z.object({
  campusId: z.string().uuid(),
  onDate: z.iso.date(),
  label: z.string().trim().max(100).optional(),
});

const planSchema = z.object({
  clubId: z.string().uuid(),
  clubDayId: z.string().uuid(),
  topic: z.string().trim().min(3).max(120),
  format: z.enum(["ppt", "assignment"]),
  deliverable: z.string().trim().min(3).max(500),
  submissionDeadline: z.iso.datetime(),
});

const activityIdSchema = z.object({ activityId: z.string().uuid() });
const attendanceSchema = z.object({ activityId: z.string().uuid(), userId: z.string().min(1) });

async function currentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

async function assertPolicy(action: string, resourceType: string, resourceId: string, session: Awaited<ReturnType<typeof currentSession>>) {
  if (!await can({
    action,
    resource: { type: resourceType, id: resourceId },
    userId: session.user.id,
    userRole: session.user.role,
    userCampusId: session.user.campusId ?? undefined,
  })) throw new Error("You are not allowed to perform this action.");
}

async function canManageClub(clubId: string, role: "coordinator" | "advisor") {
  const session = await currentSession();
  if (session.user.role === "admin") return session;
  if (session.user.role !== role) throw new Error(`Only ${role}s can perform this action`);
  const assignment = await db.query.clubStaff.findFirst({
    where: and(
      eq(clubStaff.clubId, clubId),
      eq(clubStaff.userId, session.user.id),
      eq(clubStaff.role, role),
    ),
  });
  if (!assignment) throw new Error(`You are not assigned as this club's ${role}`);
  return session;
}

export async function getActivityDashboard() {
  const session = await currentSession();
  const role = session.user.role;
  let clubIds: string[] | null = null;

  if (role === "coordinator" || role === "advisor") {
    const assignments = await db.query.clubStaff.findMany({
      where: and(eq(clubStaff.userId, session.user.id), eq(clubStaff.role, role)),
      columns: { clubId: true },
    });
    clubIds = assignments.map((row) => row.clubId);
  } else if (role === "student") {
    const memberships = await db.query.clubMembers.findMany({
      where: and(eq(clubMembers.userId, session.user.id), eq(clubMembers.status, "approved")),
      columns: { clubId: true },
    });
    clubIds = memberships.map((row) => row.clubId);
  } else if (role === "campus_manager") {
    const campusClubs = session.user.campusId
      ? await db.query.clubs.findMany({ where: eq(clubs.campusId, session.user.campusId), columns: { id: true } })
      : [];
    clubIds = campusClubs.map((row) => row.id);
  } else if (role !== "admin") {
    throw new Error("This account cannot access the activity calendar");
  }

  const campusRows = role === "admin"
    ? await db.select({ id: campuses.id, name: campuses.name, code: campuses.code }).from(campuses).orderBy(asc(campuses.name))
    : session.user.campusId
      ? await db.select({ id: campuses.id, name: campuses.name, code: campuses.code }).from(campuses).where(eq(campuses.id, session.user.campusId))
      : [];

  const clubRows = role === "admin"
    ? await db.select({ id: clubs.id, name: clubs.name, campusId: clubs.campusId }).from(clubs).where(eq(clubs.status, "approved")).orderBy(asc(clubs.name))
    : clubIds?.length
      ? await db.select({ id: clubs.id, name: clubs.name, campusId: clubs.campusId }).from(clubs).where(and(inArray(clubs.id, clubIds), eq(clubs.status, "approved"))).orderBy(asc(clubs.name))
      : [];

  const dayRows = role === "admin"
    ? await db.select({ id: clubDays.id, campusId: clubDays.campusId, onDate: clubDays.onDate, label: clubDays.label, campusName: campuses.name }).from(clubDays).innerJoin(campuses, eq(clubDays.campusId, campuses.id)).orderBy(asc(clubDays.onDate))
    : session.user.campusId
      ? await db.select({ id: clubDays.id, campusId: clubDays.campusId, onDate: clubDays.onDate, label: clubDays.label, campusName: campuses.name }).from(clubDays).innerJoin(campuses, eq(clubDays.campusId, campuses.id)).where(eq(clubDays.campusId, session.user.campusId)).orderBy(asc(clubDays.onDate))
      : [];

  const base = db.select({
    id: activities.id,
    clubId: clubs.id,
    clubName: clubs.name,
    campusName: campuses.name,
    day: clubDays.onDate,
    dayLabel: clubDays.label,
    topic: activities.topic,
    format: activities.format,
    deliverable: activities.deliverable,
    status: activities.status,
    opensAt: activities.checkInOpensAt,
    closesAt: activities.checkInClosesAt,
    deadline: activities.submissionDeadline,
    advisorComment: activities.advisorComment,
  }).from(activities)
    .innerJoin(clubs, eq(activities.clubId, clubs.id))
    .innerJoin(clubDays, eq(activities.clubDayId, clubDays.id))
    .innerJoin(campuses, eq(clubs.campusId, campuses.id));

  const activityRows = role === "admin"
    ? await base.orderBy(asc(clubDays.onDate))
    : clubIds?.length
      ? role === "student"
        ? await base.where(and(
            inArray(activities.clubId, clubIds),
            session.user.campusId ? eq(clubs.campusId, session.user.campusId) : eq(clubs.id, "00000000-0000-0000-0000-000000000000"),
            inArray(activities.status, ["announced", "check_in_open", "check_in_closed", "submissions_open", "evaluating", "reported"]),
          )).orderBy(asc(clubDays.onDate))
        : await base.where(inArray(activities.clubId, clubIds)).orderBy(asc(clubDays.onDate))
      : [];

  const rows = await Promise.all(activityRows.map(async (activity) => {
    const [attendanceCount] = await db.select({ total: count() }).from(attendance).where(and(eq(attendance.activityId, activity.id), eq(attendance.status, "present")));
    const staff = role === "admin" || role === "coordinator";
    const members = staff
      ? await db.select({ userId: user.id, name: user.name, studentId: user.studentId, checkedInAt: attendance.checkedInAt, attendanceStatus: attendance.status, late: attendance.late })
        .from(clubMembers)
        .innerJoin(user, eq(clubMembers.userId, user.id))
        .leftJoin(attendance, and(eq(attendance.activityId, activity.id), eq(attendance.userId, user.id)))
        .where(and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.status, "approved")))
        .orderBy(asc(user.name))
      : [];
    const myAttendance = role === "student"
      ? await db.query.attendance.findFirst({ where: and(eq(attendance.activityId, activity.id), eq(attendance.userId, session.user.id)) })
      : null;
    return { ...activity, presentCount: attendanceCount?.total ?? 0, members, myAttendance: myAttendance ? { checkedInAt: myAttendance.checkedInAt } : null };
  }));

  const userNotifications = await db.select({
    id: notifications.id,
    title: notifications.title,
    body: notifications.body,
    link: notifications.link,
    createdAt: notifications.createdAt,
    readAt: notifications.readAt,
  }).from(notifications).where(eq(notifications.userId, session.user.id)).orderBy(desc(notifications.createdAt)).limit(8);

  return {
    role,
    campuses: campusRows,
    clubs: clubRows,
    days: dayRows,
    activities: rows,
    notifications: userNotifications,
  };
}

export async function createClubDay(input: z.infer<typeof daySchema>) {
  const session = await currentSession();
  if (session.user.role !== "admin" && session.user.role !== "campus_manager") throw new Error("Only campus managers and admins can add campus calendar dates");
  const values = daySchema.parse(input);
  await assertPolicy("campus.calendar", "campus", values.campusId, session);
  if (session.user.role === "campus_manager" && values.campusId !== session.user.campusId) throw new Error("You can only manage calendar dates for your campus");
  const campus = await db.query.campuses.findFirst({ where: eq(campuses.id, values.campusId) });
  if (!campus) throw new Error("Campus not found");
  await db.insert(clubDays).values({ campusId: values.campusId, onDate: values.onDate, label: values.label || null });
  return { success: true };
}

const calendarCsvSchema = z.object({ csv: z.string().trim().min(1).max(20_000) });

export async function importClubDaysCsv(input: z.infer<typeof calendarCsvSchema>) {
  const session = await currentSession();
  if (session.user.role !== "admin" && session.user.role !== "campus_manager") throw new Error("Only campus managers and admins can import calendar dates.");
  const { csv } = calendarCsvSchema.parse(input);
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0]?.toLowerCase();
  const dataLines = header?.startsWith("campus_code,") ? lines.slice(1) : lines;
  if (!dataLines.length || dataLines.length > 100) throw new Error("Import between 1 and 100 date rows at a time.");
  const campusesList = await db.select({ id: campuses.id, code: campuses.code }).from(campuses);
  const byCode = new Map(campusesList.map((campus) => [campus.code.toLowerCase(), campus.id]));
  const rows = dataLines.map((line, index) => {
    const [code = "", onDate = "", ...labelParts] = line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
    const campusId = byCode.get(code.toLowerCase());
    const date = z.iso.date().safeParse(onDate);
    if (!campusId || !date.success) throw new Error(`Calendar CSV row ${index + 1} needs a valid campus code and YYYY-MM-DD date.`);
    if (session.user.role === "campus_manager" && campusId !== session.user.campusId) throw new Error("Campus managers can import dates only for their own campus.");
    return { campusId, onDate, label: labelParts.join(",").slice(0, 100) || null };
  });
  for (const campusId of new Set(rows.map((row) => row.campusId))) {
    await assertPolicy("campus.calendar", "campus", campusId, session);
  }
  const inserted = await db.insert(clubDays).values(rows).onConflictDoNothing().returning({ id: clubDays.id });
  return { success: true, imported: inserted.length, skipped: rows.length - inserted.length };
}

export async function planActivity(input: z.infer<typeof planSchema>) {
  const values = planSchema.parse(input);
  const session = await canManageClub(values.clubId, "coordinator");
  await assertPolicy("club.plan", "club", values.clubId, session);
  const [club, day] = await Promise.all([
    db.query.clubs.findFirst({ where: eq(clubs.id, values.clubId) }),
    db.query.clubDays.findFirst({ where: eq(clubDays.id, values.clubDayId) }),
  ]);
  if (!club || club.status !== "approved") throw new Error("Choose an approved club");
  if (!day || day.campusId !== club.campusId) throw new Error("Choose a calendar day at this club's campus");
  const [activity] = await db.insert(activities).values({
    clubId: values.clubId,
    clubDayId: values.clubDayId,
    topic: values.topic,
    format: values.format,
    deliverable: values.deliverable,
    submissionDeadline: new Date(values.submissionDeadline),
    plannedBy: session.user.id,
  }).returning({ id: activities.id });
  const advisors = await db.select({ userId: clubStaff.userId }).from(clubStaff)
    .where(and(eq(clubStaff.clubId, club.id), eq(clubStaff.role, "advisor")));
  if (advisors.length) {
    await db.insert(notifications).values(advisors.map(({ userId }) => ({
      userId,
      type: "plan_decision",
      title: "Activity plan needs review",
      body: `${values.topic} is waiting for advisor approval.`,
      link: "/calendar",
      dedupeKey: `plan:${activity.id}`,
    }))).onConflictDoNothing();
  }
  return { success: true, id: activity.id };
}

export async function approveActivity(input: z.infer<typeof activityIdSchema>) {
  const { activityId } = activityIdSchema.parse(input);
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, activityId) });
  if (!activity) throw new Error("Activity not found");
  const session = await canManageClub(activity.clubId, "advisor");
  await assertPolicy("activity.approve", "activity", activityId, session);
  if (activity.status !== "planned") throw new Error("Only a planned activity can be approved");
  await db.update(activities).set({ status: "approved", approvedBy: session.user.id, approvedAt: new Date(), advisorComment: null }).where(eq(activities.id, activityId));
  const coordinators = await db.select({ userId: clubStaff.userId }).from(clubStaff)
    .where(and(eq(clubStaff.clubId, activity.clubId), eq(clubStaff.role, "coordinator")));
  if (coordinators.length) {
    await db.insert(notifications).values(coordinators.map(({ userId }) => ({
      userId,
      type: "plan_decision",
      title: "Activity plan approved",
      body: `${activity.topic} is approved and ready to announce.`,
      link: "/calendar",
      dedupeKey: `approved:${activity.id}`,
    }))).onConflictDoNothing();
  }
  return { success: true };
}

async function setActivityStatus(activityId: string, next: "announced" | "check_in_open" | "check_in_closed") {
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, activityId) });
  if (!activity) throw new Error("Activity not found");
  await canManageClub(activity.clubId, "coordinator");
  const session = await currentSession();
  await assertPolicy("activity.manage", "activity", activityId, session);
  const allowed: Record<typeof next, string> = {
    announced: "approved",
    check_in_open: "announced",
    check_in_closed: "check_in_open",
  };
  if (activity.status !== allowed[next]) throw new Error(`This activity must be ${allowed[next].replaceAll("_", " ")} first`);
  const now = new Date();
  const values = next === "check_in_open"
    ? { status: next, checkInOpensAt: now, checkInClosesAt: new Date(now.getTime() + 2 * 60 * 60_000) }
    : next === "check_in_closed"
      ? { status: next, checkInClosesAt: now }
      : { status: next };
  await db.update(activities).set(values).where(eq(activities.id, activityId));
  if (next === "announced") {
    const clubDay = await db.query.clubDays.findFirst({ where: eq(clubDays.id, activity.clubDayId) });
    const members = await db.select({ userId: clubMembers.userId }).from(clubMembers)
      .where(and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.status, "approved")));
    if (members.length) {
      await db.insert(notifications).values(members.map(({ userId }) => ({
        userId,
        type: "announcement",
        title: "New club activity announced",
        body: `${activity.topic} is scheduled for ${clubDay?.onDate ?? "the next Club Day"}.`,
        link: "/calendar",
        dedupeKey: `announce:${activity.id}`,
      }))).onConflictDoNothing();
    }
  }
  return { success: true };
}

export async function announceActivity(input: z.infer<typeof activityIdSchema>) {
  return setActivityStatus(activityIdSchema.parse(input).activityId, "announced");
}

export async function openActivityCheckIn(input: z.infer<typeof activityIdSchema>) {
  return setActivityStatus(activityIdSchema.parse(input).activityId, "check_in_open");
}

export async function closeActivityCheckIn(input: z.infer<typeof activityIdSchema>) {
  return setActivityStatus(activityIdSchema.parse(input).activityId, "check_in_closed");
}

export async function recordMemberAttendance(input: z.infer<typeof attendanceSchema>) {
  const values = attendanceSchema.parse(input);
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, values.activityId) });
  if (!activity) throw new Error("Activity not found");
  await canManageClub(activity.clubId, "coordinator");
  const session = await currentSession();
  await assertPolicy("attendance.manual", "attendance", activity.id, session);
  if (activity.status !== "check_in_open") throw new Error("Open check-in before recording attendance");
  const membership = await db.query.clubMembers.findFirst({
    where: and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.userId, values.userId), eq(clubMembers.status, "approved")),
  });
  if (!membership) throw new Error("Only approved members of this club can be checked in");
  const now = new Date();
  if (activity.checkInClosesAt && now > activity.checkInClosesAt) throw new Error("The check-in window has closed.");
  const late = Boolean(activity.checkInOpensAt && now.getTime() >= activity.checkInOpensAt.getTime() + activity.lateAfterMinutes * 60_000);
  await db.insert(attendance).values({ activityId: activity.id, userId: values.userId, method: "manual", status: "present", late, checkedInAt: now }).onConflictDoNothing();
  return { success: true };
}

export async function markNotificationRead(notificationId: string) {
  const id = z.string().uuid().parse(notificationId);
  const session = await currentSession();
  await assertPolicy("notification.read", "notification", id, session);
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, session.user.id)));
  return { success: true };
}

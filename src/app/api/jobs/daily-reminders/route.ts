import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities, clubDays, clubMembers, notifications } from "@/db/schema";
import { env } from "@/env";

export const runtime = "nodejs";

function sameSecret(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function indiaDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysUntil(target: string, today: string) {
  const toUtc = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(target) - toUtc(today)) / 86_400_000);
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || !sameSecret(authorization.slice(7), env.JOBS_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = indiaDate(new Date());
  const scheduled = await db.select({
    id: activities.id,
    topic: activities.topic,
    status: activities.status,
    clubId: activities.clubId,
    onDate: clubDays.onDate,
  }).from(activities).innerJoin(clubDays, eq(activities.clubDayId, clubDays.id))
    .where(and(eq(activities.status, "announced")));

  let created = 0;
  for (const activity of scheduled) {
    const offset = daysUntil(activity.onDate, today);
    if (![7, 3, 2].includes(offset)) continue;
    const members = await db.select({ userId: clubMembers.userId }).from(clubMembers)
      .where(and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.status, "approved")));
    if (!members.length) continue;
    const rows = await db.insert(notifications).values(members.map(({ userId }) => ({
      userId,
      type: "activity_reminder",
      title: `${offset}-day Club Day reminder`,
      body: `${activity.topic} is scheduled for ${activity.onDate}.`,
      link: "/calendar",
      dedupeKey: `activity-reminder:${activity.id}:${offset}d`,
    }))).onConflictDoNothing().returning({ id: notifications.id });
    created += rows.length;
  }

  return NextResponse.json({ date: today, remindersCreated: created });
}

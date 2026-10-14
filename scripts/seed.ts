import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { env } from "../src/env";
import {
  account,
  activities,
  attendance,
  campuses,
  clubMembers,
  clubStaff,
  clubDays,
  clubs,
  notifications,
  user,
} from "../src/db/schema";

const EMAIL_DOMAIN = "clubday.local";
const SEED_TAG = "clubday-small-demo-v1";

const campusInput = [
  { code: "HI-TECH", name: "HI-Tech" },
  { code: "RATNAM", name: "Ratnam" },
  { code: "RGIB", name: "RGIB" },
  { code: "JUJ", name: "JUJ" },
] as const;

const givenNames = [
  "Aarav", "Aditi", "Aditya", "Akash", "Ananya", "Anika", "Anjali", "Arjun", "Aryan", "Ayesha",
  "Bhavya", "Chaitanya", "Deepak", "Devansh", "Diya", "Divya", "Farhan", "Gauri", "Harsh", "Ishaan",
  "Ishita", "Jatin", "Kabir", "Kavya", "Kiran", "Krishna", "Lakshmi", "Madhav", "Mahima", "Manav",
  "Meera", "Mohit", "Naina", "Neha", "Nikhil", "Nisha", "Om", "Pallavi", "Parth", "Pooja", "Pranav",
  "Priya", "Rahul", "Raj", "Riya", "Rohan", "Sakshi", "Sameer", "Sanjana", "Saurabh", "Shreya", "Siddharth",
  "Simran", "Sneha", "Tanvi", "Tushar", "Uday", "Vaishnavi", "Varun", "Vikram", "Vinay",
] as const;
const familyNames = [
  "Sharma", "Verma", "Patel", "Singh", "Gupta", "Joshi", "Mehta", "Nair", "Iyer", "Reddy", "Rao", "Khan",
] as const;

type Role = "admin" | "campus_manager" | "advisor" | "coordinator" | "student";
type PlannedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  campusId: string | null;
  studentId: string | null;
};

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function makePlan() {
  const now = new Date("2026-10-11T15:00:00.000Z");
  const campusRows = campusInput.map((campus, index) => ({ ...campus, id: uuid(index + 1), createdAt: now, updatedAt: now }));
  const [hiTech] = campusRows;
  const users: PlannedUser[] = [
    { id: "usr_admin", name: "Asha Admin", email: `admin@${EMAIL_DOMAIN}`, role: "admin", campusId: null, studentId: null },
    { id: "usr_cm_hi-tech", name: "Campus Manager", email: `manager@${EMAIL_DOMAIN}`, role: "campus_manager", campusId: hiTech.id, studentId: null },
    { id: "usr_adv_01", name: "Prof. Meera Sharma", email: `advisor@${EMAIL_DOMAIN}`, role: "advisor", campusId: hiTech.id, studentId: null },
    { id: "usr_adv_02", name: "Prof. Arjun Verma", email: `adv-02@${EMAIL_DOMAIN}`, role: "advisor", campusId: hiTech.id, studentId: null },
  ];
  for (let i = 0; i < 60; i++) {
    const studentId = `MSOT26-${String(i + 1).padStart(4, "0")}`;
    const isCoordinator = i >= 57;
    users.push({
      id: `usr_s_${String(i + 1).padStart(4, "0")}`,
      name: `${givenNames[i]} ${familyNames[i % familyNames.length]}`,
      email: `${studentId.toLowerCase()}@${EMAIL_DOMAIN}`,
      role: isCoordinator ? "coordinator" : "student",
      campusId: hiTech.id,
      studentId,
    });
  }
  // Stable, human-friendly logins for the five demo roles.
  users.find((u) => u.studentId === "MSOT26-0001")!.email = `student@${EMAIL_DOMAIN}`;
  users.find((u) => u.studentId === "MSOT26-0058")!.email = `coordinator@${EMAIL_DOMAIN}`;

  const clubNames = [
    { name: "Code Circle", category: "coding" },
    { name: "RoboWorks", category: "robotics" },
    { name: "Pixel Studio", category: "design" },
  ] as const;
  const clubRows = clubNames.map((club, i) => ({
    id: uuid(100 + i),
    campusId: hiTech.id,
    ...club,
    description: `${club.name} is the ${club.category} club at HI-Tech. We meet on Club Days to learn by doing and share what we build.`,
    capacity: 30,
    meetingRule: "Every Saturday 10:00 to 12:00",
    status: "approved" as const,
    approvedBy: "usr_cm_hi-tech",
    approvedAt: new Date("2026-08-20T06:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
  }));
  const staffRows = clubRows.flatMap((club, i) => [
    { id: uuid(200 + i * 2), clubId: club.id, userId: i === 2 ? "usr_adv_02" : "usr_adv_01", role: "advisor" as const, createdAt: now },
    { id: uuid(201 + i * 2), clubId: club.id, userId: `usr_s_${String(58 + i).padStart(4, "0")}`, role: "coordinator" as const, createdAt: now },
  ]);

  const studentIds = Array.from({ length: 57 }, (_, i) => `usr_s_${String(i + 1).padStart(4, "0")}`);
  const memberRows: (typeof clubMembers.$inferInsert)[] = studentIds.slice(0, 50).map((userId, i) => ({
    id: uuid(300 + i),
    clubId: clubRows[i % clubRows.length].id,
    userId,
    kind: "primary" as const,
    status: "approved" as const,
    requestedAt: now,
    decidedBy: staffRows.find((row) => row.clubId === clubRows[i % clubRows.length].id && row.role === "coordinator")!.userId,
    decidedAt: now,
    createdAt: now,
    updatedAt: now,
  }));
  memberRows.push({
    id: uuid(400), clubId: clubRows[2].id, userId: "usr_s_0001", kind: "secondary", status: "approved",
    requestedAt: now, decidedBy: "usr_s_0059", decidedAt: now, createdAt: now, updatedAt: now,
  });
  for (let i = 0; i < 3; i++) {
    memberRows.push({
      id: uuid(401 + i), clubId: clubRows[0].id, userId: studentIds[50 + i], kind: "primary", status: "requested",
      requestedAt: now, decidedBy: null, decidedAt: null, createdAt: now, updatedAt: now,
    });
  }
  const dayRows = [
    { id: uuid(500), campusId: hiTech.id, onDate: "2026-10-12", kind: "club_day" as const, label: "Day 4 · Plan and approve", createdAt: now, updatedAt: now },
    { id: uuid(501), campusId: hiTech.id, onDate: "2026-10-13", kind: "club_day" as const, label: "Day 5 · Check-in demo", createdAt: now, updatedAt: now },
    { id: uuid(502), campusId: hiTech.id, onDate: "2026-10-14", kind: "club_day" as const, label: "Day 6 · Submit and score", createdAt: now, updatedAt: now },
  ];
  const activityRows = [
    {
      id: uuid(510), clubId: clubRows[0].id, clubDayId: dayRows[0].id, topic: "Build a Campus Club Showcase",
      format: "assignment" as const, deliverable: "A short project link and a 3-point reflection.", status: "planned" as const,
      latePlan: false, advisorComment: null, plannedBy: "usr_s_0058", approvedBy: null, approvedAt: null,
      checkInOpensAt: null, checkInClosesAt: null, lateAfterMinutes: 10,
      submissionDeadline: new Date("2026-10-16T12:30:00.000Z"), graceMinutes: 120, createdAt: now, updatedAt: now,
    },
    {
      id: uuid(511), clubId: clubRows[0].id, clubDayId: dayRows[1].id, topic: "Prototype a Student Club App",
      format: "ppt" as const, deliverable: "Show a prototype and explain one design choice.", status: "announced" as const,
      latePlan: false, advisorComment: null, plannedBy: "usr_s_0058", approvedBy: "usr_adv_01", approvedAt: now,
      checkInOpensAt: null, checkInClosesAt: null, lateAfterMinutes: 10,
      submissionDeadline: new Date("2026-10-17T12:30:00.000Z"), graceMinutes: 120, createdAt: now, updatedAt: now,
    },
    {
      id: uuid(512), clubId: clubRows[0].id, clubDayId: dayRows[2].id, topic: "Create a Mini Portfolio",
      format: "assignment" as const, deliverable: "Submit a project link for advisor feedback.", status: "submissions_open" as const,
      latePlan: false, advisorComment: null, plannedBy: "usr_s_0058", approvedBy: "usr_adv_01", approvedAt: now,
      checkInOpensAt: new Date("2026-10-11T14:30:00.000Z"), checkInClosesAt: now, lateAfterMinutes: 10,
      submissionDeadline: new Date("2026-10-18T12:30:00.000Z"), graceMinutes: 120, createdAt: now, updatedAt: now,
    },
  ];
  const demoAttendance = [0, 3, 6, 9, 12].map((index, attendanceIndex) => ({
    id: uuid(600 + attendanceIndex), activityId: activityRows[2].id, userId: `usr_s_${String(index + 1).padStart(4, "0")}`,
    method: "qr" as const, status: "present" as const, late: attendanceIndex === 4,
    checkedInAt: new Date(new Date("2026-10-11T14:30:00.000Z").getTime() + (attendanceIndex === 4 ? 12 * 60_000 : attendanceIndex * 30_000)), createdAt: now, updatedAt: now,
  }));
  const demoNotifications = [
    { userId: "usr_adv_01", type: "plan_decision", title: "Activity plan needs review", body: "Build a Campus Club Showcase is waiting for advisor approval.", link: "/calendar", dedupeKey: `plan:${activityRows[0].id}`, createdAt: now, updatedAt: now },
    { userId: "usr_s_0001", type: "announcement", title: "New club activity announced", body: "Prototype a Student Club App is scheduled for your club.", link: "/calendar", dedupeKey: `announce:${activityRows[1].id}`, createdAt: now, updatedAt: now },
  ];
  return { now, campusRows, users, clubRows, staffRows, memberRows, dayRows, activityRows, demoAttendance, demoNotifications };
}

function counts(plan: ReturnType<typeof makePlan>) {
  return {
    campuses: plan.campusRows.length,
    users: plan.users.length,
    credentialAccounts: plan.users.length,
    clubs: plan.clubRows.length,
    clubStaff: plan.staffRows.length,
    clubMembers: plan.memberRows.length,
    approvedMemberships: plan.memberRows.filter((row) => row.status === "approved").length,
    pendingMemberships: plan.memberRows.filter((row) => row.status === "requested").length,
    clubDays: plan.dayRows.length,
    activities: plan.activityRows.length,
    attendance: plan.demoAttendance.length,
    submissions: 0,
    evaluations: 0,
    notifications: plan.demoNotifications.length,
    otherTables: "unchanged",
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (!args.has("--small")) throw new Error("Refusing to seed without --small.");
  const unknownArgs = [...args].filter((arg) => !["--small", "--apply"].includes(arg));
  if (unknownArgs.length) throw new Error(`Unknown arguments: ${unknownArgs.join(", ")}`);

  const plan = makePlan();
  const demoAccounts = [
    { role: "admin", login: "admin@clubday.local" },
    { role: "campus_manager", login: "manager@clubday.local" },
    { role: "advisor", login: "advisor@clubday.local" },
    { role: "coordinator", login: "coordinator@clubday.local" },
    { role: "student", login: "student@clubday.local", studentId: "MSOT26-0001" },
  ];

  console.log(JSON.stringify({
    mode: args.has("--apply") ? "APPLY" : "PREVIEW ONLY",
    guard: "--small required; --apply additionally requires ALLOW_DEMO_SEED=YES, Supabase transaction pooler port 6543, and all target tables empty",
    seedTag: SEED_TAG,
    counts: counts(plan),
    campuses: plan.campusRows.map(({ code, name }) => ({ code, name })),
    clubs: plan.clubRows.map(({ name, category, capacity }) => ({ campus: "HI-Tech", name, category, capacity })),
    activityFlow: plan.activityRows.map(({ topic, status, clubDayId }) => ({
      topic,
      status,
      date: plan.dayRows.find((day) => day.id === clubDayId)?.onDate,
    })),
    users: plan.users,
    demoAccounts: demoAccounts.map((account) => ({ ...account, credential: "password stored as a Better Auth hash" })),
  }, null, 2));

  if (!args.has("--apply")) return;
  if (env.ALLOW_DEMO_SEED !== "YES") {
    throw new Error("Refusing to write: set ALLOW_DEMO_SEED=YES only after reviewing the preview.");
  }
  if (!env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD.length < 12) {
    throw new Error("Refusing to write: set a private DEMO_SEED_PASSWORD of at least 12 characters in your local .env.");
  }
  const dbUrl = new URL(env.DATABASE_URL);
  if (!dbUrl.hostname.endsWith("pooler.supabase.com") || dbUrl.port !== "6543") {
    throw new Error("Refusing to write: DATABASE_URL must be the Supabase transaction pooler URL on port 6543.");
  }

  const existing = await db.execute(sql`
  select 'campuses' as table_name, count(*)::int as rows from public.campuses
  union all select 'user', count(*)::int from public."user"
  union all select 'account', count(*)::int from public.account
  union all select 'clubs', count(*)::int from public.clubs
  union all select 'club_staff', count(*)::int from public.club_staff
  union all select 'club_members', count(*)::int from public.club_members
  union all select 'club_days', count(*)::int from public.club_days
  union all select 'activities', count(*)::int from public.activities
  union all select 'attendance', count(*)::int from public.attendance
  union all select 'submissions', count(*)::int from public.submissions
  union all select 'evaluations', count(*)::int from public.evaluations
  union all select 'notifications', count(*)::int from public.notifications
`);
  const occupied = Array.from(existing as Iterable<{ table_name: string; rows: number }>).filter((row) => Number(row.rows) > 0);
  if (occupied.length) {
    throw new Error(`Refusing to write: target is not empty (${occupied.map((row) => `${row.table_name}=${row.rows}`).join(", ")}).`);
  }

  const hashedPassword = await hashPassword(env.DEMO_SEED_PASSWORD);
  await db.transaction(async (tx) => {
    await tx.insert(campuses).values(plan.campusRows);
    await tx.insert(user).values(plan.users.map((row) => ({
      ...row,
      emailVerified: true,
      createdAt: plan.now,
      updatedAt: plan.now,
    })));
    await tx.insert(account).values(plan.users.map((row) => ({
      id: `credential_${row.id}`,
      userId: row.id,
      accountId: row.id,
      providerId: "credential",
      password: hashedPassword,
      createdAt: plan.now,
      updatedAt: plan.now,
    })));
    await tx.insert(clubs).values(plan.clubRows);
    await tx.insert(clubStaff).values(plan.staffRows);
    await tx.insert(clubMembers).values(plan.memberRows);
    await tx.insert(clubDays).values(plan.dayRows);
    await tx.insert(activities).values(plan.activityRows);
    await tx.insert(attendance).values(plan.demoAttendance);
    await tx.insert(notifications).values(plan.demoNotifications);
  });
  console.log(`Seed applied successfully (${SEED_TAG}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});

// ClubDay database schema (Drizzle ORM, Postgres).
// Put this at src/db/schema.ts.
//
// Notes for a beginner:
// - Every table has a uuid primary key. Better Auth's own "user" table uses text ids, so
//   columns that point to a user are text.
// - All times are timestamptz (stored in UTC). Show them in Asia/Kolkata in the UI.
// - created_at / updated_at are on every table that changes. audit_log, attendance_corrections
//   and team_members are append-only, so they only have created_at.
// - Duplicates are blocked by the database itself (unique constraints), not just by app code.
// - Capacity of a club is NOT a constraint: check it inside a transaction in the join/approve code.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- small helpers ----------
const tz = (name: string) => timestamp(name, { withTimezone: true });
const pk = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => tz("created_at").notNull().defaultNow();
const updatedAt = () =>
  tz("updated_at").notNull().defaultNow().$onUpdate(() => new Date());

// ---------- enums ----------
export const clubStatus = pgEnum("club_status", ["pending_approval", "approved", "archived"]);
export const staffRole = pgEnum("club_staff_role", ["advisor", "coordinator"]);
export const memberKind = pgEnum("member_kind", ["primary", "secondary"]);
export const memberStatus = pgEnum("member_status", ["requested", "approved", "rejected"]);
export const dayKind = pgEnum("day_kind", ["club_day", "holiday", "exam_week"]);
export const activityFormat = pgEnum("activity_format", ["ppt", "assignment"]);
export const activityStatus = pgEnum("activity_status", [
  "planned",
  "approved",
  "announced",
  "check_in_open",
  "check_in_closed",
  "submissions_open",
  "evaluating",
  "reported",
]);
export const checkinMethod = pgEnum("checkin_method", ["qr", "code", "manual"]);
export const attendanceStatus = pgEnum("attendance_status", ["present", "absent"]);
export const submissionKind = pgEnum("submission_kind", ["file", "link"]);
export const eventStatus = pgEnum("event_status", ["draft", "open", "closed", "completed"]);
export const registrationStatus = pgEnum("registration_status", ["registered", "cancelled"]);
export const certificateKind = pgEnum("certificate_kind", ["participation", "achievement"]);

// ---------- Better Auth tables ----------
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: tz("expires_at").notNull(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("session_user_id_idx").on(t.userId),
  index("session_token_idx").on(t.token),
]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  accessTokenExpiresAt: tz("access_token_expires_at"),
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: tz("refresh_token_expires_at"),
  idToken: text("id_token"),
  expiresAt: tz("expires_at"),
  password: text("password"),
  scope: text("scope"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("account_user_id_idx").on(t.userId),
]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tz("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("verification_identifier_idx").on(t.identifier),
]);

// ---------- login user (Better Auth) ----------
// Better Auth creates user, session, account and verification tables itself.
// Run `npx auth@latest generate` and prefer the generated file. This stub only lists
// the fields the rest of the schema depends on. In the Better Auth config add
// user.additionalFields for role, campusId and studentId. If you use the username
// plugin, the CLI adds its username columns too.
// role is one of: admin, campus_manager, advisor, coordinator, student.
// Which club someone advises or coordinates lives in club_staff, not here.
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // extra fields
    role: text("role").notNull().default("student"),
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "set null" }),
    studentId: text("student_id").unique(), // e.g. MSOT26-0001
  },
  (t) => [
    check(
      "user_role_check",
      sql`${t.role} in ('admin','campus_manager','advisor','coordinator','student')`,
    ),
    index("user_campus_role_idx").on(t.campusId, t.role),
  ],
);

// ---------- campuses and clubs ----------
export const campuses = pgTable("campuses", {
  id: pk(),
  code: text("code").notNull().unique(), // HI-TECH, RATNAM, RGIB, JUJ
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const clubs = pgTable(
  "clubs",
  {
    id: pk(),
    campusId: uuid("campus_id")
      .notNull()
      .references(() => campuses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    capacity: integer("capacity").notNull(),
    meetingRule: text("meeting_rule").notNull(), // e.g. "Every Saturday 10:00 to 12:00"
    status: clubStatus("status").notNull().default("pending_approval"),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: tz("approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("clubs_campus_name_unique").on(t.campusId, t.name),
    check("clubs_capacity_check", sql`${t.capacity} between 1 and 500`),
    index("clubs_campus_status_idx").on(t.campusId, t.status),
  ],
);

// Extra table (not in your list): who advises or coordinates which club.
// Allows several advisors per club and a coordinator for more than one club.
export const clubStaff = pgTable(
  "club_staff",
  {
    id: pk(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: staffRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("club_staff_unique").on(t.clubId, t.userId, t.role),
    index("club_staff_user_idx").on(t.userId),
  ],
);

export const clubMembers = pgTable(
  "club_members",
  {
    id: pk(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: memberKind("kind").notNull(),
    status: memberStatus("status").notNull().default("requested"),
    requestedAt: tz("requested_at").notNull().defaultNow(),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: tz("decided_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // one membership row per student per club (to re-apply after a rejection, update the row)
    unique("club_members_club_user_unique").on(t.clubId, t.userId),
    // at most one live primary and one live secondary club per student
    uniqueIndex("club_members_one_per_kind_idx")
      .on(t.userId, t.kind)
      .where(sql`${t.status} in ('requested','approved')`),
    index("club_members_club_status_idx").on(t.clubId, t.status),
  ],
);

// ---------- calendar and activities ----------
export const clubDays = pgTable(
  "club_days",
  {
    id: pk(),
    campusId: uuid("campus_id")
      .notNull()
      .references(() => campuses.id, { onDelete: "restrict" }),
    onDate: date("on_date", { mode: "string" }).notNull(),
    kind: dayKind("kind").notNull().default("club_day"),
    label: text("label"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("club_days_campus_date_unique").on(t.campusId, t.onDate),
    index("club_days_date_idx").on(t.onDate),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: pk(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    clubDayId: uuid("club_day_id")
      .notNull()
      .references(() => clubDays.id, { onDelete: "restrict" }),
    topic: text("topic").notNull(),
    format: activityFormat("format").notNull(),
    deliverable: text("deliverable").notNull(),
    status: activityStatus("status").notNull().default("planned"),
    latePlan: boolean("late_plan").notNull().default(false), // plan sent less than 7 days before
    advisorComment: text("advisor_comment"), // filled when changes are requested
    plannedBy: text("planned_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: tz("approved_at"),
    checkInOpensAt: tz("check_in_opens_at"),
    checkInClosesAt: tz("check_in_closes_at"),
    lateAfterMinutes: smallint("late_after_minutes").notNull().default(10),
    submissionDeadline: tz("submission_deadline").notNull(),
    graceMinutes: smallint("grace_minutes").notNull().default(120),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("activities_club_day_unique").on(t.clubId, t.clubDayId), // one activity per club per Club Day
    index("activities_club_status_idx").on(t.clubId, t.status),
    index("activities_day_idx").on(t.clubDayId),
    check(
      "activities_window_check",
      sql`${t.checkInOpensAt} is null or ${t.checkInClosesAt} is null or ${t.checkInClosesAt} > ${t.checkInOpensAt}`,
    ),
    check("activities_late_check", sql`${t.lateAfterMinutes} >= 0 and ${t.graceMinutes} >= 0`),
  ],
);

// ---------- attendance ----------
export const attendance = pgTable(
  "attendance",
  {
    id: pk(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    method: checkinMethod("method").notNull(),
    status: attendanceStatus("status").notNull().default("present"),
    late: boolean("late").notNull().default(false),
    checkedInAt: tz("checked_in_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // HOT PATH: one check-in per student per activity. This unique index is also the lookup index.
    unique("attendance_activity_user_unique").on(t.activityId, t.userId),
    index("attendance_user_idx").on(t.userId), // transcripts and participation by student
    index("attendance_activity_time_idx").on(t.activityId, t.checkedInAt), // live attendee list
  ],
);

// Append-only history of every manual change. oldStatus is null when a coordinator adds a missing check-in.
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: pk(),
    attendanceId: uuid("attendance_id")
      .notNull()
      .references(() => attendance.id, { onDelete: "restrict" }),
    oldStatus: attendanceStatus("old_status"),
    newStatus: attendanceStatus("new_status").notNull(),
    oldLate: boolean("old_late"),
    newLate: boolean("new_late").notNull(),
    reason: text("reason").notNull(),
    correctedBy: text("corrected_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("attendance_corrections_reason_check", sql`length(trim(${t.reason})) >= 3`),
    index("attendance_corrections_attendance_idx").on(t.attendanceId),
  ],
);

// ---------- submissions and evaluation ----------
export const submissions = pgTable(
  "submissions",
  {
    id: pk(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: submissionKind("kind").notNull(),
    fileKey: text("file_key"), // path in Supabase Storage (or the local uploads folder)
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    url: text("url"), // for link submissions
    late: boolean("late").notNull().default(false),
    submittedAt: tz("submitted_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("submissions_activity_user_unique").on(t.activityId, t.userId), // replacing a file updates the row
    index("submissions_user_idx").on(t.userId),
    check(
      "submissions_kind_check",
      sql`(${t.kind} = 'file' and ${t.fileKey} is not null) or (${t.kind} = 'link' and ${t.url} is not null)`,
    ),
    check(
      "submissions_size_check",
      sql`${t.sizeBytes} is null or ${t.sizeBytes} between 1 and 26214400`, // 25 MB
    ),
  ],
);

export const evaluations = pgTable(
  "evaluations",
  {
    id: pk(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    content: smallint("content").notNull(),
    presentation: smallint("presentation").notNull(),
    participation: smallint("participation").notNull(),
    comment: text("comment"),
    evaluatorId: text("evaluator_id").references(() => user.id, { onDelete: "set null" }),
    evaluatedAt: tz("evaluated_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("evaluations_submission_unique").on(t.submissionId), // one score sheet per submission; edits go to audit_log
    check("evaluations_content_check", sql`${t.content} between 0 and 5`),
    check("evaluations_presentation_check", sql`${t.presentation} between 0 and 5`),
    check("evaluations_participation_check", sql`${t.participation} between 0 and 5`),
  ],
);

// ---------- events, registrations, teams ----------
export const events = pgTable(
  "events",
  {
    id: pk(),
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "restrict" }), // null = inter-campus
    name: text("name").notNull(), // Gambade, Hackathon, International Conference, Cross Road
    description: text("description"),
    venue: text("venue"),
    startsAt: tz("starts_at").notNull(),
    endsAt: tz("ends_at").notNull(),
    registrationClosesAt: tz("registration_closes_at"),
    teamBased: boolean("team_based").notNull().default(false),
    minTeamSize: smallint("min_team_size").notNull().default(1),
    maxTeamSize: smallint("max_team_size").notNull().default(1),
    capacity: integer("capacity"),
    checkInOpen: boolean("check_in_open").notNull().default(false),
    status: eventStatus("status").notNull().default("draft"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("events_time_check", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "events_team_size_check",
      sql`${t.minTeamSize} >= 1 and ${t.maxTeamSize} >= ${t.minTeamSize}`,
    ),
    index("events_campus_start_idx").on(t.campusId, t.startsAt),
  ],
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: pk(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: registrationStatus("status").notNull().default("registered"),
    checkedInAt: tz("checked_in_at"),
    checkInMethod: checkinMethod("check_in_method"),
    rank: integer("rank"), // result for individual events
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("event_registrations_event_user_unique").on(t.eventId, t.userId), // one registration per student per event
    index("event_registrations_user_idx").on(t.userId),
    check("event_registrations_rank_check", sql`${t.rank} is null or ${t.rank} >= 1`),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: pk(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    joinCode: text("join_code").notNull().unique(),
    leaderId: text("leader_id").references(() => user.id, { onDelete: "set null" }),
    rank: integer("rank"), // result for team events
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("teams_event_name_unique").on(t.eventId, t.name),
    unique("teams_id_event_unique").on(t.id, t.eventId), // lets team_members point at (team, event) together
    check("teams_rank_check", sql`${t.rank} is null or ${t.rank} >= 1`),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: pk(),
    teamId: uuid("team_id").notNull(),
    eventId: uuid("event_id").notNull(), // copied from the team so the database can enforce one team per event
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.teamId, t.eventId],
      foreignColumns: [teams.id, teams.eventId],
      name: "team_members_team_event_fk",
    }).onDelete("cascade"),
    unique("team_members_event_user_unique").on(t.eventId, t.userId), // one team per student per event
    index("team_members_team_idx").on(t.teamId),
  ],
);

// ---------- certificates ----------
export const certificates = pgTable(
  "certificates",
  {
    id: pk(),
    code: text("code").notNull().unique(), // short public code used in /verify/[code]
    kind: certificateKind("kind").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "set null" }),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    issuedBy: text("issued_by").references(() => user.id, { onDelete: "set null" }), // null = system
    title: text("title").notNull(),
    sha256: text("sha256").notNull(), // fingerprint of the exact PDF bytes
    storageKey: text("storage_key").notNull(),
    issuedAt: tz("issued_at").notNull().defaultNow(),
    revokedAt: tz("revoked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("certificates_sha_check", sql`length(${t.sha256}) = 64`),
    check(
      "certificates_subject_check",
      sql`${t.clubId} is not null or ${t.activityId} is not null or ${t.eventId} is not null`,
    ),
    // no duplicate certificate of the same kind for the same student and event or activity
    uniqueIndex("certificates_user_event_kind_idx")
      .on(t.userId, t.eventId, t.kind)
      .where(sql`${t.eventId} is not null`),
    uniqueIndex("certificates_user_activity_kind_idx")
      .on(t.userId, t.activityId, t.kind)
      .where(sql`${t.activityId} is not null`),
    index("certificates_user_idx").on(t.userId),
  ],
);

// ---------- notifications, audit, reports ----------
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // plan_due, announcement, submission_reminder, plan_decision, ...
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    // The daily job builds this (for example "announce:ACTIVITY_ID"). The unique index below
    // makes running the job twice harmless.
    dedupeKey: text("dedupe_key").notNull(),
    readAt: tz("read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("notifications_user_dedupe_unique").on(t.userId, t.dedupeKey),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// Append-only: never update or delete rows from app code.
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. activity.approve, attendance.correct, evaluation.update
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

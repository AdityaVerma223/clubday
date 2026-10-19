/**
 * Authorize mutations on the server. Never trust a client-sent user id or role.
 */

import { db } from "@/db";
import { activities, attendance, clubs, clubStaff, clubMembers, notifications, submissions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type CanInput = {
  action: string;
  resource?: {
    type: string;
    id?: string;
  };
  userId: string;
  userRole: string;
  userCampusId?: string;
};

/**
 * Check if the current user can perform an action on a resource.
 * Action format: "resource.action" e.g. "club.create", "club.edit", "club.join"
 */
export async function can(input: CanInput): Promise<boolean> {
  const { userId, userRole, userCampusId } = input;
  const [resourceType, action] = input.action.split(".");

  // Admin can do everything
  if (userRole === "admin") {
    return true;
  }

  switch (resourceType) {
    case "club":
      return await canClubAction(userId, userRole, userCampusId, action, input.resource);
    case "membership":
      return await canMembershipAction(userId, userRole, action, input.resource);
    case "campus":
      return action === "calendar" && userRole === "campus_manager" && input.resource?.id === userCampusId;
    case "activity":
      return await canActivityAction(userId, userRole, action, input.resource);
    case "attendance":
      return await canAttendanceAction(userId, userRole, action, input.resource);
    case "submission":
      return await canSubmissionAction(userId, userRole, action, input.resource);
    case "notification":
      if (action === "read" && input.resource?.id) {
        const notification = await db.query.notifications.findFirst({ where: eq(notifications.id, input.resource.id) });
        return notification?.userId === userId;
      }
      return false;
    default:
      return false;
  }
}

async function isClubStaff(userId: string, clubId: string, role: "advisor" | "coordinator") {
  return Boolean(await db.query.clubStaff.findFirst({
    where: and(eq(clubStaff.clubId, clubId), eq(clubStaff.userId, userId), eq(clubStaff.role, role)),
  }));
}

async function canActivityAction(userId: string, userRole: string, action: string, resource?: { type: string; id?: string }) {
  if (action === "plan" && resource?.id && userRole === "coordinator") {
    return isClubStaff(userId, resource.id, "coordinator");
  }
  if (!resource?.id) return false;
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, resource.id) });
  if (!activity) return false;
  if (action === "approve" && userRole === "advisor") return isClubStaff(userId, activity.clubId, "advisor");
  if (["manage", "announce", "checkin_open", "checkin_close", "submissions_open"].includes(action) && userRole === "coordinator") {
    return isClubStaff(userId, activity.clubId, "coordinator");
  }
  return false;
}

async function canAttendanceAction(userId: string, userRole: string, action: string, resource?: { type: string; id?: string }) {
  if (!resource?.id) return false;
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, resource.id) });
  if (!activity) return false;
  if (action === "checkin" && userRole === "student") {
    const [member, existing] = await Promise.all([
      db.query.clubMembers.findFirst({ where: and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.userId, userId), eq(clubMembers.status, "approved")) }),
      db.query.attendance.findFirst({ where: and(eq(attendance.activityId, activity.id), eq(attendance.userId, userId)) }),
    ]);
    return Boolean(member && !existing && activity.status === "check_in_open");
  }
  if (["manual", "correct"].includes(action) && userRole === "coordinator") {
    return isClubStaff(userId, activity.clubId, "coordinator");
  }
  return false;
}

async function canSubmissionAction(userId: string, userRole: string, action: string, resource?: { type: string; id?: string }) {
  if (!resource?.id) return false;
  if (action === "submit" && userRole === "student") {
    const activity = await db.query.activities.findFirst({ where: eq(activities.id, resource.id) });
    if (!activity || !["submissions_open", "evaluating"].includes(activity.status)) return false;
    const [member, checkin] = await Promise.all([
      db.query.clubMembers.findFirst({ where: and(eq(clubMembers.clubId, activity.clubId), eq(clubMembers.userId, userId), eq(clubMembers.status, "approved")) }),
      db.query.attendance.findFirst({ where: and(eq(attendance.activityId, activity.id), eq(attendance.userId, userId), eq(attendance.status, "present")) }),
    ]);
    return Boolean(member && checkin);
  }
  if (action === "evaluate" && (userRole === "advisor" || userRole === "coordinator")) {
    const submission = await db.query.submissions.findFirst({ where: eq(submissions.id, resource.id) });
    if (!submission) return false;
    const activity = await db.query.activities.findFirst({ where: eq(activities.id, submission.activityId) });
    return activity ? isClubStaff(userId, activity.clubId, userRole) : false;
  }
  return false;
}

async function canClubAction(
  userId: string,
  userRole: string,
  userCampusId: string | undefined,
  action: string,
  resource?: { type: string; id?: string },
): Promise<boolean> {
  switch (action) {
    case "create":
      // Only admin can create clubs
      return false;

    case "edit":
      // Only admin can edit clubs
      return false;

    case "approve":
      // Admin or campus manager can approve clubs on their campus
      if (userRole === "campus_manager" && resource?.id) {
        const club = await db.query.clubs.findFirst({
          where: eq(clubs.id, resource.id),
        });
        return club?.campusId === userCampusId;
      }
      return false;

    case "view":
      // Everyone can view approved clubs
      if (resource?.id) {
        const club = await db.query.clubs.findFirst({
          where: eq(clubs.id, resource.id),
        });
        return club?.status === "approved";
      }
      return true;

    default:
      return false;
  }
}

async function canMembershipAction(
  userId: string,
  userRole: string,
  action: string,
  resource?: { type: string; id?: string },
): Promise<boolean> {
  switch (action) {
    case "request":
      // Students can request to join clubs
      return userRole === "student";

    case "approve":
    case "reject":
      // Coordinators can approve/reject requests for their own clubs
      if (userRole === "coordinator" && resource?.id) {
        const membership = await db.query.clubMembers.findFirst({
          where: eq(clubMembers.id, resource.id),
        });
        if (!membership) return false;

        // Check if user is a coordinator of this club
        const staff = await db.query.clubStaff.findFirst({
          where: and(
            eq(clubStaff.clubId, membership.clubId),
            eq(clubStaff.userId, userId),
            eq(clubStaff.role, "coordinator"),
          ),
        });
        return !!staff;
      }
      return false;

    case "view":
      // Users can view their own memberships
      if (resource?.id) {
        const membership = await db.query.clubMembers.findFirst({
          where: eq(clubMembers.id, resource.id),
        });
        return membership?.userId === userId;
      }
      return false;

    default:
      return false;
  }
}

/**
 * Authorize mutations on the server. Never trust a client-sent user id or role.
 */

import { db } from "@/db";
import { clubs, clubStaff, clubMembers } from "@/db/schema";
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
    default:
      return false;
  }
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

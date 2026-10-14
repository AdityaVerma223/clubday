"use server";

import { z } from "zod";
import { db } from "@/db";
import { clubs, clubStaff, clubMembers, campuses, user } from "@/db/schema";
import { eq, and, count, desc, inArray } from "drizzle-orm";
import { can } from "@/lib/policy";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// ---------- Zod schemas ----------

const createClubSchema = z.object({
  campusId: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  capacity: z.number().int().min(1).max(500),
  meetingRule: z.string().min(1).max(200),
  advisorIds: z.array(z.string()).min(1),
  coordinatorIds: z.array(z.string()).min(1),
});

const editClubSchema = z.object({
  id: z.string().uuid(),
  campusId: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  capacity: z.number().int().min(1).max(500),
  meetingRule: z.string().min(1).max(200),
  advisorIds: z.array(z.string()).min(1),
  coordinatorIds: z.array(z.string()).min(1),
});

const requestJoinSchema = z.object({
  clubId: z.string().uuid(),
  kind: z.enum(["primary", "secondary"]),
});

const membershipDecisionSchema = z.object({
  membershipId: z.string().uuid(),
  approve: z.boolean(),
});

// ---------- Server actions ----------

export async function createClub(input: z.infer<typeof createClubSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const validated = createClubSchema.parse(input);

  const authorized = await can({
    action: "club.create",
    userId: session.user.id,
    userRole: session.user.role,
    userCampusId: session.user.campusId ?? undefined,
  });

  if (!authorized) {
    throw new Error("Forbidden: Only admin can create clubs");
  }

  // Verify campus exists
  const campus = await db.query.campuses.findFirst({
    where: eq(campuses.id, validated.campusId),
  });
  if (!campus) {
    throw new Error("Campus not found");
  }

  // Verify all advisor and coordinator users exist
  await getAssignedStaff(validated.campusId, validated.advisorIds, validated.coordinatorIds);

  // Create club and staff in a transaction
  const [club] = await db.transaction(async (tx) => {
    const [newClub] = await tx
      .insert(clubs)
      .values({
        campusId: validated.campusId,
        name: validated.name,
        category: validated.category,
        description: validated.description,
        capacity: validated.capacity,
        meetingRule: validated.meetingRule,
        status: "pending_approval",
      })
      .returning();

    // Add advisors
    for (const advisorId of validated.advisorIds) {
      await tx.insert(clubStaff).values({
        clubId: newClub.id,
        userId: advisorId,
        role: "advisor",
      });
    }

    // Add coordinators
    for (const coordinatorId of validated.coordinatorIds) {
      await tx.insert(clubStaff).values({
        clubId: newClub.id,
        userId: coordinatorId,
        role: "coordinator",
      });
    }

    return [newClub];
  });

  return club;
}

export async function editClub(input: z.infer<typeof editClubSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const validated = editClubSchema.parse(input);

  const authorized = await can({
    action: "club.edit",
    resource: { type: "club", id: validated.id },
    userId: session.user.id,
    userRole: session.user.role,
    userCampusId: session.user.campusId ?? undefined,
  });

  if (!authorized) {
    throw new Error("Forbidden: Only admin can edit clubs");
  }

  // Verify club exists
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, validated.id),
  });
  if (!club) {
    throw new Error("Club not found");
  }

  const campus = await db.query.campuses.findFirst({ where: eq(campuses.id, validated.campusId) });
  if (!campus) throw new Error("Campus not found");
  await getAssignedStaff(validated.campusId, validated.advisorIds, validated.coordinatorIds);

  // Update club and staff in a transaction
  await db.transaction(async (tx) => {
    await tx
      .update(clubs)
      .set({
        campusId: validated.campusId,
        name: validated.name,
        category: validated.category,
        description: validated.description,
        capacity: validated.capacity,
        meetingRule: validated.meetingRule,
      })
      .where(eq(clubs.id, validated.id));

    // Delete existing staff
    await tx.delete(clubStaff).where(eq(clubStaff.clubId, validated.id));

    // Add advisors
    for (const advisorId of validated.advisorIds) {
      await tx.insert(clubStaff).values({
        clubId: validated.id,
        userId: advisorId,
        role: "advisor",
      });
    }

    // Add coordinators
    for (const coordinatorId of validated.coordinatorIds) {
      await tx.insert(clubStaff).values({
        clubId: validated.id,
        userId: coordinatorId,
        role: "coordinator",
      });
    }
  });

  return { success: true };
}

async function getAssignedStaff(campusId: string, advisorIds: string[], coordinatorIds: string[]) {
  const ids = [...advisorIds, ...coordinatorIds];
  if (new Set(ids).size !== ids.length) throw new Error("A staff member can only be assigned once per club");
  const staffUsers = ids.length
    ? await db.query.user.findMany({ where: inArray(user.id, ids), columns: { id: true, role: true, campusId: true } })
    : [];
  if (staffUsers.length !== ids.length) throw new Error("One or more staff users not found");
  const userById = new Map(staffUsers.map((staffUser) => [staffUser.id, staffUser]));
  for (const id of advisorIds) {
    const staffUser = userById.get(id);
    if (staffUser?.role !== "advisor" || staffUser.campusId !== campusId) {
      throw new Error("Choose faculty advisors assigned to this campus");
    }
  }
  for (const id of coordinatorIds) {
    const staffUser = userById.get(id);
    if (staffUser?.role !== "coordinator" || staffUser.campusId !== campusId) {
      throw new Error("Choose student coordinators assigned to this campus");
    }
  }
  return staffUsers;
}

export async function listClubFormOptions() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.role !== "admin") throw new Error("Forbidden: Only admins can manage clubs");
  const [campusRows, staffRows] = await Promise.all([
    db.query.campuses.findMany({ columns: { id: true, code: true, name: true }, orderBy: (campus, { asc }) => [asc(campus.name)] }),
    db.query.user.findMany({
      where: inArray(user.role, ["advisor", "coordinator"]),
      columns: { id: true, name: true, email: true, role: true, campusId: true },
      orderBy: (account, { asc }) => [asc(account.name)],
    }),
  ]);
  return { campuses: campusRows, users: staffRows };
}

export async function listClubs() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const userRole = session?.user?.role;
  const userCampusId = session?.user?.campusId;

  // Only admins can browse across campuses. Other users must have a campus.
  const whereClause =
    userRole === "admin"
      ? undefined
      : typeof userCampusId === "string"
        ? and(eq(clubs.status, "approved"), eq(clubs.campusId, userCampusId))
        : eq(clubs.id, "00000000-0000-0000-0000-000000000000");

  const clubsList = await db.query.clubs.findMany({
    where: whereClause,
    with: {
      campus: true,
      staff: {
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: [desc(clubs.createdAt)],
  });

  // For each club, get member count
  const clubsWithCounts = await Promise.all(
    clubsList.map(async (club) => {
      const [memberCountResult] = await db
        .select({ count: count() })
        .from(clubMembers)
        .where(
          and(
            eq(clubMembers.clubId, club.id),
            eq(clubMembers.status, "approved"),
          ),
        );

      // If user is logged in, check their membership status
      let userMembership = null;
      if (userId) {
        userMembership = await db.query.clubMembers.findFirst({
          where: and(
            eq(clubMembers.clubId, club.id),
            eq(clubMembers.userId, userId),
          ),
        });
      }

      return {
        ...club,
        memberCount: memberCountResult?.count || 0,
        userMembership: userMembership
          ? {
            id: userMembership.id,
            kind: userMembership.kind,
            status: userMembership.status,
          }
          : null,
      };
    }),
  );

  return clubsWithCounts;
}

export async function requestJoin(input: z.infer<typeof requestJoinSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const validated = requestJoinSchema.parse(input);

  const authorized = await can({
    action: "membership.request",
    userId: session.user.id,
    userRole: session.user.role,
    userCampusId: session.user.campusId ?? undefined,
  });

  if (!authorized) {
    throw new Error("Forbidden: Only students can request to join clubs");
  }

  // Verify club is approved
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, validated.clubId),
  });
  if (!club) {
    throw new Error("Club not found");
  }
  if (club.status !== "approved") {
    throw new Error("Club is not approved");
  }
  console.info("[clubday:campus-check]", {
    userId: session.user.id,
    sessionCampusPresent: Boolean(session.user.campusId),
    sessionCampusId: session.user.campusId ?? null,
    clubId: club.id,
    clubCampusId: club.campusId,
    campusMatches: Boolean(session.user.campusId) &&
      club.campusId === session.user.campusId,
  });

  if (!session.user.campusId || club.campusId !== session.user.campusId) {
    throw new Error("You can only request membership at your own campus");
  }

  // Check if user already has a membership of this kind
  const existing = await db.query.clubMembers.findFirst({
    where: and(
      eq(clubMembers.userId, session.user.id),
      eq(clubMembers.kind, validated.kind),
      eq(clubMembers.clubId, validated.clubId),
    ),
  });

  if (existing) {
    if (existing.status === "approved") {
      throw new Error("Already a member of this club");
    }
    if (existing.status === "requested") {
      throw new Error("Request already pending");
    }
    // If rejected, allow re-request by updating the row
  }

  // In a single transaction:
  // 1. Check user doesn't exceed one primary and one secondary club limit
  // 2. Check club capacity is not exceeded
  // 3. Create or update membership request
  await db.transaction(async (tx) => {
    // Check limit: at most one primary and one secondary club per student
    const existingKinds = await tx
      .select({ kind: clubMembers.kind })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.userId, session.user.id),
          eq(clubMembers.kind, validated.kind),
          eq(clubMembers.status, "approved"),
        ),
      );

    if (existingKinds.length > 0) {
      throw new Error(
        `You already have a ${validated.kind} club. Maximum one ${validated.kind} club allowed.`,
      );
    }

    // Check capacity
    const [memberCountResult] = await tx
      .select({ count: count() })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, validated.clubId),
          eq(clubMembers.status, "approved"),
        ),
      );

    if (memberCountResult?.count && memberCountResult.count >= club.capacity) {
      throw new Error("Club is at full capacity");
    }

    // Create or update membership
    if (existing) {
      await tx
        .update(clubMembers)
        .set({
          status: "requested",
          requestedAt: new Date(),
        })
        .where(eq(clubMembers.id, existing.id));
    } else {
      await tx.insert(clubMembers).values({
        clubId: validated.clubId,
        userId: session.user.id,
        kind: validated.kind,
        status: "requested",
      });
    }
  });

  return { success: true };
}

export async function approveMembership(
  input: z.infer<typeof membershipDecisionSchema>,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const validated = membershipDecisionSchema.parse(input);

  const authorized = await can({
    action: "membership.approve",
    resource: { type: "membership", id: validated.membershipId },
    userId: session.user.id,
    userRole: session.user.role,
    userCampusId: session.user.campusId ?? undefined,
  });

  if (!authorized) {
    throw new Error("Forbidden: Only coordinators can approve memberships");
  }

  // Get membership and club
  const membership = await db.query.clubMembers.findFirst({
    where: eq(clubMembers.id, validated.membershipId),
    with: {
      club: true,
    },
  });

  if (!membership) {
    throw new Error("Membership not found");
  }

  if (membership.status !== "requested") {
    throw new Error("Membership is not in requested state");
  }

  // Get club capacity separately
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, membership.clubId),
  });

  if (!club) {
    throw new Error("Club not found");
  }

  // In a single transaction:
  // 1. Check club capacity
  // 2. Approve or reject membership
  await db.transaction(async (tx) => {
    if (validated.approve) {
      // Check capacity
      const [memberCountResult] = await tx
        .select({ count: count() })
        .from(clubMembers)
        .where(
          and(
            eq(clubMembers.clubId, membership.clubId),
            eq(clubMembers.status, "approved"),
          ),
        );

      if (
        memberCountResult?.count &&
        memberCountResult.count >= club.capacity
      ) {
        throw new Error("Club is at full capacity");
      }

      // Approve
      await tx
        .update(clubMembers)
        .set({
          status: "approved",
          decidedBy: session.user.id,
          decidedAt: new Date(),
        })
        .where(eq(clubMembers.id, validated.membershipId));
    } else {
      // Reject
      await tx
        .update(clubMembers)
        .set({
          status: "rejected",
          decidedBy: session.user.id,
          decidedAt: new Date(),
        })
        .where(eq(clubMembers.id, validated.membershipId));
    }
  });

  return { success: true };
}

export async function rejectMembership(
  input: z.infer<typeof membershipDecisionSchema>,
) {
  return approveMembership({ ...input, approve: false });
}

export async function listMembers(clubId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is a coordinator of this club
  const staff = await db.query.clubStaff.findFirst({
    where: and(
      eq(clubStaff.clubId, clubId),
      eq(clubStaff.userId, session.user.id),
      eq(clubStaff.role, "coordinator"),
    ),
  });

  if (!staff && session.user.role !== "admin") {
    throw new Error("Forbidden: Only coordinators can view club members");
  }

  const members = await db.query.clubMembers.findMany({
    where: eq(clubMembers.clubId, clubId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          studentId: true,
        },
      },
    },
    orderBy: [desc(clubMembers.requestedAt)],
  });

  return members;
}

export async function listMyMemberships() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const memberships = await db.query.clubMembers.findMany({
    where: eq(clubMembers.userId, session.user.id),
    with: {
      club: {
        with: {
          campus: true,
        },
      },
    },
    orderBy: [desc(clubMembers.requestedAt)],
  });

  return memberships;
}

export async function getClubById(clubId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const userRole = session?.user?.role;

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
    with: {
      campus: true,
      staff: {
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!club) {
    throw new Error("Club not found");
  }

  // Check authorization
  const authorized = await can({
    action: "club.view",
    resource: { type: "club", id: clubId },
    userId: userId || "",
    userRole: userRole || "student",
    userCampusId: session?.user?.campusId ?? undefined,
  });

  if (!authorized) {
    throw new Error("Forbidden: Club is not approved");
  }

  // Get member count
  const [memberCountResult] = await db
    .select({ count: count() })
    .from(clubMembers)
    .where(
      and(eq(clubMembers.clubId, clubId), eq(clubMembers.status, "approved")),
    );

  // If user is logged in, check their membership status
  let userMembership = null;
  if (userId) {
    userMembership = await db.query.clubMembers.findFirst({
      where: and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)),
    });
  }

  return {
    ...club,
    memberCount: memberCountResult?.count || 0,
    userMembership: userMembership
      ? {
          id: userMembership.id,
          kind: userMembership.kind,
          status: userMembership.status,
        }
      : null,
  };
}

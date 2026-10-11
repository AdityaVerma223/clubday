import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/db";
import { clubs, clubMembers, campuses, user, clubStaff } from "@/db/schema";
import { requestJoin, approveMembership } from "@/server/actions/clubs";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

describe("Club Membership Rules", () => {
  let testCampusId: string;
  let testClubId: string;
  let testClub2Id: string;
  let testUserId: string;
  let testCoordinatorId: string;
  let testUser2Id: string;
  let testUser3Id: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(clubMembers);
    await db.delete(clubStaff);
    await db.delete(clubs);
    await db.delete(campuses);
    await db.delete(user);

    // Create test campus
    const [campus] = await db
      .insert(campuses)
      .values({
        code: "TEST",
        name: "Test Campus",
      })
      .returning();
    testCampusId = campus.id;

    // Create test clubs
    const [club] = await db
      .insert(clubs)
      .values({
        campusId: testCampusId,
        name: "Test Club",
        category: "Technical",
        description: "A test club",
        capacity: 2,
        meetingRule: "Every Friday",
        status: "approved",
      })
      .returning();
    testClubId = club.id;

    const [club2] = await db
      .insert(clubs)
      .values({
        campusId: testCampusId,
        name: "Test Club 2",
        category: "Cultural",
        description: "Another test club",
        capacity: 2,
        meetingRule: "Every Saturday",
        status: "approved",
      })
      .returning();
    testClub2Id = club2.id;

    // Create test users
    const [testUser] = await db
      .insert(user)
      .values({
        id: "test-student-id",
        name: "Test Student",
        email: "test@student.com",
        role: "student",
        campusId: testCampusId,
        studentId: "TEST001",
      })
      .returning();
    testUserId = testUser.id;

    const [testUser2] = await db
      .insert(user)
      .values({
        id: "test-student-2-id",
        name: "Test Student 2",
        email: "test2@student.com",
        role: "student",
        campusId: testCampusId,
        studentId: "TEST002",
      })
      .returning();
    testUser2Id = testUser2.id;

    const [testUser3] = await db
      .insert(user)
      .values({
        id: "test-student-3-id",
        name: "Test Student 3",
        email: "test3@student.com",
        role: "student",
        campusId: testCampusId,
        studentId: "TEST003",
      })
      .returning();
    testUser3Id = testUser3.id;

    // Create test coordinator
    const [coordinator] = await db
      .insert(user)
      .values({
        id: "test-coordinator-id",
        name: "Test Coordinator",
        email: "coordinator@test.com",
        role: "coordinator",
        campusId: testCampusId,
        studentId: "TEST004",
      })
      .returning();
    testCoordinatorId = coordinator.id;

    // Make coordinator a staff member of both clubs
    await db.insert(clubStaff).values([
      {
        clubId: testClubId,
        userId: testCoordinatorId,
        role: "coordinator",
      },
      {
        clubId: testClub2Id,
        userId: testCoordinatorId,
        role: "coordinator",
      },
    ]);
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(clubMembers);
    await db.delete(clubStaff);
    await db.delete(clubs);
    await db.delete(campuses);
    await db.delete(user);
  });

  describe("Primary and Secondary Club Limit", () => {
    it("should allow requesting a primary club when user has none", async () => {
      // Mock the session to return the test student
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      const result = await requestJoin({
        clubId: testClubId,
        kind: "primary",
      });

      expect(result).toEqual({ success: true });

      // Verify membership was created
      const membership = await db.query.clubMembers.findFirst({
        where: eq(clubMembers.userId, testUserId),
      });
      expect(membership).toBeDefined();
      expect(membership?.kind).toBe("primary");
      expect(membership?.status).toBe("requested");
    });

    it("should reject requesting a second primary club", async () => {
      // First, create an approved primary membership in testClubId
      await db.insert(clubMembers).values({
        clubId: testClubId,
        userId: testUserId,
        kind: "primary",
        status: "approved",
      });

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      // Try to request another primary club (testClub2Id)
      await expect(
        requestJoin({
          clubId: testClub2Id,
          kind: "primary",
        }),
      ).rejects.toThrow("You already have a primary club");
    });

    it("should allow requesting a secondary club when user has none", async () => {
      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      const result = await requestJoin({
        clubId: testClubId,
        kind: "secondary",
      });

      expect(result).toEqual({ success: true });

      const membership = await db.query.clubMembers.findFirst({
        where: eq(clubMembers.userId, testUserId),
      });
      expect(membership?.kind).toBe("secondary");
    });

    it("should reject requesting a second secondary club", async () => {
      // Create an approved secondary membership in testClubId
      await db.insert(clubMembers).values({
        clubId: testClubId,
        userId: testUserId,
        kind: "secondary",
        status: "approved",
      });

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      await expect(
        requestJoin({
          clubId: testClub2Id,
          kind: "secondary",
        }),
      ).rejects.toThrow("You already have a secondary club");
    });

    it("should allow having both a primary and a secondary club", async () => {
      // Create approved primary membership in testClubId
      await db.insert(clubMembers).values({
        clubId: testClubId,
        userId: testUserId,
        kind: "primary",
        status: "approved",
      });

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      // Request secondary club (testClub2Id)
      const result = await requestJoin({
        clubId: testClub2Id,
        kind: "secondary",
      });

      expect(result).toEqual({ success: true });

      // Verify both memberships exist
      const memberships = await db.query.clubMembers.findMany({
        where: eq(clubMembers.userId, testUserId),
      });
      expect(memberships).toHaveLength(2);
      expect(memberships.some((m) => m.kind === "primary")).toBe(true);
      expect(memberships.some((m) => m.kind === "secondary")).toBe(true);
    });
  });

  describe("Club Capacity Enforcement", () => {
    it("should allow joining when club is below capacity", async () => {
      // Club capacity is 2, no members yet

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      const result = await requestJoin({
        clubId: testClubId,
        kind: "primary",
      });

      expect(result).toEqual({ success: true });
    });

    it("should reject joining when club is at full capacity", async () => {
      // Add 2 approved members (testUser2 and testUser3) to reach capacity
      await db.insert(clubMembers).values([
        {
          clubId: testClubId,
          userId: testUser2Id,
          kind: "primary",
          status: "approved",
        },
        {
          clubId: testClubId,
          userId: testUser3Id,
          kind: "primary",
          status: "approved",
        },
      ]);

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      await expect(
        requestJoin({
          clubId: testClubId,
          kind: "primary",
        }),
      ).rejects.toThrow("Club is at full capacity");
    });

    it("should reject approving when club is at full capacity", async () => {
      // Create a pending membership for testUserId
      const [membership] = await db
        .insert(clubMembers)
        .values({
          clubId: testClubId,
          userId: testUserId,
          kind: "primary",
          status: "requested",
        })
        .returning();

      // Add 2 approved members (testUser2 and testUser3) to reach capacity
      await db.insert(clubMembers).values([
        {
          clubId: testClubId,
          userId: testUser2Id,
          kind: "primary",
          status: "approved",
        },
        {
          clubId: testClubId,
          userId: testUser3Id,
          kind: "primary",
          status: "approved",
        },
      ]);

      // Mock the session as coordinator
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testCoordinatorId,
          name: "Test Coordinator",
          email: "coordinator@test.com",
          role: "coordinator",
          campusId: testCampusId,
          studentId: "TEST004",
        },
      } as any);

      await expect(
        approveMembership({
          membershipId: membership.id,
          approve: true,
        }),
      ).rejects.toThrow("Club is at full capacity");
    });
  });

  describe("Edge Cases", () => {
    it("should allow re-requesting after rejection", async () => {
      // Create a rejected membership
      const [membership] = await db
        .insert(clubMembers)
        .values({
          clubId: testClubId,
          userId: testUserId,
          kind: "primary",
          status: "rejected",
        })
        .returning();

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      const result = await requestJoin({
        clubId: testClubId,
        kind: "primary",
      });

      expect(result).toEqual({ success: true });

      // Verify the membership was updated to requested
      const updated = await db.query.clubMembers.findFirst({
        where: eq(clubMembers.id, membership.id),
      });
      expect(updated?.status).toBe("requested");
    });

    it("should not allow duplicate requests", async () => {
      // Create a pending membership
      await db.insert(clubMembers).values({
        clubId: testClubId,
        userId: testUserId,
        kind: "primary",
        status: "requested",
      });

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      await expect(
        requestJoin({
          clubId: testClubId,
          kind: "primary",
        }),
      ).rejects.toThrow("Request already pending");
    });

    it("should not allow joining an already joined club", async () => {
      // Create an approved membership
      await db.insert(clubMembers).values({
        clubId: testClubId,
        userId: testUserId,
        kind: "primary",
        status: "approved",
      });

      // Mock the session
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: testUserId,
          name: "Test Student",
          email: "test@student.com",
          role: "student",
          campusId: testCampusId,
          studentId: "TEST001",
        },
      } as any);

      await expect(
        requestJoin({
          clubId: testClubId,
          kind: "primary",
        }),
      ).rejects.toThrow("Already a member of this club");
    });
  });
});

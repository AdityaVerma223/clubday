"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listClubs, requestJoin, listMyMemberships } from "@/server/actions/clubs";
import { Users, MapPin, Calendar, Check } from "lucide-react";

type Club = {
  id: string;
  name: string;
  category: string;
  description: string;
  capacity: number;
  meetingRule: string;
  status: string;
  campus: { id: string; name: string; code: string };
  staff: Array<{
    id: string;
    role: string;
    user: { id: string; name: string; email: string };
  }>;
  memberCount: number;
  userMembership: {
    id: string;
    kind: string;
    status: string;
  } | null;
};

type Membership = {
  id: string;
  kind: string;
  status: string;
  club: {
    id: string;
    name: string;
    category: string;
    campus: { name: string };
  };
};

export default function StudentClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myMemberships, setMyMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [clubsData, membershipsData] = await Promise.all([
        listClubs(),
        listMyMemberships(),
      ]);
      setClubs(clubsData);
      setMyMemberships(membershipsData);
    } catch (error) {
      console.error("Failed to load clubs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const handleRequestJoin = async (clubId: string, kind: "primary" | "secondary") => {
    try {
      setJoining(clubId);
      await requestJoin({ clubId, kind });
      await loadData();
    } catch (error) {
      console.error("Failed to request join:", error);
      alert(error instanceof Error ? error.message : "Failed to request join");
    } finally {
      setJoining(null);
    }
  };

  const getMembershipStatus = (club: Club) => {
    if (!club.userMembership) return null;
    return club.userMembership.status;
  };

  const canRequestPrimary = () => {
    return !myMemberships.some(
      (m) => m.kind === "primary" && m.status === "approved",
    );
  };

  const canRequestSecondary = () => {
    return !myMemberships.some(
      (m) => m.kind === "secondary" && m.status === "approved",
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-3xl font-bold tracking-tight">Browse Clubs</h1>
        <p className="text-muted-foreground">
          Join a primary and a secondary club to build your campus experience
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <h2 className="mb-4 text-xl font-semibold">My Memberships</h2>
        {myMemberships.length === 0 ? (
          <div className="flex min-h-[150px] items-center justify-center rounded-lg border-2 border-dashed">
            <p className="text-muted-foreground">No memberships yet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {myMemberships.map((membership, index) => (
              <motion.div
                key={membership.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{membership.club.name}</CardTitle>
                        <CardDescription>
                          {membership.club.campus.name} • {membership.club.category}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        {membership.status === "approved" ? (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
                            <Check className="h-4 w-4" />
                          </span>
                        ) : membership.status === "requested" ? (
                          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs text-yellow-600">
                            Pending
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-600">
                            Rejected
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="capitalize">{membership.kind}</span>
                      <span>•</span>
                      <span className="capitalize">{membership.status}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="mb-4 text-xl font-semibold">Available Clubs</h2>
        {clubs.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg border-2 border-dashed">
            <div className="text-center">
              <p className="text-lg font-medium">No clubs available</p>
              <p className="text-muted-foreground">Check back later for new clubs</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clubs.map((club, index) => {
              const membershipStatus = getMembershipStatus(club);
              return (
                <motion.div
                  key={club.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle>{club.name}</CardTitle>
                      <CardDescription>
                        {club.campus.name} • {club.category}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">{club.description}</p>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>
                            {club.memberCount}/{club.capacity} members
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{club.meetingRule}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{club.campus.name}</span>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {membershipStatus === "approved" ? (
                          <Button variant="outline" size="sm" className="w-full" disabled>
                            <Check className="mr-2 h-4 w-4" />
                            Member
                          </Button>
                        ) : membershipStatus === "requested" ? (
                          <Button variant="outline" size="sm" className="w-full" disabled>
                            Request Pending
                          </Button>
                        ) : membershipStatus === "rejected" ? (
                          <Button variant="outline" size="sm" className="w-full" disabled>
                            Request Rejected
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <Button
                              variant="default"
                              size="sm"
                              className="w-full"
                              disabled={!canRequestPrimary() || joining === club.id}
                              onClick={() => handleRequestJoin(club.id, "primary")}
                            >
                              {joining === club.id ? "Requesting..." : "Join as Primary"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              disabled={!canRequestSecondary() || joining === club.id}
                              onClick={() => handleRequestJoin(club.id, "secondary")}
                            >
                              {joining === club.id ? "Requesting..." : "Join as Secondary"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}

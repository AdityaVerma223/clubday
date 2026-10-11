"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listClubs, listMembers, approveMembership, rejectMembership } from "@/server/actions/clubs";
import { Check, X, Users, Mail, IdCard } from "lucide-react";

type Club = {
  id: string;
  name: string;
  category: string;
  campus: { name: string };
  memberCount: number;
};

type Member = {
  id: string;
  kind: string;
  status: string;
  requestedAt: Date | string;
  user: {
    id: string;
    name: string;
    email: string;
    studentId: string | null;
  };
};

export default function CoordinatorMembersPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadClubs();
  }, []);

  useEffect(() => {
    if (selectedClubId) {
      loadMembers(selectedClubId);
    }
  }, [selectedClubId]);

  const loadClubs = async () => {
    try {
      setLoading(true);
      const clubsData = await listClubs();
      // Filter to show only clubs where user is a coordinator
      // For now, show all approved clubs (this will be filtered on the server)
      setClubs(clubsData.filter((c) => c.status === "approved"));
      if (clubsData.length > 0) {
        setSelectedClubId(clubsData[0].id);
      }
    } catch (error) {
      console.error("Failed to load clubs:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (clubId: string) => {
    try {
      const membersData = await listMembers(clubId);
      setMembers(membersData);
    } catch (error) {
      console.error("Failed to load members:", error);
    }
  };

  const handleApprove = async (membershipId: string) => {
    try {
      setProcessing(membershipId);
      await approveMembership({ membershipId, approve: true });
      if (selectedClubId) {
        await loadMembers(selectedClubId);
      }
    } catch (error) {
      console.error("Failed to approve membership:", error);
      alert(error instanceof Error ? error.message : "Failed to approve membership");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (membershipId: string) => {
    try {
      setProcessing(membershipId);
      await rejectMembership({ membershipId, approve: false });
      if (selectedClubId) {
        await loadMembers(selectedClubId);
      }
    } catch (error) {
      console.error("Failed to reject membership:", error);
      alert(error instanceof Error ? error.message : "Failed to reject membership");
    } finally {
      setProcessing(null);
    }
  };

  const selectedClub = clubs.find((c) => c.id === selectedClubId);
  const pendingMembers = members.filter((m) => m.status === "requested");
  const approvedMembers = members.filter((m) => m.status === "approved");
  const rejectedMembers = members.filter((m) => m.status === "rejected");

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
          className="mb-6"
        >
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-24" />
            ))}
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 flex-1" />
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
        <h1 className="text-3xl font-bold tracking-tight">Membership Management</h1>
        <p className="text-muted-foreground">Approve or reject club membership requests</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <div className="flex gap-2 overflow-x-auto pb-2">
          {clubs.map((club) => (
            <Button
              key={club.id}
              variant={selectedClubId === club.id ? "default" : "outline"}
              onClick={() => setSelectedClubId(club.id)}
            >
              {club.name}
            </Button>
          ))}
        </div>
      </motion.div>

      {selectedClub && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="mb-4 text-xl font-semibold">
              Pending Requests ({pendingMembers.length})
            </h2>
            {pendingMembers.length === 0 ? (
              <div className="flex min-h-[150px] items-center justify-center rounded-lg border-2 border-dashed">
                <p className="text-muted-foreground">No pending requests</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pendingMembers.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card>
                      <CardHeader>
                        <CardTitle>{member.user.name}</CardTitle>
                        <CardDescription>
                          Requested as {member.kind} member
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            <span>{member.user.email}</span>
                          </div>
                          {member.user.studentId && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <IdCard className="h-4 w-4" />
                              <span>{member.user.studentId}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span className="capitalize">{member.kind}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1"
                            disabled={processing === member.id}
                            onClick={() => handleApprove(member.id)}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            {processing === member.id ? "Processing..." : "Approve"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex-1"
                            disabled={processing === member.id}
                            onClick={() => handleReject(member.id)}
                          >
                            <X className="mr-2 h-4 w-4" />
                            {processing === member.id ? "Processing..." : "Reject"}
                          </Button>
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
            transition={{ delay: 0.3 }}
            className="mb-8"
          >
            <h2 className="mb-4 text-xl font-semibold">
              Approved Members ({approvedMembers.length})
            </h2>
            {approvedMembers.length === 0 ? (
              <div className="flex min-h-[150px] items-center justify-center rounded-lg border-2 border-dashed">
                <p className="text-muted-foreground">No approved members yet</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {approvedMembers.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{member.user.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {member.user.email}
                            </CardDescription>
                          </div>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
                            <Check className="h-4 w-4" />
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-sm">
                          {member.user.studentId && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <IdCard className="h-3 w-3" />
                              <span className="text-xs">{member.user.studentId}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-3 w-3" />
                            <span className="text-xs capitalize">{member.kind}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {rejectedMembers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="mb-4 text-xl font-semibold">
                Rejected Requests ({rejectedMembers.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {rejectedMembers.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="opacity-60">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{member.user.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {member.user.email}
                            </CardDescription>
                          </div>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600">
                            <X className="h-4 w-4" />
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-sm">
                          {member.user.studentId && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <IdCard className="h-3 w-3" />
                              <span className="text-xs">{member.user.studentId}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-3 w-3" />
                            <span className="text-xs capitalize">{member.kind}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

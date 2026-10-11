"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClub, editClub, listClubs } from "@/server/actions/clubs";
import { Plus, Edit, Check, X } from "lucide-react";

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
};

type Campus = {
  id: string;
  code: string;
  name: string;
};

type User = {
  id: string;
  name: string;
  email: string;
};

export default function AdminClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [formData, setFormData] = useState<{
    campusId: string;
    name: string;
    category: string;
    description: string;
    capacity: number;
    meetingRule: string;
    advisorIds: string[];
    coordinatorIds: string[];
  }>({
    campusId: "",
    name: "",
    category: "",
    description: "",
    capacity: 30,
    meetingRule: "",
    advisorIds: [],
    coordinatorIds: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const clubsData = await listClubs();
      setClubs(clubsData);

      // Mock campuses and users for now - in real app, these would come from server actions
      setCampuses([
        { id: "1", code: "HI-TECH", name: "HI-TECH Campus" },
        { id: "2", code: "RATNAM", name: "Ratnam Campus" },
        { id: "3", code: "RGIB", name: "RGIB Campus" },
        { id: "4", code: "JUJ", name: "JUJ Campus" },
      ]);

      setUsers([
        { id: "u1", name: "Dr. Smith", email: "smith@msot.edu" },
        { id: "u2", name: "Dr. Johnson", email: "johnson@msot.edu" },
        { id: "u3", name: "Alice Student", email: "alice@msot.edu" },
        { id: "u4", name: "Bob Student", email: "bob@msot.edu" },
      ]);
    } catch (error) {
      console.error("Failed to load clubs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClub) {
        await editClub({
          id: editingClub.id,
          campusId: formData.campusId || "",
          name: formData.name,
          category: formData.category,
          description: formData.description,
          capacity: formData.capacity,
          meetingRule: formData.meetingRule,
          advisorIds: formData.advisorIds,
          coordinatorIds: formData.coordinatorIds,
        });
      } else {
        await createClub(formData);
      }
      setDialogOpen(false);
      setEditingClub(null);
      setFormData({
        campusId: "",
        name: "",
        category: "",
        description: "",
        capacity: 30,
        meetingRule: "",
        advisorIds: [],
        coordinatorIds: [],
      });
      loadData();
    } catch (error) {
      console.error("Failed to save club:", error);
      alert(error instanceof Error ? error.message : "Failed to save club");
    }
  };

  const handleEdit = (club: Club) => {
    setEditingClub(club);
    setFormData({
      campusId: club.campus.id,
      name: club.name,
      category: club.category,
      description: club.description,
      capacity: club.capacity,
      meetingRule: club.meetingRule,
      advisorIds: club.staff.filter((s) => s.role === "advisor").map((s) => s.user.id),
      coordinatorIds: club.staff.filter((s) => s.role === "coordinator").map((s) => s.user.id),
    });
    setDialogOpen(true);
  };

  const toggleAdvisor = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      advisorIds: prev.advisorIds.includes(userId)
        ? prev.advisorIds.filter((id) => id !== userId)
        : [...prev.advisorIds, userId],
    }));
  };

  const toggleCoordinator = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      coordinatorIds: prev.coordinatorIds.includes(userId)
        ? prev.coordinatorIds.filter((id) => id !== userId)
        : [...prev.coordinatorIds, userId],
    }));
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
        <h1 className="text-3xl font-bold tracking-tight">Club Management</h1>
        <p className="text-muted-foreground">Create and manage campus clubs</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 flex justify-end"
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button onClick={() => setEditingClub(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Club
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingClub ? "Edit Club" : "Create New Club"}</DialogTitle>
              <DialogDescription>
                {editingClub
                  ? "Update club information and staff assignments"
                  : "Add a new club to the campus"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="campus">Campus</Label>
                  <Select
                    value={formData.campusId || undefined}
                    onValueChange={(value) => setFormData({ ...formData, campusId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {campuses.map((campus) => (
                        <SelectItem key={campus.id} value={campus.id}>
                          {campus.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., Technical, Cultural"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Club Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Robotics Club"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the club"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min="1"
                    max="500"
                    value={formData.capacity}
                    onChange={(e) =>
                      setFormData({ ...formData, capacity: parseInt(e.target.value) || 30 })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meetingRule">Meeting Rule</Label>
                  <Input
                    id="meetingRule"
                    value={formData.meetingRule}
                    onChange={(e) => setFormData({ ...formData, meetingRule: e.target.value })}
                    placeholder="e.g., Every Saturday 10:00-12:00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Faculty Advisors</Label>
                <div className="grid grid-cols-2 gap-2">
                  {users.map((user) => (
                    <Button
                      key={user.id}
                      type="button"
                      variant={formData.advisorIds.includes(user.id) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleAdvisor(user.id)}
                      className="justify-start"
                    >
                      {formData.advisorIds.includes(user.id) && (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {user.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Student Coordinators</Label>
                <div className="grid grid-cols-2 gap-2">
                  {users.map((user) => (
                    <Button
                      key={user.id}
                      type="button"
                      variant={formData.coordinatorIds.includes(user.id) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleCoordinator(user.id)}
                      className="justify-start"
                    >
                      {formData.coordinatorIds.includes(user.id) && (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {user.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingClub ? "Update" : "Create"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {clubs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex min-h-[300px] items-center justify-center rounded-lg border-2 border-dashed"
        >
          <div className="text-center">
            <p className="text-lg font-medium">No clubs yet</p>
            <p className="text-muted-foreground">Create your first club to get started</p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {clubs.map((club, index) => (
            <motion.div
              key={club.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{club.name}</CardTitle>
                      <CardDescription>{club.campus.name}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {club.status === "approved" ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
                          <Check className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
                          <X className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{club.description}</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="font-medium">{club.category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capacity:</span>
                      <span className="font-medium">
                        {club.memberCount}/{club.capacity}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Meeting:</span>
                      <span className="font-medium">{club.meetingRule}</span>
                    </div>
                    <div className="pt-2">
                      <p className="mb-1 text-xs text-muted-foreground">Advisors:</p>
                      <div className="flex flex-wrap gap-1">
                        {club.staff
                          .filter((s) => s.role === "advisor")
                          .map((s) => (
                            <span
                              key={s.id}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              {s.user.name}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="pt-2">
                      <p className="mb-1 text-xs text-muted-foreground">Coordinators:</p>
                      <div className="flex flex-wrap gap-1">
                        {club.staff
                          .filter((s) => s.role === "coordinator")
                          .map((s) => (
                            <span
                              key={s.id}
                              className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                            >
                              {s.user.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(club)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

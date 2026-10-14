"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import QRCode from "qrcode";
import Image from "next/image";
import Link from "next/link";
import {
  approveActivity,
  announceActivity,
  closeActivityCheckIn,
  createClubDay,
  getActivityDashboard,
  importClubDaysCsv,
  openActivityCheckIn,
  planActivity,
  recordMemberAttendance,
  markNotificationRead,
} from "@/server/actions/activities";
import { createActivityCheckinLink, correctActivityAttendance } from "@/server/actions/checkin";
import { openActivitySubmissions } from "@/server/actions/submissions";

type Dashboard = Awaited<ReturnType<typeof getActivityDashboard>>;

function prettyStatus(status: string) {
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function CalendarPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedClubId, setSelectedClubId] = useState("");
  const [qr, setQr] = useState<{ activityId: string; dataUrl: string; code: string; manualUrl: string; expiresAt: number } | null>(null);
  const [qrSeconds, setQrSeconds] = useState(0);
  const [correcting, setCorrecting] = useState<{ activityId: string; userId: string; name: string; late: boolean } | null>(null);
  const [importMessage, setImportMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setDashboard(await getActivityDashboard());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the activity calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  const shouldPoll = dashboard?.activities.some((activity) => activity.status === "check_in_open") ?? false;
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setInterval(() => { void refresh(); }, 3_000);
    return () => clearInterval(timer);
  }, [refresh, shouldPoll]);
  useEffect(() => {
    if (!qr) return;
    const update = () => setQrSeconds(Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1_000)));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [qr]);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => createClubDay({ campusId: String(form.get("campusId")), onDate: String(form.get("onDate")), label: String(form.get("label") || "") }), "Campus date added.");
    event.currentTarget.reset();
  }

  async function handleCalendarImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const result = await importClubDaysCsv({ csv: String(form.get("csv")) });
      setImportMessage(`${result.imported} dates imported${result.skipped ? `; ${result.skipped} duplicates skipped` : ""}.`);
    }, "Calendar import finished.");
  }

  async function handlePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const localDeadline = String(form.get("submissionDeadline"));
    await run(() => planActivity({
      clubId: String(form.get("clubId")),
      clubDayId: String(form.get("clubDayId")),
      topic: String(form.get("topic")),
      format: form.get("format") === "assignment" ? "assignment" : "ppt",
      deliverable: String(form.get("deliverable")),
      submissionDeadline: new Date(localDeadline).toISOString(),
    }), "Activity submitted for advisor approval.");
    event.currentTarget.reset();
  }

  async function handleCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!correcting) return;
    const form = new FormData(event.currentTarget);
    await run(() => correctActivityAttendance({
      activityId: correcting.activityId,
      userId: correcting.userId,
      status: form.get("status") === "absent" ? "absent" : "present",
      late: form.get("late") === "on",
      reason: String(form.get("reason")),
    }), "Attendance correction saved with an audit reason.");
    setCorrecting(null);
  }

  async function showCheckinQr(activityId: string) {
    await run(async () => {
      const result = await createActivityCheckinLink({ activityId });
      setQr({ activityId, dataUrl: await QRCode.toDataURL(result.url, { width: 240, margin: 2 }), code: result.code, manualUrl: result.manualUrl, expiresAt: Date.now() + result.expiresInSeconds * 1_000 });
    }, "Fresh check-in QR generated. It expires after 60 seconds.");
  }

  if (loading) return <main className="mx-auto w-full max-w-6xl p-6"><p>Loading calendar…</p></main>;
  if (!dashboard) return <main className="mx-auto w-full max-w-6xl p-6"><p role="alert">{message || "Sign in to view the calendar."}</p></main>;

  const canPlan = dashboard.role === "coordinator" || dashboard.role === "admin";
  const canSetCalendar = dashboard.role === "admin" || dashboard.role === "campus_manager";
  const selectedClub = dashboard.clubs.find((club) => club.id === selectedClubId);
  const availableDays = selectedClub ? dashboard.days.filter((day) => day.campusId === selectedClub.campusId) : dashboard.days;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">ClubDay schedule</p>
        <h1 className="text-3xl font-semibold tracking-tight">Calendar & activities</h1>
        <p className="text-muted-foreground">Plan an activity, review it, then record attendance during the club session.</p>
        <nav aria-label="ClubDay" className="flex gap-4 pt-2 text-sm"><Link className="underline" href="/">Home</Link><Link className="underline" href="/student/clubs">Clubs</Link><Link className="underline" href="/submissions">Submissions & scores</Link></nav>
      </header>

      {message && <p role="status" className="rounded-md border px-4 py-3 text-sm">{message}</p>}

      {dashboard.notifications.length > 0 && <section aria-label="Notifications" className="space-y-2">
        <h2 className="text-lg font-semibold">Notifications <span className="text-sm font-normal text-muted-foreground">({dashboard.notifications.filter((item) => !item.readAt).length} unread)</span></h2>
        {dashboard.notifications.map((item) => <Card key={item.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.body}</p></div>
          {!item.readAt && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => markNotificationRead(item.id), "Notification marked as read.")}>Mark read</Button>}
        </CardContent></Card>)}
      </section>}

      {qr && <Card className="max-w-sm"><CardHeader><CardTitle>Student check-in</CardTitle><CardDescription>The QR and fallback code rotate every minute. Students need to sign in first.</CardDescription></CardHeader><CardContent className="space-y-3"><Image src={qr.dataUrl} alt="Time-limited check-in QR code" width={240} height={240} unoptimized /><p className="text-sm">One-time code: <strong className="font-mono text-xl tracking-widest">{qr.code}</strong></p><p className="text-xs text-muted-foreground">Expires in {qrSeconds}s · Manual link: <a className="underline" href={qr.manualUrl}>{qr.manualUrl}</a></p><Button variant="outline" onClick={() => void showCheckinQr(qr.activityId)}>Refresh QR and code</Button></CardContent></Card>}

      {(canSetCalendar || canPlan) && <section className="grid gap-4 lg:grid-cols-2">
        {canSetCalendar && <Card>
          <CardHeader><CardTitle>Add a campus date</CardTitle><CardDescription>Set the date clubs will use to plan activities.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={handleDay}>
              <label className="grid gap-1 text-sm">Campus<select className="rounded-md border bg-background px-3 py-2" name="campusId" required>
                <option value="">Choose a campus</option>{dashboard.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name} ({campus.code})</option>)}
              </select></label>
              <label className="grid gap-1 text-sm">Date<input className="rounded-md border bg-background px-3 py-2" name="onDate" type="date" required /></label>
              <label className="grid gap-1 text-sm">Label (optional)<input className="rounded-md border bg-background px-3 py-2" name="label" maxLength={100} placeholder="October Club Day" /></label>
              <Button disabled={busy || dashboard.campuses.length === 0}>Add date</Button>
            </form>
          </CardContent>
        </Card>}

        {canSetCalendar && <Card>
          <CardHeader><CardTitle>Import campus dates</CardTitle><CardDescription>CSV columns: campus_code, on_date, label. Dates use YYYY-MM-DD.</CardDescription></CardHeader>
          <CardContent><form className="grid gap-3" onSubmit={handleCalendarImport}>
            <label className="grid gap-1 text-sm">Calendar CSV<textarea className="min-h-28 rounded-md border bg-background px-3 py-2 font-mono text-xs" name="csv" required defaultValue={`campus_code,on_date,label\n${dashboard.campuses[0]?.code ?? "HI-TECH"},2026-10-12,October Club Day`} /></label>
            {importMessage && <p role="status" className="text-sm">{importMessage}</p>}
            <Button variant="outline" disabled={busy || dashboard.campuses.length === 0}>Import up to 100 dates</Button>
          </form></CardContent>
        </Card>}

        {canPlan && <Card>
          <CardHeader><CardTitle>Plan an activity</CardTitle><CardDescription>The advisor must approve it before it can be announced.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={handlePlan}>
              <label className="grid gap-1 text-sm">Club<select className="rounded-md border bg-background px-3 py-2" name="clubId" value={selectedClubId} onChange={(event) => setSelectedClubId(event.target.value)} required>
                <option value="">Choose a club</option>{dashboard.clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select></label>
              <label className="grid gap-1 text-sm">Campus date<select className="rounded-md border bg-background px-3 py-2" name="clubDayId" required>
                <option value="">Choose a date</option>{availableDays.map((day) => <option key={day.id} value={day.id}>{day.onDate} · {day.label || day.campusName}</option>)}
              </select></label>
              <label className="grid gap-1 text-sm">Activity topic<input className="rounded-md border bg-background px-3 py-2" name="topic" minLength={3} maxLength={120} required /></label>
              <label className="grid gap-1 text-sm">Format<select className="rounded-md border bg-background px-3 py-2" name="format"><option value="ppt">Presentation</option><option value="assignment">Assignment</option></select></label>
              <label className="grid gap-1 text-sm">Student deliverable<input className="rounded-md border bg-background px-3 py-2" name="deliverable" minLength={3} maxLength={500} placeholder="A short reflection on the activity" required /></label>
              <label className="grid gap-1 text-sm">Submission deadline<input className="rounded-md border bg-background px-3 py-2" name="submissionDeadline" type="datetime-local" required /></label>
              <Button disabled={busy || dashboard.clubs.length === 0 || dashboard.days.length === 0}>Send for approval</Button>
            </form>
          </CardContent>
        </Card>}
      </section>}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">Activities</h2><p className="text-sm text-muted-foreground">Visible to the people assigned to the club or approved club members.</p></div><span className="text-sm text-muted-foreground">{dashboard.activities.length} total</span></div>
        {dashboard.activities.length === 0 ? <Card><CardContent className="py-8 text-sm text-muted-foreground">No activities are available yet. An admin adds a campus date; a coordinator plans an activity; an advisor approves it.</CardContent></Card> : dashboard.activities.map((activity) => (
          <Card key={activity.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><CardTitle>{activity.topic}</CardTitle><CardDescription>{activity.clubName} · {activity.campusName} · {activity.day}{activity.dayLabel ? ` · ${activity.dayLabel}` : ""}</CardDescription></div>
                <span className="rounded-full border px-3 py-1 text-xs font-medium">{prettyStatus(activity.status)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{activity.deliverable} · {activity.presentCount} checked in</p>
              {activity.myAttendance && <p className="text-sm font-medium">Your attendance recorded at {new Date(activity.myAttendance.checkedInAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST</p>}
              <div className="flex flex-wrap gap-2">
                {(dashboard.role === "advisor" || dashboard.role === "admin") && activity.status === "planned" && <Button disabled={busy} onClick={() => void run(() => approveActivity({ activityId: activity.id }), "Activity approved.")}>Approve activity</Button>}
                {(dashboard.role === "coordinator" || dashboard.role === "admin") && activity.status === "approved" && <Button disabled={busy} onClick={() => void run(() => announceActivity({ activityId: activity.id }), "Activity announced.")}>Announce</Button>}
                {(dashboard.role === "coordinator" || dashboard.role === "admin") && (activity.status === "announced" || activity.status === "check_in_closed") && <Button disabled={busy} onClick={() => void run(() => openActivityCheckIn({ activityId: activity.id }), "Check-in opened.")}>Open check-in</Button>}
                {(dashboard.role === "coordinator" || dashboard.role === "admin") && activity.status === "check_in_open" && <Button variant="outline" disabled={busy} onClick={() => void run(() => closeActivityCheckIn({ activityId: activity.id }), "Check-in closed.")}>Close check-in</Button>}
                {(dashboard.role === "coordinator" || dashboard.role === "admin") && activity.status === "check_in_open" && <Button variant="outline" disabled={busy} onClick={() => void showCheckinQr(activity.id)}>Show 60-second QR</Button>}
                {(dashboard.role === "coordinator" || dashboard.role === "admin") && activity.status === "check_in_closed" && <Button disabled={busy} onClick={() => void run(() => openActivitySubmissions({ activityId: activity.id }), "Submissions are open for checked-in students.")}>Open submissions</Button>}
              </div>
              {activity.members.length > 0 && (activity.status === "check_in_open" || dashboard.role === "admin" || dashboard.role === "coordinator") && <div className="space-y-2 border-t pt-3"><h3 className="text-sm font-medium">Approved members</h3><ul className="divide-y">{activity.members.map((member) => <li key={member.userId} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3"><span>{member.name}{member.studentId ? ` · ${member.studentId}` : ""}</span>{member.checkedInAt ? <span className="text-muted-foreground">{member.attendanceStatus === "absent" ? "Absent" : `Present${member.late ? " · Late" : ""}`}</span> : activity.status === "check_in_open" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => recordMemberAttendance({ activityId: activity.id, userId: member.userId }), "Attendance recorded.")}>Mark present</Button> : <span className="text-muted-foreground">Not checked in</span>}</div>
                {member.checkedInAt && (dashboard.role === "coordinator" || dashboard.role === "admin") && <Button className="mt-2" size="sm" variant="ghost" onClick={() => setCorrecting({ activityId: activity.id, userId: member.userId, name: member.name, late: Boolean(member.late) })}>Correct record</Button>}
                {correcting?.activityId === activity.id && correcting.userId === member.userId && <form className="mt-2 grid gap-2 rounded-md border p-3" onSubmit={handleCorrection}>
                  <p className="font-medium">Correct {correcting.name}&apos;s attendance</p>
                  <label className="grid gap-1">Status<select className="rounded-md border bg-background px-3 py-2" name="status" defaultValue={member.attendanceStatus ?? "present"}><option value="present">Present</option><option value="absent">Absent</option></select></label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="late" defaultChecked={Boolean(member.late)} />Late</label>
                  <label className="grid gap-1">Reason<input className="rounded-md border bg-background px-3 py-2" name="reason" minLength={3} maxLength={500} required placeholder="Explain the correction" /></label>
                  <div className="flex gap-2"><Button size="sm" disabled={busy}>Save correction</Button><Button size="sm" type="button" variant="outline" onClick={() => setCorrecting(null)}>Cancel</Button></div>
                </form>}
              </li>)}</ul></div>}
              {(dashboard.role === "student") && ["submissions_open", "evaluating", "reported"].includes(activity.status) && <p className="text-sm"><a className="font-medium underline" href="/submissions">Submit work and see your score</a></p>}
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

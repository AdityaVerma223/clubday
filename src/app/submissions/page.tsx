"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSubmissionUpload, evaluateActivitySubmission, getSubmissionDashboard, getSubmissionFileUrl, saveUploadedSubmission, submitActivityLink } from "@/server/actions/submissions";

type Dashboard = Awaited<ReturnType<typeof getSubmissionDashboard>>;

function dateInIndia(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));
}

export default function SubmissionsPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setDashboard(await getSubmissionDashboard());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load submissions.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try { await action(); setMessage(success); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "That action failed."); }
    finally { setBusy(false); }
  }

  async function handleLink(event: FormEvent<HTMLFormElement>, activityId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => submitActivityLink({ activityId, url: String(form.get("url")) }), "Your link submission is saved.");
  }

  async function handleFile(event: FormEvent<HTMLFormElement>, activityId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1) { setMessage("Choose a file first."); return; }
    if (file.size > 25 * 1024 * 1024) { setMessage("Files must be 25 MB or smaller."); return; }
    await run(async () => {
      const signed = await createSubmissionUpload({ activityId, fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size });
      const body = new FormData();
      body.append("", file);
      const uploaded = await fetch(signed.uploadUrl, { method: "PUT", body });
      if (!uploaded.ok) throw new Error("The file could not be uploaded. Check your connection and try again.");
      return saveUploadedSubmission({ activityId, fileKey: signed.fileKey, fileName: signed.fileName, mimeType: signed.mimeType, sizeBytes: signed.sizeBytes });
    }, "Your file submission is saved.");
  }

  async function openFile(submissionId: string) {
    const tab = window.open("about:blank", "_blank");
    if (!tab) { setMessage("Allow pop-ups for ClubDay to open a private file link."); return; }
    try {
      const result = await getSubmissionFileUrl({ submissionId });
      tab.location.href = result.url;
    } catch (error) {
      tab?.close();
      setMessage(error instanceof Error ? error.message : "Could not open this file.");
    }
  }

  async function handleScore(event: FormEvent<HTMLFormElement>, submissionId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => evaluateActivitySubmission({
      submissionId,
      content: Number(form.get("content")),
      presentation: Number(form.get("presentation")),
      participation: Number(form.get("participation")),
      comment: String(form.get("comment") || ""),
    }), "Rubric score saved. The student can now see it.");
  }

  if (!dashboard) return <main className="mx-auto w-full max-w-5xl p-6"><p role={message ? "alert" : "status"}>{message || "Loading submissions…"}</p></main>;

  return <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
    <header><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Day 6 · student work</p><h1 className="text-3xl font-semibold tracking-tight">Submissions & scoring</h1><p className="mt-1 text-muted-foreground">Students submit a project link; assigned staff score it with the same three-part rubric.</p><nav aria-label="ClubDay" className="flex gap-4 pt-2 text-sm"><Link className="underline" href="/">Home</Link><Link className="underline" href="/calendar">Calendar & check-in</Link><Link className="underline" href="/student/clubs">Clubs</Link></nav></header>
    {message && <p role="status" className="rounded-md border px-4 py-3 text-sm">{message}</p>}
    {dashboard.activities.length === 0 && <Card><CardContent className="py-8 text-sm text-muted-foreground">No activities are available for this account yet.</CardContent></Card>}

    {dashboard.role === "student" && dashboard.activities.map((activity) => <Card key={activity.id}>
      <CardHeader><CardTitle>{activity.topic}</CardTitle><CardDescription>{activity.clubName} · Deadline {dateInIndia(activity.deadline)} IST</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {activity.canSubmit && <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void handleLink(event, activity.id)}>
          <label className="grid gap-1 text-sm">Project or assignment link<input className="rounded-md border bg-background px-3 py-2" name="url" type="url" placeholder="https://…" defaultValue={activity.submission?.url ?? ""} required /></label>
          <Button className="self-end" disabled={busy}>Save submission</Button>
        </form>}
        {activity.canSubmit && <form className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void handleFile(event, activity.id)}>
          <label className="grid gap-1 text-sm">Upload PDF, PPT, PPTX, PNG, or JPG (up to 25 MB)<input className="rounded-md border bg-background px-3 py-2" name="file" type="file" accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg" required /></label>
          <Button className="self-end" disabled={busy}>Upload file</Button>
        </form>}
        {activity.submission && <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
          <p>Submitted {dateInIndia(activity.submission.submittedAt)}{activity.submission.late ? " · Late" : ""}</p>
          {activity.submission.url ? <a className="break-all underline" href={activity.submission.url} target="_blank" rel="noreferrer">Open your submission</a> : activity.submission.fileName && <button type="button" className="underline" onClick={() => void openFile(activity.submission!.id)}>Open {activity.submission.fileName}</button>}
          {activity.submission.content !== null && activity.submission.content !== undefined && activity.submission.presentation !== null && activity.submission.presentation !== undefined && activity.submission.participation !== null && activity.submission.participation !== undefined ? <div className="mt-3 border-t pt-3"><p className="font-semibold">Score: {activity.submission.content + activity.submission.presentation + activity.submission.participation} / 15</p><p>Content {activity.submission.content}/5 · Presentation {activity.submission.presentation}/5 · Participation {activity.submission.participation}/5</p>{activity.submission.comment && <p className="mt-1">Staff feedback: {activity.submission.comment}</p>}</div> : <p className="mt-2 text-muted-foreground">Awaiting staff scoring.</p>}
        </div>}
      </CardContent>
    </Card>)}

    {dashboard.role !== "student" && dashboard.activities.map((activity) => <Card key={activity.id}>
      <CardHeader><CardTitle>{activity.topic}</CardTitle><CardDescription>{activity.clubName} · Submission deadline {dateInIndia(activity.deadline)} IST</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {activity.submissions.length === 0 && <p className="text-sm text-muted-foreground">No checked-in students have submitted work yet.</p>}
        {activity.submissions.map((submission) => <div key={submission.id} className="grid gap-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><p className="font-medium">{submission.studentName}{submission.studentId ? ` · ${submission.studentId}` : ""}</p><p className="text-muted-foreground">Submitted {dateInIndia(submission.submittedAt)}{submission.late ? " · Late" : ""}</p></div>{submission.url ? <a className="break-all underline" href={submission.url} target="_blank" rel="noreferrer">Open student work</a> : submission.fileName && <button type="button" className="underline" onClick={() => void openFile(submission.id)}>Open {submission.fileName}</button>}</div>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void handleScore(event, submission.id)}>
            {(["content", "presentation", "participation"] as const).map((field) => <label key={field} className="grid gap-1 text-sm capitalize">{field} (0–5)<input className="rounded-md border bg-background px-3 py-2" name={field} type="number" min="0" max="5" defaultValue={submission[field] ?? 0} required /></label>)}
            <label className="grid gap-1 text-sm md:col-span-4">Feedback<textarea className="min-h-20 rounded-md border bg-background px-3 py-2" name="comment" maxLength={1000} defaultValue={submission.comment ?? ""} /></label>
          {submission.content !== null && submission.content !== undefined && submission.presentation !== null && submission.presentation !== undefined && submission.participation !== null && submission.participation !== undefined && <p className="text-sm font-medium md:col-span-4">Current total: {submission.content + submission.presentation + submission.participation} / 15</p>}
            <Button className="md:col-span-4 md:justify-self-start" disabled={busy}>Save rubric score</Button>
          </form>
        </div>)}
      </CardContent>
    </Card>)}
  </main>;
}

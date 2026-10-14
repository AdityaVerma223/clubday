"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkInWithOneTimeCode, scanActivityCheckin } from "@/server/actions/checkin";

export function CheckinClient({ activityId, token }: { activityId: string; token?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  async function checkInWithQr() {
    setBusy(true);
    setMessage("");
    try {
      if (!token) throw new Error("No QR token was found. Enter the current one-time code instead.");
      const result = await scanActivityCheckin({ activityId, token });
      setMessage(result.late ? "Attendance saved. You were marked late." : "Attendance saved. You are checked in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check in.");
    } finally { setBusy(false); }
  }
  async function checkInWithCode() {
    setBusy(true);
    setMessage("");
    try {
      const result = await checkInWithOneTimeCode({ activityId, code });
      setMessage(result.late ? "Attendance saved. You were marked late." : "Attendance saved. You are checked in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check in.");
    } finally { setBusy(false); }
  }
  return <main className="flex flex-1 items-center justify-center p-6"><Card className="w-full max-w-md">
    <CardHeader><CardTitle>ClubDay check-in</CardTitle><CardDescription>Sign in as a student and confirm your attendance. This QR code expires after 60 seconds.</CardDescription></CardHeader>
    <CardContent className="space-y-4">{token && (
  <Button
    className="w-full"
    disabled={busy || message.startsWith("Attendance saved")}
    onClick={() => void checkInWithQr()}
  >
    {busy ? "Checking in…" : "Confirm QR check-in"}
  </Button>
)}<form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void checkInWithCode(); }}><label className="grid gap-1 text-sm">One-time code<input className="rounded-md border bg-background px-3 py-2 font-mono tracking-widest" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label><Button className="w-full" variant="outline" disabled={busy || code.length !== 6 || message.startsWith("Attendance saved")}>{busy ? "Checking in…" : "Confirm with code"}</Button></form>{message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}</CardContent>
  </Card></main>;
}

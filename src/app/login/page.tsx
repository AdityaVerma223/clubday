"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed. Check your email and password.");
        return;
      }
      router.push("/student/clubs");
      router.refresh();
    } catch {
      setError("Could not reach ClubDay. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to ClubDay</CardTitle>
          <CardDescription>Use your ClubDay account to manage campus clubs and membership requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium">
              Email
              <input
                autoComplete="username"
                className="border-input bg-background w-full rounded-md border px-3 py-2 font-normal"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Password
              <input
                autoComplete="current-password"
                className="border-input bg-background w-full rounded-md border px-3 py-2 font-normal"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={submitting} type="submit">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

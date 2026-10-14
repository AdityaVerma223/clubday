import { CheckinClient } from "./check-in-client";

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ activityId?: string; token?: string }> }) {
  const { activityId = "", token } = await searchParams;
  if (!activityId) return <main className="mx-auto w-full max-w-xl p-6"><h1 className="text-2xl font-semibold">Invalid check-in link</h1><p className="mt-2 text-muted-foreground">Ask the club coordinator to show a fresh QR code.</p></main>;
  return <CheckinClient activityId={activityId} token={token} />;
}

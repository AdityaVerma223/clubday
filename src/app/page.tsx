import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Campus life, organized</p>
      <h1 className="text-4xl font-semibold tracking-tight">ClubDay</h1>
      <p className="text-muted-foreground max-w-lg">Discover campus clubs, manage membership, and bring your club day together.</p>
      <Link className={buttonVariants()} href="/login">Sign in</Link>
    </main>
  );
}

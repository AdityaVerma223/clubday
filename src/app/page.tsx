import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const sections = [
  {
    number: "01",
    title: "Student Clubs",
    description:
      "Discover campus communities, explore clubs, and manage your memberships.",
    href: "/student/clubs",
    action: "Explore clubs",
    category: "STUDENT LIFE",
  },
  {
    number: "02",
    title: "Calendar & Activities",
    description:
      "Keep track of campus events, upcoming activities, and your schedule.",
    href: "/calendar",
    action: "View calendar",
    category: "CAMPUS LIFE",
  },
  {
    number: "03",
    title: "Submissions & Scores",
    description:
      "Submit your work, share project links, and access the submission workflow.",
    href: "/submissions",
    action: "View submissions",
    category: "PROJECTS",
  },
  {
    number: "04",
    title: "Coordinator Dashboard",
    description:
      "Review membership requests and manage student participation.",
    href: "/coordinator/members",
    action: "Manage members",
    category: "COORDINATION",
  },
  {
    number: "05",
    title: "Club Administration",
    description:
      "Create clubs, update club information, and manage campus communities.",
    href: "/admin/clubs",
    action: "Manage clubs",
    category: "ADMINISTRATION",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
      {/* Header */}
      <header className="flex items-center justify-between border-b pb-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-lg font-bold text-background">
            C
          </span>

          <span className="text-xl font-semibold tracking-tight">
            ClubDay
          </span>
        </Link>

        <Link
          href="/login"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Sign in <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b py-12 sm:py-16 lg:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-muted/70 blur-3xl"
        />

        <div className="relative max-w-3xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Campus life, organized
          </p>

          <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight sm:text-6xl lg:text-7xl">
            Your campus.
            <br />
            Your community.
            <br />
            <span className="text-muted-foreground">All in one place.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Discover clubs, join activities, manage memberships, and bring
            your campus experience together with ClubDay.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/student/clubs"
              className={buttonVariants({ size: "lg" })}
            >
              Explore clubs <span aria-hidden="true" className="ml-2">→</span>
            </Link>

            <Link
              href="/calendar"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Browse activities
            </Link>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <section className="py-10 sm:py-12" aria-labelledby="workspace-heading">
        <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Explore ClubDay
            </p>

            <h2
              id="workspace-heading"
              className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Your workspace
            </h2>
          </div>

          <p className="text-sm text-muted-foreground">
            Everything you need, one click away.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.number}
              href={section.href}
              className="group flex min-h-60 flex-col rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-foreground/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-widest text-muted-foreground">
                  {section.number}
                </span>

                <span className="rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wider text-muted-foreground">
                  {section.category}
                </span>
              </div>

              <h3 className="mt-7 text-lg font-semibold tracking-tight">
                {section.title}
              </h3>

              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {section.description}
              </p>

              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <span className="text-sm font-medium">
                  {section.action}
                </span>

                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-full border text-sm transition-all duration-200 group-hover:border-foreground group-hover:bg-foreground group-hover:text-background"
                >
                  ↗
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col gap-2 border-t py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} ClubDay</p>
        <p>Bringing campus communities together.</p>
      </footer>
    </main>
  );
}
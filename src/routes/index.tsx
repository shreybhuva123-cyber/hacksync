import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Database, GitBranch, Network, PlugZap, ShieldCheck, Terminal, Zap } from "lucide-react";
import { StatusPill } from "@/components/hacksync/primitives";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HackSync — Integration Control Center for Hackathon Teams" },
      {
        name: "description",
        content:
          "One shared source of truth for a 3-laptop hackathon team: API contracts, database schema, branch status, integration map and readiness score.",
      },
      { property: "og:title", content: "HackSync — Integration Control Center" },
      {
        property: "og:description",
        content:
          "Frontend, backend and database on three laptops — one connected system. Contracts, schema, branches, health checks and a live readiness score.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: PlugZap,
    title: "API Contract Center",
    body: "Backend declares method, route, schemas, auth and version. Frontend consumes copy-paste ready clients. Lock a contract so it cannot drift.",
  },
  {
    icon: Database,
    title: "Schema Guard",
    body: "Every table, column, index and migration with an owner and a schema version — plus detection of code that still assumes the old shape.",
  },
  {
    icon: Network,
    title: "Integration Map",
    body: "Feature → API route → database table, drawn as one graph. Green is wired, yellow is pending, red is broken.",
  },
  {
    icon: GitBranch,
    title: "Git-native workflow",
    body: "A branch per teammate with ahead/behind, merge status and an Integration Ready flag. No fake browser file sync.",
  },
  {
    icon: ShieldCheck,
    title: "Pre-Demo Health Check",
    body: "One screen: app, API, database, contract mismatches and unresolved blockers. Walk on stage knowing it is green.",
  },
  {
    icon: Terminal,
    title: "One-Click Setup Guide",
    body: "A personalized laptop checklist per role: clone, checkout, install, .env from .env.example, start, verify health.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary">
              <Network className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Hack<span className="text-primary">Sync</span>
            </span>
          </div>
          <Link
            to="/auth"
            search={{ redirect: "/dashboard" }}
            className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Enter workspace
          </Link>
        </div>
      </header>

      <section className="grid-bg relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute -top-40 left-1/2 size-[38rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
          <StatusPill tone="primary" className="mx-auto">
            built for the final round
          </StatusPill>
          <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
            Three laptops.
            <br />
            <span className="text-gradient">One connected codebase.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground md:text-lg">
            HackSync is the integration control center for a distributed hackathon team. Frontend,
            backend and database each work locally with Git — HackSync holds the shared contracts,
            schema, routes, environment and live integration state so the three parts actually fit
            together.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              search={{ redirect: "/dashboard" }}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign In to Workspace
            </Link>
            <Link
              to="/demo"
              className="rounded-lg border border-border-strong bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent flex items-center gap-1.5"
            >
              <Zap className="size-3.5 text-primary fill-primary" />
              Explore Sandbox Demo
            </Link>
          </div>

          <div className="mono mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] tracking-wide text-muted-foreground uppercase">
            <span className="text-frontend">● frontend</span>
            <span className="text-backend">● backend</span>
            <span className="text-database">● database</span>
            <span className="text-lead">● lead</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          Stop losing the final round to a route mismatch
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          Every failure mode of a 3-person hackathon team is a contract problem. HackSync makes each
          contract explicit, owned and monitored.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="panel p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
                <f.icon className="size-4.5" />
              </span>
              <h3 className="mt-3.5 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Honest about what a browser can do
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A web app cannot read or write arbitrary folders on three teammates' laptops, and we
              will not pretend otherwise. HackSync is built around Git and shared contracts:
              everyone codes locally in their own IDE, pushes their own branch, and HackSync records
              the integration truth the whole team depends on. A future optional CLI agent can
              stream local file, branch and health metadata into the workspace — the platform is
              fully useful without it.
            </p>
          </div>
          <div className="panel p-5">
            <div className="mono space-y-2 text-xs text-muted-foreground">
              <p className="text-foreground">$ git checkout -b feat/api-events</p>
              <p>… code locally in your own editor …</p>
              <p className="text-foreground">$ git push -u origin feat/api-events</p>
              <p className="text-primary">
                HackSync ▸ contract POST /api/events/:id/rsvp — v2 locked
              </p>
              <p className="text-success">HackSync ▸ integration readiness 87% → 94%</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Boxes className="size-3.5" /> HackSync — hackathon integration control center
        </span>
        <Link to="/auth" search={{ redirect: "/dashboard" }} className="hover:text-primary">
          Enter workspace →
        </Link>
      </footer>
    </div>
  );
}

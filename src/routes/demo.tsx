import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Boxes,
  Database,
  GitBranch,
  Network,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  CodeBlock,
  MethodBadge,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  ScoreRing,
  StatusPill,
} from "@/components/hacksync/primitives";
import { computeReadiness, computeWarnings } from "@/lib/hacksync/analysis";
import { auditWorkspaceSecurity } from "@/lib/hacksync/ai-security";
import { TopTimerWidget } from "@/components/timer";
import { AiCopilotModal } from "@/components/hacksync/AiCopilotModal";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demo Sandbox Workspace — HackSync" },
      {
        name: "description",
        content: "Interactive in-memory demo sandbox for HackSync hackathon judges and evaluators.",
      },
    ],
  }),
  component: DemoPage,
});

// Clean isolated in-memory demo seed state
const DEMO_WORKSPACE: Workspace = {
  project: {
    id: "demo-sandbox-project",
    name: "CampusMesh (Demo Sandbox)",
    description: "Campus event mesh built during hackathon with React, Node/Express and PostgreSQL.",
    repo_url: "https://github.com/hacksync/campusmesh",
    default_branch: "main",
    schema_version: "2.1.0",
    invite_code: "DEMO99",
    is_open_demo: true,
    demo_mode: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  members: [
    {
      id: "m1",
      project_id: "demo-sandbox-project",
      user_id: "u1",
      display_name: "Arjun Patel",
      email: "arjun@campusmesh.dev",
      role: "lead",
      branch_name: "main",
      working_area: "src/routes/dashboard",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "m2",
      project_id: "demo-sandbox-project",
      user_id: "u2",
      display_name: "Priya Sharma",
      email: "priya@campusmesh.dev",
      role: "frontend",
      branch_name: "feat/frontend-ui",
      working_area: "src/components/Events.tsx",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "m3",
      project_id: "demo-sandbox-project",
      user_id: "u3",
      display_name: "Rahul Verma",
      email: "rahul@campusmesh.dev",
      role: "backend",
      branch_name: "feat/api-layer",
      working_area: "src/routes/events.ts",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "m4",
      project_id: "demo-sandbox-project",
      user_id: "u4",
      display_name: "Meera Nair",
      email: "meera@campusmesh.dev",
      role: "database",
      branch_name: "feat/schema-v2",
      working_area: "database/migrations",
      online: false,
      last_seen_at: new Date().toISOString(),
    },
  ],
  contracts: [
    {
      id: "c1",
      project_id: "demo-sandbox-project",
      method: "GET",
      route: "/api/events",
      summary: "List all upcoming campus events",
      request_schema: '{ "query": { "limit?": "number" } }',
      response_schema: '[{ "id": "uuid", "title": "string", "startsAt": "iso" }]',
      auth_required: false,
      status: "live",
      owner_role: "backend",
      version: "v1",
      test_status: "passing",
      locked: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "c2",
      project_id: "demo-sandbox-project",
      method: "POST",
      route: "/api/events/:id/rsvp",
      summary: "RSVP to event",
      request_schema: '{ "body": { "note": "string" } }',
      response_schema: '{ "success": true, "rsvpId": "uuid" }',
      auth_required: true,
      status: "live",
      owner_role: "backend",
      version: "v1",
      test_status: "passing",
      locked: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  tables: [
    {
      id: "t1",
      project_id: "demo-sandbox-project",
      name: "events",
      description: "Club organized events",
      owner_role: "database",
      schema_version: "v2.1.0",
      migration_status: "applied",
      sql_definition: "CREATE TABLE events (id uuid primary key, title text not null);",
    },
    {
      id: "t2",
      project_id: "demo-sandbox-project",
      name: "rsvps",
      description: "RSVP attendance records",
      owner_role: "database",
      schema_version: "v2.1.0",
      migration_status: "applied",
      sql_definition: "CREATE TABLE rsvps (id uuid primary key, event_id uuid, attendee_id uuid);",
    },
  ],
  columns: [
    {
      id: "col1",
      table_id: "t1",
      project_id: "demo-sandbox-project",
      name: "id",
      data_type: "uuid",
      is_nullable: false,
      is_primary: true,
      is_indexed: true,
      references_table: null,
      ordinal: 1,
    },
    {
      id: "col2",
      table_id: "t1",
      project_id: "demo-sandbox-project",
      name: "title",
      data_type: "text",
      is_nullable: false,
      is_primary: false,
      is_indexed: false,
      references_table: null,
      ordinal: 2,
    },
  ],
  codeNodes: [],
  links: [],
  branches: [],
  envVars: [],
  checks: [],
  tasks: [
    {
      id: "tsk1",
      project_id: "demo-sandbox-project",
      title: "Lock events GET contract",
      area: "backend",
      priority: "high",
      status: "done",
      assignee_role: "backend",
      depends_on: null,
      blocker: null,
      updated_at: new Date().toISOString(),
    },
    {
      id: "tsk2",
      project_id: "demo-sandbox-project",
      title: "Connect Frontend EventList component",
      area: "frontend",
      priority: "high",
      status: "in_progress",
      assignee_role: "frontend",
      depends_on: "GET /api/events",
      blocker: null,
      updated_at: new Date().toISOString(),
    },
  ],
  activity: [
    {
      id: "act1",
      project_id: "demo-sandbox-project",
      kind: "contract",
      actor: "Arjun Patel",
      actor_role: "lead",
      message: "Locked contract GET /api/events v1",
      created_at: new Date().toISOString(),
    },
  ],
  notes: [],
  handoffs: [],
  comments: [],
};

function DemoPage() {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const readiness = useMemo(() => computeReadiness(DEMO_WORKSPACE), []);
  const security = useMemo(() => auditWorkspaceSecurity(DEMO_WORKSPACE), []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Banner */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Network className="size-4" />
            </span>
            <span>
              Hack<span className="text-primary">Sync</span>
            </span>
          </Link>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-500">
            Isolated Demo Sandbox
          </span>
        </div>

        <div className="flex items-center gap-3">
          <TopTimerWidget />

          <button
            type="button"
            onClick={() => setCopilotOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            title="Open AI Workspace Copilot"
          >
            <Sparkles className="size-3.5" />
            <span>AI Copilot</span>
          </button>

          <Link
            to="/auth"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <span>Sign In / Create Account</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          eyebrow="sandbox exploration"
          title="Demo Workspace Simulator"
          description="A fully populated in-memory workspace demonstrating real-time integration analysis, readiness scoring, and contract locks."
        />

        {/* Top KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium">Integration Readiness</p>
              <p className="text-2xl font-bold mt-1">{readiness.score}%</p>
            </div>
            <ScoreRing score={readiness.score} size={48} />
          </Panel>

          <Panel className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium">Cyber Security Grade</p>
              <p className="text-2xl font-bold mt-1 text-success">Grade {security.grade}</p>
            </div>
            <ShieldCheck className="size-8 text-success" />
          </Panel>

          <Panel className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium">API Contracts</p>
              <p className="text-2xl font-bold mt-1 text-primary">{DEMO_WORKSPACE.contracts.length}</p>
            </div>
            <PlugZap className="size-8 text-primary" />
          </Panel>

          <Panel className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium">Database Tables</p>
              <p className="text-2xl font-bold mt-1">{DEMO_WORKSPACE.tables.length}</p>
            </div>
            <Database className="size-8 text-database" />
          </Panel>
        </div>

        {/* Demo Details Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Contracts */}
          <Panel className="p-5 space-y-3">
            <PanelHeader
              title="Locked API Contracts"
              subtitle="Single source of truth between frontend & backend"
              actions={<StatusPill tone="success">100% type-safe</StatusPill>}
            />
            <div className="divide-y divide-border rounded-lg border border-border bg-surface">
              {DEMO_WORKSPACE.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <MethodBadge method={c.method} />
                    <span className="mono font-semibold">{c.route}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone="success">locked</StatusPill>
                    <RoleBadge role={c.owner_role} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Members */}
          <Panel className="p-5 space-y-3">
            <PanelHeader
              title="Team Members & Presence"
              subtitle="Multi-member workspace with role separation"
              actions={<StatusPill tone="primary">{DEMO_WORKSPACE.members.length} engineers</StatusPill>}
            />
            <div className="divide-y divide-border rounded-lg border border-border bg-surface">
              {DEMO_WORKSPACE.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${m.online ? "bg-success" : "bg-muted-foreground"}`}
                    />
                    <span className="font-semibold">{m.display_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] text-muted-foreground">{m.working_area}</span>
                    <RoleBadge role={m.role} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </main>

      <AiCopilotModal
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FolderPlus,
  Users,
  Zap,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  Database,
  FileCode,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { setActiveProjectId } from "@/hooks/useActiveProject";
import { useCreateProject, useJoinProject } from "@/lib/hacksync/workspace";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { JoinProjectModal } from "@/components/projects/JoinProjectModal";
import type { Role } from "@/lib/hacksync/types";

export function NoWorkspaceOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createProject = useCreateProject();
  const joinProject = useJoinProject();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [isQuickstarting, setIsQuickstarting] = useState(false);

  const handleCreate = async (input: {
    name: string;
    description?: string;
    repo_url?: string;
    role: Role;
  }) => {
    const project = await createProject.mutateAsync({
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      ...(input.repo_url ? { repo_url: input.repo_url } : {}),
      role: input.role,
      displayName: user?.email ? user.email.split("@")[0] || "Team Lead" : "Team Lead",
      userId: user?.id ?? "local-user",
    });

    setActiveProjectId(project.id);
    void navigate({ to: "/dashboard" });
  };

  const handleJoin = async (input: { inviteCode: string; role: Role }) => {
    const project = await joinProject.mutateAsync({
      inviteCode: input.inviteCode,
      displayName: user?.email ? user.email.split("@")[0] || "Developer" : "Developer",
      role: input.role,
      userId: user?.id ?? "local-user",
    });

    setActiveProjectId(project.id);
    void navigate({ to: "/dashboard" });
  };

  const handleQuickstartSample = async () => {
    setIsQuickstarting(true);
    try {
      const project = await createProject.mutateAsync({
        name: "HackSync Starter Workspace",
        description: "Full-stack real-time collaboration workspace with contracts and schema.",
        role: "owner",
        displayName: user?.email ? user.email.split("@")[0] || "Team Lead" : "Team Lead",
        userId: user?.id ?? "local-user",
      });

      // Seed starter contracts, tables, and tasks in PostgreSQL
      try {
        await Promise.all([
          // Starter API Contracts
          import("@/integrations/supabase/client").then(({ supabase }) =>
            supabase.from("api_contracts").insert([
              {
                project_id: project.id,
                route: "/api/events",
                method: "GET",
                summary: "List all upcoming hackathon events",
                description: "Returns an array of upcoming hackathon events with metadata.",
                response_schema: '{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"}}}}',
                owner_role: "backend",
                locked: true,
                status: "implemented",
                test_status: "passing",
                version: "v1",
              },
              {
                project_id: project.id,
                route: "/api/events/:id/rsvp",
                method: "POST",
                summary: "RSVP to a specific event",
                description: "Registers the current attendee for the designated event.",
                request_schema: '{"type":"object","required":["attendeeId"],"properties":{"attendeeId":{"type":"string"}}}',
                response_schema: '{"type":"object","properties":{"success":{"type":"boolean"}}}',
                owner_role: "backend",
                locked: true,
                status: "agreed",
                test_status: "passing",
                version: "v1",
              },
            ]),
          ),
          // Starter DB Tables
          import("@/integrations/supabase/client").then(({ supabase }) =>
            supabase.from("db_tables").insert([
              {
                project_id: project.id,
                name: "events",
                description: "Hackathon scheduled events and workshops",
                status: "migrated",
                rls_enabled: true,
              },
              {
                project_id: project.id,
                name: "rsvps",
                description: "RSVP attendee registration records",
                status: "migrated",
                rls_enabled: true,
              },
            ]),
          ),
          // Starter Tasks
          import("@/integrations/supabase/client").then(({ supabase }) =>
            supabase.from("tasks").insert([
              {
                project_id: project.id,
                title: "Lock events GET API contract",
                description: "Finalize OpenAPI request and response schema for event list.",
                assigned_role: "backend",
                status: "done",
                priority: "high",
              },
              {
                project_id: project.id,
                title: "Connect Frontend EventList component",
                description: "Bind React Query hook to /api/events endpoint.",
                assigned_role: "frontend",
                status: "in_progress",
                priority: "high",
              },
            ]),
          ),
          // Starter Env Vars
          import("@/integrations/supabase/client").then(({ supabase }) =>
            supabase.from("env_vars").insert([
              {
                project_id: project.id,
                key: "DATABASE_URL",
                example_value: "postgresql://postgres:***@db.example.com:5432/postgres",
                description: "Primary PostgreSQL connection string",
                is_secret: true,
                required_by: ["backend", "database"],
              },
            ]),
          ),
        ]);
      } catch {
        // Non-blocking fallback if auxiliary seeds fail
      }

      setActiveProjectId(project.id);
      void navigate({ to: "/dashboard" });
    } catch (err) {
      console.error("Quickstart project creation failed:", err);
    } finally {
      setIsQuickstarting(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-12 text-center animate-in fade-in duration-300">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" />
          <span>Welcome to HackSync Workspace</span>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            You're authenticated! Let's get started.
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Create a fresh project for your hackathon team, join an existing workspace with an invite code, or spin up an instant sample workspace.
          </p>
        </div>

        {/* 3 Core Action Cards */}
        <div className="grid gap-4 sm:grid-cols-3 text-left pt-2">
          {/* Create Project Card */}
          <div
            onClick={() => setShowCreate(true)}
            className="group relative cursor-pointer rounded-xl border border-border/80 bg-card/60 p-5 shadow-sm transition-all hover:border-primary hover:bg-card hover:shadow-md"
          >
            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary group-hover:scale-110 transition-transform">
              <FolderPlus className="size-5" />
            </div>
            <h3 className="font-semibold text-foreground text-sm flex items-center justify-between">
              Create Project
              <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Start a new hackathon workspace and invite your teammates with role assignments.
            </p>
          </div>

          {/* Join Project Card */}
          <div
            onClick={() => setShowJoin(true)}
            className="group relative cursor-pointer rounded-xl border border-border/80 bg-card/60 p-5 shadow-sm transition-all hover:border-primary hover:bg-card hover:shadow-md"
          >
            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-success/15 text-success group-hover:scale-110 transition-transform">
              <Users className="size-5" />
            </div>
            <h3 className="font-semibold text-foreground text-sm flex items-center justify-between">
              Join with Code
              <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-success" />
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Have a 6-character team invite code? Enter it to join your squad immediately.
            </p>
          </div>

          {/* Quickstart Starter Card */}
          <div
            onClick={handleQuickstartSample}
            className="group relative cursor-pointer rounded-xl border border-primary/40 bg-primary/5 p-5 shadow-sm transition-all hover:border-primary hover:bg-primary/10 hover:shadow-md"
          >
            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500 group-hover:scale-110 transition-transform">
              <Zap className="size-5 fill-amber-500/30" />
            </div>
            <h3 className="font-semibold text-foreground text-sm flex items-center justify-between">
              1-Click Starter
              <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-amber-500" />
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isQuickstarting ? "Creating project..." : "Instantly bootstrap your first workspace with default roles and settings."}
            </p>
          </div>
        </div>

        {/* Feature Highlights & Demo Link */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-primary" /> API Contracts
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5 text-database" /> Schema Sync
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="size-3.5 text-success" /> AST Security
            </span>
            <span className="flex items-center gap-1.5">
              <FileCode className="size-3.5 text-frontend" /> AI Copilot
            </span>
          </div>
          <Link
            to="/demo"
            className="font-medium text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            View Pre-Populated Demo <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Modals */}
      <CreateProjectModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
      />
      <JoinProjectModal
        isOpen={showJoin}
        onClose={() => setShowJoin(false)}
        onSubmit={handleJoin}
      />
    </div>
  );
}

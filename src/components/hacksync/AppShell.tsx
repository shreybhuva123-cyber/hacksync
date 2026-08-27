import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Boxes,
  ChevronDown,
  Database,
  FileCode2,
  FolderKanban,
  GitBranch,
  Github,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MonitorPlay,
  Network,
  PlugZap,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut, useAuth } from "@/hooks/useAuth";
import { useActiveProjectId, setActiveProjectId } from "@/hooks/useActiveProject";
import { useWorkspace, useUserProjects } from "@/lib/hacksync/workspace";
import { computeReadiness, computeWarnings } from "@/lib/hacksync/analysis";
import { auditWorkspaceSecurity } from "@/lib/hacksync/ai-security";
import { RoleBadge, StatusPill } from "./primitives";
import { AiCopilotModal } from "./AiCopilotModal";
import { InviteTeammatesModal } from "@/components/projects/InviteTeammatesModal";
import { TopTimerWidget } from "@/components/timer";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string | number;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { to: "/dashboard", label: "Cockpit", icon: LayoutDashboard },
      { to: "/pitch", label: "Judge Pitch & Demo", icon: Trophy },
      { to: "/security", label: "Cyber Security", icon: ShieldAlert },
      { to: "/architecture", label: "Architecture Map", icon: Boxes },
      { to: "/integrations", label: "Integration Map", icon: Network },
      { to: "/predemo", label: "Pre-Demo Mode", icon: MonitorPlay },
    ],
  },
  {
    group: "Contracts",
    items: [
      { to: "/api", label: "API Contracts", icon: PlugZap },
      { to: "/schema", label: "Database Schema", icon: Database },
      { to: "/env", label: "Environment", icon: KeyRound },
      { to: "/health", label: "Health Center", icon: ShieldCheck },
    ],
  },
  {
    group: "Code & Git",
    items: [
      { to: "/code", label: "Files & Code", icon: FileCode2 },
      { to: "/git", label: "Git & Branches", icon: GitBranch },
      { to: "/handoffs", label: "Handoff Cards", icon: Sparkles },
      { to: "/setup", label: "Setup & Workflow", icon: Terminal },
    ],
  },
  {
    group: "Team",
    items: [
      { to: "/tasks", label: "Tasks", icon: ListChecks },
      { to: "/activity", label: "Activity Feed", icon: Activity },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/project-settings", label: "Project Settings", icon: Sliders },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: ws } = useWorkspace();

  const readiness = ws ? computeReadiness(ws) : null;
  const criticalCount = ws
    ? computeWarnings(ws).filter((w) => w.severity === "critical").length
    : 0;

  const cyberAudit = ws ? auditWorkspaceSecurity(ws) : null;
  const cyberThreatsCount = cyberAudit ? cyberAudit.summary.critical + cyberAudit.summary.high : 0;

  // Keyboard shortcut listener: Cmd/Ctrl + J or Cmd/Ctrl + K opens Copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "k")) {
        e.preventDefault();
        setCopilotOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary">
              <Network className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Hack<span className="text-primary">Sync</span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Project Switcher */}
        <ProjectSwitcher />

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((section) => (
            <div key={section.group} className="mb-4">
              <p className="mono px-2 pb-1.5 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                {section.group}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon
                          className={cn("size-4", active ? "text-primary" : "opacity-70")}
                        />
                        <span className="truncate">{item.label}</span>
                        {item.to === "/health" && criticalCount > 0 ? (
                          <span className="mono ml-auto rounded bg-destructive/20 px-1.5 text-[10px] text-destructive">
                            {criticalCount}
                          </span>
                        ) : null}
                        {item.to === "/security" && cyberThreatsCount > 0 ? (
                          <span className="mono ml-auto rounded bg-destructive/20 px-1.5 text-[10px] text-destructive">
                            {cyberThreatsCount}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Readiness</span>
              <span className="mono text-sm font-semibold tabular-nums">
                {readiness ? `${readiness.score}%` : "—"}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  (readiness?.score ?? 0) >= 90
                    ? "bg-success"
                    : (readiness?.score ?? 0) >= 70
                      ? "bg-warning"
                      : "bg-destructive",
                )}
                style={{ width: `${readiness?.score ?? 0}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              void navigate({ to: "/" });
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-background/70 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Main Content Area */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">
              {ws?.project.name ?? "Loading workspace…"}
            </span>
            {ws ? (
              <StatusPill tone="primary" dot={false} className="hidden sm:inline-flex">
                schema {ws.project.schema_version}
              </StatusPill>
            ) : null}
            {ws?.project.repo_url ? (
              <a
                href={ws.project.repo_url}
                target="_blank"
                rel="noreferrer"
                className="mono hidden items-center gap-1 text-[11px] text-muted-foreground hover:text-primary md:inline-flex"
              >
                <Github className="size-3.5" />
                {ws.project.repo_url.replace("https://github.com/", "")}
              </a>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Hackathon Top Countdown / Stopwatch Timer & Activity History */}
            <TopTimerWidget />

            {/* Invite Teammates Action Button */}
            {ws ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/80 px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                title="Invite Teammates with 1-Click Link or Code"
              >
                <UserPlus className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Invite Teammates</span>
              </button>
            ) : null}

            {/* AI Copilot Action Button */}
            <button
              type="button"
              onClick={() => setCopilotOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              title="Open AI Workspace Copilot (Ctrl+J)"
            >
              <Sparkles className="size-3.5" />
              <span>AI Copilot</span>
              <kbd className="hidden sm:inline-block rounded border border-primary/30 bg-primary/5 px-1 py-0.2 text-[9px] mono opacity-80">
                Ctrl+J
              </kbd>
            </button>

            <div className="hidden items-center -space-x-1.5 md:flex">
              {ws?.members.map((m) => (
                <span
                  key={m.id}
                  title={`${m.display_name || "Member"} · ${m.role}${m.working_area ? ` · ${m.working_area}` : ""}`}
                  className={cn(
                    "relative grid size-7 place-items-center rounded-full border-2 border-background text-[10px] font-semibold",
                    m.role === "frontend"
                      ? "bg-frontend/20 text-frontend"
                      : m.role === "backend"
                        ? "bg-backend/20 text-backend"
                        : m.role === "database"
                          ? "bg-database/20 text-database"
                          : "bg-lead/20 text-lead",
                  )}
                >
                  {(m.display_name || "User")
                    .split(" ")
                    .filter(Boolean)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "U"}
                  <span
                    className={cn(
                      "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-background",
                      m.online ? "bg-success" : "bg-muted-foreground",
                    )}
                  />
                </span>
              ))}
            </div>

            <div className="hidden text-right sm:block">
              <p className="max-w-40 truncate text-xs font-medium">{user?.email}</p>
              <RoleBadge role="lead" />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-6">{children}</main>
      </div>

      {/* Global AI Copilot Modal */}
      <AiCopilotModal isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} />

      {/* Invite Teammates Modal */}
      {ws ? (
        <InviteTeammatesModal
          isOpen={inviteOpen}
          onClose={() => setInviteOpen(false)}
          workspace={ws}
        />
      ) : null}
    </div>
  );
}

// ─── Project Switcher ──────────────────────────────────────────────────

function ProjectSwitcher() {
  const [dropOpen, setDropOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: ws } = useWorkspace();
  const { data: projects } = useUserProjects();
  const [, setActive] = useActiveProjectId();
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]);

  const switchTo = (id: string) => {
    setActive(id);
    setDropOpen(false);
    void navigate({ to: "/dashboard" });
  };

  return (
    <div ref={ref} className="relative border-b border-sidebar-border">
      <button
        type="button"
        onClick={() => setDropOpen(!dropOpen)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded bg-primary/10 text-primary">
          <Network className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {ws?.project.name ?? "Select project"}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            dropOpen && "rotate-180",
          )}
        />
      </button>

      {dropOpen && projects && projects.length > 0 ? (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => switchTo(p.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
                p.id === ws?.project.id && "bg-accent/50 font-medium",
              )}
            >
              <Network className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{p.name}</span>
              {p.id === ws?.project.id ? (
                <span className="ml-auto text-[10px] text-primary">active</span>
              ) : null}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <Link
              to="/projects"
              onClick={() => setDropOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <FolderKanban className="size-3" />
              Manage projects
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

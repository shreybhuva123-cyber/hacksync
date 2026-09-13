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
  Gauge,
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
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  TestTube2,
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
import { CommandPalette } from "./CommandPalette";
import { InviteTeammatesModal } from "@/components/projects/InviteTeammatesModal";
import { TopTimerWidget } from "@/components/timer";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string | number | undefined;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
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
  const conflictCount = ws ? ws.branches.filter((b) => b.merge_status === "conflict").length : 0;

  // Keyboard shortcut listener: Cmd/Ctrl + J for Copilot, Cmd/Ctrl + K for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setCopilotOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navGroups: NavGroup[] = [
    {
      group: "Workspaces",
      items: [
        { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { to: "/code", label: "Code Intelligence", icon: FileCode2 },
        {
          to: "/security",
          label: "Security Center",
          icon: ShieldAlert,
          badge: cyberThreatsCount > 0 ? cyberThreatsCount : undefined,
        },
        {
          to: "/testing",
          label: "Testing & Verify",
          icon: TestTube2,
          badge: criticalCount > 0 ? criticalCount : undefined,
        },
        { to: "/evaluation", label: "Evaluation & Benchmarks", icon: Gauge },
        {
          to: "/git",
          label: "Git Intelligence",
          icon: GitBranch,
          badge: conflictCount > 0 ? conflictCount : undefined,
        },
        { to: "/settings", label: "Settings", icon: Settings },
      ],
    },
    {
      group: "Specifications & Maps",
      items: [
        { to: "/api", label: "API Contracts", icon: PlugZap },
        { to: "/schema", label: "Database Schema", icon: Database },
        { to: "/architecture", label: "Architecture Map", icon: Boxes },
        { to: "/activity", label: "Activity Log", icon: Activity },
        { to: "/pitch", label: "Judge Demo Mode", icon: Trophy },
      ],
    },
  ];

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
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-[6px] bg-primary/10 text-primary border border-primary/20">
              <Network className="size-4" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-foreground leading-none">
                Hack<span className="text-primary">Sync</span>
              </span>
              <span className="text-[10px] text-muted-foreground mono mt-0.5">engineering platform</span>
            </div>
          </Link>
          <button
            type="button"
            className="rounded-[6px] p-1 text-muted-foreground hover:bg-sidebar-accent lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Project Switcher */}
        <ProjectSwitcher />

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {navGroups.map((section) => (
            <div key={section.group} className="mb-4">
              <p className="mono px-2 pb-1.5 text-[10px] tracking-[0.14em] text-muted-foreground uppercase font-medium">
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
                          "flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                          active
                            ? "bg-surface-raised font-medium text-foreground border border-border"
                            : "text-muted-foreground hover:bg-surface hover:text-foreground",
                        )}
                      >
                        <item.icon
                          className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                        />
                        <span className="truncate">{item.label}</span>
                        {item.badge !== undefined ? (
                          <span className="mono ml-auto rounded-[4px] bg-destructive/15 border border-destructive/25 px-1.5 py-0.2 text-[10px] font-semibold text-destructive">
                            {item.badge}
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
          <div className="rounded-[8px] border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-medium">Health Score</span>
              <span className="mono text-sm font-semibold tabular-nums text-foreground">
                {readiness ? `${readiness.score}%` : "—"}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
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
            className="mt-3 flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Main Content Area */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <button
            type="button"
            className="rounded-[6px] p-1.5 text-muted-foreground hover:bg-surface-raised lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-xs font-semibold text-foreground sm:text-sm">
              {ws?.project.name ?? "Loading workspace…"}
            </span>

            {/* Active Git Branch badge */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-[4px] border border-border bg-surface px-2 py-0.5 text-[11px] mono text-muted-foreground">
              <GitBranch className="size-3 text-primary" />
              <span>{ws?.project.default_branch ?? "main"}</span>
            </div>

            {/* Real-time Sync Status indicator */}
            <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <span className="size-1.5 rounded-full bg-success" />
              <span>Live Sync Active</span>
            </div>

            {ws?.project.repo_url ? (
              <a
                href={ws.project.repo_url}
                target="_blank"
                rel="noreferrer"
                className="mono hidden items-center gap-1 text-[11px] text-muted-foreground hover:text-primary md:inline-flex transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Github className="size-3.5" />
                {ws.project.repo_url.replace("https://github.com/", "")}
              </a>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Global Search / Command Palette Shortcut Trigger */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-2 rounded-[6px] border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              title="Search or Jump to... (Ctrl+K)"
            >
              <Search className="size-3.5" />
              <span className="hidden md:inline">Search or jump to...</span>
              <kbd className="mono rounded border border-border bg-surface-raised px-1 py-0.2 text-[10px]">
                ⌘K
              </kbd>
            </button>

            {/* Top Timer Widget */}
            <TopTimerWidget />

            {/* Invite Teammates Action Button */}
            {ws ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Invite Teammates"
              >
                <UserPlus className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Invite</span>
              </button>
            ) : null}

            {/* Evidence-First AI Copilot Trigger */}
            <button
              type="button"
              onClick={() => setCopilotOpen(true)}
              className="flex items-center gap-1.5 rounded-[6px] border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              title="Open AI Engineering Copilot (Ctrl+J)"
            >
              <Sparkles className="size-3.5" />
              <span>Copilot</span>
              <kbd className="hidden sm:inline-block rounded border border-primary/30 bg-primary/10 px-1 py-0.2 text-[9px] mono">
                ⌘J
              </kbd>
            </button>

            <div className="hidden items-center -space-x-1 md:flex pl-1">
              {ws?.members.map((m) => (
                <span
                  key={m.id}
                  title={`${m.display_name || "Member"} · ${m.role}`}
                  className="relative grid size-6 place-items-center rounded-full border border-border bg-surface text-[10px] font-semibold text-foreground"
                >
                  {(m.display_name || "U")[0]?.toUpperCase() || "U"}
                  <span
                    className={cn(
                      "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full border border-background",
                      m.online ? "bg-success" : "bg-muted-foreground",
                    )}
                  />
                </span>
              ))}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1540px] px-4 py-6 md:px-6">{children}</main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        workspace={ws}
        onOpenCopilot={() => setCopilotOpen(true)}
      />

      {/* Global AI Copilot Workspace */}
      <AiCopilotModal
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        workspace={ws}
      />

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
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-[4px] bg-surface text-primary border border-border">
          <Network className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
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
        <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-[8px] border border-border bg-popover py-1 shadow-md">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => switchTo(p.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-raised",
                p.id === ws?.project.id && "bg-surface-raised font-medium text-primary",
              )}
            >
              <Network className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{p.name}</span>
              {p.id === ws?.project.id ? (
                <span className="ml-auto mono text-[10px] text-primary">active</span>
              ) : null}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <Link
              to="/projects"
              onClick={() => setDropOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <FolderKanban className="size-3" />
              Manage all projects
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

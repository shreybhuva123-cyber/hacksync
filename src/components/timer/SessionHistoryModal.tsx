import { useState } from "react";
import { createPortal } from "react-dom";
import {
  History,
  X,
  Plus,
  Search,
  Download,
  Copy,
  Check,
  Clock,
  PlugZap,
  Database,
  ShieldCheck,
  FileCode,
  ListChecks,
  Sparkles,
  User,
} from "lucide-react";
import { RoleBadge } from "@/components/hacksync/primitives";
import type { TimelineEntry } from "@/lib/hacksync/timer-store";

interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: TimelineEntry[];
  onAddEntry: (entry: {
    category: TimelineEntry["category"];
    title: string;
    description?: string | null | undefined;
  }) => void;
  onClearHistory: () => void;
}

const CATEGORY_ICONS: Record<TimelineEntry["category"], typeof Clock> = {
  contract: PlugZap,
  database: Database,
  security: ShieldCheck,
  code: FileCode,
  task: ListChecks,
  pitch: Sparkles,
  custom: Clock,
};

const CATEGORY_COLORS: Record<TimelineEntry["category"], string> = {
  contract: "text-primary bg-primary/10 border-primary/20",
  database: "text-database bg-database/10 border-database/20",
  security: "text-success bg-success/10 border-success/20",
  code: "text-frontend bg-frontend/10 border-frontend/20",
  task: "text-lead bg-lead/10 border-lead/20",
  pitch: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  custom: "text-muted-foreground bg-muted border-border",
};

export function SessionHistoryModal({
  isOpen,
  onClose,
  history,
  onAddEntry,
  onClearHistory,
}: SessionHistoryModalProps) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCat, setNewCat] = useState<TimelineEntry["category"]>("custom");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredHistory = history.filter((item) => {
    const matchesFilter = filter === "all" || item.category === filter;
    const matchesSearch =
      search === "" ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase())) ||
      (item.actor && item.actor.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddEntry({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      category: newCat,
    });
    setNewTitle("");
    setNewDesc("");
    setShowAddForm(false);
  };

  const exportMarkdown = () => {
    const lines = [
      "# ⏱️ HackSync Hackathon Time Log & Activity History",
      `*Generated on ${new Date().toLocaleString()}*`,
      "",
      "| Timer Offset | Category | Action / Milestone | Actor |",
      "|---|---|---|---|",
      ...history.map(
        (h) =>
          `| **${h.timerOffset}** | \`${h.category}\` | **${h.title}** ${h.description ? `— ${h.description}` : ""} | ${h.actor || "Team"} |`,
      ),
    ];
    const text = lines.join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 sm:p-4 backdrop-blur-sm">
      <div
        className="relative flex h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5 bg-surface">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <History className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Timeline & Session History</h3>
              <p className="text-[11px] text-muted-foreground">
                In this time you did this — chronological hackathon work-log
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportMarkdown}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent text-foreground transition-colors"
              title="Copy Markdown report for judges"
            >
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              <span>{copied ? "Copied Markdown!" : "Export Timeline"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="size-3.5" />
              <span>Log Milestone</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Add Work Log Drawer */}
        {showAddForm && (
          <form onSubmit={handleAddSubmit} className="border-b border-border bg-muted/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Log What You Did At This Time</span>
              <span className="text-[10px] text-muted-foreground">Auto-stamps with current timer offset</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Connected Frontend Auth Form"
                className="col-span-2 rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
              />
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value as any)}
                className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
              >
                <option value="code">💻 Code / Feature</option>
                <option value="contract">📡 API Contract</option>
                <option value="database">🗄️ Database Table</option>
                <option value="security">🛡️ Security Patch</option>
                <option value="task">📋 Team Task</option>
                <option value="pitch">🏆 Pitch / Slide</option>
                <option value="custom">⏱️ Milestone</option>
              </select>
            </div>

            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Optional notes or details on what was built..."
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Add to Timeline
              </button>
            </div>
          </form>
        )}

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-1">
            {["all", "contract", "database", "security", "code", "task", "pitch", "custom"].map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                    filter === cat
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {cat === "all" ? "All Activity" : cat}
                </button>
              ),
            )}
          </div>

          <div className="relative min-w-48">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history..."
              className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1 text-xs outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Timeline Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center space-y-2 text-muted-foreground">
              <Clock className="size-8 opacity-40" />
              <p className="text-xs">No timeline events matched your search.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
              {filteredHistory.map((item) => {
                const Icon = CATEGORY_ICONS[item.category] || Clock;
                const toneClass = CATEGORY_COLORS[item.category] || "text-foreground bg-muted";

                return (
                  <div key={item.id} className="relative group">
                    {/* Pulsing dot indicator */}
                    <div
                      className={`absolute -left-6 top-1.5 grid size-5 place-items-center rounded-full border bg-card ${toneClass}`}
                    >
                      <Icon className="size-2.5" />
                    </div>

                    <div className="rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 transition-colors shadow-sm space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="mono rounded bg-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
                            ⏱️ {item.timerOffset}
                          </span>
                          <h4 className="text-xs font-semibold text-foreground">{item.title}</h4>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {item.actor && <span>By {item.actor}</span>}
                          <span>•</span>
                          <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-xs text-muted-foreground pt-0.5">{item.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-border bg-surface px-5 py-2.5 text-xs text-muted-foreground">
          <span>{filteredHistory.length} timeline milestones recorded</span>
          <button
            type="button"
            onClick={onClearHistory}
            className="text-[11px] hover:text-destructive transition-colors"
          >
            Clear History
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

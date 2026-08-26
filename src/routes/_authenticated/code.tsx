import { useState, useMemo, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Bug,
  Check,
  ChevronRight,
  Edit3,
  Eye,
  FileCode2,
  Folder,
  HardDrive,
  HelpCircle,
  Info,
  Laptop,
  Lightbulb,
  MessageSquare,
  Radio,
  RefreshCw,
  Repeat,
  Save,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  CopyButton,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { analyzeCodeFile, askWorkspaceCopilot } from "@/lib/hacksync/ai-assistant";
import { auditWorkspaceSecurity } from "@/lib/hacksync/ai-security";
import {
  pickLocalDirectory,
  scanLocalDirectory,
  convertScannedFilesToCodeNodes,
  getStoredDirectoryState,
  saveStoredDirectoryState,
  writeNestedFileByPath,
  getActiveDirectoryHandle,
  type LocalDirectoryState,
  type ScannedFile,
} from "@/lib/hacksync/local-filesystem";
import { logActivity, useRowMutation } from "@/lib/hacksync/workspace";
import type { CodeNode, Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/code")({
  head: () => ({
    meta: [
      { title: "Code Explorer & AI Intelligence — HackSync" },
      {
        name: "description",
        content:
          "Shared project file tree with AI code explainer, bug detector, loop refactoring tutor, and cyber security analyzer.",
      },
      { property: "og:title", content: "Code Explorer & AI Intelligence — HackSync" },
      {
        property: "og:description",
        content: "One structure everyone codes against, with automated AI debugging & cyber audit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CodePage,
});

type AiTab = "code" | "explain" | "bugs" | "optimize" | "security" | "chat";

function CodePage() {
  return <WorkspaceView>{(ws) => <CodeBody ws={ws} />}</WorkspaceView>;
}

function CodeBody({ ws }: { ws: Workspace }) {
  // Local File System state
  const [localDir, setLocalDir] = useState<LocalDirectoryState>(getStoredDirectoryState);
  const [localNodes, setLocalNodes] = useState<CodeNode[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingToDisk, setIsSavingToDisk] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");

  // Merge workspace code nodes with scanned local nodes
  const displayNodes = useMemo(() => {
    if (localNodes.length === 0) return ws.codeNodes;
    // Map local nodes by path and overlay
    const nodeMap = new Map<string, CodeNode>();
    for (const node of ws.codeNodes) nodeMap.set(node.path, node);
    for (const node of localNodes) nodeMap.set(node.path, node);
    return Array.from(nodeMap.values());
  }, [ws.codeNodes, localNodes]);

  const files = displayNodes.filter((n) => n.kind === "file");
  const [selectedId, setSelectedId] = useState<string | null>(files[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<AiTab>("code");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { sender: "user" | "ai"; text: string; time: string }[]
  >([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const selected: CodeNode | undefined = displayNodes.find((n) => n.id === selectedId) ?? files[0];

  // Update edit buffer when selected file changes
  useEffect(() => {
    if (selected?.content) {
      setEditBuffer(selected.content);
    } else {
      setEditBuffer("");
    }
    setIsEditing(false);
  }, [selected?.id, selected?.content]);

  // Connect local folder
  const handleConnectDirectory = useCallback(async () => {
    try {
      setIsSyncing(true);
      const res = await pickLocalDirectory();
      if (!res) {
        setIsSyncing(false);
        return;
      }

      const scanned = await scanLocalDirectory(res.handle);
      const nodes = convertScannedFilesToCodeNodes(scanned, ws.project.id);
      setLocalNodes(nodes);
      setLocalDir({
        connected: true,
        name: res.name,
        fileCount: scanned.length,
        lastSyncedAt: new Date().toISOString(),
        autoSync: true,
      });
      saveStoredDirectoryState({
        connected: true,
        name: res.name,
        fileCount: scanned.length,
        lastSyncedAt: new Date().toISOString(),
        autoSync: true,
      });

      if (nodes.length > 0 && nodes[0]) {
        setSelectedId(nodes[0].id);
      }

      setSyncFeedback(`Synced ${scanned.length} files from ${res.name}`);
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : "Failed to open local directory.");
    } finally {
      setIsSyncing(false);
    }
  }, [ws.project.id]);

  // Rescan & Sync from Local Disk
  const handleSyncFromDisk = useCallback(async () => {
    const handle = getActiveDirectoryHandle();
    if (!handle) {
      // Re-prompt to select folder
      await handleConnectDirectory();
      return;
    }

    try {
      setIsSyncing(true);
      const scanned = await scanLocalDirectory(handle);
      const nodes = convertScannedFilesToCodeNodes(scanned, ws.project.id);
      setLocalNodes(nodes);
      setLocalDir((prev) => ({
        ...prev,
        fileCount: scanned.length,
        lastSyncedAt: new Date().toISOString(),
      }));
      setSyncFeedback(`Live sync: ${scanned.length} files up-to-date`);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err) {
      console.warn("Auto-sync scan error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [ws.project.id, handleConnectDirectory]);

  // Push edited code to Local Disk
  const handlePushToDisk = async () => {
    if (!selected) return;
    const handle = getActiveDirectoryHandle();
    if (!handle) {
      setSyncFeedback("Please connect your local folder first.");
      setTimeout(() => setSyncFeedback(null), 3000);
      return;
    }

    try {
      setIsSavingToDisk(true);
      const success = await writeNestedFileByPath(handle, selected.path, editBuffer);
      if (success) {
        // Update local node content
        setLocalNodes((prev) =>
          prev.map((n) => (n.id === selected.id ? { ...n, content: editBuffer } : n)),
        );
        setIsEditing(false);
        setSyncFeedback(`Saved & pushed ${selected.path} to disk!`);
        void logActivity(ws.project.id, "code", `Saved & synced ${selected.path} to local disk`);
      } else {
        setSyncFeedback(`Failed to write ${selected.path} to disk.`);
      }
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : "Disk write failed.");
    } finally {
      setIsSavingToDisk(false);
    }
  };

  // Toggle Auto-sync watcher
  const toggleAutoSync = () => {
    const next = !localDir.autoSync;
    setLocalDir((prev) => ({ ...prev, autoSync: next }));
    saveStoredDirectoryState({ autoSync: next });
  };

  // Auto-sync polling interval (every 4 seconds if enabled and handle active)
  useEffect(() => {
    if (!localDir.autoSync || !getActiveDirectoryHandle()) return;
    const timer = setInterval(() => {
      void handleSyncFromDisk();
    }, 4000);
    return () => clearInterval(timer);
  }, [localDir.autoSync, handleSyncFromDisk]);

  // AI analysis for the selected file
  const analysis = useMemo(() => {
    if (!selected) return null;
    const activeNode = isEditing ? { ...selected, content: editBuffer } : selected;
    return analyzeCodeFile(activeNode, ws);
  }, [selected, ws, isEditing, editBuffer]);

  // Cyber security scan for the selected file
  const fileVulns = useMemo(() => {
    if (!selected) return [];
    const fullAudit = auditWorkspaceSecurity(ws);
    return fullAudit.vulnerabilities.filter(
      (v) => v.location.type === "code" && v.location.target === selected.path,
    );
  }, [selected, ws]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim() || isAiLoading || !selected) return;

    const query = chatPrompt.trim();
    setChatPrompt("");
    const userTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setChatHistory((prev) => [...prev, { sender: "user", text: query, time: userTime }]);
    setIsAiLoading(true);

    try {
      const activeNode = isEditing ? { ...selected, content: editBuffer } : selected;
      const response = await askWorkspaceCopilot(query, ws, activeNode);
      setChatHistory((prev) => [
        ...prev,
        { sender: "ai", text: response.content, time: response.timestamp },
      ]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "ai",
          text: "I encountered an issue analyzing this file. Please try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="code & ai intelligence"
        title="Code Explorer"
        description="Shared project file tree with integrated AI code explainer, line-targeted bug diagnostics, loop transforms, and cyber security scanner."
      />

      {/* ⚡ Vibe Coding Live Sync Station */}
      <Panel className="p-4 bg-gradient-to-r from-card via-card to-primary/5 border-primary/20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Laptop className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground">Vibe Coding Live Sync</span>
                {localDir.connected ? (
                  <span className="flex items-center gap-1 rounded bg-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
                    <span className="size-1.5 rounded-full bg-success animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Disconnected
                  </span>
                )}
                {localDir.autoSync && localDir.connected ? (
                  <span className="flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Radio className="size-2.5 animate-pulse" /> Auto-Watcher ON
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {localDir.connected
                  ? `📁 ${localDir.name} · ${displayNodes.length} files synchronized`
                  : "Connect your local project folder to enable two-way live sync with VS Code & Cursor"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!localDir.connected ? (
              <button
                type="button"
                onClick={handleConnectDirectory}
                disabled={isSyncing}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm transition-opacity"
              >
                <Folder className="size-3.5" />
                Connect Local Folder
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSyncFromDisk()}
                  disabled={isSyncing}
                  title="Rescan and pull latest code edits from your local editor"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                >
                  <RefreshCw
                    className={`size-3.5 text-primary ${isSyncing ? "animate-spin" : ""}`}
                  />
                  Sync from Disk
                </button>

                <button
                  type="button"
                  onClick={toggleAutoSync}
                  title="Toggle automatic disk file watcher"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    localDir.autoSync
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-secondary text-muted-foreground border border-border"
                  }`}
                >
                  <Radio className="size-3" />
                  Auto-Watcher
                </button>

                <button
                  type="button"
                  onClick={handleConnectDirectory}
                  title="Switch to another local folder"
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Switch Folder
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sync feedback notification */}
        {syncFeedback ? (
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-xs text-primary font-medium animate-in fade-in">
            <Sparkles className="size-3" />
            {syncFeedback}
          </div>
        ) : null}

        {/* Teammate working awareness */}
        {ws.members.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1">
              👥 Team Working Areas:
            </span>
            {ws.members.map((m) => (
              <span
                key={m.id}
                className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px]"
              >
                <RoleBadge role={m.role} />
                <span className="font-medium text-foreground">{m.display_name}</span>
                {m.working_area ? (
                  <span className="text-muted-foreground font-mono">({m.working_area})</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
        {/* Left File Tree Panel */}
        <Panel className="self-start">
          <PanelHeader
            title="Files & Modules"
            icon={<FileCode2 className="size-4" />}
            actions={
              <StatusPill tone="primary" dot={false}>
                {displayNodes.length} nodes
              </StatusPill>
            }
          />
          <ul className="max-h-[75vh] divide-y divide-border overflow-y-auto">
            {displayNodes.map((n) => {
              const isSelected = selected?.id === n.id;
              const hasFileBugs = n.kind === "file" && analyzeCodeFile(n, ws).bugs.length > 0;
              // Check if a teammate is working in this file
              const activeMember = ws.members.find(
                (m) => m.working_area && n.path.includes(m.working_area),
              );

              return (
                <li key={n.id}>
                  <button
                    type="button"
                    disabled={n.kind === "folder"}
                    onClick={() => {
                      setSelectedId(n.id);
                      setChatHistory([]);
                    }}
                    className={`flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-accent/50 disabled:cursor-default disabled:opacity-80 ${
                      isSelected ? "bg-accent/60 font-medium" : ""
                    }`}
                  >
                    {n.kind === "folder" ? (
                      <Folder className="size-3.5 text-muted-foreground" />
                    ) : (
                      <FileCode2 className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="mono truncate text-[12px]">{n.path}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      {activeMember ? (
                        <span
                          title={`${activeMember.display_name} is working here`}
                          className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-foreground"
                        >
                          👤 {activeMember.display_name.split(" ")[0]}
                        </span>
                      ) : null}
                      {hasFileBugs ? (
                        <span className="flex items-center gap-0.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">
                          <Bug className="size-2.5" /> Bug
                        </span>
                      ) : null}
                      {n.owner_role ? <RoleBadge role={n.owner_role} /> : null}
                      <StatusPill tone={statusTone(n.status)} dot={false}>
                        {n.status.replace("_", " ")}
                      </StatusPill>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Right Tabbed Viewer: Source Code + AI Intelligence Suite */}
        <div className="self-start space-y-3">
          {/* AI Navigation Toolbar */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1">
            <TabButton
              active={activeTab === "code"}
              onClick={() => setActiveTab("code")}
              icon={<FileCode2 className="size-3.5" />}
              label="Source Code"
            />
            <TabButton
              active={activeTab === "explain"}
              onClick={() => setActiveTab("explain")}
              icon={<Lightbulb className="size-3.5" />}
              label="Explain & Architecture"
            />
            <TabButton
              active={activeTab === "bugs"}
              onClick={() => setActiveTab("bugs")}
              icon={<Bug className="size-3.5" />}
              label="Bugs & Debug"
              badge={analysis && analysis.bugs.length > 0 ? analysis.bugs.length : undefined}
              badgeTone="danger"
            />
            <TabButton
              active={activeTab === "optimize"}
              onClick={() => setActiveTab("optimize")}
              icon={<Zap className="size-3.5" />}
              label="Refactor & Loops"
            />
            <TabButton
              active={activeTab === "security"}
              onClick={() => setActiveTab("security")}
              icon={<Shield className="size-3.5" />}
              label="Cyber Scan"
              badge={fileVulns.length > 0 ? fileVulns.length : undefined}
              badgeTone="danger"
            />
            <TabButton
              active={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
              icon={<Bot className="size-3.5" />}
              label="Ask AI"
            />
          </div>

          {/* TAB 1: Source Code View & Live Editor */}
          {activeTab === "code" ? (
            <div className="space-y-2">
              {selected?.content !== undefined ? (
                <div>
                  {/* Action Bar for Source Code / Live Editor */}
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs font-semibold text-foreground">
                        {selected.path}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] mono text-muted-foreground uppercase">
                        {selected.language}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(!isEditing)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          isEditing
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground hover:bg-accent"
                        }`}
                      >
                        {isEditing ? <Eye className="size-3" /> : <Edit3 className="size-3" />}
                        {isEditing ? "View Highlighting" : "Live Editor"}
                      </button>

                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => void handlePushToDisk()}
                          disabled={isSavingToDisk}
                          className="flex items-center gap-1 rounded-md bg-success/90 px-2.5 py-1 text-xs font-semibold text-success-foreground hover:bg-success disabled:opacity-60"
                        >
                          <Save className={`size-3 ${isSavingToDisk ? "animate-spin" : ""}`} />
                          Push to Disk
                        </button>
                      ) : null}

                      <CopyButton value={isEditing ? editBuffer : (selected.content ?? "")} />
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="rounded-lg border border-border bg-card p-3 shadow-inner">
                      <textarea
                        value={editBuffer}
                        onChange={(e) => setEditBuffer(e.target.value)}
                        placeholder="// Enter or modify code..."
                        rows={22}
                        className="w-full resize-y rounded bg-muted/40 p-3 text-xs mono text-foreground outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                        spellCheck={false}
                      />
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{editBuffer.split("\n").length} lines</span>
                        <span className="italic">
                          Edits automatically refresh AI diagnostics & security scans
                        </span>
                      </div>
                    </div>
                  ) : (
                    <CodeBlock
                      filename={selected.path}
                      language={selected.language}
                      code={selected.content ?? ""}
                      maxHeight="70vh"
                    />
                  )}
                </div>
              ) : (
                <EmptyState
                  title="No file contents"
                  description="Select a file that has committed snippets or connect your local folder to scan files."
                />
              )}
            </div>
          ) : null}

          {/* TAB 2: AI Code Explainer & Architecture Insights */}
          {activeTab === "explain" ? (
            <Panel className="p-5 space-y-4">
              <div>
                <span className="mono text-[10px] uppercase tracking-wider text-primary font-semibold">
                  AI Code Analysis
                </span>
                <h3 className="text-base font-semibold tracking-tight">{selected?.path}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {analysis?.explanation.overview}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3.5">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="size-3.5 text-primary" /> Architectural Role
                </h4>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {analysis?.explanation.architectureRole}
                </p>
              </div>

              {/* Construct Insights & Why Loops Were Used */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" /> Syntax & Construct Rationale
                </h4>

                {analysis?.explanation.constructInsights &&
                analysis.explanation.constructInsights.length > 0 ? (
                  analysis.explanation.constructInsights.map((ci, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-surface p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary">{ci.construct}</span>
                        <StatusPill tone="primary">Construct Analysis</StatusPill>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <strong>Why used:</strong> {ci.whyUsed}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <strong>Alternative options:</strong> {ci.alternatives}
                      </p>

                      {ci.transformationGuide ? (
                        <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                          <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                            <Repeat className="size-3" />
                            Transform to: {ci.transformationGuide.targetConstruct}
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            {ci.transformationGuide.explanation}
                          </p>
                          <CodeBlock
                            code={ci.transformationGuide.convertedSnippet}
                            language="typescript"
                            maxHeight="160px"
                          />
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This file uses standard declarative module exports without complex loop
                    branching.
                  </p>
                )}
              </div>
            </Panel>
          ) : null}

          {/* TAB 3: Bugs & Debugging Assistant */}
          {activeTab === "bugs" ? (
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                    <Bug className="size-4 text-destructive" />
                    Line-by-Line Fault Diagnostics
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Automated static analysis detecting runtime traps, async faults, and memory
                    leaks.
                  </p>
                </div>
                <StatusPill tone={analysis?.bugs.length ? "danger" : "success"}>
                  {analysis?.bugs.length ?? 0} bugs detected
                </StatusPill>
              </div>

              {!analysis?.bugs.length ? (
                <div className="p-8 text-center">
                  <Check className="mx-auto size-7 text-success" />
                  <p className="mt-2 text-xs font-semibold text-foreground">
                    Zero code faults found
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    No unhandled promises, state mutations, or infinite loop traps were identified
                    in this file.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {analysis.bugs.map((bug) => (
                    <div
                      key={bug.id}
                      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="mono rounded bg-destructive/20 px-1.5 py-0.5 text-xs font-bold text-destructive">
                            Line {bug.line}
                          </span>
                          <h4 className="text-xs font-semibold text-foreground">{bug.title}</h4>
                        </div>
                        <StatusPill tone="danger">{bug.category}</StatusPill>
                      </div>

                      {bug.snippet ? (
                        <div className="mono rounded bg-background p-2 text-xs text-destructive border border-border">
                          {bug.snippet}
                        </div>
                      ) : null}

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {bug.description}
                      </p>

                      <div className="rounded-md border border-border bg-background p-3 text-xs space-y-1.5">
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <Wrench className="size-3 text-primary" /> Step-by-Step Debugging Guide:
                        </span>
                        <div className="whitespace-pre-wrap text-[11px] text-muted-foreground leading-relaxed">
                          {bug.debuggingGuide}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-foreground mb-1 block">
                          Suggested Fix:
                        </span>
                        <CodeBlock
                          code={bug.suggestedFix}
                          language="typescript"
                          maxHeight="150px"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {/* TAB 4: Refactor & Optimizations (Loop conversions) */}
          {activeTab === "optimize" ? (
            <Panel className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  Code Optimizations & Loop Refactors
                </h3>
                <p className="text-xs text-muted-foreground">
                  Algorithmic performance enhancements, loop optimizations, and React memoization
                  strategies.
                </p>
              </div>

              {/* Loop transformation box */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Repeat className="size-3.5" /> For Loop ↔ While Loop Conversion Guide
                  </span>
                  <StatusPill tone="primary">Loop Tutor</StatusPill>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Need to rewrite a <code>for</code> loop to a <code>while</code> loop or vice
                  versa? Here is the exact structural conversion recipe:
                </p>
                <CodeBlock
                  code={`// 1. FOR LOOP (Standard counter)
for (let i = 0; i < list.length; i++) {
  doWork(list[i]);
}

// 2. TRANSFORMED TO WHILE LOOP (With invariant safety)
let i = 0;
const total = list.length;
while (i < total) {
  doWork(list[i]);
  i++; // Crucial: must increment to avoid infinite loop
}`}
                  language="typescript"
                  maxHeight="180px"
                />
              </div>

              {/* Optimizations list */}
              <div className="space-y-3">
                {analysis?.optimizations.map((opt) => (
                  <div
                    key={opt.id}
                    className="rounded-lg border border-border bg-surface p-3.5 space-y-2"
                  >
                    <h4 className="text-xs font-semibold text-foreground">{opt.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      <strong>Performance Benefit:</strong> {opt.benefit}
                    </p>
                    <p className="text-[11px] text-primary">
                      <strong>Action Prompt:</strong> {opt.promptToRefactor}
                    </p>
                    {opt.beforeSnippet && opt.afterSnippet ? (
                      <div className="grid gap-2 sm:grid-cols-2 mt-2">
                        <div>
                          <span className="text-[10px] mono text-muted-foreground block mb-0.5">
                            BEFORE:
                          </span>
                          <div className="mono text-[11px] rounded bg-muted/60 p-2 border border-border truncate">
                            {opt.beforeSnippet}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] mono text-success block mb-0.5">AFTER:</span>
                          <div className="mono text-[11px] rounded bg-success/10 text-success p-2 border border-success/30 truncate">
                            {opt.afterSnippet}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {/* TAB 5: Cyber Security Vulnerability Scan for File */}
          {activeTab === "security" ? (
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                    <ShieldAlert className="size-4 text-primary" />
                    File Security & Cyber Scan
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    OWASP vulnerability scan tailored to {selected?.path}.
                  </p>
                </div>
                <StatusPill tone={fileVulns.length ? "danger" : "success"}>
                  {fileVulns.length} vulnerabilities
                </StatusPill>
              </div>

              {!fileVulns.length ? (
                <div className="p-8 text-center">
                  <Shield className="mx-auto size-7 text-success" />
                  <p className="mt-2 text-xs font-semibold text-foreground">Clean security scan</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    No hardcoded credentials, SQL injection patterns, or error leaks detected in
                    this file.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fileVulns.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{v.title}</span>
                        <StatusPill tone="danger">{v.severity}</StatusPill>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {v.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Remediation:</strong> {v.remediation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {/* TAB 6: Interactive Ask AI Chat */}
          {activeTab === "chat" ? (
            <Panel className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Bot className="size-3.5 text-primary" /> Ask AI about {selected?.path}
                </span>
                <span className="text-[10px] text-muted-foreground">File-Context Connected</span>
              </div>

              {/* Chat Thread */}
              <div className="max-h-60 min-h-36 overflow-y-auto space-y-2.5 p-1 text-xs">
                {chatHistory.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <Sparkles className="mx-auto size-5 text-primary/60 mb-1" />
                    <p className="font-medium text-foreground">Ask anything about this code</p>
                    <p className="text-[11px] mt-0.5">
                      Try: <em>"Why use for loop instead of while loop?"</em> or{" "}
                      <em>"How to optimize this function?"</em>
                    </p>
                  </div>
                ) : (
                  chatHistory.map((m, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`rounded-lg p-3 max-w-[90%] whitespace-pre-wrap leading-relaxed ${
                          m.sender === "user"
                            ? "bg-primary text-primary-foreground font-medium"
                            : "border border-border bg-surface text-foreground"
                        }`}
                      >
                        {m.text}
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-0.5 px-1">{m.time}</span>
                    </div>
                  ))
                )}
                {isAiLoading ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Bot className="size-3.5 animate-pulse text-primary" /> Thinking...
                  </div>
                ) : null}
              </div>

              {/* Chat Form */}
              <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-border">
                <input
                  type="text"
                  value={chatPrompt}
                  onChange={(e) => setChatPrompt(e.target.value)}
                  placeholder={`Ask about ${selected?.path ?? "code"} (e.g. why for vs while loop)...`}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring focus:ring-1"
                />
                <button
                  type="submit"
                  disabled={!chatPrompt.trim() || isAiLoading}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                >
                  <Send className="size-3" /> Ask
                </button>
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeTone = "danger",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number | null | undefined;
  badgeTone?: "danger" | "warning" | "success";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-surface-raised text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge !== null && badge > 0 ? (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
            badgeTone === "danger"
              ? "bg-destructive/20 text-destructive"
              : badgeTone === "warning"
                ? "bg-warning/20 text-warning"
                : "bg-success/20 text-success"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

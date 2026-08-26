import { useState, useMemo, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bug,
  FileCode2,
  Folder,
  Laptop,
  Lightbulb,
  Radio,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Zap,
  Bot,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { CodeEditorView } from "@/components/code/CodeEditorView";
import { CodeExplainTab } from "@/components/code/CodeExplainTab";
import { CodeBugsTab } from "@/components/code/CodeBugsTab";
import { CodeOptimizeTab } from "@/components/code/CodeOptimizeTab";
import { CodeSecurityTab } from "@/components/code/CodeSecurityTab";
import { CodeChatTab } from "@/components/code/CodeChatTab";
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
} from "@/lib/hacksync/local-filesystem";
import { logActivity } from "@/lib/hacksync/workspace";
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
    const nodeMap = new Map<string, CodeNode>();
    for (const node of ws.codeNodes) nodeMap.set(node.path, node);
    for (const node of localNodes) nodeMap.set(node.path, node);
    return Array.from(nodeMap.values());
  }, [ws.codeNodes, localNodes]);

  const files = displayNodes.filter((n) => n.kind === "file");
  const [selectedId, setSelectedId] = useState<string | null>(files[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<AiTab>("code");
  const [chatHistory, setChatHistory] = useState<
    { sender: "user" | "ai"; text: string; time: string }[]
  >([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const selected: CodeNode | undefined = displayNodes.find((n) => n.id === selectedId) ?? files[0];

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
      const state: LocalDirectoryState = {
        connected: true,
        name: res.name,
        fileCount: scanned.length,
        lastSyncedAt: new Date().toISOString(),
        autoSync: true,
      };
      setLocalDir(state);
      saveStoredDirectoryState(state);

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

  const toggleAutoSync = () => {
    const next = !localDir.autoSync;
    setLocalDir((prev) => ({ ...prev, autoSync: next }));
    saveStoredDirectoryState({ autoSync: next });
  };

  useEffect(() => {
    if (!localDir.autoSync || !getActiveDirectoryHandle()) return;
    const timer = setInterval(() => {
      void handleSyncFromDisk();
    }, 4000);
    return () => clearInterval(timer);
  }, [localDir.autoSync, handleSyncFromDisk]);

  const analysis = useMemo(() => {
    if (!selected) return null;
    const activeNode = isEditing ? { ...selected, content: editBuffer } : selected;
    return analyzeCodeFile(activeNode, ws);
  }, [selected, ws, isEditing, editBuffer]);

  const fileVulns = useMemo(() => {
    if (!selected) return [];
    const fullAudit = auditWorkspaceSecurity(ws);
    return fullAudit.vulnerabilities.filter(
      (v) => v.location.type === "code" && v.location.target === selected.path,
    );
  }, [selected, ws]);

  const handleSendChat = async (query: string) => {
    if (!query.trim() || isAiLoading || !selected) return;

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

        {syncFeedback ? (
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-xs text-primary font-medium animate-in fade-in">
            <Sparkles className="size-3" />
            {syncFeedback}
          </div>
        ) : null}

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

        {/* Right Tabbed Viewer */}
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

          {activeTab === "code" && selected && (
            <CodeEditorView
              node={selected}
              isEditing={isEditing}
              editBuffer={editBuffer}
              isSaving={isSavingToDisk}
              onToggleEdit={() => setIsEditing(!isEditing)}
              onBufferChange={setEditBuffer}
              onSave={() => void handlePushToDisk()}
            />
          )}

          {activeTab === "explain" && (
            <CodeExplainTab selectedNode={selected} analysis={analysis} />
          )}

          {activeTab === "bugs" && (
            <CodeBugsTab analysis={analysis} />
          )}

          {activeTab === "optimize" && (
            <CodeOptimizeTab analysis={analysis} />
          )}

          {activeTab === "security" && (
            <CodeSecurityTab vulnerabilities={fileVulns} />
          )}

          {activeTab === "chat" && (
            <CodeChatTab
              selectedNode={selected}
              chatHistory={chatHistory}
              isAiLoading={isAiLoading}
              onSendChat={handleSendChat}
            />
          )}
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
  badgeTone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number | undefined;
  badgeTone?: "danger" | "success" | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 ? (
        <span
          className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
            badgeTone === "danger"
              ? "bg-destructive text-destructive-foreground"
              : "bg-success text-success-foreground"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

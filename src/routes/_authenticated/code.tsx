import { useState, useMemo, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  Bug,
  Check,
  FileCode2,
  Folder,
  FolderPlus,
  Laptop,
  Lightbulb,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Trash2,
  X,
  Zap,
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
  pickDirectoryUniversal,
  pickLocalDirectory,
  scanLocalDirectory,
  convertScannedFilesToCodeNodes,
  getStoredDirectoryState,
  saveStoredDirectoryState,
  writeNestedFileByPath,
  getActiveDirectoryHandle,
  type LocalDirectoryState,
} from "@/lib/hacksync/local-filesystem";
import { logActivity, useRowInsert, useRowMutation, useRowDelete } from "@/lib/hacksync/workspace";
import { ROLES, ROLE_CONFIG, type Role } from "@/lib/constants/roles";
import type { CodeNode, Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/code")({
  head: () => ({
    meta: [
      { title: "Files & Code Explorer — HackSync" },
      {
        name: "description",
        content:
          "Shared project file tree with in-browser editor, local disk sync, AI code explainer, bug detector, and cyber security analyzer.",
      },
      { property: "og:title", content: "Files & Code Explorer — HackSync" },
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
  const insert = useRowInsert();
  const update = useRowMutation();
  const remove = useRowDelete();

  const [localDir, setLocalDir] = useState<LocalDirectoryState>(getStoredDirectoryState);
  const [localNodes, setLocalNodes] = useState<CodeNode[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");

  // New File Modal State
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileRole, setNewFileRole] = useState<Role>("frontend");
  const [newFileContent, setNewFileContent] = useState("");
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [isScaffolding, setIsScaffolding] = useState(false);

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

  const selected: CodeNode | undefined =
    displayNodes.find((n) => n.id === selectedId) ?? files[0];

  useEffect(() => {
    if (selected?.content) {
      setEditBuffer(selected.content);
    } else {
      setEditBuffer("");
    }
    setIsEditing(false);
  }, [selected?.id, selected?.content]);

  // Connect local folder (Supports Chrome, Brave, Firefox, Safari, Edge)
  const handleConnectDirectory = useCallback(async () => {
    try {
      setIsSyncing(true);
      const res = await pickDirectoryUniversal();
      if (!res) {
        setIsSyncing(false);
        return;
      }

      const nodes = convertScannedFilesToCodeNodes(res.files, ws.project.id);
      setLocalNodes(nodes);
      const state: LocalDirectoryState = {
        connected: true,
        name: res.name,
        fileCount: res.files.length,
        lastSyncedAt: new Date().toISOString(),
        autoSync: Boolean(res.handle),
      };
      setLocalDir(state);
      saveStoredDirectoryState(state);

      if (nodes.length > 0 && nodes[0]) {
        setSelectedId(nodes[0].id);
      }

      // Persist newly scanned nodes into Supabase code_nodes table
      try {
        for (const f of res.files.slice(0, 40)) {
          insert.mutate({
            table: "code_nodes",
            values: {
              project_id: ws.project.id,
              path: f.path,
              parent_path: f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : null,
              kind: "file",
              area: f.area,
              owner_role:
                f.area === "frontend"
                  ? "frontend"
                  : f.area === "backend"
                    ? "backend"
                    : f.area === "database"
                      ? "database"
                      : "lead",
              status: "implemented",
              language: f.language,
              content: f.content || null,
            },
          });
        }
      } catch {
        // Non-blocking
      }

      setSyncFeedback(`Synced ${res.files.length} files from ${res.name}!`);
      void logActivity(
        ws.project.id,
        "code",
        `Connected local folder "${res.name}" with ${res.files.length} files`,
      );
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : "Failed to open local directory.");
    } finally {
      setIsSyncing(false);
    }
  }, [ws.project.id, insert]);

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

  // Push edited code to Supabase AND Local Disk
  const handleSaveFile = async () => {
    if (!selected) return;

    try {
      setIsSaving(true);

      // 1. Update in Supabase if it's a persisted code node
      if (ws.codeNodes.some((n) => n.id === selected.id)) {
        update.mutate({
          table: "code_nodes",
          id: selected.id,
          values: { content: editBuffer, updated_at: new Date().toISOString() },
        });
      }

      // 2. Update local state
      setLocalNodes((prev) =>
        prev.map((n) => (n.id === selected.id ? { ...n, content: editBuffer } : n)),
      );

      // 3. Write to local disk if directory handle exists
      const handle = getActiveDirectoryHandle();
      if (handle) {
        await writeNestedFileByPath(handle, selected.path, editBuffer);
      }

      setIsEditing(false);
      setSyncFeedback(`Saved ${selected.path} successfully!`);
      void logActivity(ws.project.id, "code", `Edited & saved ${selected.path}`);
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete file
  const handleDeleteFile = (fileNode: CodeNode) => {
    if (!confirm(`Delete "${fileNode.path}" from workspace?`)) return;

    if (ws.codeNodes.some((n) => n.id === fileNode.id)) {
      remove.mutate({ table: "code_nodes", id: fileNode.id });
    }

    setLocalNodes((prev) => prev.filter((n) => n.id !== fileNode.id));
    if (selectedId === fileNode.id) {
      const remaining = displayNodes.filter((n) => n.id !== fileNode.id && n.kind === "file");
      setSelectedId(remaining[0]?.id ?? null);
    }

    void logActivity(ws.project.id, "code", `Deleted file ${fileNode.path}`);
    setSyncFeedback(`Deleted ${fileNode.path}`);
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  // 1-Click Starter Files Scaffolder
  const handleScaffoldStarterFiles = async () => {
    try {
      setIsScaffolding(true);
      const starterFiles = [
        {
          project_id: ws.project.id,
          path: "src/index.ts",
          parent_path: "src",
          kind: "file" as const,
          area: "backend" as const,
          owner_role: "backend" as const,
          status: "in_progress" as const,
          language: "typescript",
          content: `// ${ws.project.name} Application Entry Point\nimport express from "express";\n\nconst app = express();\napp.use(express.json());\n\nconst PORT = process.env.PORT || 8080;\n\napp.get("/api/health", (req, res) => {\n  res.json({ status: "healthy", timestamp: new Date().toISOString() });\n});\n\napp.listen(PORT, () => {\n  console.log(\`Server running on port \${PORT}\`);\n});\n`,
        },
        {
          project_id: ws.project.id,
          path: "src/routes/api.ts",
          parent_path: "src/routes",
          kind: "file" as const,
          area: "backend" as const,
          owner_role: "backend" as const,
          status: "in_progress" as const,
          language: "typescript",
          content: `// API Routes matching HackSync Contracts\nimport { Router } from "express";\n\nexport const apiRouter = Router();\n\napiRouter.get("/events", (req, res) => {\n  res.json([\n    { id: "evt_01", title: "Hackathon Kickoff & Keynote" },\n    { id: "evt_02", title: "AI Agent Engineering Workshop" },\n  ]);\n});\n\napiRouter.post("/events/:id/rsvp", (req, res) => {\n  res.status(201).json({ success: true, message: "RSVP confirmed" });\n});\n`,
        },
        {
          project_id: ws.project.id,
          path: "src/db/schema.sql",
          parent_path: "src/db",
          kind: "file" as const,
          area: "database" as const,
          owner_role: "database" as const,
          status: "in_progress" as const,
          language: "sql",
          content: `-- ${ws.project.name} Database Schema\nCREATE TABLE IF NOT EXISTS events (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  title TEXT NOT NULL,\n  description TEXT,\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n\nCREATE TABLE IF NOT EXISTS rsvps (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  event_id UUID REFERENCES events(id) ON DELETE CASCADE,\n  user_email TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n`,
        },
        {
          project_id: ws.project.id,
          path: "README.md",
          parent_path: null,
          kind: "file" as const,
          area: "shared" as const,
          owner_role: "lead" as const,
          status: "implemented" as const,
          language: "markdown",
          content: `# ${ws.project.name}\n\n${ws.project.description || "Hackathon project workspace managed by HackSync."}\n\n## 🚀 Getting Started\n\n1. Install dependencies: \`npm install\`\n2. Run development server: \`npm run dev\`\n3. Single Source of Truth API contracts are synchronized via HackSync.\n`,
        },
      ];

      for (const f of starterFiles) {
        insert.mutate({ table: "code_nodes", values: f });
      }

      void logActivity(ws.project.id, "code", `Scaffolded starter project files for ${ws.project.name}`);
      setSyncFeedback("Scaffolded 4 starter files!");
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err) {
      setSyncFeedback("Failed to scaffold files.");
    } finally {
      setIsScaffolding(false);
    }
  };

  // Create new file
  const handleCreateNewFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilePath.trim()) {
      setNewFileError("File path is required.");
      return;
    }

    const cleanPath = newFilePath.trim().replace(/^\//, "");
    const parts = cleanPath.split("/");
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    const ext = cleanPath.split(".").pop()?.toLowerCase() ?? "";

    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      sql: "sql",
      json: "json",
      md: "markdown",
      css: "css",
      html: "html",
    };

    insert.mutate(
      {
        table: "code_nodes",
        values: {
          project_id: ws.project.id,
          path: cleanPath,
          parent_path: parentPath,
          kind: "file",
          area: newFileRole === "lead" ? "shared" : newFileRole,
          owner_role: newFileRole,
          status: "in_progress",
          language: langMap[ext] || "text",
          content: newFileContent || `// ${cleanPath}\n`,
        },
      },
      {
        onSuccess: () => {
          void logActivity(ws.project.id, "code", `Created new file ${cleanPath}`);
          setShowNewFileModal(false);
          setNewFilePath("");
          setNewFileContent("");
          setNewFileError(null);
          setSyncFeedback(`Created ${cleanPath}`);
          setTimeout(() => setSyncFeedback(null), 3000);
        },
        onError: (err: unknown) => {
          setNewFileError(err instanceof Error ? err.message : "Failed to create file.");
        },
      },
    );
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
        title="Files & Code Explorer"
        description="Shared project file tree with in-browser editor, local disk sync, AI code explainer, line-targeted bug diagnostics, and cyber security scanner."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewFileModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-sm"
            >
              <Plus className="size-3.5 text-primary" />
              <span>New File</span>
            </button>
          </div>
        }
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
      </Panel>

      {/* Main Files Layout */}
      {displayNodes.length === 0 ? (
        /* Empty State */
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-4 bg-muted/10">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileCode2 className="size-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-semibold text-foreground">No files in this project yet</h3>
            <p className="text-xs text-muted-foreground">
              You can connect your local development directory, generate hackathon starter code with 1-click, or create individual files manually.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleScaffoldStarterFiles}
              disabled={isScaffolding}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm transition-opacity"
            >
              {isScaffolding ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              <span>Scaffold Starter Files</span>
            </button>
            <button
              type="button"
              onClick={handleConnectDirectory}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-semibold hover:bg-accent transition-colors"
            >
              <Folder className="size-3.5 text-primary" />
              <span>Connect Local Folder</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNewFileModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
              <span>New File</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
          {/* Left File Tree Panel */}
          <Panel className="self-start">
            <PanelHeader
              title="Files & Modules"
              icon={<FileCode2 className="size-4" />}
              actions={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowNewFileModal(true)}
                    title="Create New File"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <StatusPill tone="primary" dot={false}>
                    {displayNodes.length} nodes
                  </StatusPill>
                </div>
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
                  <li key={n.id} className="group relative">
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
                    {/* Delete file button on hover */}
                    {n.kind === "file" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(n);
                        }}
                        title={`Delete ${n.path}`}
                        className="absolute right-2 top-2.5 hidden rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive group-hover:block"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* Right Tabbed Viewer */}
          {selected ? (
            <div className="self-start space-y-3">
              {/* Tab Selector Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("code")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === "code"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <FileCode2 className="size-3.5" />
                    Code Editor
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("explain")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === "explain"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Lightbulb className="size-3.5" />
                    Explain
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("bugs")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === "bugs"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Bug className="size-3.5" />
                    Bugs ({analysis?.bugs.length ?? 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("optimize")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === "optimize"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Zap className="size-3.5" />
                    Optimize
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("security")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === "security"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Shield className="size-3.5" />
                    Cyber Audit ({fileVulns.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("chat")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === "chat"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Bot className="size-3.5" />
                    AI Chat
                  </button>
                </div>

                {/* Save button when in code tab */}
                {activeTab === "code" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveFile}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
                    >
                      {isSaving ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Save className="size-3" />
                      )}
                      <span>Save File</span>
                    </button>
                  </div>
                )}
              </div>

              {/* TAB 1: Code Editor */}
              {activeTab === "code" && (
                <CodeEditorView
                  node={selected}
                  isEditing={isEditing}
                  editBuffer={editBuffer}
                  isSaving={isSaving}
                  onToggleEdit={() => setIsEditing((prev) => !prev)}
                  onBufferChange={setEditBuffer}
                  onSave={handleSaveFile}
                />
              )}

              {/* TAB 2: AI Explainer */}
              {activeTab === "explain" && (
                <CodeExplainTab selectedNode={selected} analysis={analysis} />
              )}

              {/* TAB 3: Bug Diagnostics */}
              {activeTab === "bugs" && (
                <CodeBugsTab analysis={analysis} />
              )}

              {/* TAB 4: Optimizer */}
              {activeTab === "optimize" && (
                <CodeOptimizeTab analysis={analysis} />
              )}

              {/* TAB 5: Cyber Security */}
              {activeTab === "security" && (
                <CodeSecurityTab vulnerabilities={fileVulns} />
              )}

              {/* TAB 6: AI Chat */}
              {activeTab === "chat" && (
                <CodeChatTab
                  selectedNode={selected}
                  chatHistory={chatHistory}
                  isAiLoading={isAiLoading}
                  onSendChat={handleSendChat}
                />
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <FolderPlus className="size-4 text-primary" /> Create New File
              </h3>
              <button
                type="button"
                onClick={() => setShowNewFileModal(false)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {newFileError && (
              <div className="rounded-lg bg-destructive/15 border border-destructive/30 p-2.5 text-xs text-destructive">
                {newFileError}
              </div>
            )}

            <form onSubmit={handleCreateNewFile} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">
                  File Path <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="e.g. src/services/auth.ts or README.md"
                  className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">
                  Owning Role
                </label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewFileRole(r)}
                      className={`flex items-center justify-center gap-1 rounded-lg border p-1.5 text-xs transition-colors ${
                        newFileRole === r
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      <RoleBadge role={r} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">
                  Initial Content (Optional)
                </label>
                <textarea
                  rows={4}
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  placeholder="// Paste or write initial code..."
                  className="mono w-full rounded-lg border border-input bg-background p-2.5 text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowNewFileModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={insert.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {insert.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  <span>Create File</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

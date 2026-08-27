import { useState, useMemo, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  Bug,
  Check,
  Download,
  FileCode2,
  Folder,
  FolderPlus,
  Github,
  HardDrive,
  Laptop,
  Layers,
  Lightbulb,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
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
import { MyWorkspaceView } from "@/components/code/MyWorkspaceView";
import { CodeSyncModal } from "@/components/code/CodeSyncModal";
import { GitHubPushModal } from "@/components/code/GitHubPushModal";
import { analyzeCodeFile, askWorkspaceCopilot } from "@/lib/hacksync/ai-assistant";
import { auditWorkspaceSecurity } from "@/lib/hacksync/ai-security";
import { useAuth } from "@/hooks/useAuth";
import {
  pickDirectoryUniversal,
  pickLocalFileUniversal,
  pickLocalDirectory,
  scanLocalDirectory,
  convertScannedFilesToCodeNodes,
  getStoredDirectoryState,
  saveStoredDirectoryState,
  writeNestedFileByPath,
  getActiveDirectoryHandle,
  setActiveDirectoryHandle,
  exportWorkspaceToZip,
  syncWorkspaceFilesToLocalDisk,
  downloadSingleFile,
  type LocalDirectoryState,
} from "@/lib/hacksync/local-filesystem";
import { logActivity, useRowInsert, useRowMutation, useRowDelete } from "@/lib/hacksync/workspace";
import { ROLES, ROLE_CONFIG, type Role } from "@/lib/constants/roles";
import { supabase } from "@/integrations/supabase/client";
import type { CodeNode, Workspace, MemberFile, FileSyncStatus, Area } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/code")({
  head: () => ({
    meta: [
      { title: "Files & Code Workspace — HackSync" },
      {
        name: "description",
        content:
          "Individual local file workspaces, CodeSync engine with conflict resolution, shared project codebase, and direct GitHub push.",
      },
      { property: "og:title", content: "Files & Code Workspace — HackSync" },
      {
        property: "og:description",
        content: "Individual developer workspaces synced seamlessly into one shared project with GitHub push.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CodePage,
});

type WorkspaceMode = "my_workspace" | "shared_project";
type AiTab = "code" | "explain" | "bugs" | "optimize" | "security" | "chat";

function CodePage() {
  return <WorkspaceView>{(ws) => <CodeBody ws={ws} />}</WorkspaceView>;
}

function CodeBody({ ws }: { ws: Workspace }) {
  const { user } = useAuth();
  const insert = useRowInsert();
  const update = useRowMutation();
  const remove = useRowDelete();

  // Mode: "my_workspace" (Individual member files) vs "shared_project" (Merged codebase)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("shared_project");

  // Modals
  const [showCodeSyncModal, setShowCodeSyncModal] = useState(false);
  const [showGitHubPushModal, setShowGitHubPushModal] = useState(false);
  const [showNewFileModal, setShowNewFileModal] = useState(false);

  // Member local files state
  const [memberFiles, setMemberFiles] = useState<MemberFile[]>([]);
  const [isLoadingMemberFiles, setIsLoadingMemberFiles] = useState(false);

  // Determine current user details
  const callerMember = ws.members.find((m) => m.user_id === user?.id);
  const currentRole: Role = callerMember?.role ?? (ws.project.created_by === user?.id ? "owner" : "member");
  const currentUserName = callerMember?.display_name || user?.email?.split("@")[0] || "Developer";

  // Load Member Files from Supabase
  const loadMemberFiles = useCallback(async () => {
    try {
      setIsLoadingMemberFiles(true);
      const { data, error } = await (supabase.from as any)("member_files")
        .select("*")
        .eq("project_id", ws.project.id);

      if (!error && data) {
        setMemberFiles(data as MemberFile[]);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingMemberFiles(false);
    }
  }, [ws.project.id]);

  useEffect(() => {
    loadMemberFiles();
  }, [loadMemberFiles]);

  // Local Directory State
  const [localDir, setLocalDir] = useState<LocalDirectoryState>(getStoredDirectoryState);
  const [localNodes, setLocalNodes] = useState<CodeNode[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");

  // New File Modal State
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
      setActiveDirectoryHandle(res.handle);

      // Add to member files as well
      const memberStagedFiles = res.files.map((f) => ({
        project_id: ws.project.id,
        user_id: user?.id ?? null,
        member_id: callerMember?.id ?? null,
        owner_role:
          f.area === "frontend"
            ? "frontend"
            : f.area === "backend"
              ? "backend"
              : f.area === "database"
                ? "database"
                : ("lead" as Role),
        file_name: f.name,
        relative_path: f.path,
        file_type: "text/plain",
        language: f.language,
        content: f.content || "",
        sync_status: "local_modified" as FileSyncStatus,
        last_modified: new Date(f.lastModified).toISOString(),
      }));

      // Insert into member_files table
      for (const mf of memberStagedFiles.slice(0, 50)) {
        await (supabase.from as any)("member_files").insert(mf);
      }

      loadMemberFiles();

      setSyncFeedback(`Synced ${res.files.length} files from ${res.name}!`);
      void logActivity(
        ws.project.id,
        "code",
        `Connected local folder "${res.name}" with ${res.files.length} files`,
      );
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err) {
      console.warn("Directory connect error:", err);
      setSyncFeedback("Could not connect folder. Access was cancelled.");
      setTimeout(() => setSyncFeedback(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  }, [ws.project.id, user?.id, callerMember?.id, loadMemberFiles]);

  // Push All to Disk
  const handlePushAllToDisk = async () => {
    const handle = getActiveDirectoryHandle();
    if (!handle) {
      setSyncFeedback("Connect a local folder first to push files to disk.");
      setTimeout(() => setSyncFeedback(null), 3500);
      return;
    }

    try {
      setIsSyncing(true);
      const res = await syncWorkspaceFilesToLocalDisk(handle, displayNodes);
      setSyncFeedback(`Pushed ${res.written} files to "${localDir.name}" on your disk!`);
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err) {
      setSyncFeedback("Failed to write files to disk.");
      setTimeout(() => setSyncFeedback(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  };

  // 1-Click ZIP Download
  const handleDownloadZip = async () => {
    try {
      setIsExporting(true);
      await exportWorkspaceToZip(ws.project.name, displayNodes);
      void logActivity(ws.project.id, "code", `Downloaded project zip archive for ${ws.project.name}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download project zip.");
    } finally {
      setIsExporting(false);
    }
  };

  // Add Member Files
  const handleAddMemberFiles = async (
    newFiles: Omit<MemberFile, "id" | "created_at" | "updated_at">[],
  ) => {
    for (const f of newFiles) {
      const payload = {
        ...f,
        project_id: ws.project.id,
        user_id: user?.id ?? null,
        member_id: callerMember?.id ?? null,
      };

      try {
        const { data } = await (supabase.from as any)("member_files").insert(payload).select("*").single();
        if (data) {
          setMemberFiles((prev) => [data as MemberFile, ...prev]);
        }
      } catch {
        // Local in-memory fallback
        const mock: MemberFile = {
          ...payload,
          id: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setMemberFiles((prev) => [mock, ...prev]);
      }
    }
  };

  const handleDeleteMemberFile = async (fileId: string) => {
    try {
      await (supabase.from as any)("member_files").delete().eq("id", fileId);
      setMemberFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      setMemberFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  // Scaffold Starter Files
  const handleScaffoldStarter = async () => {
    try {
      setIsScaffolding(true);
      const starterFiles = [
        {
          project_id: ws.project.id,
          path: "src/index.ts",
          parent_path: "src",
          kind: "file" as const,
          area: "frontend" as const,
          owner_role: "frontend" as const,
          status: "done" as const,
          language: "typescript",
          content: `// ${ws.project.name} - Application Entrypoint\nimport React from "react";\n\nexport function App() {\n  return (\n    <main className="min-h-screen p-8">\n      <h1 className="text-2xl font-bold">${ws.project.name}</h1>\n      <p className="text-muted-foreground">${ws.project.description || "Built with HackSync"}</p>\n    </main>\n  );\n}\n`,
        },
        {
          project_id: ws.project.id,
          path: "src/routes/api.ts",
          parent_path: "src/routes",
          kind: "file" as const,
          area: "backend" as const,
          owner_role: "backend" as const,
          status: "done" as const,
          language: "typescript",
          content: `// ${ws.project.name} - API Route Handler\nexport async function handleRequest(req: Request) {\n  const url = new URL(req.url);\n  if (url.pathname === "/api/health") {\n    return new Response(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }), {\n      headers: { "Content-Type": "application/json" },\n    });\n  }\n  return new Response("Not Found", { status: 404 });\n}\n`,
        },
        {
          project_id: ws.project.id,
          path: "src/db/schema.sql",
          parent_path: "src/db",
          kind: "file" as const,
          area: "database" as const,
          owner_role: "database" as const,
          status: "done" as const,
          language: "sql",
          content: `-- ${ws.project.name} Database Schema\nCREATE TABLE IF NOT EXISTS items (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  title TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n`,
        },
        {
          project_id: ws.project.id,
          path: "README.md",
          parent_path: null,
          kind: "file" as const,
          area: "shared" as const,
          owner_role: "lead" as const,
          status: "done" as const,
          language: "markdown",
          content: `# ${ws.project.name}\n\n${ws.project.description || "Hackathon project workspace managed by HackSync."}\n\n## 🚀 Getting Started\n\n1. Install dependencies: \`npm install\`\n2. Run development server: \`npm run dev\`\n3. Push to GitHub with HackSync CodeSync.\n`,
        },
      ];

      for (const f of starterFiles) {
        insert.mutate({ table: "code_nodes", values: f });
      }

      const handle = getActiveDirectoryHandle();
      if (handle) {
        for (const f of starterFiles) {
          await writeNestedFileByPath(handle, f.path, f.content);
        }
      }

      void logActivity(ws.project.id, "code", `Scaffolded starter project files for ${ws.project.name}`);
      setSyncFeedback("Scaffolded starter files! You can download, edit, or push them anytime.");
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch {
      setSyncFeedback("Failed to scaffold files.");
    } finally {
      setIsScaffolding(false);
    }
  };

  // Create new file
  const handleCreateNewFile = (e: React.FormEvent) => {
    e.preventDefault();
    setNewFileError(null);

    let cleanPath = newFilePath.trim().replace(/\\/g, "/");
    cleanPath = cleanPath.replace(/^[A-Za-z]:\/?/, "");
    cleanPath = cleanPath.replace(/^\/+/, "");

    if (!cleanPath) {
      setNewFileError("Please enter a relative file path (e.g. src/index.ts or README.md).");
      return;
    }

    if (!cleanPath.includes(".")) {
      cleanPath = `${cleanPath}.ts`;
    }

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

    const validOwnerRole: "frontend" | "backend" | "database" | "lead" =
      newFileRole === "frontend" || newFileRole === "backend" || newFileRole === "database"
        ? newFileRole
        : "lead";

    const initialContent = newFileContent || `// ${cleanPath}\n`;

    insert.mutate(
      {
        table: "code_nodes",
        values: {
          project_id: ws.project.id,
          path: cleanPath,
          parent_path: parentPath,
          kind: "file",
          area: validOwnerRole === "lead" ? "shared" : validOwnerRole,
          owner_role: validOwnerRole,
          status: "in_progress",
          language: langMap[ext] || "text",
          content: initialContent,
        },
      },
      {
        onSuccess: async () => {
          const handle = getActiveDirectoryHandle();
          if (handle) {
            await writeNestedFileByPath(handle, cleanPath, initialContent);
          }

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

  const handleSaveContent = async () => {
    if (!selected) return;
    try {
      setIsSaving(true);
      const isLocal = localNodes.some((n) => n.id === selected.id);

      if (isLocal) {
        const handle = getActiveDirectoryHandle();
        if (handle) {
          const ok = await writeNestedFileByPath(handle, selected.path, editBuffer);
          if (ok) {
            setLocalNodes((prev) =>
              prev.map((n) => (n.id === selected.id ? { ...n, content: editBuffer } : n)),
            );
            setSyncFeedback(`Saved "${selected.path}" directly to disk!`);
          }
        }
      } else {
        update.mutate({
          table: "code_nodes",
          id: selected.id,
          values: { content: editBuffer },
        });

        const handle = getActiveDirectoryHandle();
        if (handle) {
          await writeNestedFileByPath(handle, selected.path, editBuffer);
        }

        setSyncFeedback(`Saved "${selected.path}"!`);
      }

      setIsEditing(false);
      void logActivity(ws.project.id, "code", `Updated content of ${selected.path}`);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch {
      setSyncFeedback("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const pendingSyncCount = memberFiles.filter(
    (f) => f.sync_status === "local_modified" || f.sync_status === "pending_upload",
  ).length;

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
        eyebrow="code & synchronization workspace"
        title="Files & Code Workspace"
        description="Individual member workspaces, pre-sync conflict radar, unified shared codebase, and 1-click GitHub push."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCodeSyncModal(true)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-sm ${
                pendingSyncCount > 0
                  ? "bg-amber-500 hover:bg-amber-600 text-black animate-pulse"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              <Zap className="size-3.5" />
              <span>⚡ CodeSync {pendingSyncCount > 0 ? `(${pendingSyncCount})` : ""}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGitHubPushModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-sm"
            >
              <Github className="size-3.5 text-primary" />
              <span>Push to GitHub</span>
            </button>

            {displayNodes.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={isExporting}
                title="Download entire project as .ZIP archive"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-sm"
              >
                {isExporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5 text-primary" />
                )}
                <span>Download (.zip)</span>
              </button>
            )}
          </div>
        }
      />

      {/* 🧭 Top Mode Switcher: My Workspace vs Shared Project */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setWorkspaceMode("my_workspace")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              workspaceMode === "my_workspace"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Laptop className="size-3.5" />
            <span>My Workspace ({memberFiles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setWorkspaceMode("shared_project")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              workspaceMode === "shared_project"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Layers className="size-3.5" />
            <span>Shared Project ({files.length} files)</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <RoleBadge role={currentRole} />
          <span className="text-muted-foreground">{currentUserName}</span>
        </div>
      </div>

      {/* VIEW 1: My Personal Workspace */}
      {workspaceMode === "my_workspace" && (
        <MyWorkspaceView
          memberFiles={memberFiles}
          currentUserId={user?.id ?? null}
          currentRole={currentRole}
          onAddFiles={handleAddMemberFiles}
          onUpdateFile={(id, updates) => {
            setMemberFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
          }}
          onDeleteFile={handleDeleteMemberFile}
          onSelectFile={(f) => {
            const matching = displayNodes.find((n) => n.path === f.relative_path);
            if (matching) setSelectedId(matching.id);
            setWorkspaceMode("shared_project");
          }}
          selectedFileId={selectedId}
          onOpenCodeSync={() => setShowCodeSyncModal(true)}
        />
      )}

      {/* VIEW 2: Shared Synchronized Project Codebase */}
      {workspaceMode === "shared_project" && (
        <div className="space-y-4">
          {/* ⚡ Vibe Coding Live Sync Station */}
          <Panel className="p-4 bg-gradient-to-r from-card via-card to-primary/5 border-primary/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Laptop className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-foreground">
                      Vibe Coding Local Directory Sync
                    </span>
                    {localDir.connected ? (
                      <span className="flex items-center gap-1 rounded bg-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
                        <span className="size-1.5 rounded-full bg-success animate-pulse" />
                        Connected ({localDir.name})
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Disconnected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Universal local folder binding with live disk export.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnectDirectory}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <Folder className="size-3.5" />
                  {localDir.connected ? "Switch Local Folder" : "Connect Local Folder"}
                </button>

                {localDir.connected && (
                  <button
                    type="button"
                    onClick={handlePushAllToDisk}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <HardDrive className="size-3.5" />
                    <span>Push to Disk</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowNewFileModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-sm"
                >
                  <Plus className="size-3.5 text-primary" />
                  <span>+ New File</span>
                </button>
              </div>
            </div>

            {syncFeedback && (
              <div className="flex items-center gap-2 rounded-lg bg-success/15 border border-success/30 p-2 text-xs font-medium text-success">
                <Check className="size-3.5 shrink-0" />
                <span>{syncFeedback}</span>
              </div>
            )}
          </Panel>

          {/* Main 2-Column Split: File Tree & In-Browser Editor / AI Diagnostics */}
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            {/* Left: Code File Tree */}
            <Panel className="p-3 space-y-3">
              <PanelHeader
                title="Shared Project Tree"
                icon={<FileCode2 className="size-4 text-primary" />}
                actions={
                  <span className="mono text-[10px] text-muted-foreground">
                    {files.length} files
                  </span>
                }
              />

              {files.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">No files in shared codebase.</p>
                  <button
                    type="button"
                    onClick={handleScaffoldStarter}
                    disabled={isScaffolding}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 w-full"
                  >
                    {isScaffolding ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    <span>Scaffold Starter Files</span>
                  </button>
                </div>
              ) : (
                <ul className="space-y-1 max-h-[600px] overflow-y-auto">
                  {files.map((file) => {
                    const isSelected = file.id === (selected?.id ?? null);
                    return (
                      <li key={file.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(file.id);
                            setActiveTab("code");
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileCode2 className="size-3.5 shrink-0" />
                            <span className="truncate mono">{file.path}</span>
                          </div>
                          {file.owner_role && (
                            <RoleBadge role={file.owner_role} className="shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {/* Right: Code Editor & AI Intelligence Center */}
            <div className="space-y-3">
              {/* Tab Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("code")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "code"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <FileCode2 className="size-3" /> Code
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("explain")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "explain"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Lightbulb className="size-3" /> Explain
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("bugs")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "bugs"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Bug className="size-3" /> Bugs ({analysis?.bugs.length || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("optimize")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "optimize"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Sparkles className="size-3" /> Optimize
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("security")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "security"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Shield className="size-3" /> Security ({fileVulns.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("chat")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "chat"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Bot className="size-3" /> AI Chat
                  </button>
                </div>

                {selected && (
                  <div className="flex items-center gap-2">
                    <span className="mono text-xs text-muted-foreground font-semibold">
                      {selected.path}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadSingleFile(selected.path, selected.content || "")}
                      title="Download file"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Download className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Tab Views */}
              {activeTab === "code" && selected && (
                <CodeEditorView
                  node={selected}
                  isEditing={isEditing}
                  editBuffer={editBuffer}
                  isSaving={isSaving}
                  onToggleEdit={() => {
                    if (isEditing) {
                      setIsEditing(false);
                      setEditBuffer(selected.content || "");
                    } else {
                      setIsEditing(true);
                    }
                  }}
                  onBufferChange={setEditBuffer}
                  onSave={handleSaveContent}
                />
              )}

              {activeTab === "explain" && selected && analysis && (
                <CodeExplainTab selectedNode={selected} analysis={analysis} />
              )}

              {activeTab === "bugs" && analysis && (
                <CodeBugsTab analysis={analysis} />
              )}

              {activeTab === "optimize" && analysis && (
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
        </div>
      )}

      {/* CodeSync Preview & Merge Modal */}
      <CodeSyncModal
        isOpen={showCodeSyncModal}
        onClose={() => setShowCodeSyncModal(false)}
        workspace={ws}
        memberFiles={memberFiles}
        onSyncCompleted={() => {
          loadMemberFiles();
          setSyncFeedback("CodeSync completed! All files merged into shared codebase.");
          setTimeout(() => setSyncFeedback(null), 3500);
        }}
        currentUserName={currentUserName}
        currentUserRole={currentRole}
      />

      {/* Push to GitHub Modal */}
      <GitHubPushModal
        isOpen={showGitHubPushModal}
        onClose={() => setShowGitHubPushModal(false)}
        workspace={ws}
        currentUserName={currentUserName}
      />

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
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  File Path <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="e.g. src/index.ts, routes/api.ts, db/schema.sql, README.md"
                  className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary text-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  Enter a relative project file path (e.g. <code className="text-primary font-mono">src/index.ts</code>, <code className="text-primary font-mono">app.py</code>, <code className="text-primary font-mono">README.md</code>).
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Quick Templates:</span>
                  {["src/index.ts", "src/routes/api.ts", "src/db/schema.sql", "README.md"].map((tmpl) => (
                    <button
                      key={tmpl}
                      type="button"
                      onClick={() => setNewFilePath(tmpl)}
                      className="rounded bg-secondary border border-border px-2 py-0.5 text-[10px] mono text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      {tmpl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  Owning Role
                </label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {(["frontend", "backend", "database", "lead"] as Role[]).map((r) => (
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

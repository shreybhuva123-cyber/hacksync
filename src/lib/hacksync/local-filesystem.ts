import type { CodeNode, Role } from "./types";

export interface ScannedFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  content?: string;
  lastModified: number;
  area: "frontend" | "backend" | "database" | "shared";
  language: string;
}

export interface LocalDirectoryState {
  connected: boolean;
  name: string;
  path?: string;
  fileCount: number;
  lastSyncedAt: string | null;
  autoSync: boolean;
}

const LOCAL_DIR_KEY = "hacksync_local_directory";
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
  ".vite",
  ".gemini",
  "target",
  "vendor",
]);

const IGNORED_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

// Memory cache for active directory handle in browser session
let activeDirectoryHandle: FileSystemDirectoryHandle | null = null;

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function getStoredDirectoryState(): LocalDirectoryState {
  if (typeof window === "undefined") {
    return { connected: false, name: "", fileCount: 0, lastSyncedAt: null, autoSync: false };
  }
  try {
    const raw = localStorage.getItem(LOCAL_DIR_KEY);
    if (!raw) {
      return { connected: false, name: "", fileCount: 0, lastSyncedAt: null, autoSync: false };
    }
    return JSON.parse(raw);
  } catch {
    return { connected: false, name: "", fileCount: 0, lastSyncedAt: null, autoSync: false };
  }
}

export function saveStoredDirectoryState(state: Partial<LocalDirectoryState>) {
  if (typeof window === "undefined") return;
  const current = getStoredDirectoryState();
  const updated = { ...current, ...state };
  localStorage.setItem(LOCAL_DIR_KEY, JSON.stringify(updated));
}

export function clearStoredDirectoryState() {
  if (typeof window === "undefined") return;
  activeDirectoryHandle = null;
  localStorage.removeItem(LOCAL_DIR_KEY);
}

export function getActiveDirectoryHandle(): FileSystemDirectoryHandle | null {
  return activeDirectoryHandle;
}

export function setActiveDirectoryHandle(handle: FileSystemDirectoryHandle | null) {
  activeDirectoryHandle = handle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Native File System Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function pickLocalDirectory(): Promise<{
  handle: FileSystemDirectoryHandle;
  name: string;
} | null> {
  if (!supportsFileSystemAccess()) {
    throw new Error(
      "Your browser does not support the File System Access API. Please use Chrome, Edge, Brave, or Opera for Vibe Coding.",
    );
  }

  try {
    // Prompt user to pick a folder on disk
    const handle = await (
      window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker();
    activeDirectoryHandle = handle;
    const name = handle.name;

    saveStoredDirectoryState({
      connected: true,
      name,
      lastSyncedAt: new Date().toISOString(),
    });

    return { handle, name };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return null; // User cancelled the dialog
    }
    throw err;
  }
}

export async function createProjectSubfolder(
  parentHandle: FileSystemDirectoryHandle,
  projectName: string,
): Promise<FileSystemDirectoryHandle> {
  const cleanName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
  return await parentHandle.getDirectoryHandle(cleanName, { create: true });
}

export async function scaffoldInitialProjectFiles(
  dirHandle: FileSystemDirectoryHandle,
  projectName: string,
  description: string,
): Promise<void> {
  try {
    // 1. README.md
    const readme = `# ${projectName}\n\n${description || "A synchronized hackathon project built with HackSync."}\n\n## 🚀 Getting Started\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n\n## 📡 Architecture\n- Managed with HackSync real-time sync.\n`;
    await writeRawFileToHandle(dirHandle, "README.md", readme);

    // 2. schema.sql
    const schema = `-- ${projectName} PostgreSQL Schema\nCREATE TABLE IF NOT EXISTS users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  email TEXT UNIQUE NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n`;
    await writeRawFileToHandle(dirHandle, "schema.sql", schema);

    // 3. src/index.ts
    const srcDir = await dirHandle.getDirectoryHandle("src", { create: true });
    const indexTs = `// ${projectName} Main Entrypoint\nexport async function main() {\n  console.log("HackSync Vibe Coding project running!");\n}\nmain();\n`;
    await writeRawFileToHandle(srcDir, "index.ts", indexTs);
  } catch (err) {
    console.warn("Failed to scaffold initial template files:", err);
  }
}

export async function writeRawFileToHandle(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<boolean> {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await (
      fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }
    ).createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    console.error(`Failed to write file ${fileName}:`, err);
    return false;
  }
}

export async function writeNestedFileByPath(
  rootDirHandle: FileSystemDirectoryHandle,
  filePath: string,
  content: string,
): Promise<boolean> {
  try {
    const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) return false;

    let currentDir = rootDirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }

    const fileName = parts[parts.length - 1];
    if (!fileName) return false;
    return await writeRawFileToHandle(currentDir, fileName, content);
  } catch (err) {
    console.error(`Failed to write nested file ${filePath}:`, err);
    return false;
  }
}

export async function scanLocalDirectory(
  dirHandle: FileSystemDirectoryHandle,
  prefix = "",
  maxFiles = 150,
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function walk(handle: FileSystemDirectoryHandle, currentPath: string) {
    if (results.length >= maxFiles) return;

    for await (const [name, entry] of handle as unknown as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (results.length >= maxFiles) break;

      const relPath = currentPath ? `${currentPath}/${name}` : name;

      if (entry.kind === "directory") {
        if (!IGNORED_DIRECTORIES.has(name) && !name.startsWith(".")) {
          await walk(entry as FileSystemDirectoryHandle, relPath);
        }
      } else if (entry.kind === "file") {
        if (!IGNORED_FILES.has(name) && !name.startsWith(".")) {
          try {
            const fileObj = await (entry as FileSystemFileHandle).getFile();
            // Only read text files under 250KB to maintain snappy performance
            let content = "";
            if (fileObj.size < 250_000 && isLikelyCodeFile(name)) {
              content = await fileObj.text();
            }

            const ext = name.split(".").pop()?.toLowerCase() || "";
            results.push({
              path: relPath,
              name,
              extension: ext,
              size: fileObj.size,
              content,
              lastModified: fileObj.lastModified,
              area: inferFileArea(relPath),
              language: inferFileLanguage(ext),
            });
          } catch {
            // Ignore unreadable or locked files
          }
        }
      }
    }
  }

  await walk(dirHandle, prefix);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for Language & Layer Inference
// ─────────────────────────────────────────────────────────────────────────────

export function isLikelyCodeFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const codeExts = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "py",
    "sql",
    "json",
    "html",
    "css",
    "md",
    "yaml",
    "yml",
    "toml",
    "env",
    "sh",
    "rs",
    "go",
  ]);
  return codeExts.has(ext);
}

export function inferFileLanguage(extension: string): string {
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "sql":
      return "sql";
    case "json":
      return "json";
    case "html":
      return "html";
    case "css":
      return "css";
    case "md":
      return "markdown";
    case "rs":
      return "rust";
    case "go":
      return "go";
    default:
      return "plaintext";
  }
}

export function inferFileArea(path: string): "frontend" | "backend" | "database" | "shared" {
  const lower = path.toLowerCase();
  if (
    lower.includes("db") ||
    lower.includes("database") ||
    lower.includes("schema") ||
    lower.includes("migration") ||
    lower.endsWith(".sql") ||
    lower.includes("prisma") ||
    lower.includes("drizzle")
  ) {
    return "database";
  }
  if (
    lower.includes("server") ||
    lower.includes("/api/") ||
    lower.startsWith("api/") ||
    lower.includes("controllers") ||
    lower.includes("backend") ||
    lower.includes("services")
  ) {
    return "backend";
  }
  if (
    lower.includes("components") ||
    lower.includes("routes") ||
    lower.includes("views") ||
    lower.includes("ui") ||
    lower.includes("frontend") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".css")
  ) {
    return "frontend";
  }
  return "shared";
}

export function convertScannedFilesToCodeNodes(
  files: ScannedFile[],
  projectId: string,
  defaultRole: Role = "lead",
): CodeNode[] {
  return files.map((f, idx) => ({
    id: `local-node-${idx}-${f.name}`,
    project_id: projectId,
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
            : defaultRole,
    status: "done",
    language: f.language,
    content: f.content ?? null,
    updated_at: new Date(f.lastModified).toISOString(),
  }));
}

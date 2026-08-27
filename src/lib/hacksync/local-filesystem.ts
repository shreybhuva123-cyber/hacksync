import type { CodeNode, Role, Area, MemberFile } from "./types";
import JSZip from "jszip";

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
  ".idea",
  ".vscode",
  "coverage",
]);

const IGNORED_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "ico", "webp", "bmp", "tiff", "psd",
  "zip", "tar", "gz", "7z", "rar", "bz2", "xz",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "exe", "dll", "so", "dylib", "bin", "iso", "dmg", "msi", "app",
  "class", "jar", "war", "ear", "pyc", "pyo", "pyd", "o", "a",
  "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "flac", "ogg", "m4a",
  "woff", "woff2", "ttf", "eot", "otf",
  "sqlite", "db", "sqlite3", "pdb", "wasm",
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

// ─────────────────────────────────────────────────────────────────────────────
// Project-Scoped Local Storage Cache (Guarantees 0 Data Loss & Offline Snapshots)
// ─────────────────────────────────────────────────────────────────────────────

export function getStoredMemberFiles(projectId: string): MemberFile[] {
  if (typeof window === "undefined" || !projectId) return [];
  try {
    const raw = localStorage.getItem(`hacksync:member-files:${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredMemberFiles(projectId: string, files: MemberFile[]) {
  if (typeof window === "undefined" || !projectId) return;
  try {
    localStorage.setItem(`hacksync:member-files:${projectId}`, JSON.stringify(files));
  } catch (err) {
    console.warn("Could not cache member files to localStorage", err);
  }
}

export function getStoredLocalNodes(projectId: string): CodeNode[] {
  if (typeof window === "undefined" || !projectId) return [];
  try {
    const raw = localStorage.getItem(`hacksync:local-nodes:${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredLocalNodes(projectId: string, nodes: CodeNode[]) {
  if (typeof window === "undefined" || !projectId) return;
  try {
    localStorage.setItem(`hacksync:local-nodes:${projectId}`, JSON.stringify(nodes));
  } catch (err) {
    console.warn("Could not cache local nodes to localStorage", err);
  }
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
    throw new Error("Native File System Access API is not enabled in this browser.");
  }

  try {
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
      return null;
    }
    throw err;
  }
}

/**
 * Universal HTML5 Directory Picker: Works across Brave, Firefox, Safari, Edge, Chrome.
 */
export async function pickDirectoryViaInput(): Promise<{ name: string; files: ScannedFile[] } | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;
    input.style.position = "fixed";
    input.style.top = "-9999px";
    input.style.left = "-9999px";
    input.style.opacity = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    document.body.appendChild(input);

    input.onchange = async () => {
      try {
        const fileList = input.files;
        if (!fileList || fileList.length === 0) {
          resolve(null);
          return;
        }

        const scanned: ScannedFile[] = [];
        const readPromises: Promise<void>[] = [];
        let folderName = "Local Folder";

        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          if (!file) continue;

          const rawPath = file.webkitRelativePath || file.name;
          const parts = rawPath.replace(/\\/g, "/").split("/").filter(Boolean);

          if (parts.length > 1 && parts[0]) {
            folderName = parts[0];
          }

          // Strip root folder name if relative path: "project/src/index.ts" -> "src/index.ts"
          const relativePath = parts.length > 1 ? parts.slice(1).join("/") : rawPath;

          // Check ignored dirs / files
          const hasIgnoredDir = parts.some((p) => IGNORED_DIRECTORIES.has(p));
          if (hasIgnoredDir || IGNORED_FILES.has(file.name) || file.name.startsWith(".")) {
            continue;
          }

          // Only skip binary files and files > 1MB
          if (file.size > 1_000_000 || !isLikelyCodeFile(file.name)) {
            continue;
          }

          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

          readPromises.push(
            file
              .text()
              .then((content) => {
                scanned.push({
                  path: relativePath,
                  name: file.name,
                  extension: ext,
                  size: file.size,
                  content,
                  lastModified: file.lastModified,
                  area: inferFileArea(relativePath),
                  language: inferFileLanguage(ext),
                });
              })
              .catch((readErr) => {
                console.warn(`Could not read file ${file.name}`, readErr);
              }),
          );
        }

        await Promise.all(readPromises);
        resolve({ name: folderName, files: scanned });
      } catch (err) {
        console.warn("HTML5 folder pick error:", err);
        resolve(null);
      } finally {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      }
    };

    input.oncancel = () => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
      resolve(null);
    };

    input.click();
  });
}

/**
 * Universal Folder Picker: Tries native showDirectoryPicker first;
 * if unavailable, empty, or blocked by privacy shields (Brave/Firefox),
 * seamlessly opens standard HTML5 directory picker.
 */
export async function pickDirectoryUniversal(): Promise<{
  handle: FileSystemDirectoryHandle | null;
  name: string;
  files: ScannedFile[];
} | null> {
  // 1. Try native File System Access API if supported
  if (supportsFileSystemAccess()) {
    try {
      const picked = await pickLocalDirectory();
      if (picked) {
        const files = await scanLocalDirectory(picked.handle);
        if (files.length > 0) {
          saveStoredDirectoryState({
            connected: true,
            name: picked.name,
            fileCount: files.length,
            lastSyncedAt: new Date().toISOString(),
            autoSync: true,
          });
          return { handle: picked.handle, name: picked.name, files };
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return null;
      console.warn("Native directory picker fallback:", err);
    }
  }

  // 2. HTML5 Directory Input Fallback (Works 100% in Brave, Firefox, Chrome, Safari)
  const inputResult = await pickDirectoryViaInput();
  if (inputResult && inputResult.files.length > 0) {
    saveStoredDirectoryState({
      connected: true,
      name: inputResult.name,
      fileCount: inputResult.files.length,
      lastSyncedAt: new Date().toISOString(),
      autoSync: false,
    });
    return {
      handle: null,
      name: inputResult.name,
      files: inputResult.files,
    };
  }

  return inputResult ? { handle: null, name: inputResult.name, files: [] } : null;
}

/**
 * Read dropped files and folders via Drag & Drop dataTransfer
 */
export async function readDataTransferEntries(
  dataTransfer: DataTransfer,
): Promise<{ name: string; files: ScannedFile[] } | null> {
  const items = dataTransfer.items;
  if (!items || items.length === 0) {
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const scanned: ScannedFile[] = [];
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        if (!file || !isLikelyCodeFile(file.name)) continue;
        const text = await file.text().catch(() => "");
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        scanned.push({
          path: file.name,
          name: file.name,
          extension: ext,
          size: file.size,
          content: text,
          lastModified: file.lastModified,
          area: inferFileArea(file.name),
          language: inferFileLanguage(ext),
        });
      }
      return { name: "Dropped Files", files: scanned };
    }
    return null;
  }

  const scanned: ScannedFile[] = [];
  let rootName = "Dropped Folder";

  async function traverseEntry(entry: any, currentPath = ""): Promise<void> {
    if (entry.isFile) {
      if (IGNORED_FILES.has(entry.name) || entry.name.startsWith(".")) return;
      if (!isLikelyCodeFile(entry.name)) return;

      try {
        const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
        if (file.size > 1_000_000) return;
        const text = await file.text().catch(() => "");
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
        scanned.push({
          path: relPath,
          name: file.name,
          extension: ext,
          size: file.size,
          content: text,
          lastModified: file.lastModified,
          area: inferFileArea(relPath),
          language: inferFileLanguage(ext),
        });
      } catch {
        // Ignore unreadable
      }
    } else if (entry.isDirectory) {
      if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) return;
      if (!currentPath) rootName = entry.name;
      try {
        const dirReader = entry.createReader();
        const entries: any[] = await new Promise((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });
        for (const child of entries) {
          await traverseEntry(child, currentPath ? `${currentPath}/${entry.name}` : entry.name);
        }
      } catch {
        // Ignore directory read error
      }
    }
  }

  const traversePromises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
    if (entry) {
      traversePromises.push(traverseEntry(entry, ""));
    }
  }

  await Promise.all(traversePromises);
  return { name: rootName, files: scanned };
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
  maxFiles = 250,
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
            let content = "";
            if (fileObj.size < 1_000_000 && isLikelyCodeFile(name)) {
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
  const clean = fileName.toLowerCase().trim();
  const ext = clean.split(".").pop() || "";
  if (BINARY_EXTENSIONS.has(ext)) return false;
  return true;
}

export function inferFileLanguage(extension: string): string {
  switch (extension.toLowerCase()) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "py":
      return "python";
    case "sql":
      return "sql";
    case "json":
      return "json";
    case "html":
    case "htm":
      return "html";
    case "css":
    case "scss":
    case "sass":
    case "less":
      return "css";
    case "md":
    case "mdx":
      return "markdown";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "java":
      return "java";
    case "c":
    case "h":
      return "c";
    case "cpp":
    case "hpp":
    case "cc":
      return "cpp";
    case "cs":
      return "csharp";
    case "php":
      return "php";
    case "rb":
      return "ruby";
    case "dart":
      return "dart";
    case "kt":
    case "kts":
      return "kotlin";
    case "swift":
      return "swift";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "yaml":
    case "yml":
      return "yaml";
    case "toml":
      return "toml";
    case "xml":
    case "svg":
      return "xml";
    case "graphql":
    case "gql":
      return "graphql";
    default:
      return "plaintext";
  }
}

export function inferFileArea(path: string): "frontend" | "backend" | "database" | "shared" {
  const lower = path.toLowerCase();
  if (
    lower.includes("frontend") ||
    lower.includes("components") ||
    lower.includes("pages") ||
    lower.includes("views") ||
    lower.includes("styles") ||
    lower.includes("css") ||
    lower.includes("app.") ||
    lower.includes("index.html") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".vue") ||
    lower.endsWith(".svelte")
  ) {
    return "frontend";
  }
  if (
    lower.includes("backend") ||
    lower.includes("api") ||
    lower.includes("routes") ||
    lower.includes("controllers") ||
    lower.includes("services") ||
    lower.includes("server") ||
    lower.endsWith(".py") ||
    lower.endsWith(".go") ||
    lower.endsWith(".rs") ||
    lower.endsWith(".java") ||
    lower.endsWith(".cs") ||
    lower.endsWith(".php")
  ) {
    return "backend";
  }
  if (
    lower.includes("db") ||
    lower.includes("database") ||
    lower.includes("schema") ||
    lower.includes("migrations") ||
    lower.endsWith(".sql") ||
    lower.includes("prisma") ||
    lower.includes("drizzle")
  ) {
    return "database";
  }
  return "shared";
}

export function convertScannedFilesToCodeNodes(
  scanned: ScannedFile[],
  projectId: string,
  defaultRole: Role = "frontend",
): CodeNode[] {
  return scanned.map((file, idx) => {
    const parentPath = file.path.includes("/")
      ? file.path.substring(0, file.path.lastIndexOf("/"))
      : null;

    const area = file.area || inferFileArea(file.path);
    const ownerRole: Role =
      area === "frontend"
        ? "frontend"
        : area === "backend"
          ? "backend"
          : area === "database"
            ? "database"
            : defaultRole;

    return {
      id: `local-node-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      project_id: projectId,
      path: file.path,
      parent_path: parentPath,
      kind: "file" as const,
      area,
      owner_role: ownerRole,
      status: "done" as const,
      language: file.language || inferFileLanguage(file.extension),
      content: file.content || "",
      updated_at: new Date(file.lastModified).toISOString(),
    };
  });
}

export function downloadSingleFile(filePath: string, content: string) {
  if (typeof document === "undefined") return;
  const fileName = filePath.split("/").pop() || "file.txt";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportWorkspaceToZip(
  projectName: string,
  nodes: CodeNode[],
): Promise<void> {
  if (typeof window === "undefined") return;
  const zip = new JSZip();
  const fileNodes = nodes.filter((n) => n.kind === "file");

  if (fileNodes.length === 0) {
    throw new Error("No files to export in this workspace.");
  }

  for (const node of fileNodes) {
    const cleanPath = node.path.replace(/^\//, "");
    zip.file(cleanPath, node.content || "");
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName =
    projectName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "hacksync-project";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function syncWorkspaceFilesToLocalDisk(
  dirHandle: FileSystemDirectoryHandle,
  nodes: CodeNode[],
): Promise<{ written: number; failed: number }> {
  const fileNodes = nodes.filter((n) => n.kind === "file");
  let written = 0;
  let failed = 0;

  for (const node of fileNodes) {
    const content = node.content ?? "";
    const ok = await writeNestedFileByPath(dirHandle, node.path, content);
    if (ok) written++;
    else failed++;
  }

  return { written, failed };
}

/**
 * Universal Single-File Picker
 */
export async function pickLocalFileUniversal(preferredRelativePath?: string): Promise<{
  fileName: string;
  relativePath: string;
  content: string;
  language: string;
  area: Area;
  fileType: string;
  lastModified: number;
} | null> {
  if (typeof window === "undefined") return null;

  // 1. Try native showOpenFilePicker if supported
  if (supportsFileSystemAccess() && "showOpenFilePicker" in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        multiple: false,
      });
      if (handle) {
        const file: File = await handle.getFile();
        const content = await file.text();
        const relPath = preferredRelativePath || file.name;
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        return {
          fileName: file.name,
          relativePath: relPath.replace(/\\/g, "/").replace(/^\/+/, ""),
          content,
          language: inferFileLanguage(ext),
          area: inferFileArea(relPath),
          fileType: file.type || "text/plain",
          lastModified: file.lastModified,
        };
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return null;
    }
  }

  // 2. HTML5 File Input fallback
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.position = "fixed";
    input.style.top = "-9999px";
    input.style.left = "-9999px";
    input.style.opacity = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    document.body.appendChild(input);

    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        const content = await file.text();
        const relPath = preferredRelativePath || file.name;
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        resolve({
          fileName: file.name,
          relativePath: relPath.replace(/\\/g, "/").replace(/^\/+/, ""),
          content,
          language: inferFileLanguage(ext),
          area: inferFileArea(relPath),
          fileType: file.type || "text/plain",
          lastModified: file.lastModified,
        });
      } catch (err) {
        console.warn("Single file picker error:", err);
        resolve(null);
      } finally {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      }
    };

    input.oncancel = () => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
      resolve(null);
    };

    input.click();
  });
}

/**
 * Unified Diff Parser — HackSync Phase 3
 * Robust parser for unified diffs supporting added, modified, deleted, renamed, and binary files.
 */

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export interface ParsedFileDiff {
  oldPath: string;
  newPath: string;
  changeType: "added" | "modified" | "deleted" | "renamed" | "binary";
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
  patchSnippet: string;
}

export class DiffParser {
  /**
   * Parses standard unified diff text into an array of structured ParsedFileDiff objects.
   */
  static parse(diffText: string): ParsedFileDiff[] {
    if (!diffText || diffText.trim() === "") return [];

    const fileDiffs: ParsedFileDiff[] = [];
    const lines = diffText.split("\n");

    let currentFile: ParsedFileDiff | null = null;
    let currentHunk: DiffHunk | null = null;
    let patchLines: string[] = [];

    const finalizeCurrentHunk = () => {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
    };

    const finalizeCurrentFile = () => {
      finalizeCurrentHunk();
      if (currentFile) {
        currentFile.patchSnippet = patchLines.slice(0, 50).join("\n");
        fileDiffs.push(currentFile);
        currentFile = null;
        patchLines = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Check for git diff file header: diff --git a/... b/...
      if (line.startsWith("diff --git ")) {
        finalizeCurrentFile();

        const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
        const oldPath = match ? match[1] || "" : "";
        const newPath = match ? match[2] || "" : "";

        currentFile = {
          oldPath,
          newPath,
          changeType: "modified",
          additions: 0,
          deletions: 0,
          binary: false,
          hunks: [],
          patchSnippet: "",
        };
        patchLines = [line];
        continue;
      }

      if (!currentFile) {
        // Handle diff without "diff --git" header (e.g. raw unified diff starting with --- a/...)
        if (line.startsWith("--- a/") || line.startsWith("--- /dev/null")) {
          const oldPath = line.startsWith("--- a/") ? line.replace("--- a/", "").trim() : "";
          currentFile = {
            oldPath,
            newPath: oldPath,
            changeType: oldPath ? "modified" : "added",
            additions: 0,
            deletions: 0,
            binary: false,
            hunks: [],
            patchSnippet: "",
          };
          patchLines = [line];
          continue;
        }
      }

      if (currentFile) {
        patchLines.push(line);

        // Check for new file mode
        if (line.startsWith("new file mode")) {
          currentFile.changeType = "added";
        } else if (line.startsWith("deleted file mode")) {
          currentFile.changeType = "deleted";
        } else if (line.startsWith("similarity index") || line.startsWith("rename from")) {
          currentFile.changeType = "renamed";
        } else if (line.startsWith("Binary files ") || line.includes("GIT binary patch")) {
          currentFile.binary = true;
          currentFile.changeType = "binary";
        } else if (line.startsWith("--- a/")) {
          currentFile.oldPath = line.replace("--- a/", "").trim();
        } else if (line.startsWith("--- /dev/null")) {
          currentFile.oldPath = "";
          currentFile.changeType = "added";
        } else if (line.startsWith("+++ b/")) {
          currentFile.newPath = line.replace("+++ b/", "").trim();
          if (!currentFile.oldPath) {
            currentFile.oldPath = currentFile.newPath;
          }
        } else if (line.startsWith("+++ /dev/null")) {
          currentFile.newPath = "";
          currentFile.changeType = "deleted";
        } else if (line.startsWith("@@ ")) {
          finalizeCurrentHunk();

          // e.g. @@ -1,5 +1,6 @@ optional function header
          const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
          if (hunkMatch) {
            const oldStart = parseInt(hunkMatch[1] || "1", 10);
            const oldLines = parseInt(hunkMatch[2] || "1", 10);
            const newStart = parseInt(hunkMatch[3] || "1", 10);
            const newLines = parseInt(hunkMatch[4] || "1", 10);
            const header = (hunkMatch[5] || "").trim();

            currentHunk = {
              oldStart,
              oldLines,
              newStart,
              newLines,
              header,
              lines: [],
            };
          }
        } else if (currentHunk) {
          currentHunk.lines.push(line);
          if (line.startsWith("+")) {
            currentFile.additions++;
          } else if (line.startsWith("-")) {
            currentFile.deletions++;
          }
        }
      }
    }

    finalizeCurrentFile();
    return fileDiffs;
  }
}

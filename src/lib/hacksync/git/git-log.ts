/**
 * Safe Git Log Reader — HackSync Phase 3
 * Bounded read-only Git commit history extractor.
 */

import { GitSafety } from "./git-safety";

export interface GitCommitEntry {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export class GitLogManager {
  /**
   * Retrieves bounded commit history for a repository.
   */
  static async getLog(
    repoPath: string,
    options?: { limit?: number | undefined; branch?: string | undefined },
  ): Promise<GitCommitEntry[]> {
    const limit = Math.max(1, Math.min(50, options?.limit || 10));
    // Use format with custom delimiter: %H%x1f%an%x1f%ae%x1f%ad%x1f%s
    const format = "%H%x1f%an%x1f%ae%x1f%ad%x1f%s";
    const args = ["log", `-n${limit}`, `--format=${format}`];

    if (options?.branch) {
      args.push(options.branch);
    }

    const res = await GitSafety.runSafeGit(repoPath, args);
    const output = res.stdout;

    const entries: GitCommitEntry[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const [sha, author, email, date, message] = trimmed.split("\x1f");
      if (sha && author) {
        entries.push({
          sha,
          shortSha: sha.slice(0, 7),
          author: author || "Unknown",
          email: email || "",
          date: date || "",
          message: message || "",
        });
      }
    }

    return entries;
  }
}

/**
 * HackSync GitHub Push & Synchronization Service
 * Validates GitHub repositories, checks permissions and branch statuses,
 * and pushes the complete synchronized project tree using the GitHub Git Data API.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/errors";
import type { CodeNode, GitHubPushRecord } from "@/lib/hacksync/types";

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  canPush: boolean;
}

export interface GitHubPushOptions {
  projectId: string;
  repoUrl: string;
  branch?: string;
  commitMessage: string;
  files: CodeNode[];
  token: string;
  authorName?: string;
  authorEmail?: string;
}

export interface GitHubPushResult {
  success: boolean;
  commitSha: string;
  commitUrl: string;
  filesCount: number;
  branch: string;
}

export const githubService = {
  /**
   * Parse GitHub repo URL into owner and repository name
   */
  parseGitHubRepoUrl(url: string): { owner: string; repo: string } {
    if (!url || typeof url !== "string") {
      throw new Error("Repository URL is required.");
    }

    const trimmed = url.trim().replace(/\.git$/, "");

    // Format 1: owner/repo
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      const parts = trimmed.split("/");
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
    }

    // Format 2: https://github.com/owner/repo or http://
    const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i);
    if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    // Format 3: git@github.com:owner/repo
    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+)/i);
    if (sshMatch && sshMatch[1] && sshMatch[2]) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    throw new Error(
      "Invalid GitHub repository URL. Use https://github.com/owner/repo or owner/repo format.",
    );
  },

  /**
   * Validate repository existence, visibility, and user write permissions
   */
  async validateRepository(repoUrl: string, token: string): Promise<GitHubRepoInfo> {
    const { owner, repo } = this.parseGitHubRepoUrl(repoUrl);
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "HackSync-App",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token.trim()}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
    });

    if (res.status === 404) {
      throw new Error(
        `Repository "${owner}/${repo}" was not found on GitHub. Check spelling or ensure your Personal Access Token has access to private repositories.`,
      );
    }

    if (res.status === 401) {
      throw new Error(
        "GitHub authentication failed. Your Personal Access Token is invalid or expired.",
      );
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`GitHub API Error: ${err.message || res.statusText}`);
    }

    const data = await res.json();
    return {
      owner,
      repo,
      fullName: data.full_name,
      defaultBranch: data.default_branch || "main",
      isPrivate: data.private,
      canPush: data.permissions ? Boolean(data.permissions.push) : true,
    };
  },

  /**
   * Check remote branch HEAD commit to detect if remote has diverged
   */
  async checkRemoteBranchHead(
    repoUrl: string,
    branch: string,
    token: string,
  ): Promise<{ sha: string; author: string; date: string } | null> {
    try {
      const { owner, repo } = this.parseGitHubRepoUrl(repoUrl);
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "HackSync-App",
      };
      if (token) headers["Authorization"] = `Bearer ${token.trim()}`;

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`, {
        headers,
      });

      if (!res.ok) return null;
      const data = await res.json();
      return {
        sha: data.commit.sha,
        author: data.commit.commit.author.name,
        date: data.commit.commit.author.date,
      };
    } catch {
      return null;
    }
  },

  /**
   * Push complete synchronized project tree to GitHub using GitHub Git Data API
   */
  async pushSynchronizedProjectToGitHub(options: GitHubPushOptions): Promise<GitHubPushResult> {
    const {
      projectId,
      repoUrl,
      commitMessage,
      files,
      token,
      authorName = "HackSync Developer",
    } = options;

    if (!token || !token.trim()) {
      throw new Error("GitHub Personal Access Token is required to push.");
    }

    const { owner, repo } = this.parseGitHubRepoUrl(repoUrl);
    const branch = options.branch?.trim() || "main";

    const fileNodes = files.filter((f) => f.kind === "file");
    if (fileNodes.length === 0) {
      throw new Error("No files in workspace to push to GitHub.");
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token.trim()}`,
      "User-Agent": "HackSync-App",
      "Content-Type": "application/json",
    };

    // 1. Get current branch reference
    let parentCommitSha: string | null = null;
    let baseTreeSha: string | null = null;

    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      { headers },
    );

    if (refRes.ok) {
      const refData = await refRes.json();
      parentCommitSha = refData.object.sha;

      // Get base tree
      const commitRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${parentCommitSha}`,
        { headers },
      );
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        baseTreeSha = commitData.tree.sha;
      }
    }

    // 2. Create Blobs for each file in the workspace
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];

    for (const file of fileNodes) {
      const cleanPath = file.path.replace(/^\/+/, "").replace(/\\/g, "/");
      const content = file.content ?? "";

      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content,
          encoding: "utf-8",
        }),
      });

      if (!blobRes.ok) {
        const blobErr = await blobRes.json().catch(() => ({ message: blobRes.statusText }));
        throw new Error(`Failed to upload blob for ${cleanPath}: ${blobErr.message}`);
      }

      const blobData = await blobRes.json();
      treeEntries.push({
        path: cleanPath,
        mode: "100644",
        type: "blob",
        sha: blobData.sha,
      });
    }

    // 3. Create Git Tree
    const treePayload: any = {
      tree: treeEntries,
    };
    if (baseTreeSha) {
      treePayload.base_tree = baseTreeSha;
    }

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify(treePayload),
    });

    if (!treeRes.ok) {
      const treeErr = await treeRes.json().catch(() => ({ message: treeRes.statusText }));
      throw new Error(`Failed to create Git tree: ${treeErr.message}`);
    }

    const treeData = await treeRes.json();

    // 4. Create Git Commit
    const commitPayload: any = {
      message: commitMessage || "Sync project from HackSync",
      tree: treeData.sha,
      parents: parentCommitSha ? [parentCommitSha] : [],
    };

    const newCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify(commitPayload),
    });

    if (!newCommitRes.ok) {
      const newCommitErr = await newCommitRes.json().catch(() => ({ message: newCommitRes.statusText }));
      throw new Error(`Failed to create Git commit: ${newCommitErr.message}`);
    }

    const newCommitData = await newCommitRes.json();
    const commitSha = newCommitData.sha;

    // 5. Update or Create Branch Ref
    if (parentCommitSha) {
      const updateRefRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            sha: commitSha,
            force: true,
          }),
        },
      );

      if (!updateRefRes.ok) {
        const updateErr = await updateRefRes.json().catch(() => ({ message: updateRefRes.statusText }));
        throw new Error(`Failed to update branch ${branch}: ${updateErr.message}`);
      }
    } else {
      const createRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: commitSha,
        }),
      });

      if (!createRefRes.ok) {
        const createErr = await createRefRes.json().catch(() => ({ message: createRefRes.statusText }));
        throw new Error(`Failed to create branch ref: ${createErr.message}`);
      }
    }

    const commitUrl = `https://github.com/${owner}/${repo}/commit/${commitSha}`;

    // 6. Record in project activity and github_pushes table
    try {
      await (supabase.from as any)("github_pushes").insert({
        project_id: projectId,
        repo_url: repoUrl,
        branch,
        commit_sha: commitSha,
        commit_message: commitMessage,
        files_count: fileNodes.length,
        author_name: authorName,
      });
    } catch {
      // Non-blocking
    }

    try {
      await supabase.from("activity_events").insert({
        project_id: projectId,
        kind: "git",
        actor: authorName,
        actor_role: "lead",
        message: `Pushed ${fileNodes.length} files to GitHub (${owner}/${repo} @ ${branch}): "${commitMessage}" [${commitSha.slice(0, 7)}]`,
      });
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      commitSha,
      commitUrl,
      filesCount: fileNodes.length,
      branch,
    };
  },
};

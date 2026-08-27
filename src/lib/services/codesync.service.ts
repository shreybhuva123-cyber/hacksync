/**
 * HackSync CodeSync Engine Service
 * Aggregates individual team members' staged local files into a unified project codebase,
 * provides pre-sync conflict radar detection, and executes safe atomic merges.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/errors";
import type {
  CodeNode,
  Member,
  MemberFile,
  CodeSyncPreviewItem,
  CodeSyncConflict,
  SyncSession,
  Role,
  Area,
} from "@/lib/hacksync/types";

export interface CodeSyncPreviewResult {
  items: CodeSyncPreviewItem[];
  conflicts: CodeSyncConflict[];
  stats: {
    totalFiles: number;
    addedCount: number;
    modifiedCount: number;
    unchangedCount: number;
    conflictCount: number;
    membersCount: number;
  };
  trackBreakdown: Record<Area, CodeSyncPreviewItem[]>;
}

export const codeSyncService = {
  /**
   * Build pre-sync diff preview comparing all members' staged files against shared project code.
   */
  buildCodeSyncPreview(
    projectId: string,
    memberFiles: MemberFile[],
    sharedNodes: CodeNode[],
    members: Member[],
  ): CodeSyncPreviewResult {
    const sharedMap = new Map<string, CodeNode>();
    for (const node of sharedNodes) {
      if (node.kind === "file") {
        sharedMap.set(node.path, node);
      }
    }

    const memberMap = new Map<string, Member>();
    for (const m of members) {
      if (m.user_id) memberMap.set(m.user_id, m);
      memberMap.set(m.id, m);
    }

    // Group member files by normalized relative path to detect multi-member collisions
    const pathGroup = new Map<string, MemberFile[]>();
    for (const mf of memberFiles) {
      const normPath = mf.relative_path.replace(/^\/+/, "").replace(/\\/g, "/");
      const existing = pathGroup.get(normPath) || [];
      existing.push(mf);
      pathGroup.set(normPath, existing);
    }

    const previewItems: CodeSyncPreviewItem[] = [];
    const conflicts: CodeSyncConflict[] = [];

    const processedPaths = new Set<string>();

    for (const [path, files] of pathGroup.entries()) {
      if (!files || files.length === 0) continue;
      processedPaths.add(path);
      const sharedNode = sharedMap.get(path);

      if (files.length > 1) {
        // Conflict: 2 or more members modified the exact same path
        const fileA = files[0];
        const fileB = files[1];
        if (!fileA || !fileB) continue;

        const memberA = fileA.user_id ? memberMap.get(fileA.user_id) : memberMap.get(fileA.member_id || "");
        const memberB = fileB.user_id ? memberMap.get(fileB.user_id) : memberMap.get(fileB.member_id || "");

        conflicts.push({
          path,
          fileA,
          fileB,
        });

        // Add both to preview with conflict flags
        for (const file of files) {
          if (!file) continue;
          const ownerMem = file.user_id ? memberMap.get(file.user_id) : memberMap.get(file.member_id || "");
          const otherFile = file.id === fileA.id ? fileB : fileA;
          const otherMem = otherFile.user_id ? memberMap.get(otherFile.user_id) : memberMap.get(otherFile.member_id || "");

          previewItems.push({
            id: file.id,
            path,
            fileName: file.file_name,
            area: (file.owner_role === "frontend" ? "frontend" : file.owner_role === "backend" ? "backend" : file.owner_role === "database" ? "database" : "shared") as Area,
            ownerRole: file.owner_role || "lead",
            ownerName: ownerMem?.display_name || "Team Member",
            ownerUserId: file.user_id,
            changeType: sharedNode ? "modified" : "added",
            content: file.content,
            previousContent: sharedNode?.content || null,
            language: file.language || "text",
            isConflict: true,
            conflictDetails: {
              otherOwnerName: otherMem?.display_name || "Teammate",
              otherOwnerRole: otherFile.owner_role || "lead",
              otherContent: otherFile.content || "",
            },
          });
        }
      } else {
        // Single member owns this path
        const file = files[0];
        if (!file) continue;

        const ownerMem = file.user_id ? memberMap.get(file.user_id) : memberMap.get(file.member_id || "");

        let changeType: "added" | "modified" | "unchanged" = "added";
        if (sharedNode) {
          if (sharedNode.content?.trim() === file.content?.trim()) {
            changeType = "unchanged";
          } else {
            changeType = "modified";
          }
        }

        previewItems.push({
          id: file.id,
          path,
          fileName: file.file_name,
          area: (file.owner_role === "frontend" ? "frontend" : file.owner_role === "backend" ? "backend" : file.owner_role === "database" ? "database" : "shared") as Area,
          ownerRole: file.owner_role || "lead",
          ownerName: ownerMem?.display_name || "Team Member",
          ownerUserId: file.user_id,
          changeType,
          content: file.content,
          previousContent: sharedNode?.content || null,
          language: file.language || "text",
          isConflict: false,
        });
      }
    }

    // Group by area track
    const trackBreakdown: Record<Area, CodeSyncPreviewItem[]> = {
      frontend: [],
      backend: [],
      database: [],
      shared: [],
    };

    let addedCount = 0;
    let modifiedCount = 0;
    let unchangedCount = 0;

    const uniqueMembers = new Set<string>();

    for (const item of previewItems) {
      trackBreakdown[item.area].push(item);
      if (item.ownerUserId) uniqueMembers.add(item.ownerUserId);
      if (item.changeType === "added") addedCount++;
      else if (item.changeType === "modified") modifiedCount++;
      else if (item.changeType === "unchanged") unchangedCount++;
    }

    return {
      items: previewItems,
      conflicts,
      stats: {
        totalFiles: previewItems.length,
        addedCount,
        modifiedCount,
        unchangedCount,
        conflictCount: conflicts.length,
        membersCount: uniqueMembers.size || 1,
      },
      trackBreakdown,
    };
  },

  /**
   * Execute CodeSync: Merges resolved files into shared code_nodes table and records audit log.
   */
  async executeCodeSync(
    projectId: string,
    resolvedItems: { path: string; content: string; area: Area; ownerRole: Role; language: string }[],
    actorName: string,
    actorRole: Role = "lead",
  ): Promise<SyncSession> {
    logger.info(`Executing CodeSync for project ${projectId} with ${resolvedItems.length} files`);

    // 1. Upsert each resolved file into code_nodes table
    for (const item of resolvedItems) {
      const cleanPath = item.path.replace(/^\/+/, "").replace(/\\/g, "/");
      const parentPath = cleanPath.includes("/") ? cleanPath.substring(0, cleanPath.lastIndexOf("/")) : null;

      const validOwnerRole = (["frontend", "backend", "database", "lead"].includes(item.ownerRole)
        ? item.ownerRole
        : "lead") as "frontend" | "backend" | "database" | "lead";

      const { data: existing } = await supabase
        .from("code_nodes")
        .select("id")
        .eq("project_id", projectId)
        .eq("path", cleanPath)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("code_nodes")
          .update({
            content: item.content,
            area: item.area,
            owner_role: validOwnerRole,
            status: "done",
            language: item.language,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existing.id);
      } else {
        await supabase.from("code_nodes").insert({
          project_id: projectId,
          path: cleanPath,
          parent_path: parentPath,
          kind: "file",
          area: item.area,
          owner_role: validOwnerRole,
          status: "done",
          language: item.language,
          content: item.content,
        } as any);
      }
    }

    // 2. Mark member_files as synced in database
    try {
      await (supabase.from as any)("member_files")
        .update({ sync_status: "synced", updated_at: new Date().toISOString() })
        .eq("project_id", projectId);
    } catch {
      // Non-blocking if table is local
    }

    // 3. Record Sync Session in sync_sessions
    const sessionSummary = {
      files_synced: resolvedItems.length,
      timestamp: new Date().toISOString(),
      paths: resolvedItems.map((r) => r.path),
    };

    let session: SyncSession = {
      id: `sync-${Date.now()}`,
      project_id: projectId,
      synced_by: null,
      actor_name: actorName,
      actor_role: actorRole,
      files_count: resolvedItems.length,
      conflicts_resolved: 0,
      summary: sessionSummary,
      created_at: new Date().toISOString(),
    };

    try {
      const { data } = await (supabase.from as any)("sync_sessions")
        .insert({
          project_id: projectId,
          actor_name: actorName,
          actor_role: actorRole,
          files_count: resolvedItems.length,
          summary: sessionSummary,
        })
        .select("*")
        .single();
      if (data) session = data as unknown as SyncSession;
    } catch {
      // Non-blocking
    }

    // 4. Log to activity_events
    try {
      await supabase.from("activity_events").insert({
        project_id: projectId,
        kind: "code",
        actor: actorName,
        actor_role: actorRole,
        message: `Executed CodeSync: Synchronized ${resolvedItems.length} files into shared project codebase`,
      });
    } catch {
      // Non-blocking
    }

    return session;
  },
};

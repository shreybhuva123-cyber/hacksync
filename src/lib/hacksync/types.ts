export { ROLES, type Role, ROLE_CONFIG, ROLE_PERMISSIONS, isValidRole } from "@/lib/constants/roles";
import type { Role } from "@/lib/constants/roles";

export type Area = "frontend" | "backend" | "database" | "shared";
export type LinkStatus = "healthy" | "broken" | "pending";
export type CheckStatus = "pass" | "fail" | "warn";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repo_url: string | null;
  default_branch: string;
  schema_version: string;
  invite_code: string;
  is_open_demo: boolean;
  demo_mode: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  project_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  role: Role;
  branch_name: string | null;
  working_area: string | null;
  online: boolean;
  last_seen_at: string;
}

export interface CodeNode {
  id: string;
  project_id: string;
  path: string;
  parent_path: string | null;
  kind: "file" | "folder";
  area: Area;
  owner_role: Role | null;
  status: "planned" | "in_progress" | "done" | "blocked";
  language: string | null;
  content: string | null;
  updated_at: string;
  current_version_number?: number;
  content_hash?: string;
  last_synced_by?: string;
  contributors?: string[];
  is_deleted?: boolean;
}

export interface ApiContract {
  id: string;
  project_id: string;
  method: string;
  route: string;
  summary: string | null;
  request_schema: string | null;
  response_schema: string | null;
  auth_required: boolean;
  status: "planned" | "in_progress" | "live" | "broken" | "deprecated";
  owner_role: string;
  version: string;
  test_status: "passing" | "failing" | "untested";
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbTable {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  owner_role: string;
  schema_version: string;
  migration_status: "applied" | "pending" | "drifted";
  sql_definition: string | null;
}

export interface DbColumn {
  id: string;
  table_id: string;
  project_id: string;
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary: boolean;
  is_indexed: boolean;
  references_table: string | null;
  ordinal: number;
}

export interface IntegrationLink {
  id: string;
  project_id: string;
  feature_name: string;
  frontend_path: string | null;
  contract_id: string | null;
  tables: string[];
  status: LinkStatus;
  notes: string | null;
  updated_at: string;
}

export interface GitBranch {
  id: string;
  project_id: string;
  name: string;
  owner_role: Role;
  owner_name: string | null;
  last_commit_sha: string | null;
  last_commit_message: string | null;
  last_commit_at: string | null;
  ahead: number;
  behind: number;
  merge_status: "clean" | "conflict" | "review" | "merged";
  integration_ready: boolean;
}

export interface EnvVar {
  id: string;
  project_id: string;
  key_name: string;
  scope: "frontend" | "backend" | "database";
  required: boolean;
  configured: boolean;
  used_in: string | null;
  description: string | null;
  example_value: string | null;
}

export interface HealthCheck {
  id: string;
  project_id: string;
  name: string;
  category: string;
  status: CheckStatus;
  detail: string | null;
  critical: boolean;
  last_run_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  area: Area;
  priority: "low" | "medium" | "high" | "critical";
  status: "todo" | "in_progress" | "review" | "done";
  assignee_role: string | null;
  depends_on: string | null;
  blocker: string | null;
  updated_at: string;
}

export interface ActivityEvent {
  id: string;
  project_id: string;
  kind: string;
  actor: string | null;
  actor_role: string | null;
  message: string;
  created_at: string;
}

export interface Note {
  id: string;
  project_id: string;
  title: string;
  body: string;
  author_role: string | null;
  updated_at: string;
}

export interface Handoff {
  id: string;
  project_id: string;
  title: string;
  author_role: string;
  author_name: string | null;
  summary: string | null;
  files_affected: string | null;
  api_changes: string | null;
  schema_changes: string | null;
  env_required: string | null;
  test_instructions: string | null;
  known_issues: string | null;
  created_at: string;
}

export interface ContractComment {
  id: string;
  project_id: string;
  contract_id: string | null;
  author_role: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export type JoinRequestStatus = "pending" | "accepted" | "rejected";

export interface JoinRequest {
  id: string;
  project_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  requested_role: Role;
  assigned_role: Role | null;
  status: JoinRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Workspace {
  project: Project;
  members: Member[];
  codeNodes: CodeNode[];
  contracts: ApiContract[];
  tables: DbTable[];
  columns: DbColumn[];
  links: IntegrationLink[];
  branches: GitBranch[];
  envVars: EnvVar[];
  checks: HealthCheck[];
  tasks: Task[];
  activity: ActivityEvent[];
  notes: Note[];
  handoffs: Handoff[];
  comments: ContractComment[];
  joinRequests?: JoinRequest[];
}

export interface UserProject {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_at: string;
  member_count?: number;
}

export type FileSyncStatus =
  | "synced"
  | "pending_upload"
  | "local_modified"
  | "behind"
  | "diverged"
  | "conflict"
  | "unlinked";

export interface MemberFile {
  id: string;
  project_id: string;
  user_id: string | null;
  member_id: string | null;
  owner_role: Role | null;
  file_name: string;
  relative_path: string;
  file_type: string | null;
  language: string | null;
  content: string | null;
  sync_status: FileSyncStatus;
  last_modified: string;
  created_at: string;
  updated_at: string;
  base_version_number?: number;
  base_content?: string | null;
  base_hash?: string | null;
  content_hash?: string | null;
  is_deleted?: boolean;
}

export type VersionChangeType =
  | "initial"
  | "edit"
  | "auto_merge"
  | "manual_merge"
  | "rollback"
  | "delete";

export interface FileVersion {
  id: string;
  project_id: string;
  file_path: string;
  node_id?: string | null | undefined;
  version_number: number;
  content: string;
  content_hash: string;
  base_version_number?: number | null | undefined;
  parent_version_number?: number | null | undefined;
  created_by_user_id?: string | null | undefined;
  created_by_name: string;
  created_by_role?: Role | null | undefined;
  contributors: string[];
  change_summary: string;
  change_type: VersionChangeType;
  created_at: string;
}

export interface LineDiffItem {
  type: "added" | "removed" | "modified" | "unchanged" | "conflict";
  oldLineNumber?: number | undefined;
  newLineNumber?: number | undefined;
  content: string;
  tag?: string | undefined;
}

export interface MergeConflictHunk {
  id: string;
  startLine: number;
  baseChunk: string;
  contributorChunks: Record<string, string>; // memberIdentifier -> code
  resolvedChunk?: string | undefined;
  isResolved: boolean;
}

export interface MemberContribution {
  fileId: string;
  userId: string | null;
  memberId: string | null;
  memberName: string;
  role: Role;
  content: string;
  lastModified?: string | undefined;
  baseVersionNumber?: number | undefined;
  isDeleted?: boolean | undefined;
}

export interface MergeResult {
  hasConflict: boolean;
  mergedContent: string;
  conflicts: MergeConflictHunk[];
  autoMergedHunksCount: number;
  contributors: string[];
  isIdenticalToExisting: boolean;
  rawConflictMarkers?: string | undefined;
}

export interface CodeSyncPreviewItem {
  id: string;
  path: string;
  fileName: string;
  area: Area;
  ownerRole: Role;
  ownerName: string;
  ownerUserId: string | null;
  changeType: "added" | "modified" | "auto_merged" | "unchanged" | "deleted";
  content: string | null;
  previousContent: string | null;
  baseContent?: string | null | undefined;
  baseVersionNumber?: number | undefined;
  sharedVersionNumber?: number | undefined;
  language: string;
  isConflict: boolean;
  contributors?: string[] | undefined;
  conflictType?: "overlapping_edit" | "deletion_vs_modification" | "creation_collision" | undefined;
  conflictDetails?: {
    otherOwnerName: string;
    otherOwnerRole: Role;
    otherContent: string;
    allContributors?: string[] | undefined;
  } | undefined;
}

export interface ConflictResolution {
  choice:
    | "versionA"
    | "versionB"
    | "manual"
    | "use_base"
    | "combine"
    | "keep_deleted"
    | "keep_modified"
    | "restore_merge";
  customContent?: string | undefined;
}

export interface CodeSyncConflict {
  path: string;
  conflictType: "overlapping_edit" | "deletion_vs_modification" | "creation_collision";
  baseVersionNumber?: number | undefined;
  baseContent: string;
  files: MemberFile[];
  fileA: MemberFile;
  fileB: MemberFile;
  rawConflictMarkers?: string | undefined;
  hunks?: MergeConflictHunk[] | undefined;
  resolution?: ConflictResolution | undefined;
  mergedContent?: string | undefined;
}

export interface SyncSession {
  id: string;
  project_id: string;
  session_number?: number;
  synced_by: string | null;
  actor_name: string;
  actor_role: string;
  files_count: number;
  conflicts_resolved: number;
  auto_merged_count?: number;
  conflicts_count?: number;
  new_files_count?: number;
  deleted_files_count?: number;
  contributors?: string[];
  status?: "completed" | "in_progress" | "conflict_pending" | "failed";
  summary: Record<string, any>;
  created_at: string;
}

export interface GitHubPushRecord {
  id: string;
  project_id: string;
  repo_url: string;
  branch: string;
  commit_sha: string;
  commit_message: string;
  files_count: number;
  author_name: string | null;
  created_at: string;
}

export type CodeSyncState =
  | "LOCAL_ONLY"
  | "PENDING_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "SYNC_FAILED"
  | "CONFLICT"
  | "RESOLVED";

export interface CodeSyncTransition {
  from: CodeSyncState;
  to: CodeSyncState;
  timestamp: string;
  reason?: string | undefined;
  error?: string | undefined;
}

export const VALID_CODESYNC_TRANSITIONS: Record<CodeSyncState, CodeSyncState[]> = {
  LOCAL_ONLY: ["PENDING_SYNC"],
  PENDING_SYNC: ["SYNCING", "LOCAL_ONLY", "CONFLICT"],
  SYNCING: ["SYNCED", "SYNC_FAILED", "CONFLICT"],
  SYNCED: ["LOCAL_ONLY", "PENDING_SYNC"],
  SYNC_FAILED: ["PENDING_SYNC", "LOCAL_ONLY", "SYNCING"],
  CONFLICT: ["RESOLVED", "SYNC_FAILED", "LOCAL_ONLY", "PENDING_SYNC"],
  RESOLVED: ["PENDING_SYNC", "SYNCING", "LOCAL_ONLY"],
};

export function transitionSyncState(
  currentState: CodeSyncState,
  targetState: CodeSyncState,
  reason?: string,
): { allowed: boolean; nextState: CodeSyncState; error?: string } {
  const allowedNext = VALID_CODESYNC_TRANSITIONS[currentState] || [];
  if (currentState === targetState) {
    return { allowed: true, nextState: targetState };
  }
  if (!allowedNext.includes(targetState)) {
    return {
      allowed: false,
      nextState: currentState,
      error: `Invalid CodeSync state transition from '${currentState}' to '${targetState}'. Allowed transitions: [${allowedNext.join(", ")}]. Reason: ${reason || "none"}`,
    };
  }
  return { allowed: true, nextState: targetState };
}



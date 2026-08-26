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
}

export interface UserProject {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_at: string;
  member_count?: number;
}


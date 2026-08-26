/**
 * Canonical Source of Truth for Roles and RBAC Permissions
 * All TypeScript types, Zod schemas, DB migrations, UI components,
 * and security policies MUST derive from this canonical definition.
 */

export const ROLES = ["owner", "lead", "backend", "database", "frontend", "member"] as const;

export type Role = (typeof ROLES)[number];

export interface RoleMetadata {
  label: string;
  badgeClass: string;
  description: string;
}

export const ROLE_CONFIG: Record<Role, RoleMetadata> = {
  owner: {
    label: "Project Owner",
    badgeClass: "bg-lead/20 text-lead border-lead/30",
    description: "Full administrative control, project deletion, member roles, and contract locks",
  },
  lead: {
    label: "Team Lead",
    badgeClass: "bg-lead/20 text-lead border-lead/30",
    description: "Workspace coordinator, team member management, contract locks, and architecture oversight",
  },
  backend: {
    label: "Backend Engineer",
    badgeClass: "bg-backend/20 text-backend border-backend/30",
    description: "API contracts, route schemas, endpoint status, and server logic",
  },
  database: {
    label: "Database Engineer",
    badgeClass: "bg-database/20 text-database border-database/30",
    description: "Database tables, column migrations, indexes, and schema definitions",
  },
  frontend: {
    label: "Frontend Engineer",
    badgeClass: "bg-frontend/20 text-frontend border-frontend/30",
    description: "Client UI components, SDK consumption, and client-side integration",
  },
  member: {
    label: "Team Member",
    badgeClass: "bg-muted text-muted-foreground border-border",
    description: "Read-only inspection of contracts, schema, and tasks",
  },
};

export interface RolePermissions {
  canManageMembers: boolean;
  canManageContracts: boolean;
  canManageSchema: boolean;
  canDeleteProject: boolean;
  canEditProject: boolean;
  canViewProject: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  owner: {
    canManageMembers: true,
    canManageContracts: true,
    canManageSchema: true,
    canDeleteProject: true,
    canEditProject: true,
    canViewProject: true,
  },
  lead: {
    canManageMembers: true,
    canManageContracts: true,
    canManageSchema: true,
    canDeleteProject: false, // Only owner can delete project
    canEditProject: true,
    canViewProject: true,
  },
  backend: {
    canManageMembers: false, // Cannot promote self or change roles
    canManageContracts: true,
    canManageSchema: false,
    canDeleteProject: false,
    canEditProject: false,
    canViewProject: true,
  },
  database: {
    canManageMembers: false, // Cannot promote self or change roles
    canManageContracts: false,
    canManageSchema: true,
    canDeleteProject: false,
    canEditProject: false,
    canViewProject: true,
  },
  frontend: {
    canManageMembers: false, // Cannot promote self or change roles
    canManageContracts: false,
    canManageSchema: false,
    canDeleteProject: false,
    canEditProject: false,
    canViewProject: true,
  },
  member: {
    canManageMembers: false,
    canManageContracts: false,
    canManageSchema: false,
    canDeleteProject: false,
    canEditProject: false,
    canViewProject: true,
  },
};

/**
 * Type guard to verify if a string is a valid canonical Role
 */
export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

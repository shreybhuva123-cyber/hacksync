import { type Role as CanonicalRole, ROLES } from "@/lib/constants/roles";

export type ProjectRole = CanonicalRole;

export interface RoleCapability {
  canManageProject: boolean;
  canManageMembers: boolean;
  canChangeRoles: boolean;
  canDeleteProject: boolean;
  canManageContracts: boolean;
  canManageSchema: boolean;
  canManageTasks: boolean;
  canManageSecurity: boolean;
  canWriteCode: boolean;
}

export const ROLE_CAPABILITIES: Record<ProjectRole, RoleCapability> = {
  owner: {
    canManageProject: true,
    canManageMembers: true,
    canChangeRoles: true,
    canDeleteProject: true,
    canManageContracts: true,
    canManageSchema: true,
    canManageTasks: true,
    canManageSecurity: true,
    canWriteCode: true,
  },
  lead: {
    canManageProject: true,
    canManageMembers: true,
    canChangeRoles: true,
    canDeleteProject: false, // Owner only
    canManageContracts: true,
    canManageSchema: true,
    canManageTasks: true,
    canManageSecurity: true,
    canWriteCode: true,
  },
  backend: {
    canManageProject: false,
    canManageMembers: false,
    canChangeRoles: false,
    canDeleteProject: false,
    canManageContracts: true, // Backend manages API contracts
    canManageSchema: false,
    canManageTasks: true,
    canManageSecurity: true,
    canWriteCode: true,
  },
  database: {
    canManageProject: false,
    canManageMembers: false,
    canChangeRoles: false,
    canDeleteProject: false,
    canManageContracts: false,
    canManageSchema: true, // Database engineer manages tables & migrations
    canManageTasks: true,
    canManageSecurity: true,
    canWriteCode: true,
  },
  frontend: {
    canManageProject: false,
    canManageMembers: false,
    canChangeRoles: false,
    canDeleteProject: false,
    canManageContracts: false,
    canManageSchema: false,
    canManageTasks: true,
    canManageSecurity: false,
    canWriteCode: true,
  },
  member: {
    canManageProject: false,
    canManageMembers: false,
    canChangeRoles: false,
    canDeleteProject: false,
    canManageContracts: false,
    canManageSchema: false,
    canManageTasks: false,
    canManageSecurity: false,
    canWriteCode: false,
  },
};

export function hasPermission(role: string | null | undefined, permission: keyof RoleCapability): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase() as ProjectRole;
  const caps = ROLE_CAPABILITIES[normalized];
  if (!caps) return false;
  return caps[permission];
}

export function canManageMembers(role?: string | null): boolean {
  return hasPermission(role, "canManageMembers");
}

export function canManageContracts(role?: string | null): boolean {
  return hasPermission(role, "canManageContracts");
}

export function canManageSchema(role?: string | null): boolean {
  return hasPermission(role, "canManageSchema");
}

export function canDeleteProject(role?: string | null): boolean {
  return hasPermission(role, "canDeleteProject");
}

export function canEditProject(role?: string | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "lead" || role === "backend" || role === "frontend" || role === "database";
}

export function canViewProject(role?: string | null): boolean {
  return Boolean(role);
}


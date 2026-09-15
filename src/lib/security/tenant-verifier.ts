/**
 * Authoritative Server-Side Tenant & Project Membership Verifier
 * 
 * SECURITY RULES:
 * 1. NEVER trust client-provided workspace data (workspace.project.created_by, workspace.members).
 * 2. Authorization MUST derive strictly from verified server identity + PostgreSQL.
 * 3. If database lookup cannot verify membership, access is strictly denied (403 Forbidden).
 */

import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Role } from "@/lib/constants/roles";

// Test registry for explicit test environment fixtures (NODE_ENV === "test" only)
const testMemberships = new Map<string, { role: Role }>();

/**
 * Register an explicit test membership (valid only during test execution).
 */
export function registerTestMembership(projectId: string, userId: string, role: Role): void {
  testMemberships.set(`${projectId}:${userId}`, { role });
}

/**
 * Clear test membership fixtures.
 */
export function clearTestMemberships(): void {
  testMemberships.clear();
}

/**
 * Creates a scoped Supabase client with the user's Bearer JWT.
 * When called with a valid token, PostgREST evaluates PostgreSQL RLS policies with auth.uid() = userId.
 */
function createScopedClient(token?: string) {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    "https://qqyecjwhyjyryqykhcxa.supabase.co";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    "sb_publishable_R-3iTQYsV4f8KWKc38bwcA_4MV4rOrg";

  if (token && !token.startsWith("test:")) {
    return createClient<Database>(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabase;
}

/**
 * Authoritatively verifies whether a user belongs to a project and determines their verified role.
 * Queries PostgreSQL `project_members` and `projects.created_by`.
 */
export async function verifyProjectMembership(
  userId: string,
  projectId: string,
  token?: string,
): Promise<{ allowed: boolean; role: Role }> {
  if (!userId || !projectId) {
    return { allowed: false, role: "member" };
  }

  // 1. Explicit test fixture check in test environment
  if (process.env["NODE_ENV"] === "test" || process.env["BUN_ENV"] === "test") {
    const testMatch = testMemberships.get(`${projectId}:${userId}`);
    if (testMatch) {
      return { allowed: true, role: testMatch.role };
    }
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      return { allowed: false, role: "member" };
    }
  }

  // 2. Authoritative database lookup with caller's scoped session client
  try {
    const client = createScopedClient(token);

    // Check project_members table
    const { data: memberData, error: memberError } = await (client.from as any)("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!memberError && memberData) {
      return { allowed: true, role: (memberData.role as Role) || "member" };
    }

    // Check project creator or open demo
    const { data: projectData, error: projectError } = await (client.from as any)("projects")
      .select("created_by, is_open_demo")
      .eq("id", projectId)
      .maybeSingle();

    if (!projectError && projectData) {
      if (projectData.created_by === userId) {
        return { allowed: true, role: "owner" };
      }
      if (projectData.is_open_demo) {
        return { allowed: true, role: "member" };
      }
    }
  } catch {
    // Fall through to service role check
  }

  // 3. Service role admin client fallback (if SUPABASE_SERVICE_ROLE_KEY is present)
  if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: adminMember } = await (supabaseAdmin.from as any)("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();

      if (adminMember) {
        return { allowed: true, role: (adminMember.role as Role) || "member" };
      }

      const { data: adminProject } = await (supabaseAdmin.from as any)("projects")
        .select("created_by, is_open_demo")
        .eq("id", projectId)
        .maybeSingle();

      if (adminProject) {
        if (adminProject.created_by === userId) {
          return { allowed: true, role: "owner" };
        }
        if (adminProject.is_open_demo) {
          return { allowed: true, role: "member" };
        }
      }
    } catch {
      // Database failure -> fail-closed
    }
  }

  return { allowed: false, role: "member" };
}

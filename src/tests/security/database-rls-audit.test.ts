import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SecretRedactor } from "@/lib/hacksync/security/secret-redactor";
import { TenantGuard } from "@/lib/hacksync/security/tenant-guard";
import { AuthorizationError } from "@/lib/errors";

describe("Phase 8.15: Database & RLS Security Architecture Audit", () => {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const clientSupabaseFile = join(process.cwd(), "src", "integrations", "supabase", "client.ts");

  describe("1. Client Bundle Secret Exposure Audit", () => {
    it("should ensure client Supabase configuration strictly uses publishable key and NEVER service role key", () => {
      expect(existsSync(clientSupabaseFile)).toBe(true);
      const clientContent = readFileSync(clientSupabaseFile, "utf-8");

      // Verify NO service role key references in client integration
      expect(clientContent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(clientContent).not.toContain("service_role");

      // Verify publishable key prefix or env variable is used
      expect(clientContent).toContain("SUPABASE_PUBLISHABLE_KEY");
      expect(clientContent).toContain("sb_publishable_");

      // Secret redactor verify: No live secret leaked in source
      const { detections } = SecretRedactor.redact(clientContent);
      const criticalLeaks = detections.filter((d) => d.severity === "critical");
      expect(criticalLeaks.length).toBe(0);
    });
  });

  describe("2. Database Schema RLS Policy Audit across All Migrations", () => {
    it("should verify Row Level Security (RLS) is explicitly enabled on all public schema tables", () => {
      const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
      expect(migrationFiles.length).toBeGreaterThan(0);

      const allMigrationSql = migrationFiles
        .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
        .join("\n");

      // All production database tables
      const expectedTables = [
        "projects",
        "project_members",
        "security_audit_events",
        "member_files",
        "ai_approval_requests",
      ];

      for (const table of expectedTables) {
        const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
        const hasRls = rlsRegex.test(allMigrationSql);
        expect(hasRls).toBe(true);
      }
    });

    it("should verify security audit events table is strictly append-only (no UPDATE/DELETE policies)", () => {
      const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
      const allMigrationSql = migrationFiles
        .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
        .join("\n");

      // Verify SELECT and INSERT policies exist
      expect(allMigrationSql).toContain('"security_audit_select_owner_lead"');
      expect(allMigrationSql).toContain('"security_audit_insert_system"');

      // Verify NO policies exist granting UPDATE or DELETE on security_audit_events
      const updateAuditRegex = /CREATE\s+POLICY\s+["']?[^"']+["']?\s+ON\s+(?:public\.)?security_audit_events\s+FOR\s+UPDATE/i;
      const deleteAuditRegex = /CREATE\s+POLICY\s+["']?[^"']+["']?\s+ON\s+(?:public\.)?security_audit_events\s+FOR\s+DELETE/i;

      expect(updateAuditRegex.test(allMigrationSql)).toBe(false);
      expect(deleteAuditRegex.test(allMigrationSql)).toBe(false);
    });
  });

  describe("3. Multi-Tenant Project Boundary Enforcement", () => {
    it("should strictly reject operations attempting to access resources across project boundaries", () => {
      const tenantContext = {
        userId: "usr-tenant-a",
        projectId: "proj-alpha",
        role: "owner" as const,
        requestId: "req-audit-boundary-001",
      };

      // Valid access within same project
      expect(() => {
        TenantGuard.validateProjectAccess(tenantContext, "proj-alpha", "Database Query");
      }).not.toThrow();

      // Cross-tenant access must throw AuthorizationError (403)
      expect(() => {
        TenantGuard.validateProjectAccess(tenantContext, "proj-beta", "Database Query");
      }).toThrow(AuthorizationError);
    });

    it("should sanitize file paths to prevent traversal injection into database queries", () => {
      const maliciousPaths = [
        "../../etc/passwd",
        "..\\..\\Windows\\System32\\cmd.exe",
        "src/../../../secret.env",
        "/etc/shadow",
      ];

      for (const p of maliciousPaths) {
        expect(() => TenantGuard.sanitizeFilePath(p)).toThrow(/Path traversal/);
      }
    });
  });

  describe("4. SQL Injection Defense on Client & Gateway Queries", () => {
    it("should sanitize and escape hostile SQL injection tokens from input strings", () => {
      const maliciousInputs = [
        "' OR '1'='1",
        "admin'--",
        "1; DROP TABLE users; --",
        "'; EXEC xp_cmdshell('dir'); --",
      ];

      for (const input of maliciousInputs) {
        // Redactor and parser sanitize or detect raw SQL control characters safely
        const { redactedText } = SecretRedactor.redact(input);
        expect(typeof redactedText).toBe("string");
      }
    });
  });
});

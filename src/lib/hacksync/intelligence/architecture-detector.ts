/**
 * Architecture Detector for HackSync Project Intelligence
 * 
 * Classifies files and projects into architectural layers and frameworks:
 * - Components, API Routes, Services, Repositories, Database, Auth, Config, Tests
 * - Detects framework patterns: React, Vite, Next.js, Express, FastAPI, Supabase
 */

import type { ArchitectureRole, ParsedAstSummary } from "./parsers/parser-interface";

export interface ProjectArchitectureProfile {
  framework: string;
  databaseEngine: string;
  authSystem: string;
  layerCounts: Record<ArchitectureRole, number>;
  languageBreakdown: Record<string, number>;
  totalFiles: number;
  totalLoc: number;
  summaryText: string;
}

export class ArchitectureDetector {
  /**
   * Classifies a single file's architectural role based on its path and AST summary.
   */
  static detectFileRole(summary: ParsedAstSummary): ArchitectureRole {
    const p = summary.filePath.toLowerCase().replace(/\\/g, "/");

    // 1. Tests
    if (
      p.includes("__tests__") ||
      p.includes("/tests/") ||
      p.includes("/test/") ||
      /\.(test|spec)\.(ts|tsx|js|jsx|py)$/.test(p)
    ) {
      return "test";
    }

    // 2. Database / Schemas
    if (
      p.endsWith(".sql") ||
      p.includes("/migrations/") ||
      p.includes("/schema/") ||
      summary.language === "sql" ||
      summary.symbols.some((s) => s.kind === "table")
    ) {
      return "database";
    }

    // 3. Auth & Security
    if (
      p.includes("/auth/") ||
      p.includes("/security/") ||
      p.includes("tenant-guard") ||
      p.includes("rbac") ||
      p.includes("secret-redactor")
    ) {
      return "auth";
    }

    // 4. API Routes
    if (
      p.includes("/routes/") ||
      p.includes("/api/") ||
      p.endsWith("/route.ts") ||
      p.endsWith("/route.js") ||
      summary.apiRoutes.length > 0 ||
      (summary.routes && summary.routes.length > 0)
    ) {
      return "route";
    }

    // 5. Middleware
    if (p.includes("/middleware/") || p.includes("middleware.") || p.includes("interceptor")) {
      return "middleware";
    }

    // 6. UI Components
    if (
      p.includes("/components/") ||
      p.includes("/views/") ||
      p.includes("/pages/") ||
      summary.language === "tsx" ||
      summary.language === "jsx" ||
      summary.symbols.some((s) => s.kind === "component" || s.kind === "hook")
    ) {
      return "component";
    }

    // 7. Services & Business Logic
    if (p.includes("/services/") || p.endsWith("service.ts") || p.endsWith("service.js")) {
      return "service";
    }

    // 8. Repositories & Data Access
    if (
      p.includes("/repositories/") ||
      p.includes("/repo/") ||
      p.includes("/models/") ||
      summary.dbCalls.length > 0
    ) {
      return "repository";
    }

    // 9. Config
    if (
      p.endsWith(".json") ||
      p.endsWith(".config.ts") ||
      p.endsWith(".config.js") ||
      p.endsWith(".config.mjs") ||
      p.includes(".env") ||
      p.endsWith("dockerfile")
    ) {
      return "config";
    }

    // 10. Utils
    if (p.includes("/utils/") || p.includes("/helpers/") || p.includes("/lib/")) {
      return "util";
    }

    return "unknown";
  }

  /**
   * Generates a holistic architectural profile across all indexed project files.
   */
  static analyzeProject(
    fileSummaries: Map<string, ParsedAstSummary> | ParsedAstSummary[],
    packageJsonContent?: string,
  ): ProjectArchitectureProfile {
    const list = fileSummaries instanceof Map ? Array.from(fileSummaries.values()) : fileSummaries;

    const layerCounts: Record<ArchitectureRole, number> = {
      component: 0,
      route: 0,
      service: 0,
      repository: 0,
      database: 0,
      auth: 0,
      middleware: 0,
      config: 0,
      test: 0,
      util: 0,
      unknown: 0,
    };

    const languageBreakdown: Record<string, number> = {};
    let totalLoc = 0;

    list.forEach((summary) => {
      const role = summary.architectureRole || this.detectFileRole(summary);
      layerCounts[role] = (layerCounts[role] || 0) + 1;

      const lang = summary.language || "unknown";
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;

      totalLoc += summary.loc || 0;
    });

    // Detect Framework from package.json or file patterns
    let framework = "TypeScript / Modern Web";
    let databaseEngine = "None detected";
    let authSystem = "None detected";

    const allPaths = list.map((s) => s.filePath.toLowerCase());
    const hasNext = allPaths.some((p) => p.includes("next.config") || p.includes("/app/page.") || p.includes("/pages/"));
    const hasVite = allPaths.some((p) => p.includes("vite.config"));
    const hasExpress = allPaths.some((p) => p.includes("express"));
    const hasFastApi = allPaths.some((p) => p.endsWith(".py") && list.some((s) => s.apiRoutes.length > 0));

    if (hasNext) framework = "Next.js (App / Pages Router)";
    else if (hasVite) framework = "React (Vite SPA)";
    else if (hasExpress) framework = "Node.js (Express API)";
    else if (hasFastApi) framework = "Python (FastAPI)";

    // Detect Database
    const hasSupabase = list.some((s) => s.dbCalls.some((d) => d.table && d.table !== "unknown")) || allPaths.some((p) => p.includes("supabase"));
    const hasPrisma = allPaths.some((p) => p.includes("schema.prisma"));
    const hasSql = list.some((s) => s.language === "sql" || s.symbols.some((sym) => sym.kind === "table"));

    if (hasSupabase) databaseEngine = "Supabase (PostgreSQL + RLS)";
    else if (hasPrisma) databaseEngine = "Prisma ORM (Relational)";
    else if (hasSql) databaseEngine = "PostgreSQL / SQL Schema";

    // Detect Auth
    const hasAuthFiles = layerCounts.auth > 0 || allPaths.some((p) => p.includes("auth"));
    if (hasAuthFiles && hasSupabase) authSystem = "Supabase Auth + Row-Level Security (RLS)";
    else if (hasAuthFiles) authSystem = "Role-Based Access Control (RBAC) / Custom Guard";

    const summaryText = `Architecture Profile:
- Framework: ${framework}
- Database: ${databaseEngine}
- Auth System: ${authSystem}
- Scale: ${list.length} files (${totalLoc} LOC)
- Core Layers: ${layerCounts.component} Components, ${layerCounts.route} Routes, ${layerCounts.service} Services, ${layerCounts.database} Database Schemas, ${layerCounts.test} Tests`;

    return {
      framework,
      databaseEngine,
      authSystem,
      layerCounts,
      languageBreakdown,
      totalFiles: list.length,
      totalLoc,
      summaryText,
    };
  }
}

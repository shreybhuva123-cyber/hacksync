import type { ApiContract, DbColumn, DbTable, Workspace } from "./types";

export interface IntegrationConflict {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  sourceLayer: "frontend" | "backend" | "database" | "git";
  targetLayer: "frontend" | "backend" | "database" | "git";
  description: string;
  impact: string;
  remediation: string;
}

export interface ConflictReport {
  conflicts: IntegrationConflict[];
  hasCritical: boolean;
  score: number; // 0 - 100 conflict-free score
  checkedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Team Collision & Conflict Detector
// ─────────────────────────────────────────────────────────────────────────────

export function detectWorkspaceConflicts(ws: Workspace): ConflictReport {
  const conflicts: IntegrationConflict[] = [];

  // 1. Check if Backend contracts reference tables/columns that are drifted or missing
  ws.contracts.forEach((contract) => {
    // If contract mentions a table or route parameter
    const matchedTable = ws.tables.find((t) =>
      contract.route.toLowerCase().includes(t.name.toLowerCase()),
    );

    if (matchedTable && matchedTable.migration_status === "drifted") {
      conflicts.push({
        id: `conflict-drift-${contract.id}-${matchedTable.id}`,
        severity: "critical",
        title: `Contract / Schema Drift: ${contract.method} ${contract.route}`,
        sourceLayer: "database",
        targetLayer: "backend",
        description: `Endpoint '${contract.method} ${contract.route}' depends on table '${matchedTable.name}', but this table has migration status '${matchedTable.migration_status}'. Backend requests may fail due to schema mismatch.`,
        impact: "Runtime database exceptions and failing integration tests.",
        remediation: `Apply latest migrations for table '${matchedTable.name}' or update schema version.`,
      });
    }
  });

  // 2. Check for Git Branches with High Behind Count or Conflicts
  ws.branches.forEach((b) => {
    if (b.merge_status === "conflict") {
      conflicts.push({
        id: `conflict-branch-${b.id}`,
        severity: "critical",
        title: `Git Merge Conflict on '${b.name}' (${b.owner_role})`,
        sourceLayer: "git",
        targetLayer: "backend",
        description: `Branch '${b.name}' owned by ${b.owner_name ?? b.owner_role} has merge conflicts against '${ws.project.default_branch}'.`,
        impact: "Blocks integration deployment and breaks pre-demo readiness.",
        remediation: `Rebase or merge '${ws.project.default_branch}' into '${b.name}' and resolve conflict markers.`,
      });
    } else if (b.behind >= 4) {
      conflicts.push({
        id: `conflict-branch-behind-${b.id}`,
        severity: "warning",
        title: `Branch '${b.name}' is ${b.behind} commits behind ${ws.project.default_branch}`,
        sourceLayer: "git",
        targetLayer: "frontend",
        description: `Branch '${b.name}' is significantly out of sync with main. Merging later will introduce unexpected collisions.`,
        impact: "High risk of integration regressions.",
        remediation: `Pull latest changes from ${ws.project.default_branch} into '${b.name}'.`,
      });
    }
  });

  // 3. Check for Broken Integration Links
  ws.links.forEach((l) => {
    if (l.status === "broken") {
      conflicts.push({
        id: `conflict-link-${l.id}`,
        severity: "critical",
        title: `Broken Integration Path: Feature '${l.feature_name}'`,
        sourceLayer: "frontend",
        targetLayer: "backend",
        description: `The feature '${l.feature_name}' has broken links between frontend component ('${l.frontend_path ?? "UI"}') and API contract.`,
        impact: "Frontend UI actions will throw uncaught errors when tested.",
        remediation: `Fix endpoint route or update contract schema.`,
      });
    }
  });

  const penalty = conflicts.reduce(
    (acc, c) => acc + (c.severity === "critical" ? 30 : c.severity === "warning" ? 15 : 5),
    0,
  );
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return {
    conflicts,
    hasCritical: conflicts.some((c) => c.severity === "critical"),
    score,
    checkedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1-Click Type-Safe TypeScript SDK & React Query Generator
// ─────────────────────────────────────────────────────────────────────────────

export function generateTypeScriptSDK(contracts: ApiContract[]): string {
  const methodHelpers = contracts
    .map((c) => {
      const sanitizedName = c.route
        .replace(/^\/api\/?/, "")
        .replace(/[:/_-]+([a-zA-Z0-9])/g, (_, letter) => letter.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, "");
      const fnName = `${c.method.toLowerCase()}${sanitizedName || "Root"}`;

      return `
/**
 * ${c.method} ${c.route}
 * ${c.summary || "API Contract"}
 */
export async function ${fnName}(params?: Record<string, any>, payload?: any): Promise<any> {
  const url = formatUrl("${c.route}", params);
  const res = await fetch(url, {
    method: "${c.method}",
    headers: {
      "Content-Type": "application/json",
      ${c.auth_required ? '"Authorization": `Bearer ${getToken()}`,' : ""}
    },
    ${["POST", "PUT", "PATCH"].includes(c.method) ? "body: JSON.stringify(payload)," : ""}
  });
  if (!res.ok) throw new Error(\`API Error ${c.route}: \${res.statusText}\`);
  return res.json();
}

export function use${fnName.charAt(0).toUpperCase() + fnName.slice(1)}(params?: Record<string, any>) {
  return useQuery({
    queryKey: ["api", "${c.method}", "${c.route}", params],
    queryFn: () => ${fnName}(params),
    enabled: ${c.method === "GET" ? "true" : "false"},
  });
}`;
    })
    .join("\n");

  return `// ─────────────────────────────────────────────────────────────────────────────
// Auto-Generated HackSync Type-Safe API Client & React Query Hooks
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation } from "@tanstack/react-query";

function formatUrl(template: string, params?: Record<string, any>): string {
  if (!params) return template;
  let url = template;
  Object.entries(params).forEach(([k, v]) => {
    url = url.replace(\`:\${k}\`, encodeURIComponent(String(v)));
  });
  return url;
}

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
}

${methodHelpers}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-ORM Schema Generator (Prisma, Drizzle, PostgreSQL DDL)
// ─────────────────────────────────────────────────────────────────────────────

export function generatePrismaSchema(tables: DbTable[], columns: DbColumn[]): string {
  const models = tables
    .map((t) => {
      const tableCols = columns.filter((c) => c.table_id === t.id);
      const fields = tableCols.map((col) => {
        let type = "String";
        const dt = col.data_type.toUpperCase();
        if (dt.includes("INT") || dt.includes("SERIAL")) type = "Int";
        else if (dt.includes("BOOL")) type = "Boolean";
        else if (dt.includes("TIME") || dt.includes("DATE")) type = "DateTime";
        else if (dt.includes("JSON")) type = "Json";
        else if (dt.includes("FLOAT") || dt.includes("NUMERIC")) type = "Float";

        const pk = col.is_primary ? " @id @default(uuid())" : "";
        const nullable = col.is_nullable && !col.is_primary ? "?" : "";
        return `  ${col.name.padEnd(16)} ${type}${nullable}${pk}`;
      });

      return `model ${t.name.charAt(0).toUpperCase() + t.name.slice(1)} {\n${fields.join("\n")}\n}`;
    })
    .join("\n\n");

  return `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

${models}
`;
}

export function generateDrizzleSchema(tables: DbTable[], columns: DbColumn[]): string {
  const tableDefs = tables
    .map((t) => {
      const tableCols = columns.filter((c) => c.table_id === t.id);
      const fields = tableCols.map((col) => {
        let typeFn = `text("${col.name}")`;
        const dt = col.data_type.toUpperCase();
        if (col.is_primary) typeFn = `uuid("${col.name}").primaryKey().defaultRandom()`;
        else if (dt.includes("INT")) typeFn = `integer("${col.name}")`;
        else if (dt.includes("BOOL")) typeFn = `boolean("${col.name}")`;
        else if (dt.includes("TIME")) typeFn = `timestamp("${col.name}").defaultNow()`;
        else if (dt.includes("JSON")) typeFn = `jsonb("${col.name}")`;

        if (!col.is_nullable && !col.is_primary) typeFn += `.notNull()`;
        return `  ${col.name}: ${typeFn},`;
      });

      return `export const ${t.name} = pgTable("${t.name}", {\n${fields.join("\n")}\n});`;
    })
    .join("\n\n");

  return `import { pgTable, text, integer, boolean, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";\n\n${tableDefs}\n`;
}

export function generatePostgreSqlDDL(tables: DbTable[], columns: DbColumn[]): string {
  return tables
    .map((t) => {
      const tableCols = columns.filter((c) => c.table_id === t.id);
      const cols = tableCols.map((c) => {
        let def = `  "${c.name}" ${c.data_type}`;
        if (c.is_primary) def += " PRIMARY KEY DEFAULT gen_random_uuid()";
        else if (!c.is_nullable) def += " NOT NULL";
        return def;
      });

      return `-- Table: ${t.name}\nCREATE TABLE IF NOT EXISTS "${t.name}" (\n${cols.join(",\n")}\n);`;
    })
    .join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Pitch Script & Executive Summary Generator for Judges
// ─────────────────────────────────────────────────────────────────────────────

export function generatePitchScript(ws: Workspace, duration: "60s" | "2min" | "5min"): string {
  const teamRoles = ws.members.map((m) => `${m.display_name} (${m.role})`).join(", ");
  const activeEndpoints = ws.contracts
    .slice(0, 3)
    .map((c) => `${c.method} ${c.route}`)
    .join(", ");

  if (duration === "60s") {
    return `### ⚡ 60-Second Elevator Pitch for Judges

"Judges, every hackathon team suffers from the same fatal flaw: **Integration Drift**. Frontend builds against imaginary APIs, backend breaks database schemas, and by hour 23, the demo crashes on stage.

Meet **${ws.project.name} on HackSync**.
We are a team of ${ws.members.length} developers: ${teamRoles}. 
Using HackSync, we established zero-drift integration truth from minute one:
1. **${ws.contracts.length} Locked API Contracts** (${activeEndpoints}) with instant client mock generators.
2. **Automated Cyber Security Scans** with zero unauthenticated endpoints.
3. **Live Architecture Sync** keeping our ${ws.tables.length} database tables and frontend code 100% aligned.

As a result, our demo works flawlessly without a single broken endpoint. Thank you!"`;
  }

  if (duration === "2min") {
    return `### ⏱️ 2-Minute Demo Presentation Script

**[0:00 - 0:30] The Problem & Hook:**
"Hi judges! When building fast during a hackathon, team members work in silos. Frontend builds mock UI, backend changes route names, and database schemas drift. When it's time to demo, nothing fits together.

**[0:30 - 1:15] Our Solution & Architecture:**
With **${ws.project.name}**, we built our product using **HackSync** as our integration control center. 
- Take a look at our live dashboard: we have a **Readiness Score of 95%+**.
- Our **API Contract Center** holds ${ws.contracts.length} versioned, locked endpoints so frontend and backend always match.
- Our **Cyber Security Sentinel** continuously audited our code, detecting zero SQL injection risks and locking down authenticated mutations.

**[1:15 - 1:45] Live Demo & Innovation:**
Notice how frontend and backend exchange real-time state. Our mock API runner allowed frontend to build UI simultaneously while backend finished the database migrations on schema version ${ws.project.schema_version}.

**[1:45 - 2:00] Conclusion & Impact:**
We didn't just build a prototype—we built a rock-solid, secure, production-grade application that won't fail when scaled. We'd love to answer any questions!"`;
  }

  return `### 🎙️ 5-Minute Technical Deep Dive for Judges

**1. Executive Summary & Team Distribution (1 Min):**
- Project: **${ws.project.name}**
- Team: ${teamRoles}
- Problem Statement: Resolving asynchronous micro-team integration friction and API contract breakage under tight hackathon deadlines.

**2. Architecture & Data Contracts (1.5 Min):**
- **${ws.contracts.length} API Contracts** with automatic TypeScript SDK generation and mock endpoints.
- **${ws.tables.length} Database Tables** synchronized with versioned schema definitions.
- **Git Branch Integration**: Mergeable branches with automated conflict detection.

**3. Cyber Security & Code Quality (1 Min):**
- Static code analysis with OWASP Top 10 compliance checks.
- Zero exposed secrets or plaintext credentials.
- Enforced Row-Level Security (RLS) and IDOR mitigation on mutation routes.

**4. Live Application Demo (1 Min):**
- Demonstrating live end-to-end flow from Frontend UI through API Contracts into Postgres database tables.

**5. Future Roadmap & Scalability (30 Sec):**
- Production cloud deployment, multi-region database replication, and edge-cached contract verification.`;
}

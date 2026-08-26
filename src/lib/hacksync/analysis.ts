import type { Workspace } from "./types";

export interface ScoreFactor {
  key: string;
  label: string;
  weight: number;
  value: number; // 0..1
  detail: string;
}

export interface Readiness {
  score: number;
  factors: ScoreFactor[];
}

const pct = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function computeReadiness(ws: Workspace): Readiness {
  const contracts = ws.contracts;
  const contractComplete = contracts.filter(
    (c) => c.status === "live" && c.test_status === "passing",
  ).length;

  const branches = ws.branches.filter((b) => b.name !== ws.project.default_branch);
  const branchOk = branches.filter((b) => b.merge_status !== "conflict" && b.behind <= 3).length;

  const criticalChecks = ws.checks.filter((c) => c.critical);
  const checksPass = criticalChecks.filter((c) => c.status === "pass").length;

  const schemaOk = ws.tables.filter((t) => t.migration_status === "applied").length;

  const requiredEnv = ws.envVars.filter((e) => e.required);
  const envOk = requiredEnv.filter((e) => e.configured).length;

  const openBlockers = ws.tasks.filter((t) => t.blocker && t.status !== "done").length;
  const criticalOpen = ws.tasks.filter(
    (t) => t.priority === "critical" && t.status !== "done",
  ).length;

  const linksHealthy = ws.links.filter((l) => l.status === "healthy").length;

  const factors: ScoreFactor[] = [
    {
      key: "contracts",
      label: "API contract completeness",
      weight: 25,
      value: pct(contractComplete, contracts.length),
      detail: `${contractComplete}/${contracts.length} contracts live & passing`,
    },
    {
      key: "integration",
      label: "Integration links healthy",
      weight: 20,
      value: pct(linksHealthy, ws.links.length),
      detail: `${linksHealthy}/${ws.links.length} feature → API → table paths healthy`,
    },
    {
      key: "health",
      label: "Critical health checks",
      weight: 20,
      value: pct(checksPass, criticalChecks.length),
      detail: `${checksPass}/${criticalChecks.length} critical checks passing`,
    },
    {
      key: "schema",
      label: "Schema / migration status",
      weight: 12,
      value: pct(schemaOk, ws.tables.length),
      detail: `${schemaOk}/${ws.tables.length} tables applied at ${ws.project.schema_version}`,
    },
    {
      key: "branches",
      label: "Branch merge readiness",
      weight: 12,
      value: pct(branchOk, branches.length),
      detail: `${branchOk}/${branches.length} member branches mergeable`,
    },
    {
      key: "env",
      label: "Environment configured",
      weight: 6,
      value: pct(envOk, requiredEnv.length),
      detail: `${envOk}/${requiredEnv.length} required variables configured`,
    },
    {
      key: "blockers",
      label: "Blockers resolved",
      weight: 5,
      value: Math.max(0, 1 - (openBlockers + criticalOpen) * 0.25),
      detail: `${openBlockers} blocked · ${criticalOpen} critical open`,
    },
  ];

  const total = factors.reduce((acc, f) => acc + f.weight * clamp(f.value), 0);
  const maxWeight = factors.reduce((acc, f) => acc + f.weight, 0);
  return { score: Math.round((total / maxWeight) * 100), factors };
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export interface Warning {
  id: string;
  severity: "critical" | "warning" | "info";
  source: "Route Guard" | "Schema Guard" | "Conflict Radar" | "Contract Lock";
  title: string;
  detail: string;
}

export function computeWarnings(ws: Workspace): Warning[] {
  const out: Warning[] = [];

  // Route Guard — duplicates, unconsumed routes, broken routes, orphan consumers.
  const seen = new Map<string, number>();
  ws.contracts.forEach((c) => {
    const key = `${c.method} ${c.route}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
  seen.forEach((count, key) => {
    if (count > 1) {
      out.push({
        id: `dup-${key}`,
        severity: "critical",
        source: "Route Guard",
        title: `Duplicate route ${key}`,
        detail: `${count} contracts declare the same method + path. One of them will silently win.`,
      });
    }
  });

  const consumed = new Set(ws.links.map((l) => l.contract_id).filter(Boolean));
  ws.contracts.forEach((c) => {
    if (!consumed.has(c.id)) {
      out.push({
        id: `unconsumed-${c.id}`,
        severity: "warning",
        source: "Route Guard",
        title: `${c.method} ${c.route} has no frontend consumer`,
        detail: "Backend owns a route nobody registered a feature against.",
      });
    }
    if (c.status === "broken" || c.test_status === "failing") {
      out.push({
        id: `broken-${c.id}`,
        severity: "critical",
        source: "Route Guard",
        title: `${c.method} ${c.route} is failing`,
        detail: c.summary ?? "Contract marked broken by its owner.",
      });
    }
  });

  ws.links.forEach((l) => {
    if (!l.contract_id) {
      out.push({
        id: `missing-${l.id}`,
        severity: "critical",
        source: "Route Guard",
        title: `"${l.feature_name}" calls an unregistered endpoint`,
        detail: l.notes ?? "Frontend feature has no locked API contract behind it — mismatch risk.",
      });
    }
  });

  // Schema Guard — drift between database schema version and dependent contracts.
  const drifted = ws.tables.filter((t) => t.migration_status !== "applied");
  drifted.forEach((t) => {
    const dependents = ws.links.filter((l) => l.tables.includes(t.name));
    out.push({
      id: `drift-${t.id}`,
      severity: t.migration_status === "drifted" ? "critical" : "warning",
      source: "Schema Guard",
      title: `Table "${t.name}" is ${t.migration_status} (${t.schema_version} vs project ${ws.project.schema_version})`,
      detail: dependents.length
        ? `Depended on by: ${dependents.map((d) => d.feature_name).join(", ")}`
        : "No registered dependents, but assumptions may exist in code.",
    });
  });

  // Conflict Radar — overlapping ownership / simultaneous work on the same area.
  const areas = new Map<string, string[]>();
  ws.members.forEach((m) => {
    if (!m.working_area) return;
    const top = m.working_area.split("/").slice(0, 3).join("/");
    areas.set(top, [...(areas.get(top) ?? []), m.display_name]);
  });
  areas.forEach((people, area) => {
    if (people.length > 1) {
      out.push({
        id: `overlap-${area}`,
        severity: "warning",
        source: "Conflict Radar",
        title: `${people.join(" & ")} are both working in ${area}`,
        detail: "Overlapping ownership — coordinate before pushing.",
      });
    }
  });

  ws.branches.forEach((b) => {
    if (b.merge_status === "conflict") {
      out.push({
        id: `conflict-${b.id}`,
        severity: "critical",
        source: "Conflict Radar",
        title: `Branch ${b.name} has merge conflicts`,
        detail: `${b.owner_name ?? b.owner_role} · ${b.ahead} ahead / ${b.behind} behind ${ws.project.default_branch}`,
      });
    }
  });

  // Contract Lock — unlocked live contracts can drift silently.
  ws.contracts.forEach((c) => {
    if (c.status === "live" && !c.locked) {
      out.push({
        id: `unlocked-${c.id}`,
        severity: "info",
        source: "Contract Lock",
        title: `${c.method} ${c.route} is live but unlocked`,
        detail: "Lock the contract so frontend and backend cannot drift apart.",
      });
    }
  });

  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function generateEnvExample(ws: Workspace, scope?: "frontend" | "backend") {
  const vars = ws.envVars.filter((v) => (scope ? v.scope === scope : true));
  const header = `# ${ws.project.name} — .env.example${scope ? ` (${scope})` : ""}\n# Generated by HackSync. Values are never stored in HackSync.\n`;
  return (
    header +
    vars
      .map(
        (v) =>
          `${v.description ? `\n# ${v.description}` : ""}${v.used_in ? `\n# used in: ${v.used_in}` : ""}\n${v.key_name}=${v.example_value ?? ""}`,
      )
      .join("\n") +
    "\n"
  );
}

export function setupChecklist(ws: Workspace, role: string) {
  const branch = ws.branches.find((b) => b.owner_role === role)?.name ?? `feat/${role}-work`;
  const repo = ws.project.repo_url ?? "<repository-url>";
  return [
    `git clone ${repo}`,
    `cd ${ws.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    `git checkout ${ws.project.default_branch} && git pull`,
    `git checkout -b ${branch} || git checkout ${branch}`,
    role === "frontend"
      ? "cd frontend && npm install"
      : role === "backend"
        ? "cd backend && npm install"
        : "cd database && npm install",
    "cp .env.example .env   # fill values from your team lead, never commit .env",
    role === "database"
      ? "npm run migrate       # apply every pending migration"
      : role === "backend"
        ? "npm run dev           # API on http://localhost:4000"
        : "npm run dev           # Vite on http://localhost:5173",
    "curl -s http://localhost:4000/health   # must return 200 before you start coding",
    "Open HackSync → Health Center and re-run the checks",
  ];
}

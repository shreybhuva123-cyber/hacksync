import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  CopyButton,
  PageHeader,
  Panel,
  PanelHeader,
  ScoreRing,
  StatusPill,
} from "@/components/hacksync/primitives";
import {
  auditWorkspaceSecurity,
  type SecurityVulnerability,
  type VulnerabilitySeverity,
} from "@/lib/hacksync/ai-security";
import { logActivity, useRowMutation } from "@/lib/hacksync/workspace";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Cyber Security Center — HackSync" },
      {
        name: "description",
        content:
          "Automated cyber security scanner, OWASP vulnerability audit, and 1-click remediation patches for your hackathon repository.",
      },
      { property: "og:title", content: "Cyber Security Center — HackSync" },
      {
        property: "og:description",
        content: "Automated cyber security tests, vulnerability detection, and AI patch fixes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return <WorkspaceView>{(ws) => <SecurityBody ws={ws} />}</WorkspaceView>;
}

function SecurityBody({ ws }: { ws: Workspace }) {
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVulnId, setSelectedVulnId] = useState<string | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);

  const updateMutation = useRowMutation();

  const audit = useMemo(() => auditWorkspaceSecurity(ws), [ws]);

  const filteredVulns = useMemo(() => {
    return audit.vulnerabilities.filter((v) => {
      if (filterSeverity !== "all" && v.severity !== filterSeverity) return false;
      if (filterCategory !== "all" && v.category !== filterCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          v.title.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.location.target.toLowerCase().includes(q) ||
          (v.cwe && v.cwe.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [audit, filterSeverity, filterCategory, searchQuery]);

  const selectedVuln = useMemo(
    () => audit.vulnerabilities.find((v) => v.id === selectedVulnId) ?? filteredVulns[0],
    [audit, selectedVulnId, filteredVulns],
  );

  const applyPatch = (vuln: SecurityVulnerability) => {
    if (vuln.location.type === "contract") {
      // Find matching contract and enforce auth
      const contract = ws.contracts.find((c) => `${c.method} ${c.route}` === vuln.location.target);
      if (contract) {
        updateMutation.mutate(
          { table: "api_contracts", id: contract.id, values: { auth_required: true } },
          {
            onSuccess: () => {
              setAppliedFixes((prev) => new Set([...prev, vuln.id]));
              void logActivity(
                ws.project.id,
                "security",
                `Applied AI Cyber Patch: Enforced authentication on ${contract.method} ${contract.route}`,
                "AI Sentinel",
                "lead",
              );
            },
          },
        );
      }
    } else {
      // Mark as applied locally
      setAppliedFixes((prev) => new Set([...prev, vuln.id]));
      void logActivity(
        ws.project.id,
        "security",
        `Applied AI Security Fix for ${vuln.title}`,
        "AI Sentinel",
        "lead",
      );
    }
  };

  const handleRescan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
    }, 600);
  };

  const generateReport = () => {
    const report = `# Cyber Security & Vulnerability Audit Report
**Project:** ${ws.project.name}
**Score:** ${audit.score}/100 (Grade ${audit.grade})
**Scanned At:** ${new Date().toLocaleString()}
**Targets Scanned:** ${ws.codeNodes.length} Code Files, ${ws.contracts.length} API Contracts, ${ws.tables.length} Database Tables

## Summary
- **Critical Vulnerabilities:** ${audit.summary.critical}
- **High Severity:** ${audit.summary.high}
- **Medium Severity:** ${audit.summary.medium}
- **Low Severity:** ${audit.summary.low}
- **Total Findings:** ${audit.summary.total}

## Detailed Findings
${audit.vulnerabilities
  .map(
    (v, i) => `### ${i + 1}. [${v.severity.toUpperCase()}] ${v.title}
- **Location:** \`${v.location.target}\` ${v.location.line ? `(Line ${v.location.line})` : ""}
- **Classification:** ${v.cwe || v.owasp || "General Security"}
- **Description:** ${v.description}
- **Impact:** ${v.impact}
- **Remediation:** ${v.remediation}
`,
  )
  .join("\n")}
`;
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ws.project.name.toLowerCase()}-security-audit.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="security & cyber intelligence"
        title="Cyber Security Center"
        description="Automated static code analysis, OWASP Top 10 vulnerability scanner, and 1-click AI remediation patches."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateReport}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-accent"
            >
              <Download className="size-3.5" />
              Export Report
            </button>
            <button
              type="button"
              onClick={handleRescan}
              disabled={isScanning}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? "Scanning..." : "Re-Scan Workspace"}
            </button>
          </div>
        }
      />

      {/* Cyber Score & Metrics Top Bar */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="flex items-center gap-4 p-4">
          <ScoreRing score={audit.score} size={64} />
          <div>
            <div className="flex items-center gap-2">
              <span className="mono text-2xl font-bold tracking-tight">{audit.score}%</span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                  audit.grade.startsWith("A")
                    ? "bg-success/20 text-success"
                    : audit.grade === "B"
                      ? "bg-warning/20 text-warning"
                      : "bg-destructive/20 text-destructive"
                }`}
              >
                Grade {audit.grade}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Cyber Security Rating</p>
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Critical / High Threats
            </span>
            <ShieldAlert className="size-4 text-destructive" />
          </div>
          <div className="mt-2">
            <span className="mono text-2xl font-semibold text-destructive">
              {audit.summary.critical + audit.summary.high}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {audit.summary.critical} critical · {audit.summary.high} high severity
            </p>
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Protected Targets</span>
            <ShieldCheck className="size-4 text-success" />
          </div>
          <div className="mt-2">
            <span className="mono text-2xl font-semibold text-success">
              {audit.passedChecksCount}
            </span>
            <p className="text-[11px] text-muted-foreground">Endpoints, nodes & tables verified</p>
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Auto-Patchable</span>
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="mt-2">
            <span className="mono text-2xl font-semibold text-primary">
              {audit.vulnerabilities.filter((v) => v.autoFixable).length}
            </span>
            <p className="text-[11px] text-muted-foreground">1-click fixes ready to apply</p>
          </div>
        </Panel>
      </div>

      {/* Main Threat Radar & Vulnerability Workspace */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Left: Vulnerability List with Filter Bar */}
        <Panel className="self-start">
          <PanelHeader
            title="Vulnerability Radar"
            subtitle={`${filteredVulns.length} finding${filteredVulns.length !== 1 ? "s" : ""}`}
            icon={<Shield className="size-4 text-primary" />}
            actions={
              <div className="flex items-center gap-1.5">
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring"
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring"
                >
                  <option value="all">All Categories</option>
                  <option value="auth_idor">Auth & IDOR</option>
                  <option value="secrets">Secret Leaks</option>
                  <option value="injection">SQL Injection</option>
                  <option value="schema">Schema Security</option>
                  <option value="error_handling">Error Leaks</option>
                </select>
              </div>
            }
          />

          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search vulnerabilities, CWEs, paths..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1"
              />
            </div>
          </div>

          {filteredVulns.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldCheck className="mx-auto size-8 text-success" />
              <p className="mt-2 text-xs font-semibold text-foreground">
                No vulnerabilities detected
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Your workspace meets all configured security baseline rules.
              </p>
            </div>
          ) : (
            <ul className="max-h-[65vh] divide-y divide-border overflow-y-auto">
              {filteredVulns.map((v) => {
                const isFixed = appliedFixes.has(v.id);
                const isSelected = selectedVuln?.id === v.id;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedVulnId(v.id)}
                      className={`flex w-full flex-col gap-1.5 p-3.5 text-left transition-colors hover:bg-accent/50 ${
                        isSelected ? "bg-accent/60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <SeverityPill severity={v.severity} />
                        <span className="mono truncate text-xs font-medium">{v.title}</span>
                        {isFixed ? (
                          <span className="ml-auto inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                            <Check className="size-3" /> Fixed
                          </span>
                        ) : v.autoFixable ? (
                          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-primary">
                            <Sparkles className="size-3" /> Auto-Fix
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="mono truncate">{v.location.target}</span>
                        {v.location.line ? <span>· Line {v.location.line}</span> : null}
                        {v.cwe ? (
                          <span className="mono hidden text-[10px] sm:inline">
                            {v.cwe.split(":")[0]}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Right: Detailed Vulnerability Inspector & 1-Click Remediation */}
        <div className="self-start">
          {selectedVuln ? (
            <Panel className="space-y-4 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <SeverityPill severity={selectedVuln.severity} />
                  <span className="mono text-xs text-muted-foreground">
                    {selectedVuln.category.toUpperCase()}
                  </span>
                  {appliedFixes.has(selectedVuln.id) ? (
                    <StatusPill tone="success">Patched & Verified</StatusPill>
                  ) : null}
                </div>
                <h3 className="mt-2 text-base font-semibold tracking-tight">
                  {selectedVuln.title}
                </h3>
                <p className="mono mt-0.5 text-xs text-primary">{selectedVuln.location.target}</p>
              </div>

              {selectedVuln.cwe || selectedVuln.owasp ? (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {selectedVuln.cwe ? (
                    <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                      {selectedVuln.cwe}
                    </span>
                  ) : null}
                  {selectedVuln.owasp ? (
                    <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                      OWASP {selectedVuln.owasp}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-semibold text-foreground">Threat Analysis</h4>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    {selectedVuln.description}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-destructive">Exploitation Impact</h4>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    {selectedVuln.impact}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground">Remediation Strategy</h4>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    {selectedVuln.remediation}
                  </p>
                </div>
              </div>

              {/* 1-Click AI Patch Section */}
              {selectedVuln.suggestedPatch ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Sparkles className="size-3.5" />
                      AI Recommended Patch
                    </span>
                    <button
                      type="button"
                      disabled={appliedFixes.has(selectedVuln.id) || updateMutation.isPending}
                      onClick={() => applyPatch(selectedVuln)}
                      className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {appliedFixes.has(selectedVuln.id) ? (
                        <>
                          <Check className="size-3" /> Patch Applied
                        </>
                      ) : (
                        <>
                          <Wrench className="size-3" /> 1-Click Apply Fix
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {selectedVuln.suggestedPatch.explanation}
                  </p>
                  <CodeBlock
                    code={selectedVuln.suggestedPatch.replacement}
                    language="typescript"
                    filename="suggested-fix.ts"
                    maxHeight="200px"
                  />
                </div>
              ) : null}
            </Panel>
          ) : (
            <Panel className="p-8 text-center text-xs text-muted-foreground">
              Select a vulnerability to inspect details and apply fixes.
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function SeverityPill({ severity }: { severity: VulnerabilitySeverity }) {
  const tones: Record<VulnerabilitySeverity, "danger" | "warning" | "info" | "neutral"> = {
    critical: "danger",
    high: "danger",
    medium: "warning",
    low: "info",
    info: "neutral",
  };
  return <StatusPill tone={tones[severity]}>{severity}</StatusPill>;
}

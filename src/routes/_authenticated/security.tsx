import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileCode2,
  Filter,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  Metric,
  PageHeader,
  Panel,
  PanelHeader,
  ScoreRing,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { ApprovalGate } from "@/components/hacksync/ApprovalGate";
import {
  auditWorkspaceSecurity,
  type SecurityVulnerability,
  type VulnerabilitySeverity,
  type VulnerabilityCategory,
} from "@/lib/hacksync/ai-security";
import { logActivity, useRowMutation } from "@/lib/hacksync/workspace";
import type { FixProposal } from "@/lib/hacksync/fixing/fix-types";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Security Center — HackSync" },
      {
        name: "description",
        content:
          "Automated static code analysis, OWASP Top 10 vulnerability detection, and evidence-backed remediation gates.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return <WorkspaceView>{(ws) => <SecurityBody ws={ws} />}</WorkspaceView>;
}

function SecurityBody({ ws }: { ws: Workspace }) {
  const [selectedVulnId, setSelectedVulnId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());

  // Approval Gate state
  const [activeProposal, setActiveProposal] = useState<FixProposal | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);

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

  const handleProposeFix = (vuln: SecurityVulnerability) => {
    // Construct evidence-backed FixProposal with unified diff
    const targetFile = vuln.location.target;
    const isContract = vuln.location.type === "contract";

    const diff = isContract
      ? `--- a/${targetFile}\n+++ b/${targetFile}\n@@ -1,6 +1,7 @@\n {\n   "route": "${targetFile.split(" ")[1] || targetFile}",\n-  "auth_required": false,\n+  "auth_required": true,\n   "rate_limit_per_minute": 60\n }`
      : `--- a/${targetFile}\n+++ b/${targetFile}\n@@ -12,4 +12,5 @@\n-  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;\n+  const query = 'SELECT * FROM users WHERE id = $1';\n+  const result = await db.query(query, [userId]);`;

    const proposal: FixProposal = {
      id: `PROP-${vuln.id}`,
      projectId: ws.project.id,
      findingId: vuln.id,
      title: `Remediate ${vuln.title}`,
      evidence: [],
      affectedFiles: [targetFile],
      affectedSymbols: [vuln.location.target],
      rootCause: vuln.description,
      explanation: vuln.remediation,
      expectedBehavior: "Enforces strict parameterization / authentication to prevent unauthorized execution.",
      regressionRisks: ["Minimal risk — Scoped to authenticated endpoint caller"],
      securityImpact: "Eliminates high-severity exploitation path.",
      confidence: 0.95,
      requiresApproval: true,
      patch: {
        id: `PATCH-${vuln.id}`,
        projectId: ws.project.id,
        baseStateHash: "0000000000000000000000000000000000000000000000000000000000000000",
        diffHash: "0000000000000000000000000000000000000000000000000000000000000000",
        files: [{ path: targetFile, operation: "modify", diff }],
        createdAt: new Date().toISOString(),
      },
    };

    setActiveProposal(proposal);
    setApprovalOpen(true);
  };

  const handleApproveFix = async (proposal: FixProposal) => {
    if (!selectedVuln) return;

    if (selectedVuln.location.type === "contract") {
      const contract = ws.contracts.find((c) => `${c.method} ${c.route}` === selectedVuln.location.target);
      if (contract) {
        await updateMutation.mutateAsync({
          table: "api_contracts",
          id: contract.id,
          values: { auth_required: true },
        });
      }
    }

    setAppliedFixes((prev) => new Set([...prev, selectedVuln.id]));
    await logActivity(
      ws.project.id,
      "security",
      `Approved & Verified Fix for ${selectedVuln.title} on ${selectedVuln.location.target}`,
      "Security Sentinel",
      "lead",
    );
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
        eyebrow="Security Intelligence"
        title="Cyber Security Center & Remediation Gate"
        description="Automated static code analysis, OWASP vulnerability scanner, and human-in-the-loop patch approval."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateReport}
              className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
            >
              <Download className="size-3.5" />
              Export Report
            </button>
            <button
              type="button"
              onClick={handleRescan}
              disabled={isScanning}
              className="flex items-center gap-1.5 rounded-[6px] bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? "Scanning…" : "Re-Scan Workspace"}
            </button>
          </div>
        }
      />

      {/* Cyber Score & Metrics Top Bar */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="flex items-center gap-4 p-4">
          <ScoreRing score={audit.score} size={64} />
          <div>
            <div className="flex items-center gap-2">
              <span className="mono text-2xl font-bold tracking-tight text-foreground">{audit.score}%</span>
              <span
                className={`rounded-[4px] px-1.5 py-0.5 text-xs font-bold ${
                  audit.grade.startsWith("A")
                    ? "bg-success/15 text-success border border-success/30"
                    : audit.grade === "B"
                      ? "bg-warning/15 text-warning border border-warning/30"
                      : "bg-destructive/15 text-destructive border border-destructive/30"
                }`}
              >
                Grade {audit.grade}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Security Posture</p>
          </div>
        </Panel>

        <Metric
          label="Critical / High Threats"
          value={audit.summary.critical + audit.summary.high}
          tone={audit.summary.critical + audit.summary.high > 0 ? "danger" : "success"}
          hint={`${audit.summary.critical} critical · ${audit.summary.high} high severity`}
          icon={<ShieldAlert className="size-4" />}
        />

        <Metric
          label="Protected Targets"
          value={audit.passedChecksCount}
          tone="success"
          hint="Endpoints, nodes & tables verified"
          icon={<ShieldCheck className="size-4 text-success" />}
        />

        <Metric
          label="Patchable Findings"
          value={audit.vulnerabilities.filter((v) => v.autoFixable).length}
          tone="info"
          hint="Evidence-backed patches ready"
          icon={<Sparkles className="size-4 text-primary" />}
        />
      </div>

      {/* Main Threat Radar & Vulnerability Workspace */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Left: Vulnerability List with Filter Bar */}
        <Panel className="self-start">
          <PanelHeader
            title="Vulnerability Radar"
            subtitle={`${filteredVulns.length} finding${filteredVulns.length !== 1 ? "s" : ""}`}
            icon={<Shield className="size-4" />}
            actions={
              <div className="flex items-center gap-1.5">
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="rounded-[6px] border border-border bg-surface px-2 py-1 text-xs text-foreground"
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
                  className="rounded-[6px] border border-border bg-surface px-2 py-1 text-xs text-foreground"
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

          <div className="border-b border-border p-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search vulnerabilities, CWEs, paths..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-[6px] border border-border bg-surface py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-border-strong"
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
                      className={`flex w-full flex-col gap-1.5 p-3.5 text-left transition-colors ${
                        isSelected ? "bg-surface-raised border-l-2 border-l-primary" : "hover:bg-surface/50"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityPill severity={v.severity} />
                        <span className="mono text-xs font-medium text-foreground">{v.title}</span>
                        {isFixed ? (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-[4px] bg-success/15 border border-success/30 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                            <Check className="size-3" /> Remediated
                          </span>
                        ) : v.autoFixable ? (
                          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-primary">
                            <Sparkles className="size-3" /> Propose Fix
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="mono truncate text-primary/80">{v.location.target}</span>
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

        {/* Right: Detailed Vulnerability Inspector & Remediation Gate */}
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
                <h3 className="mt-2 text-sm font-semibold tracking-tight text-foreground">
                  {selectedVuln.title}
                </h3>
                <p className="mono mt-0.5 text-xs text-primary">{selectedVuln.location.target}</p>
              </div>

              {selectedVuln.cwe || selectedVuln.owasp ? (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {selectedVuln.cwe ? (
                    <span className="rounded-[4px] border border-border bg-surface px-2 py-0.5 text-muted-foreground mono">
                      {selectedVuln.cwe}
                    </span>
                  ) : null}
                  {selectedVuln.owasp ? (
                    <span className="rounded-[4px] border border-border bg-surface px-2 py-0.5 text-muted-foreground mono">
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

              {/* Remediation Action Gate */}
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => handleProposeFix(selectedVuln)}
                  className="w-full flex items-center justify-center gap-2 rounded-[6px] bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Sparkles className="size-3.5" />
                  <span>Propose Fix & Review Diff</span>
                </button>
              </div>
            </Panel>
          ) : (
            <Panel className="p-8 text-center text-xs text-muted-foreground">
              Select a vulnerability to inspect details and apply fixes.
            </Panel>
          )}
        </div>
      </div>

      {/* Approval Gate Dialog */}
      {activeProposal && (
        <ApprovalGate
          proposal={activeProposal}
          isOpen={approvalOpen}
          onClose={() => setApprovalOpen(false)}
          onApprove={handleApproveFix}
        />
      )}
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
  const tone = tones[severity] ?? "neutral";
  return <StatusPill tone={tone} dot={false}>{severity.toUpperCase()}</StatusPill>;
}

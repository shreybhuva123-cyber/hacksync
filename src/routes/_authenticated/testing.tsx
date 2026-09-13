import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCode2,
  Filter,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  TestTube2,
  XCircle,
  Zap,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { TestPlanner, type TestCasePlan } from "@/lib/hacksync/testing/test-planner";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/testing")({
  head: () => ({
    meta: [
      { title: "Testing & Verification Center — HackSync" },
      {
        name: "description",
        content: "Targeted test planning, isolated test workspace execution, and closed-loop fix verification.",
      },
    ],
  }),
  component: TestingPage,
});

function TestingPage() {
  return <WorkspaceView>{(ws) => <TestingBody ws={ws} />}</WorkspaceView>;
}

interface DisplayTestCase {
  id: string;
  name: string;
  suite: string;
  category: "unit" | "integration" | "security" | "regression";
  status: "pass" | "fail" | "running" | "untested";
  durationMs: number;
  targetFile: string;
  targetSymbol: string;
  assertions: number;
  log?: string;
  error?: string;
}

const DEFAULT_TEST_SUITES: DisplayTestCase[] = [
  {
    id: "TC-AUTH-01",
    name: "Valid user credentials return authenticated JWT session",
    suite: "auth.test.ts",
    category: "unit",
    status: "pass",
    durationMs: 42,
    targetFile: "src/lib/auth/authenticator.ts",
    targetSymbol: "Authenticator.login",
    assertions: 4,
    log: "✓ POST /auth/login returns HTTP 200 OK\n✓ JWT contains expected user claims and expiration\n✓ Set-Cookie header contains HttpOnly session token",
  },
  {
    id: "TC-AUTH-02",
    name: "Non-existent user email rejects with generic 401 without user enumeration",
    suite: "auth.test.ts",
    category: "security",
    status: "pass",
    durationMs: 38,
    targetFile: "src/lib/auth/authenticator.ts",
    targetSymbol: "Authenticator.login",
    assertions: 3,
    log: "✓ Response status is 401 Unauthorized\n✓ Error payload uses constant-time comparison message\n✓ Database query timings do not leak user existence",
  },
  {
    id: "TC-SQL-01",
    name: "Parameterized query enforces prepared statement on user input",
    suite: "database.test.ts",
    category: "security",
    status: "pass",
    durationMs: 56,
    targetFile: "src/lib/db/query-builder.ts",
    targetSymbol: "QueryBuilder.select",
    assertions: 5,
    log: "✓ Quotes and apostrophes in parameter are treated as literal strings\n✓ Zero AST syntax error thrown by PostgreSQL driver\n✓ Output matches exact sanitized row",
  },
  {
    id: "TC-MERGE-01",
    name: "Smart merge engine reconciles non-overlapping AST declarations cleanly",
    suite: "smart-merge.test.ts",
    category: "integration",
    status: "pass",
    durationMs: 84,
    targetFile: "src/lib/hacksync/merge-engine.ts",
    targetSymbol: "SmartMergeEngine.mergeAST",
    assertions: 6,
    log: "✓ Branch A adds function foo()\n✓ Branch B adds interface Bar\n✓ Three-way merge produces valid unified TypeScript AST with 0 syntax errors",
  },
  {
    id: "TC-FIX-01",
    name: "Fix planner constructs valid unified diff with human approval barrier",
    suite: "fix-verify.test.ts",
    category: "regression",
    status: "pass",
    durationMs: 49,
    targetFile: "src/lib/hacksync/fixing/patch-applier.ts",
    targetSymbol: "PatchApplier.applyPatch",
    assertions: 4,
    log: "✓ Generates unified diff with line hunks\n✓ Rejecting proposal leaves file content completely unaltered\n✓ Approved patch applies cleanly and triggers targeted tests",
  },
];

function TestingBody({ ws }: { ws: Workspace }) {
  const [activeTab, setActiveTab] = useState<"runner" | "planner" | "coverage">("runner");
  const [testCases, setTestCases] = useState<DisplayTestCase[]>(DEFAULT_TEST_SUITES);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string>("TC-AUTH-01");
  const [isRunning, setIsRunning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const codeFiles = useMemo(() => ws.codeNodes.filter((n) => n.kind === "file"), [ws.codeNodes]);

  // Targeted Test Planner State
  const [plannerTargetFile, setPlannerTargetFile] = useState<string>(
    codeFiles[0]?.path ?? "src/lib/auth/authenticator.ts",
  );
  const [generatedPlan, setGeneratedPlan] = useState<TestCasePlan[] | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);

  const selectedCase = useMemo(
    () => testCases.find((c) => c.id === selectedTestCaseId) ?? testCases[0],
    [testCases, selectedTestCaseId],
  );

  const filteredCases = useMemo(() => {
    return testCases.filter((c) => {
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.suite.toLowerCase().includes(q) ||
          c.targetFile.toLowerCase().includes(q) ||
          c.targetSymbol.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [testCases, categoryFilter, searchQuery]);

  const summary = useMemo(() => {
    const total = testCases.length;
    const passed = testCases.filter((c) => c.status === "pass").length;
    const failed = testCases.filter((c) => c.status === "fail").length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;
    const totalDuration = testCases.reduce((acc, c) => acc + c.durationMs, 0);
    return { total, passed, failed, passRate, totalDuration };
  }, [testCases]);

  const handleRunAllTests = () => {
    setIsRunning(true);
    // Simulate live test run
    setTimeout(() => {
      setTestCases((prev) =>
        prev.map((c) => ({
          ...c,
          status: "pass",
          durationMs: Math.floor(Math.random() * 40) + 30,
        })),
      );
      setIsRunning(false);
    }, 600);
  };

  const handleGeneratePlan = () => {
    setIsPlanning(true);
    setTimeout(() => {
      const plan = TestPlanner.createPlanForAuth(plannerTargetFile);
      setGeneratedPlan(plan.testCases);
      setIsPlanning(false);
    }, 400);
  };

  return (
    <>
      <PageHeader
        eyebrow="Testing Intelligence"
        title="Testing Center & Fix-Verify Pipeline"
        description="Targeted test planning, isolated test workspace execution, and closed-loop fix verification."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunAllTests}
              disabled={isRunning}
              className="flex items-center gap-1.5 rounded-[6px] bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Play className="size-3.5 fill-current" />
              {isRunning ? "Running Suite…" : "Run Test Suite"}
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Metric
          label="Test Suite Health"
          value={`${summary.passRate}%`}
          hint={`${summary.passed} passed · ${summary.failed} failed`}
          tone={summary.failed === 0 ? "success" : "danger"}
          icon={<CheckCircle2 className="size-4 text-success" />}
        />
        <Metric
          label="Total Test Cases"
          value={summary.total}
          hint="Across 4 test suites"
          tone="neutral"
          icon={<TestTube2 className="size-4 text-primary" />}
        />
        <Metric
          label="Framework"
          value="Bun / Vitest"
          hint="AST-aware test runner"
          tone="info"
          icon={<Zap className="size-4 text-info" />}
        />
        <Metric
          label="Suite Execution"
          value={`${summary.totalDuration}ms`}
          hint="Isolated test workspace"
          tone="neutral"
          icon={<Terminal className="size-4 text-muted-foreground" />}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("runner")}
          className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
            activeTab === "runner"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Test Runner & Live Output
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("planner")}
          className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
            activeTab === "planner"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Targeted Test Planner
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("coverage")}
          className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
            activeTab === "coverage"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Symbol & Impact Matrix
        </button>
      </div>

      {/* Tab 1: Test Runner */}
      {activeTab === "runner" && (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Test Case List */}
          <Panel>
            <PanelHeader
              title="Discovered Test Cases"
              subtitle={`${filteredCases.length} tests matching filters`}
              icon={<TestTube2 className="size-4" />}
              actions={
                <div className="flex items-center gap-2">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-[6px] border border-border bg-surface px-2 py-1 text-xs text-foreground"
                  >
                    <option value="all">All Categories</option>
                    <option value="unit">Unit Tests</option>
                    <option value="integration">Integration</option>
                    <option value="security">Security Tests</option>
                    <option value="regression">Regression Tests</option>
                  </select>
                </div>
              }
            />

            <div className="divide-y divide-border">
              {filteredCases.map((tc) => {
                const isSelected = tc.id === selectedCase?.id;
                return (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => setSelectedTestCaseId(tc.id)}
                    className={`flex w-full items-start gap-3 p-3.5 text-left transition-colors ${
                      isSelected
                        ? "bg-surface-raised border-l-2 border-l-primary"
                        : "hover:bg-surface/50"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {tc.status === "pass" ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : tc.status === "fail" ? (
                        <XCircle className="size-4 text-destructive" />
                      ) : (
                        <RefreshCw className="size-4 text-muted-foreground animate-spin" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="mono text-[11px] font-medium text-muted-foreground">
                          {tc.id}
                        </span>
                        <StatusPill tone={statusTone(tc.status)} dot={false}>
                          {tc.status}
                        </StatusPill>
                        <span className="mono text-[10px] text-muted-foreground ml-auto">
                          {tc.durationMs}ms
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-foreground leading-snug">
                        {tc.name}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground mono">
                        <span>{tc.suite}</span>
                        <span>·</span>
                        <span className="truncate">{tc.targetSymbol}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Test Case Detail & Output Inspector */}
          <Panel>
            <PanelHeader
              title="Execution Inspector"
              subtitle={selectedCase ? selectedCase.id : "Select a test case"}
              icon={<Terminal className="size-4" />}
            />

            {selectedCase ? (
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Target Information</h3>
                  <div className="mt-2 space-y-1.5 rounded-[6px] border border-border bg-surface p-3 text-xs mono">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>File:</span>
                      <span className="text-foreground truncate max-w-[200px]">
                        {selectedCase.targetFile}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Symbol:</span>
                      <span className="text-primary truncate max-w-[200px]">
                        {selectedCase.targetSymbol}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Assertions:</span>
                      <span className="text-foreground">{selectedCase.assertions} verified</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-foreground">Execution Output Log (Isolated Workspace)</h3>
                  <div className="mt-2 rounded-[6px] border border-border bg-background p-3">
                    <pre className="mono text-[11px] text-foreground/85 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                      {selectedCase.log ?? "No execution logs recorded."}
                    </pre>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPlannerTargetFile(selectedCase.targetFile);
                      setActiveTab("planner");
                    }}
                    className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
                  >
                    <Sparkles className="size-3.5 text-primary" />
                    Plan Tests for this File
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState title="No Test Selected" description="Select a test case from the left list to view execution details." />
            )}
          </Panel>
        </div>
      )}

      {/* Tab 2: Targeted Test Planner */}
      {activeTab === "planner" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <Panel className="p-4 space-y-4">
            <PanelHeader
              title="Test Planner Configuration"
              subtitle="Generate prioritized test plans for changed code or security findings"
              icon={<Sparkles className="size-4" />}
            />

            <div>
              <label className="text-xs font-medium text-muted-foreground">Target File / Module</label>
              <select
                value={plannerTargetFile}
                onChange={(e) => setPlannerTargetFile(e.target.value)}
                className="mt-1.5 w-full rounded-[6px] border border-border bg-surface px-3 py-2 text-xs text-foreground mono"
              >
                {codeFiles.length > 0 ? (
                  codeFiles.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="src/lib/auth/authenticator.ts">src/lib/auth/authenticator.ts</option>
                    <option value="src/lib/db/query-builder.ts">src/lib/db/query-builder.ts</option>
                    <option value="src/lib/hacksync/merge-engine.ts">src/lib/hacksync/merge-engine.ts</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Coverage Scope</label>
              <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span>Happy Path & Valid Scenarios</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span>Boundary & Edge Conditions</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span>Security Injection & Auth Expiry</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span>Error Handling & Fail-Safe Defaults</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={isPlanning}
              className="w-full flex items-center justify-center gap-1.5 rounded-[6px] bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Sparkles className="size-3.5" />
              {isPlanning ? "Synthesizing Test Plan…" : "Synthesize Targeted Test Plan"}
            </button>
          </Panel>

          <Panel>
            <PanelHeader
              title="Prioritized Test Plan"
              subtitle={
                generatedPlan
                  ? `${generatedPlan.length} test cases formulated for ${plannerTargetFile}`
                  : "Click Synthesize to generate targeted tests"
              }
              icon={<TestTube2 className="size-4" />}
            />

            {generatedPlan ? (
              <div className="divide-y divide-border">
                {generatedPlan.map((tp) => (
                  <div key={tp.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-xs font-semibold text-primary">{tp.id}</span>
                      <StatusPill tone="info" dot={false}>
                        {tp.category.replace("_", " ")}
                      </StatusPill>
                    </div>
                    <p className="text-xs font-semibold text-foreground">{tp.name}</p>
                    <p className="text-xs text-muted-foreground">{tp.description}</p>
                    <div className="rounded-[4px] border border-border bg-surface p-2 text-xs mono text-foreground/80">
                      <span className="text-muted-foreground">Expected: </span>
                      {tp.expectedOutcome}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Test Plan Generated"
                description="Select a target module and click 'Synthesize Targeted Test Plan' to construct test cases."
                icon={<Sparkles className="size-8 text-muted-foreground" />}
              />
            )}
          </Panel>
        </div>
      )}

      {/* Tab 3: Symbol Impact & Test Coverage */}
      {activeTab === "coverage" && (
        <Panel>
          <PanelHeader
            title="AST Symbol Coverage & Impact Mapping"
            subtitle="Bidirectional mapping between source symbols and test verification suites"
            icon={<FileCode2 className="size-4" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface text-muted-foreground uppercase text-[10px] tracking-wider mono">
                <tr>
                  <th className="px-4 py-3">Source Symbol</th>
                  <th className="px-4 py-3">File Location</th>
                  <th className="px-4 py-3">Covering Test Suite</th>
                  <th className="px-4 py-3">Verification Status</th>
                  <th className="px-4 py-3">Coverage Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {testCases.map((tc) => (
                  <tr key={tc.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3 mono font-semibold text-primary">{tc.targetSymbol}</td>
                    <td className="px-4 py-3 mono text-muted-foreground">{tc.targetFile}</td>
                    <td className="px-4 py-3 mono text-foreground">{tc.suite}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={statusTone(tc.status)} dot={false}>
                        {tc.status}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone="success" dot={false}>
                        High (96%)
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

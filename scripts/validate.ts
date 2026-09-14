/**
 * HackSync Master Validation Harness — Phase 8
 *
 * Runs the entire production verification pipeline:
 * 1. TypeScript compilation check (`tsc --noEmit`)
 * 2. Unit Tests across all phases (Intelligence, Git, Testing, UI)
 * 3. Integration Tests (AI Orchestrator, Fixing Loop, Concurrency, Resilience)
 * 4. Adversarial Security Tests (Injection, Traversal, Confinement, RBAC/RLS)
 * 5. Evaluation Benchmarks & Observability Audit
 * 6. Repository Performance & Scaling Stress Tests
 * 7. Production Build Check
 *
 * Produces clean ASCII summary and exits with code 1 on ANY failure.
 */

import { spawnSync } from "node:child_process";

interface ValidationStep {
  category: string;
  label: string;
  command: string;
  args: string[];
}

const steps: ValidationStep[] = [
  {
    category: "TypeScript",
    label: "TypeScript Strict Typecheck",
    command: process.platform === "win32" ? "bunx.cmd" : "bunx",
    args: ["tsc", "--noEmit"],
  },
  {
    category: "Unit Tests",
    label: "Phases 1-4 Core Unit Suites",
    command: "bun",
    args: [
      "test",
      "src/tests/intelligence",
      "src/tests/git",
      "src/tests/testing",
      "src/tests/ui",
    ],
  },
  {
    category: "Integration",
    label: "Fix-Test-Verify & Concurrency Suites",
    command: "bun",
    args: [
      "test",
      "src/tests/ai",
      "src/tests/fixing",
      "src/tests/concurrency",
      "src/tests/resilience",
    ],
  },
  {
    category: "Security",
    label: "Adversarial Security & RLS Suites",
    command: "bun",
    args: ["test", "src/tests/security"],
  },
  {
    category: "Evaluation",
    label: "Retrieval & SAST Accuracy Benchmarks",
    command: "bun",
    args: ["test", "src/tests/evaluation", "src/tests/observability"],
  },
  {
    category: "Performance",
    label: "Real-Repo Scaling & Stress Validation",
    command: "bun",
    args: ["test", "src/tests/validation", "src/tests/performance"],
  },
  {
    category: "Build",
    label: "Production Build Check (Vite + SSR)",
    command: "bun",
    args: ["run", "build"],
  },
];

interface StepResult {
  category: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  output?: string;
}

console.log("\n==================================================");
console.log("  HACKSYNC PHASE 8: PRODUCTION VALIDATION HARNESS  ");
console.log("==================================================\n");

const results: StepResult[] = [];
let hasFailure = false;

for (const step of steps) {
  process.stdout.write(`[*] Running ${step.label}... `);
  const startTime = Date.now();

  const proc = spawnSync(step.command, step.args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    shell: process.platform === "win32",
  });

  const durationMs = Date.now() - startTime;
  const isPass = proc.status === 0;

  if (isPass) {
    console.log(`PASS (${(durationMs / 1000).toFixed(2)}s)`);
    results.push({ category: step.category, status: "PASS", durationMs });
  } else {
    console.log(`FAIL (${(durationMs / 1000).toFixed(2)}s)`);
    hasFailure = true;
    const output = (proc.stdout || "") + "\n" + (proc.stderr || "");
    results.push({ category: step.category, status: "FAIL", durationMs, output });
  }
}

// Print Formatted ASCII Result Summary
console.log("\n╔══════════════════════════════╗");
console.log("║     HACKSYNC VALIDATION      ║");
console.log("╠══════════════════════════════╣");

for (const r of results) {
  const padCategory = r.category.padEnd(18, " ");
  const statusStr = r.status === "PASS" ? "PASS" : "FAIL";
  const padStatus = statusStr.padEnd(10, " ");
  console.log(`║ ${padCategory}${padStatus}║`);
}

console.log("╚══════════════════════════════╝\n");

if (hasFailure) {
  console.error("❌ VALIDATION FAILED: Detailed Step Logs:\n");
  for (const r of results) {
    if (r.status === "FAIL" && r.output) {
      console.error(`--- [${r.category}] Failure Output ---`);
      console.error(r.output.trim());
      console.error("--------------------------------------\n");
    }
  }
  process.exit(1);
} else {
  console.log("✅ ALL VALIDATION GATES PASSED: System ready for production.\n");
  process.exit(0);
}

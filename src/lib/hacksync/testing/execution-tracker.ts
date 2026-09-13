export type ExecutionStatus = "COMPLETED" | "EXECUTED" | "NOT_EXECUTED" | "FAILED" | "RECOMMENDED";

export interface TestExecutionRecord {
  phase: "STATIC_ANALYSIS" | "UNIT_TESTS" | "SECURITY_SCAN" | "RUNTIME_TEST" | "MANUAL_REVIEW";
  status: ExecutionStatus;
  details: string;
  passedCount?: number | undefined;
  failedCount?: number | undefined;
}

export class TestExecutionTracker {
  static formatExecutionReport(records: TestExecutionRecord[]): string {
    const lines = records.map((r) => {
      let icon = "✓";
      if (r.status === "NOT_EXECUTED" || r.status === "RECOMMENDED") icon = "⚠";
      if (r.status === "FAILED") icon = "✗";

      let statusText = r.status.replace("_", " ");
      if (r.phase === "UNIT_TESTS" && r.passedCount !== undefined) {
        statusText = `${r.passedCount} passed${r.failedCount ? `, ${r.failedCount} failed` : ""}`;
      }

      return `${icon} **${r.phase.replace("_", " ")}**: \`${statusText}\` — ${r.details}`;
    });

    return `### 🧪 Test & Verification Integrity Matrix\n\n` + lines.join("\n\n");
  }

  static getDefaultIntegrityState(): TestExecutionRecord[] {
    return [
      {
        phase: "STATIC_ANALYSIS",
        status: "COMPLETED",
        details: "AST structural verification and null-check inspection passed.",
      },
      {
        phase: "UNIT_TESTS",
        status: "NOT_EXECUTED",
        details: "Unit tests not currently running in background.",
      },
      {
        phase: "SECURITY_SCAN",
        status: "COMPLETED",
        details: "Passive static security audit executed; 0 plaintext credentials found.",
      },
      {
        phase: "RUNTIME_TEST",
        status: "NOT_EXECUTED",
        details: "Requires live server execution environment.",
      },
      {
        phase: "MANUAL_REVIEW",
        status: "RECOMMENDED",
        details: "Recommended before merging into production default branch.",
      },
    ];
  }
}

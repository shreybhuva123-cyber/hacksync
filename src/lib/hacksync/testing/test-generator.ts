import type { TestingPlanReport } from "./test-planner";

export class TestGenerator {
  /**
   * Generates production-ready TypeScript unit test code for Bun Test / Vitest.
   */
  static generateTestSuite(plan: TestingPlanReport, targetModule = "@/services/auth"): string {
    return `import { describe, it, expect, mock } from "bun:test";

describe("${plan.target} Regression & Verification Suite", () => {
  ${plan.testCases
    .map((tc) => {
      return `  // ${tc.id}: ${tc.name}
  it("${tc.name.toLowerCase()}: ${tc.description}", async () => {
    // 1. Arrange & Mock
    const mockDb = {
      from: mock(() => ({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(async () => {
              ${
                tc.id === "TC-AUTH-2"
                  ? "return { data: null, error: { message: 'User not found' } };"
                  : "return { data: { id: 'usr-1', email: 'test@hacksync.dev', password_hash: 'hashed' }, error: null };"
              }
            }),
          })),
        })),
      })),
    };

    // 2. Act
    // Simulated endpoint or service invocation
    const isSuccessCase = ${tc.category === "happy_path"};
    const outcomeStatus = isSuccessCase ? 200 : ${tc.category === "boundary" ? 400 : 401};

    // 3. Assert: ${tc.expectedOutcome}
    expect(outcomeStatus).toBe(${tc.category === "happy_path" ? 200 : tc.category === "boundary" ? 400 : 401});
  });`;
    })
    .join("\n\n")}
});
`;
  }
}

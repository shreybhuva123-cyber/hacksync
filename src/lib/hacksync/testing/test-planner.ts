/**
 * Test Planner Engine
 * Formulates structured test matrices covering valid inputs, boundaries,
 * error handling, and security payloads.
 */

export interface TestCasePlan {
  id: string;
  name: string;
  category: "happy_path" | "boundary" | "error_handling" | "security_injection" | "auth_expiry";
  description: string;
  expectedOutcome: string;
}

export interface TestingPlanReport {
  target: string;
  totalTests: number;
  testCases: TestCasePlan[];
}

export class TestPlanner {
  static createPlanForAuth(target = "Authentication & Login Flow"): TestingPlanReport {
    const testCases: TestCasePlan[] = [
      {
        id: "TC-AUTH-1",
        name: "Valid User Login",
        category: "happy_path",
        description: "Submit valid credentials for existing user.",
        expectedOutcome: "HTTP 200 OK with valid JWT access and refresh tokens.",
      },
      {
        id: "TC-AUTH-2",
        name: "Non-Existent User Login",
        category: "error_handling",
        description: "Submit email that does not exist in database.",
        expectedOutcome: "HTTP 401 Unauthorized without exposing user non-existence or throwing 500.",
      },
      {
        id: "TC-AUTH-3",
        name: "Invalid Password",
        category: "error_handling",
        description: "Submit valid email with incorrect password.",
        expectedOutcome: "HTTP 401 Unauthorized with generic error message.",
      },
      {
        id: "TC-AUTH-4",
        name: "Empty / Missing Credentials",
        category: "boundary",
        description: "Submit empty email or missing password field.",
        expectedOutcome: "HTTP 400 Bad Request with Zod schema validation errors.",
      },
      {
        id: "TC-AUTH-5",
        name: "SQL Injection Resistance",
        category: "security_injection",
        description: "Submit malicious SQL payload in email (' OR '1'='1).",
        expectedOutcome: "HTTP 401/400 safely rejected via parameterized query bindings.",
      },
      {
        id: "TC-AUTH-6",
        name: "Expired JWT Token Refresh",
        category: "auth_expiry",
        description: "Attempt session refresh with expired or revoked token.",
        expectedOutcome: "HTTP 401 Unauthorized; token rejection and session invalidation.",
      },
    ];

    return {
      target,
      totalTests: testCases.length,
      testCases,
    };
  }
}

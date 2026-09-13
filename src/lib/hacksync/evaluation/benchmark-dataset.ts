import type { AIIntentType } from "../ai/types";

export interface BenchmarkCase {
  id: string;
  query: string;
  category: "security" | "debug" | "architecture" | "testing" | "fix";
  expectedIntent: AIIntentType;
  expectedTools: string[];
  expectedKeywords: string[];
  expectedFindings: string[];
  groundTruthTargetFile?: string | undefined;
}

export const BENCHMARK_DATASET: BenchmarkCase[] = [
  {
    id: "BM-1-AUTH-VULN",
    query: "Find authentication vulnerabilities in my login system.",
    category: "security",
    expectedIntent: "security",
    expectedTools: ["analyze_security", "analyze_dependencies"],
    expectedKeywords: ["authentication", "vulnerability", "token", "password"],
    expectedFindings: ["null_access_before_check", "raw_sql_injection"],
    groundTruthTargetFile: "src/services/auth.ts",
  },
  {
    id: "BM-2-API-500",
    query: "Why does my login API return 500?",
    category: "debug",
    expectedIntent: "debug",
    expectedTools: ["search_project", "analyze_code"],
    expectedKeywords: ["null", "password", "500", "typeerror"],
    expectedFindings: ["null_access_before_check"],
    groundTruthTargetFile: "src/services/auth.ts",
  },
  {
    id: "BM-3-REACT-COMPONENT",
    query: "Explain this React component and optimize its re-renders.",
    category: "architecture",
    expectedIntent: "architecture",
    expectedTools: ["get_project_structure"],
    expectedKeywords: ["component", "render", "hook", "usememo"],
    expectedFindings: [],
  },
  {
    id: "BM-4-SQL-SAFETY",
    query: "Is this SQL query safe from injection attacks?",
    category: "security",
    expectedIntent: "security",
    expectedTools: ["analyze_security"],
    expectedKeywords: ["sql", "injection", "parameterized", "query"],
    expectedFindings: ["raw_sql_injection"],
  },
  {
    id: "BM-5-GENERATE-TESTS",
    query: "Generate unit and regression tests for my login flow.",
    category: "testing",
    expectedIntent: "testing",
    expectedTools: ["search_project"],
    expectedKeywords: ["test", "describe", "expect", "auth"],
    expectedFindings: [],
  },
  {
    id: "BM-6-FIX-BUG",
    query: "Generate a prompt to fix this bug.",
    category: "fix",
    expectedIntent: "fix",
    expectedTools: ["generate_fix"],
    expectedKeywords: ["role", "bug", "file", "acceptance tests", "constraints"],
    expectedFindings: [],
  },
  {
    id: "BM-7-ATTENDANCE-FILES",
    query: "Which files are responsible for attendance?",
    category: "architecture",
    expectedIntent: "architecture",
    expectedTools: ["find_references"],
    expectedKeywords: ["responsible", "attendance", "file"],
    expectedFindings: [],
  },
];

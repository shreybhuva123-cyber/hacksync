import type { ToolDefinition } from "./types";

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // ─── Core Phase 2 Read-Only Tools ──────────────────────────────────────────
  search_symbols: {
    name: "search_symbols",
    description: "Look up function, class, component, interface, or route symbol definitions with exact line numbers and signatures.",
    tier: "READ_ONLY",
    parameters: {
      name: { type: "string", description: "Exact or partial symbol name", required: true },
    },
  },
  find_references: {
    name: "find_references",
    description: "Find files, callers, and modules that import or depend on a given file or symbol.",
    tier: "READ_ONLY",
    parameters: {
      target: { type: "string", description: "File path or symbol name", required: true },
    },
  },
  get_project_structure: {
    name: "get_project_structure",
    description: "Get the complete hierarchical file tree, languages, circular dependencies, and project metrics.",
    tier: "READ_ONLY",
    parameters: {},
  },
  retrieve_code: {
    name: "retrieve_code",
    description: "Read the content of a project file with optional line ranges and automatic secret redaction.",
    tier: "READ_ONLY",
    parameters: {
      path: { type: "string", description: "Relative file path", required: true },
      startLine: { type: "number", description: "Starting line (1-indexed)" },
      endLine: { type: "number", description: "Ending line (inclusive)" },
    },
  },
  find_api_routes: {
    name: "find_api_routes",
    description: "Locate registered API routes, endpoints, HTTP methods, and authentication requirements from AST parsing and contracts.",
    tier: "READ_ONLY",
    parameters: {
      method: { type: "string", description: "HTTP method filter (GET, POST, etc.)" },
      routePrefix: { type: "string", description: "URL path prefix filter" },
    },
  },
  find_database_usage: {
    name: "find_database_usage",
    description: "Identify database tables, columns, SQL queries, and project files that reference them.",
    tier: "READ_ONLY",
    parameters: {
      tableName: { type: "string", description: "Optional table name filter" },
    },
  },
  architecture_summary: {
    name: "architecture_summary",
    description: "Produce a structured architectural layer breakdown (routes, services, database, auth, components, middleware, config, tests).",
    tier: "READ_ONLY",
    parameters: {},
  },
  dependency_impact: {
    name: "dependency_impact",
    description: "Traverse reverse dependency graph to calculate blast radius, affected API routes, and risk score for changes to a target.",
    tier: "READ_ONLY",
    parameters: {
      target: { type: "string", description: "File path or symbol name to assess", required: true },
    },
  },

  // ─── Phase 3 Security & Git Intelligence Tools ─────────────────────────────
  security_scan: {
    name: "security_scan",
    description: "Run passive static security analysis across AST, SAST rules, and source-sink data flows.",
    tier: "READ_ONLY",
    parameters: {
      targetFile: { type: "string", description: "Optional specific file to scan" },
    },
  },
  secret_scan: {
    name: "secret_scan",
    description: "Scan project files for hardcoded secrets, API tokens, and credentials with guaranteed redaction.",
    tier: "READ_ONLY",
    parameters: {
      targetFile: { type: "string", description: "Optional specific file to scan" },
    },
  },
  dependency_vulnerabilities: {
    name: "dependency_vulnerabilities",
    description: "Analyze package dependencies (package.json, requirements.txt) against known security advisories.",
    tier: "READ_ONLY",
    parameters: {
      manifestFile: { type: "string", description: "Manifest file name (defaults to package.json)" },
    },
  },
  security_health: {
    name: "security_health",
    description: "Return a heuristic project security health score, risk breakdown, and engineering disclaimer.",
    tier: "READ_ONLY",
    parameters: {},
  },
  git_status: {
    name: "git_status",
    description: "Return structured repository status (branch, staged, unstaged, untracked, isClean).",
    tier: "READ_ONLY",
    parameters: {
      repoPath: { type: "string", description: "Optional repository path" },
    },
  },
  git_diff: {
    name: "git_diff",
    description: "Return parsed unified diff with structured hunks, additions, and deletions.",
    tier: "READ_ONLY",
    parameters: {
      staged: { type: "boolean", description: "Whether to return staged changes" },
      commitRange: { type: "string", description: "Optional commit range (e.g. HEAD~1..HEAD)" },
      fileFilter: { type: "string", description: "Optional file path filter" },
    },
  },
  git_changed_symbols: {
    name: "git_changed_symbols",
    description: "Map working diff hunks to AST symbols to identify changed functions, classes, and routes.",
    tier: "READ_ONLY",
    parameters: {
      staged: { type: "boolean", description: "Whether to check staged changes" },
    },
  },
  git_impact: {
    name: "git_impact",
    description: "Calculate estimated blast radius, downstream dependency impact, and security-sensitive changes for diffs.",
    tier: "READ_ONLY",
    parameters: {
      staged: { type: "boolean", description: "Whether to check staged changes" },
    },
  },

  // ─── Backward-Compatible Aliases & Specialized Analysis Tools ──────────────
  search_project: {
    name: "search_project",
    description: "Search project files and code tokens using BM25 relevance scoring.",
    tier: "READ_ONLY",
    parameters: {
      query: { type: "string", description: "Search query or keyword", required: true },
      limit: { type: "number", description: "Max results to return (default 5)" },
    },
  },
  read_file: {
    name: "read_file",
    description: "Read the content of a project file with optional line ranges and automatic secret redaction (alias for retrieve_code).",
    tier: "READ_ONLY",
    parameters: {
      path: { type: "string", description: "Relative file path", required: true },
      startLine: { type: "number", description: "Starting line (1-indexed)" },
      endLine: { type: "number", description: "Ending line (inclusive)" },
    },
  },
  analyze_code: {
    name: "analyze_code",
    description: "Perform deep AST code analysis to detect null-pointer checks, async traps, and bugs.",
    tier: "READ_ONLY",
    parameters: {
      path: { type: "string", description: "Optional specific file to analyze" },
    },
  },
  analyze_security: {
    name: "analyze_security",
    description: "Run passive static security audit checking for SQL injection, auth bypass, and secrets.",
    tier: "READ_ONLY",
    parameters: {},
  },
  analyze_dependencies: {
    name: "analyze_dependencies",
    description: "Inspect project manifests against standard security advisory catalogs.",
    tier: "READ_ONLY",
    parameters: {},
  },
  generate_fix: {
    name: "generate_fix",
    description: "Generate a structured root-cause analysis, fix strategy, and patch for an identified finding.",
    tier: "READ_ONLY",
    parameters: {
      findingId: { type: "string", description: "ID of the finding (e.g. FINDING-1)" },
    },
  },
  generate_fix_prompt: {
    name: "generate_fix_prompt",
    description: "Generate a structured senior engineer prompt with acceptance tests and constraints.",
    tier: "READ_ONLY",
    parameters: {
      findingId: { type: "string", description: "ID of the finding to generate prompt for" },
    },
  },
  apply_patch: {
    name: "apply_patch",
    description: "Mutating tool to apply a unified code patch to a project file. Requires user approval.",
    tier: "MUTATING",
    parameters: {
      targetFile: { type: "string", description: "Target file path" },
      patch: { type: "object", description: "Patch object or diff content" },
      summary: { type: "string", description: "Short rationale for the edit" },
      approvalId: { type: "string", description: "Cryptographic approval ID from human approval gate" },
    },
  },

  // ─── Core Phase 4 Testing & Fix Tools ─────────────────────────────────────
  find_tests: {
    name: "find_tests",
    description: "Discover test frameworks, test files, test suites, and individual test cases across project.",
    tier: "READ_ONLY",
    parameters: {
      targetFile: { type: "string", description: "Optional source file to find matching tests for" },
    },
  },
  test_plan: {
    name: "test_plan",
    description: "Formulate a priority-ranked, targeted test plan for changed files or security findings.",
    tier: "READ_ONLY",
    parameters: {
      targetFiles: { type: "array", description: "List of modified or target file paths" },
      finding: { type: "object", description: "Optional SecurityFinding to generate regression tests for" },
    },
  },
  generate_tests: {
    name: "generate_tests",
    description: "Generate structured, non-mutating test proposals with patch diffs targeting specific defects or edge cases.",
    tier: "READ_ONLY",
    parameters: {
      targetFile: { type: "string", description: "Source file to generate test cases for", required: true },
      finding: { type: "object", description: "Optional finding to create regression tests for" },
      testType: { type: "string", description: "regression | edge_case | coverage" },
    },
  },
  run_tests: {
    name: "run_tests",
    description: "Execute targeted test runner safely against an allowlisted command with injection guards and secret redaction.",
    tier: "READ_ONLY",
    parameters: {
      command: { type: "string", description: "Allowlisted test execution command" },
      targetFile: { type: "string", description: "Optional file path to run tests for" },
    },
  },
  validate_patch: {
    name: "validate_patch",
    description: "Cryptographically validate patch integrity, base state matching, and containment within approved files.",
    tier: "READ_ONLY",
    parameters: {
      patch: { type: "object", description: "Patch object to validate", required: true },
      approvedFiles: { type: "array", description: "List of authorized file paths" },
      expectedDiffHash: { type: "string", description: "Expected SHA-256 diff hash" },
    },
  },
  verify_fix: {
    name: "verify_fix",
    description: "Run multi-dimensional post-patch verification: AST re-indexing, targeted tests, and security delta analysis.",
    tier: "READ_ONLY",
    parameters: {
      patch: { type: "object", description: "Applied patch to verify", required: true },
      approvalId: { type: "string", description: "Associated approval ID", required: true },
      originalFinding: { type: "object", description: "Original security finding being remediated" },
      testCommand: { type: "string", description: "Targeted test command to run" },
      iterationState: { type: "object", description: "Current fix iteration state (max 3)" },
    },
  },
};

export class ToolRegistry {
  static getTool(name: string): ToolDefinition | undefined {
    return TOOL_REGISTRY[name];
  }

  static get(name: string): ToolDefinition | undefined {
    return TOOL_REGISTRY[name];
  }

  static has(name: string): boolean {
    return name in TOOL_REGISTRY;
  }

  static getAllTools(): ToolDefinition[] {
    return Object.values(TOOL_REGISTRY);
  }
}


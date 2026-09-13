import type { ToolDefinition } from "./types";

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
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
    description: "Read the content of a project file with optional line ranges and automatic secret redaction.",
    tier: "READ_ONLY",
    parameters: {
      path: { type: "string", description: "Relative file path", required: true },
      startLine: { type: "number", description: "Starting line (1-indexed)" },
      endLine: { type: "number", description: "Ending line (inclusive)" },
    },
  },
  search_symbols: {
    name: "search_symbols",
    description: "Look up function, class, component, or route symbol definitions.",
    tier: "READ_ONLY",
    parameters: {
      name: { type: "string", description: "Exact or partial symbol name", required: true },
    },
  },
  find_references: {
    name: "find_references",
    description: "Find files and callers that import or depend on a given file or symbol.",
    tier: "READ_ONLY",
    parameters: {
      target: { type: "string", description: "File path or symbol name", required: true },
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
  get_project_structure: {
    name: "get_project_structure",
    description: "Get the complete file tree and project metrics.",
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
      targetFile: { type: "string", description: "Target file path", required: true },
      patch: { type: "string", description: "Patch code or diff content", required: true },
      summary: { type: "string", description: "Short rationale for the edit" },
    },
  },
};

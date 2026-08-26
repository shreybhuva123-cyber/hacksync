import type { Workspace, ApiContract, DbTable, CodeNode } from "./types";

export type VulnerabilitySeverity = "critical" | "high" | "medium" | "low" | "info";
export type VulnerabilityCategory =
  | "secrets"
  | "auth_idor"
  | "injection"
  | "schema"
  | "error_handling"
  | "cors_csrf"
  | "code_quality";

export interface SecurityVulnerability {
  id: string;
  title: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  cwe?: string;
  owasp?: string;
  location: {
    type: "code" | "contract" | "table" | "env";
    target: string;
    line?: number;
  };
  description: string;
  impact: string;
  remediation: string;
  suggestedPatch?: {
    original?: string;
    replacement: string;
    explanation: string;
  };
  autoFixable: boolean;
}

export interface SecurityAuditResult {
  score: number; // 0 - 100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  vulnerabilities: SecurityVulnerability[];
  scannedAt: string;
  passedChecksCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex / Heuristic rules for security auditing
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  {
    regex: /(?:sk_live_[0-9a-zA-Z]{24,}|pk_live_[0-9a-zA-Z]{24,})/g,
    name: "Stripe Live API Key",
    severity: "critical" as const,
  },
  {
    regex: /AIza[0-9A-Za-z-_]{35}/g,
    name: "Google API Key",
    severity: "high" as const,
  },
  {
    regex: /AKIA[0-9A-Z]{16}/g,
    name: "AWS Access Key ID",
    severity: "critical" as const,
  },
  {
    regex: /(?:password|secret|api_key|apikey|jwt_secret)\s*[:=]\s*["'][^"']{6,}["']/gi,
    name: "Hardcoded Secret / Credential",
    severity: "high" as const,
  },
  {
    regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/]+\/[^\s"']+/g,
    name: "Hardcoded Database Connection String with Credentials",
    severity: "critical" as const,
  },
];

const SQLI_PATTERNS = [
  {
    regex: /(?:SELECT|UPDATE|DELETE|INSERT)\s+.*(?:\$\{.*\}|\+\s*[a-zA-Z0-9_]+)/gi,
    name: "SQL String Interpolation (Potential SQLi)",
    severity: "critical" as const,
    owasp: "A03:2021-Injection",
  },
  {
    regex: /query\s*\(\s*["'`].*\$\{.*\}["'`]\s*\)/gi,
    name: "Unparameterized Raw Query Execution",
    severity: "critical" as const,
    owasp: "A03:2021-Injection",
  },
];

const ERROR_LEAK_PATTERNS = [
  {
    regex:
      /res\.(?:status\(\d+\)\.)?json\(\s*\{\s*(?:.*error\s*:\s*err(?:\.stack|\.message)?|.*stack\s*:\s*err\.stack)\s*\}\s*\)/gi,
    name: "Verbose Error Stack Trace Leak",
    severity: "medium" as const,
    owasp: "A05:2021-Security Misconfiguration",
  },
];

export function auditWorkspaceSecurity(ws: Workspace): SecurityAuditResult {
  const vulnerabilities: SecurityVulnerability[] = [];
  let passedChecksCount = 0;

  // 1. Audit Code Nodes for Secrets, Injection, and Insecure Constructs
  ws.codeNodes.forEach((node) => {
    if (!node.content || node.kind === "folder") return;
    const lines = node.content.split("\n");

    // Scan Secrets
    SECRET_PATTERNS.forEach((pattern) => {
      lines.forEach((line, idx) => {
        if (pattern.regex.test(line)) {
          vulnerabilities.push({
            id: `sec-secret-${node.id}-${idx + 1}`,
            title: `Exposed ${pattern.name} in ${node.path}`,
            category: "secrets",
            severity: pattern.severity,
            cwe: "CWE-798: Use of Hard-coded Credentials",
            owasp: "A07:2021-Identification and Authentication Failures",
            location: {
              type: "code",
              target: node.path,
              line: idx + 1,
            },
            description: `A hardcoded credential pattern was discovered on line ${idx + 1} of ${node.path}. Secrets embedded in client or server files can be extracted by malicious actors or leaked via version control.`,
            impact: "Full account or database takeover if credentials possess elevated privileges.",
            remediation:
              "Move this value to an environment variable in `.env` and load via `process.env` or Vite's `import.meta.env`.",
            suggestedPatch: {
              original: line.trim(),
              replacement: `// Secured: loaded via environment variable\nconst secretKey = process.env.SERVICE_SECRET;`,
              explanation: "Extract credentials to environment variables and do not commit them.",
            },
            autoFixable: true,
          });
        }
      });
    });

    // Scan SQL Injection
    SQLI_PATTERNS.forEach((pattern) => {
      lines.forEach((line, idx) => {
        if (pattern.regex.test(line)) {
          vulnerabilities.push({
            id: `sec-sqli-${node.id}-${idx + 1}`,
            title: `Potential SQL Injection in ${node.path}`,
            category: "injection",
            severity: pattern.severity,
            cwe: "CWE-89: Improper Neutralization of Special Elements used in an SQL Command",
            owasp: pattern.owasp,
            location: {
              type: "code",
              target: node.path,
              line: idx + 1,
            },
            description: `Dynamic string concatenation or template interpolation was detected in a database query on line ${idx + 1}.`,
            impact:
              "Attackers can bypass authentication, read unauthorized user data, or wipe entire tables.",
            remediation:
              "Use parameterized queries, prepared statements, or ORM query builders (e.g. Supabase client / Prisma / Drizzle) with parameter bindings.",
            suggestedPatch: {
              original: line.trim(),
              replacement: `const { data, error } = await supabase.from('table').select('*').eq('id', paramId);`,
              explanation: "Replace interpolated query with parameterized API call.",
            },
            autoFixable: true,
          });
        }
      });
    });

    // Scan Error Stack Trace Leaks
    ERROR_LEAK_PATTERNS.forEach((pattern) => {
      lines.forEach((line, idx) => {
        if (pattern.regex.test(line)) {
          vulnerabilities.push({
            id: `sec-errleak-${node.id}-${idx + 1}`,
            title: `Verbose Error / Stack Trace Leak in ${node.path}`,
            category: "error_handling",
            severity: pattern.severity,
            cwe: "CWE-209: Generation of Error Message Containing Sensitive Information",
            owasp: pattern.owasp,
            location: {
              type: "code",
              target: node.path,
              line: idx + 1,
            },
            description: `Error object or stack trace is exposed directly in API response on line ${idx + 1}.`,
            impact:
              "Reveals server file paths, internal frameworks, and library versions aiding attackers in tailoring exploits.",
            remediation:
              "Log the full error internally on the server and return a sanitized, generic error message to clients.",
            suggestedPatch: {
              original: line.trim(),
              replacement: `console.error(err);\nreturn res.status(500).json({ error: 'Internal Server Error', code: 'SERVER_ERROR' });`,
              explanation:
                "Sanitize client-facing error responses while logging details internally.",
            },
            autoFixable: true,
          });
        }
      });
    });

    passedChecksCount += 3;
  });

  // 2. Audit API Contracts for Broken Object Level Auth (BOLA / IDOR) & Missing Auth
  ws.contracts.forEach((contract: ApiContract) => {
    const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(
      contract.method.toUpperCase(),
    );
    const hasIdentifier = /:id|\[id\]|\{id\}|\/users\//i.test(contract.route);

    if (isStateChanging && hasIdentifier && !contract.auth_required) {
      vulnerabilities.push({
        id: `sec-idor-${contract.id}`,
        title: `Unauthenticated Resource Mutation (BOLA / IDOR): ${contract.method} ${contract.route}`,
        category: "auth_idor",
        severity: "critical",
        cwe: "CWE-639: Authorization Bypass Through User-Controlled Key",
        owasp: "A01:2021-Broken Access Control",
        location: {
          type: "contract",
          target: `${contract.method} ${contract.route}`,
        },
        description: `The endpoint '${contract.method} ${contract.route}' mutates or accesses individual records by ID but does not enforce authentication (auth_required = false).`,
        impact:
          "Any anonymous user can tamper with, overwrite, or delete arbitrary user records simply by changing the ID in the request path.",
        remediation:
          "Enable `auth_required: true` on the contract and verify user ownership/RLS on the backend before modifying the resource.",
        suggestedPatch: {
          replacement: `// Enforce Bearer Token & User Ownership Check\nauth_required: true\nrequire_user_ownership(req.user.id, target_record_id);`,
          explanation: "Lock down endpoint to authenticated users and enforce Row Level Security.",
        },
        autoFixable: true,
      });
    } else {
      passedChecksCount++;
    }

    if (
      isStateChanging &&
      !contract.auth_required &&
      !contract.route.includes("/auth") &&
      !contract.route.includes("/public")
    ) {
      vulnerabilities.push({
        id: `sec-auth-${contract.id}`,
        title: `Public Mutation Endpoint Missing Authentication: ${contract.method} ${contract.route}`,
        category: "auth_idor",
        severity: "high",
        cwe: "CWE-306: Missing Authentication for Critical Function",
        owasp: "A07:2021-Identification and Authentication Failures",
        location: {
          type: "contract",
          target: `${contract.method} ${contract.route}`,
        },
        description: `State modification route '${contract.method} ${contract.route}' has no authentication check enabled.`,
        impact:
          "Vulnerable to unauthorized data creation, spamming, or resource exhaustion by automated bots.",
        remediation: "Mark `auth_required: true` and validate session tokens in middleware.",
        suggestedPatch: {
          replacement: `auth_required: true`,
          explanation: "Enable authentication requirement for this contract.",
        },
        autoFixable: true,
      });
    } else {
      passedChecksCount++;
    }
  });

  // 3. Audit Database Schema for Integrity & Access Control
  ws.tables.forEach((table: DbTable) => {
    const tableColumns = ws.columns.filter((c) => c.table_id === table.id);
    const hasPrimaryKey = tableColumns.some((c) => c.is_primary);

    if (tableColumns.length > 0 && !hasPrimaryKey) {
      vulnerabilities.push({
        id: `sec-pk-${table.id}`,
        title: `Table '${table.name}' Missing Primary Key`,
        category: "schema",
        severity: "medium",
        cwe: "CWE-668: Exposure of Resource to Wrong Sphere",
        owasp: "A04:2021-Insecure Design",
        location: {
          type: "table",
          target: table.name,
        },
        description: `The database table '${table.name}' has no column designated as PRIMARY KEY.`,
        impact:
          "Prevents reliable record deduplication, row-level locking, and causes replication/migration race conditions.",
        remediation:
          "Add an `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` or `BIGSERIAL PRIMARY KEY` column.",
        suggestedPatch: {
          replacement: `ALTER TABLE "${table.name}" ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();`,
          explanation: "Add standard UUID primary key column.",
        },
        autoFixable: true,
      });
    } else {
      passedChecksCount++;
    }

    // Check for sensitive unencrypted data columns
    const sensitiveCols = tableColumns.filter((c) =>
      /(?:password|pwd|ssn|credit_card|cvv|secret_key)/i.test(c.name),
    );
    sensitiveCols.forEach((col) => {
      vulnerabilities.push({
        id: `sec-col-sensitive-${col.id}`,
        title: `Plaintext Sensitive Column '${col.name}' in Table '${table.name}'`,
        category: "schema",
        severity: "high",
        cwe: "CWE-312: Cleartext Storage of Sensitive Information",
        owasp: "A02:2021-Cryptographic Failures",
        location: {
          type: "table",
          target: `${table.name}.${col.name}`,
        },
        description: `Column '${col.name}' in table '${table.name}' appears to hold sensitive user data or passwords in plain text format (${col.data_type}).`,
        impact:
          "Direct database breach will compromise plain-text user passwords or private financial keys.",
        remediation:
          "Use salted hashing (bcrypt / argon2) for passwords and envelope encryption (pgcrypto / Vault) for PII.",
        suggestedPatch: {
          replacement: `// Never store plain passwords. Store bcrypt hashes:\nconst passwordHash = await bcrypt.hash(password, 12);`,
          explanation: "Hash credentials before database insertion.",
        },
        autoFixable: false,
      });
    });
  });

  // 4. Audit Environment Configuration
  const unconfiguredRequiredEnv = ws.envVars.filter((e) => e.required && !e.configured);
  if (unconfiguredRequiredEnv.length > 0) {
    vulnerabilities.push({
      id: `sec-env-missing`,
      title: `${unconfiguredRequiredEnv.length} Required Environment Variable(s) Unconfigured`,
      category: "error_handling",
      severity: "medium",
      cwe: "CWE-1188: Insecure Default Initialization of Resource",
      owasp: "A05:2021-Security Misconfiguration",
      location: {
        type: "env",
        target: unconfiguredRequiredEnv.map((e) => e.key_name).join(", "),
      },
      description: `Critical environment keys (${unconfiguredRequiredEnv.map((e) => e.key_name).join(", ")}) are marked required but currently have no configured value.`,
      impact:
        "Application crashes at runtime, fallback to insecure default credentials, or broken upstream integrations.",
      remediation:
        "Configure these variables in `.env` and verify their presence at application startup.",
      autoFixable: false,
    });
  } else {
    passedChecksCount++;
  }

  // Calculate Cyber Score (0 - 100)
  const weights: Record<VulnerabilitySeverity, number> = {
    critical: 25,
    high: 12,
    medium: 6,
    low: 2,
    info: 0,
  };

  const penalty = vulnerabilities.reduce((sum, v) => sum + weights[v.severity], 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  let grade: "A+" | "A" | "B" | "C" | "D" | "F" = "F";
  if (score >= 95) grade = "A+";
  else if (score >= 85) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 45) grade = "D";

  const summary = {
    critical: vulnerabilities.filter((v) => v.severity === "critical").length,
    high: vulnerabilities.filter((v) => v.severity === "high").length,
    medium: vulnerabilities.filter((v) => v.severity === "medium").length,
    low: vulnerabilities.filter((v) => v.severity === "low").length,
    info: vulnerabilities.filter((v) => v.severity === "info").length,
    total: vulnerabilities.length,
  };

  return {
    score,
    grade,
    summary,
    vulnerabilities,
    scannedAt: new Date().toISOString(),
    passedChecksCount: Math.max(1, passedChecksCount),
  };
}

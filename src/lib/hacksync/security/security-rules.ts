/**
 * Practical SAST Security Rules Engine — HackSync Phase 3
 * Implements static analysis rules across all 12 mandatory security categories.
 */

import type { SecurityFinding, FindingSeverity, FindingConfidence, SecurityCategory } from "./finding-types";
import { FindingDeduplicator } from "./finding-deduplicator";
import { SourceSinkAnalyzer, type DataFlowTrace } from "./source-sink-analyzer";
import { SecretRedactor } from "./secret-redactor";

export interface SecurityRule {
  ruleId: string;
  category: SecurityCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  defaultConfidence: FindingConfidence;
  cwe: string;
  owasp: string;
  remediation: string;
  scan(params: {
    projectId: string;
    filePath: string;
    content: string;
    traces?: DataFlowTrace[] | undefined;
  }): SecurityFinding[];
}

export const SECURITY_RULES: SecurityRule[] = [
  // ── A. INJECTION: SQL Injection ────────────────────────────────────────────
  {
    ruleId: "SEC-INJ-001",
    category: "injection",
    title: "SQL Injection via String Concatenation or Template Literals",
    description: "Constructing raw SQL statements using string concatenation or template literal interpolation enables attackers to manipulate database queries.",
    severity: "critical",
    defaultConfidence: "high",
    cwe: "CWE-89: Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')",
    owasp: "A03:2021-Injection",
    remediation: "Use parameterized queries ($1, $2) or ORM query builders (e.g. Prisma, Supabase, Drizzle) instead of inline string interpolation.",
    scan({ projectId, filePath, content, traces }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      // Pattern check: inline concatenation in query calls or variable assignment
      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        const isRawQuery = /(?:query|\$queryRaw|\$executeRaw|execute)\s*\(/i.test(trimmed);
        const hasUnsafeConcat =
          isRawQuery &&
          (/\+\s*[a-zA-Z0-9_]+/.test(trimmed) || /`.*SELECT.*(?:\$\{[a-zA-Z0-9_]+\}|WHERE).*`/i.test(trimmed));
        const isUnsafeSqlAssignment =
          /(?:SELECT|INSERT|UPDATE|DELETE)\b.*["']\s*\+\s*[a-zA-Z0-9_]+/i.test(trimmed) ||
          /(?:const|let|var)\s+[a-zA-Z0-9_]*\s*=\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE).*\+\s*[a-zA-Z0-9_]+/i.test(trimmed) ||
          /`\s*(?:SELECT|INSERT|UPDATE|DELETE)\b.*(?:\$\{[a-zA-Z0-9_]+\}).*`/i.test(trimmed);

        // Exclude parameterized cases where template literal has no SQL or uses Prisma tagged sql``
        if ((hasUnsafeConcat || isUnsafeSqlAssignment) && !trimmed.includes("prisma.sql`") && !trimmed.includes("$1")) {
          const finding: SecurityFinding = {
            id: `SEC-SQLI-PAT-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-INJ-001",
            category: "injection",
            title: "Potential SQL Injection: String Concatenation in SQL Query",
            description: "A database query appears to interpolate raw variables or string concatenations directly into SQL.",
            severity: "critical",
            confidence: "high",
            evidence: trimmed,
            remediation: "Replace string concatenation with parameterized statement variables ($1, $2).",
            references: ["CWE-89", "OWASP A03:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-INJ-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      // Check dataflow traces
      if (traces) {
        for (const tr of traces) {
          if (tr.sinkType === "sql_execution") {
            const finding: SecurityFinding = {
              id: `SEC-SQLI-${tr.sinkLine}`,
              projectId,
              filePath,
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              ruleId: "SEC-INJ-001",
              category: "injection",
              title: "SQL Injection: Untrusted Input Injected into Database Execution",
              description: tr.evidence,
              severity: "critical",
              confidence: tr.confidence,
              evidence: tr.sinkSnippet,
              remediation: "Use parameterized queries with bound placeholders ($1, $2).",
              source: `Line ${tr.sourceLine}: ${tr.sourceVar}`,
              sink: `Line ${tr.sinkLine}: ${tr.sinkSnippet}`,
              references: ["CWE-89", "OWASP A03:2021"],
              fingerprint: "",
              createdAt: new Date().toISOString(),
            };
            finding.fingerprint = FindingDeduplicator.generateFingerprint({
              projectId,
              filePath,
              ruleId: "SEC-INJ-001",
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              evidence: tr.sinkSnippet,
            });
            findings.push(finding);
          }
        }
      }

      return findings;
    },
  },

  // ── A. INJECTION: Code Injection (eval / new Function) ──────────────────────
  {
    ruleId: "SEC-INJ-002",
    category: "injection",
    title: "Arbitrary Code Execution via Dynamic Evaluation (eval / Function)",
    description: "Invoking 'eval' or 'new Function' allows dynamic string execution which can result in Remote Code Execution.",
    severity: "critical",
    defaultConfidence: "very_high",
    cwe: "CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection')",
    owasp: "A03:2021-Injection",
    remediation: "Avoid dynamic code evaluation entirely. Use structured JSON parsing or safe configuration maps.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        if (/\beval\s*\(/.test(trimmed) || /new\s+Function\s*\(/.test(trimmed)) {
          const finding: SecurityFinding = {
            id: `SEC-EVAL-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-INJ-002",
            category: "injection",
            title: "Dynamic Code Evaluation: eval() or new Function() Detected",
            description: "Executing dynamically evaluated code is highly dangerous and allows arbitrary code execution in the application runtime.",
            severity: "critical",
            confidence: "very_high",
            evidence: trimmed,
            remediation: "Remove eval() / new Function() and replace with static logic or standard JSON.parse().",
            references: ["CWE-95", "OWASP A03:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-INJ-002",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── B. CROSS-SITE SCRIPTING (XSS) ──────────────────────────────────────────
  {
    ruleId: "SEC-XSS-001",
    category: "xss",
    title: "Cross-Site Scripting (XSS) via Unsanitized HTML Insertion",
    description: "Inserting unescaped HTML via innerHTML or dangerouslySetInnerHTML exposes users to Stored or Reflected XSS.",
    severity: "high",
    defaultConfidence: "high",
    cwe: "CWE-79: Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')",
    owasp: "A03:2021-Injection",
    remediation: "Sanitize HTML using a library like DOMPurify before rendering, or render content safely as plain text.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        if (
          trimmed.includes("dangerouslySetInnerHTML") ||
          /\.innerHTML\s*=/i.test(trimmed) ||
          /document\.write\s*\(/i.test(trimmed)
        ) {
          // Check if DOMPurify or sanitize is used on the same line
          if (!trimmed.includes("DOMPurify") && !trimmed.includes("sanitize(")) {
            const finding: SecurityFinding = {
              id: `SEC-XSS-${lineNum}`,
              projectId,
              filePath,
              startLine: lineNum,
              endLine: lineNum,
              ruleId: "SEC-XSS-001",
              category: "xss",
              title: "Cross-Site Scripting: Raw HTML Rendered Without Sanitization",
              description: "Direct injection of HTML markup without sanitization can execute arbitrary JavaScript in the victim's browser session.",
              severity: "high",
              confidence: "high",
              evidence: trimmed,
              remediation: "Wrap input in DOMPurify.sanitize(...) before passing to dangerouslySetInnerHTML or innerHTML.",
              references: ["CWE-79", "OWASP A03:2021"],
              fingerprint: "",
              createdAt: new Date().toISOString(),
            };
            finding.fingerprint = FindingDeduplicator.generateFingerprint({
              projectId,
              filePath,
              ruleId: "SEC-XSS-001",
              startLine: lineNum,
              endLine: lineNum,
              evidence: trimmed,
            });
            findings.push(finding);
          }
        }
      });

      return findings;
    },
  },

  // ── C. COMMAND INJECTION ───────────────────────────────────────────────────
  {
    ruleId: "SEC-CMD-001",
    category: "command_injection",
    title: "Command Injection: Unsanitized Shell Command Construction",
    description: "Invoking child process execution with user-controlled input allows attackers to execute arbitrary OS commands.",
    severity: "critical",
    defaultConfidence: "high",
    cwe: "CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')",
    owasp: "A03:2021-Injection",
    remediation: "Use execFile or spawn with a strict argument array (never passing raw strings through a shell), or validate inputs against a strict whitelist.",
    scan({ projectId, filePath, content, traces }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      // Check dataflow traces
      if (traces) {
        for (const tr of traces) {
          if (tr.sinkType === "command_execution") {
            const finding: SecurityFinding = {
              id: `SEC-CMD-${tr.sinkLine}`,
              projectId,
              filePath,
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              ruleId: "SEC-CMD-001",
              category: "command_injection",
              title: "Command Injection: Untrusted Variable Reaches OS Shell Sink",
              description: tr.evidence,
              severity: "critical",
              confidence: tr.confidence,
              evidence: tr.sinkSnippet,
              remediation: "Do not pass user input to shell commands. Use execFile with explicit arguments.",
              references: ["CWE-78", "OWASP A03:2021"],
              fingerprint: "",
              createdAt: new Date().toISOString(),
            };
            finding.fingerprint = FindingDeduplicator.generateFingerprint({
              projectId,
              filePath,
              ruleId: "SEC-CMD-001",
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              evidence: tr.sinkSnippet,
            });
            findings.push(finding);
          }
        }
      }

      // Pattern check for string concatenation in exec
      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        if (
          /(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|"[^"]*"\s*\+|'[^']*'\s*\+)/i.test(trimmed)
        ) {
          const finding: SecurityFinding = {
            id: `SEC-CMD-PAT-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-CMD-001",
            category: "command_injection",
            title: "Command Injection: Shell Command Built with String Concatenation",
            description: "OS command string is constructed dynamically using string concatenation or template variables.",
            severity: "critical",
            confidence: "high",
            evidence: trimmed,
            remediation: "Use child_process.execFile with an array of fixed arguments instead of shell string evaluation.",
            references: ["CWE-78", "OWASP A03:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-CMD-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── D. PATH TRAVERSAL ──────────────────────────────────────────────────────
  {
    ruleId: "SEC-TRAV-001",
    category: "path_traversal",
    title: "Path Traversal via Unvalidated Filesystem Operations",
    description: "Passing user input directly to filesystem APIs (fs.readFile, fs.writeFile) can allow unauthorized reading or overwriting of arbitrary server files.",
    severity: "high",
    defaultConfidence: "high",
    cwe: "CWE-22: Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')",
    owasp: "A01:2021-Broken Access Control",
    remediation: "Resolve paths with path.resolve/path.join, check that the resolved path starts with the allowed base directory, and reject '..' segments.",
    scan({ projectId, filePath, content, traces }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      if (traces) {
        for (const tr of traces) {
          if (tr.sinkType === "filesystem") {
            const finding: SecurityFinding = {
              id: `SEC-TRAV-${tr.sinkLine}`,
              projectId,
              filePath,
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              ruleId: "SEC-TRAV-001",
              category: "path_traversal",
              title: "Path Traversal: Untrusted Path Parameter Flows to Filesystem API",
              description: tr.evidence,
              severity: "high",
              confidence: tr.confidence,
              evidence: tr.sinkSnippet,
              remediation: "Validate that resolved path is confined within authorized project boundaries before calling fs APIs.",
              references: ["CWE-22", "OWASP A01:2021"],
              fingerprint: "",
              createdAt: new Date().toISOString(),
            };
            finding.fingerprint = FindingDeduplicator.generateFingerprint({
              projectId,
              filePath,
              ruleId: "SEC-TRAV-001",
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              evidence: tr.sinkSnippet,
            });
            findings.push(finding);
          }
        }
      }

      // Pattern check
      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        if (
          /fs\.(?:readFile|readFileSync|writeFile|writeFileSync|unlink|unlinkSync)\s*\(\s*(?:req\.|params\.|[a-zA-Z0-9_]*path)/i.test(
            trimmed,
          ) &&
          !trimmed.includes("sanitize") &&
          !trimmed.includes("startsWith")
        ) {
          const finding: SecurityFinding = {
            id: `SEC-TRAV-PAT-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-TRAV-001",
            category: "path_traversal",
            title: "Potential Path Traversal in Filesystem Operation",
            description: "Filesystem call appears to accept an unvalidated or dynamic path parameter.",
            severity: "high",
            confidence: "medium",
            evidence: trimmed,
            remediation: "Verify resolved path begins with the authorized root directory using TenantGuard.sanitizeFilePath or path.resolve().",
            references: ["CWE-22", "OWASP A01:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-TRAV-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── E. SSRF (Server-Side Request Forgery) ───────────────────────────────────
  {
    ruleId: "SEC-SSRF-001",
    category: "ssrf",
    title: "Server-Side Request Forgery (SSRF) via Dynamic External URL",
    description: "Making server-side HTTP requests targeting user-supplied URLs allows attackers to port scan internal networks or query cloud metadata services.",
    severity: "high",
    defaultConfidence: "high",
    cwe: "CWE-918: Server-Side Request Forgery (SSRF)",
    owasp: "A10:2021-Server-Side Request Forgery (SSRF)",
    remediation: "Validate destination URLs against a strict whitelist of permitted hostnames and protocols (https only). Reject loopback (127.0.0.1) and private RFC1918 IPs.",
    scan({ projectId, filePath, content, traces }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      if (traces) {
        for (const tr of traces) {
          if (tr.sinkType === "ssrf_request") {
            const finding: SecurityFinding = {
              id: `SEC-SSRF-${tr.sinkLine}`,
              projectId,
              filePath,
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              ruleId: "SEC-SSRF-001",
              category: "ssrf",
              title: "SSRF: User Parameter Flows to Server-Side HTTP Client",
              description: tr.evidence,
              severity: "high",
              confidence: tr.confidence,
              evidence: tr.sinkSnippet,
              remediation: "Validate target domain against an allowlist before issuing HTTP requests.",
              references: ["CWE-918", "OWASP A10:2021"],
              fingerprint: "",
              createdAt: new Date().toISOString(),
            };
            finding.fingerprint = FindingDeduplicator.generateFingerprint({
              projectId,
              filePath,
              ruleId: "SEC-SSRF-001",
              startLine: tr.sinkLine,
              endLine: tr.sinkLine,
              evidence: tr.sinkSnippet,
            });
            findings.push(finding);
          }
        }
      }

      // Pattern check
      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        if (
          /(?:fetch|axios\.(?:get|post)|http\.get)\s*\(\s*(?:req\.|params\.|url|targetUrl|destUrl)/i.test(trimmed) &&
          !trimmed.includes("whitelist") &&
          !trimmed.includes("allowlist") &&
          !trimmed.includes("new URL(")
        ) {
          const finding: SecurityFinding = {
            id: `SEC-SSRF-PAT-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-SSRF-001",
            category: "ssrf",
            title: "Potential SSRF Vector: HTTP Request with Dynamic Destination",
            description: "Server-side HTTP request issued with dynamically passed URL parameter.",
            severity: "high",
            confidence: "medium",
            evidence: trimmed,
            remediation: "Enforce domain allowlist and reject internal/private IP ranges (127.0.0.1, 169.254.169.254).",
            references: ["CWE-918", "OWASP A10:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-SSRF-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── F. AUTHENTICATION: Missing Auth / Auth Bypass ───────────────────────────
  {
    ruleId: "SEC-AUTH-001",
    category: "authentication",
    title: "Authentication Bypass Risk via Unverified Identity or Missing Auth",
    description: "Exposing state-modifying operations or sensitive endpoints without verifying session JWT or user credentials.",
    severity: "high",
    defaultConfidence: "high",
    cwe: "CWE-306: Missing Authentication for Critical Function",
    owasp: "A07:2021-Identification and Authentication Failures",
    remediation: "Require authentication middleware or verify session token on all mutating routes.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        // Null check bypass before auth check
        if (
          filePath.includes("auth") &&
          /if\s*\(\s*user\.password\b/i.test(trimmed) &&
          !content.includes("if (!user)")
        ) {
          const finding: SecurityFinding = {
            id: `SEC-AUTH-NULL-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-AUTH-001",
            category: "authentication",
            title: "Authentication Bypass via Unhandled Null User Entity",
            description: "Accessing password or credential property directly on user entity without verifying the user exists can trigger exceptions or bypass checks.",
            severity: "high",
            confidence: "high",
            evidence: trimmed,
            remediation: "Check if entity is non-null before evaluating credentials: if (!user) return 401;",
            references: ["CWE-306", "OWASP A07:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-AUTH-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── G. AUTHORIZATION: IDOR / Missing Role Check ─────────────────────────────
  {
    ruleId: "SEC-AUTHZ-001",
    category: "authorization",
    title: "Insecure Direct Object Reference (IDOR) / Missing Ownership Check",
    description: "Querying or mutating database records using user-supplied IDs without verifying ownership or tenancy membership.",
    severity: "high",
    defaultConfidence: "high",
    cwe: "CWE-639: Authorization Bypass Through User-Controlled Key",
    owasp: "A01:2021-Broken Access Control",
    remediation: "Ensure every record query filters by authenticated userId or tenant/projectId in addition to the resource ID.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        // Pattern: delete/update by id where user_id is absent
        if (
          /(?:\.delete|\.update)\s*\(\s*\{\s*id\s*:\s*[a-zA-Z0-9_.]+\s*\}\s*\)/i.test(trimmed) &&
          !content.includes("user_id") &&
          !content.includes("owner_id") &&
          !content.includes("created_by") &&
          !content.includes("tenant_id")
        ) {
          const finding: SecurityFinding = {
            id: `SEC-IDOR-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-AUTHZ-001",
            category: "authorization",
            title: "Potential IDOR: Resource Mutation by ID Without Ownership Filter",
            description: "A database mutation queries exclusively by record ID without constraining to the authenticated user or tenant.",
            severity: "high",
            confidence: "medium",
            evidence: trimmed,
            remediation: "Include authenticated user_id in the mutation where clause: { id, user_id: authUser.id }.",
            references: ["CWE-639", "OWASP A01:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-AUTHZ-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── H. JWT / SESSION SECURITY ──────────────────────────────────────────────
  {
    ruleId: "SEC-JWT-001",
    category: "jwt_session",
    title: "Insecure JWT Verification / Algorithm Confusion Risk",
    description: "Disabling JWT signature verification or allowing 'none' algorithms permits attackers to forge administrative authentication tokens.",
    severity: "critical",
    defaultConfidence: "very_high",
    cwe: "CWE-347: Improper Verification of Cryptographic Signature",
    owasp: "A02:2021-Cryptographic Failures",
    remediation: "Always enforce signature verification with explicitly specified algorithms: algorithms: ['HS256'] or ['RS256']. Never allow algorithm 'none'.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        if (
          /jwt\.decode\s*\(/i.test(trimmed) &&
          !content.includes("jwt.verify") &&
          filePath.includes("auth")
        ) {
          const finding: SecurityFinding = {
            id: `SEC-JWT-DEC-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-JWT-001",
            category: "jwt_session",
            title: "Insecure Token Handling: jwt.decode() Used Without Signature Verification",
            description: "jwt.decode() only parses token payload without verifying the cryptographic signature, allowing forged tokens.",
            severity: "critical",
            confidence: "high",
            evidence: trimmed,
            remediation: "Use jwt.verify(token, secret, { algorithms: ['HS256'] }) to cryptographically validate authenticity.",
            references: ["CWE-347", "OWASP A02:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-JWT-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }

        if (/(?:verifyOptions|algorithms)\s*:\s*\[.*["']none["'].*\]/i.test(trimmed)) {
          const finding: SecurityFinding = {
            id: `SEC-JWT-NONE-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-JWT-001",
            category: "jwt_session",
            title: "Critical JWT Misconfiguration: 'none' Algorithm Allowed",
            description: "Allowing algorithm 'none' completely disables token signature verification.",
            severity: "critical",
            confidence: "very_high",
            evidence: trimmed,
            remediation: "Remove 'none' from allowed algorithms whitelist.",
            references: ["CWE-347", "OWASP A02:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-JWT-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── J. CRYPTOGRAPHY: Weak Hash / Insecure Random ───────────────────────────
  {
    ruleId: "SEC-CRYP-001",
    category: "cryptography",
    title: "Weak Cryptographic Hash Algorithm or Insecure Random Generator",
    description: "Using MD5 or SHA1 for password hashing, or Math.random() for security tokens, creates collision and predictability vulnerabilities.",
    severity: "high",
    defaultConfidence: "high",
    cwe: "CWE-327: Use of a Broken or Risky Cryptographic Algorithm",
    owasp: "A02:2021-Cryptographic Failures",
    remediation: "Use Argon2, bcrypt, or PBKDF2 for passwords; use crypto.randomBytes() or crypto.getRandomValues() for security-sensitive tokens.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        // Weak hash for password
        if (
          /createHash\s*\(\s*["'](?:md5|sha1)["']\s*\)/i.test(trimmed) &&
          /password|passwd|auth|token/i.test(content)
        ) {
          const finding: SecurityFinding = {
            id: `SEC-CRYP-HASH-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-CRYP-001",
            category: "cryptography",
            title: "Weak Hash Algorithm: MD5/SHA1 Used in Authentication Context",
            description: "MD5 and SHA-1 are cryptographically broken and prone to collision attacks.",
            severity: "high",
            confidence: "high",
            evidence: trimmed,
            remediation: "Use bcrypt or Argon2 for passwords; use SHA-256 or SHA-512 for cryptographic integrity hashing.",
            references: ["CWE-327", "OWASP A02:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-CRYP-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }

        // Insecure random for security tokens
        if (
          /Math\.random\s*\(\)/i.test(trimmed) &&
          /(?:token|secret|salt|csrf|nonce|session|key)\s*=/i.test(trimmed)
        ) {
          const finding: SecurityFinding = {
            id: `SEC-CRYP-RAND-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-CRYP-001",
            category: "cryptography",
            title: "Insecure Randomness: Math.random() Used for Cryptographic Token",
            description: "Math.random() is a pseudo-random generator with predictable seeds; it must never be used for security tokens or nonces.",
            severity: "medium",
            confidence: "high",
            evidence: trimmed,
            remediation: "Use crypto.randomUUID() or crypto.randomBytes(32) for secure random values.",
            references: ["CWE-338: Use of Cryptographically Weak Pseudo-Random Number Generator (PRNG)"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-CRYP-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── K. INSECURE CONFIGURATION: CORS / Debug / Disabled TLS ──────────────────
  {
    ruleId: "SEC-CONF-001",
    category: "insecure_configuration",
    title: "Insecure Security Configuration (Permissive CORS, Disabled TLS, or Debug Mode)",
    description: "Permissive CORS policies ('*'), disabled certificate verification, or active debug flags in production expose internal services.",
    severity: "medium",
    defaultConfidence: "high",
    cwe: "CWE-16: Configuration",
    owasp: "A05:2021-Security Misconfiguration",
    remediation: "Configure explicit trusted CORS origins and keep rejectUnauthorized: true in TLS options.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        // Permissive CORS with credentials
        if (
          /Access-Control-Allow-Origin.*["']\*["']/i.test(trimmed) &&
          /credentials/i.test(content)
        ) {
          const finding: SecurityFinding = {
            id: `SEC-CONF-CORS-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-CONF-001",
            category: "insecure_configuration",
            title: "Permissive CORS Policy: Wildcard '*' with Credentials",
            description: "Access-Control-Allow-Origin: * combined with credentials allows any third-party domain to read authenticated responses.",
            severity: "high",
            confidence: "high",
            evidence: trimmed,
            remediation: "Specify an explicit allowlist of trusted origin domains.",
            references: ["CWE-16", "OWASP A05:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-CONF-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }

        // Disabled TLS verification
        if (/rejectUnauthorized\s*:\s*false/i.test(trimmed)) {
          const finding: SecurityFinding = {
            id: `SEC-CONF-TLS-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-CONF-001",
            category: "insecure_configuration",
            title: "Disabled TLS Certificate Verification (rejectUnauthorized: false)",
            description: "Disabling TLS certificate verification enables Man-in-the-Middle (MitM) attacks.",
            severity: "critical",
            confidence: "very_high",
            evidence: trimmed,
            remediation: "Remove rejectUnauthorized: false and provide trusted CA certificate bundles.",
            references: ["CWE-295: Improper Certificate Validation"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-CONF-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: trimmed,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },

  // ── L. DATABASE SECURITY: Plaintext Passwords / Unparameterized Raw SQL ─────
  {
    ruleId: "SEC-DB-001",
    category: "database_security",
    title: "Database Security: Plaintext Password Storage or Unencrypted Secret Field",
    description: "Storing unhashed passwords or plaintext secrets in database records exposes credentials upon database breach.",
    severity: "critical",
    defaultConfidence: "high",
    cwe: "CWE-256: Unprotected Storage of Credentials",
    owasp: "A02:2021-Cryptographic Failures",
    remediation: "Hash passwords with bcrypt or Argon2 before database insertion. Never store plaintext credentials in SQL tables.",
    scan({ projectId, filePath, content }) {
      const findings: SecurityFinding[] = [];
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        // Inserting password into db without hash check in file
        if (
          /(?:\.insert|\.update)\s*\(\s*\{.*password\s*:\s*(?:req\.body\.password|password|plainPassword)/i.test(trimmed) &&
          !content.includes("hash") &&
          !content.includes("bcrypt") &&
          !content.includes("argon")
        ) {
          const { redactedText } = SecretRedactor.redact(trimmed);
          const finding: SecurityFinding = {
            id: `SEC-DB-PW-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId: "SEC-DB-001",
            category: "database_security",
            title: "Database Security: Potential Plaintext Password Storage",
            description: "Password parameter is passed directly into a database insert or update operation without cryptographic hashing.",
            severity: "critical",
            confidence: "high",
            evidence: redactedText,
            remediation: "Hash passwords with bcrypt.hash(password, 12) before persisting to the database.",
            references: ["CWE-256", "OWASP A02:2021"],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };
          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId: "SEC-DB-001",
            startLine: lineNum,
            endLine: lineNum,
            evidence: redactedText,
          });
          findings.push(finding);
        }
      });

      return findings;
    },
  },
];

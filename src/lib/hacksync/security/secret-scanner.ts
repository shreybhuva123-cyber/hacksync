/**
 * Dedicated Secret Scanner — HackSync Phase 3
 * Combines signature pattern detection, Shannon entropy analysis, and contextual heuristics.
 * Guarantees zero plaintext secret exposure via SecretRedactor.
 */

import { SecretRedactor } from "./secret-redactor";
import type { FindingConfidence, FindingSeverity, SecurityFinding } from "./finding-types";
import { FindingDeduplicator } from "./finding-deduplicator";

export interface SecretFinding {
  ruleId: string;
  patternName: string;
  filePath: string;
  line: number;
  snippet: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  entropy?: number | undefined;
}

export class SecretScanner {
  /**
   * Computes the Shannon entropy of a string (in bits per character).
   * Measures the randomness/unpredictability of character distributions.
   */
  static computeShannonEntropy(str: string): number {
    if (!str || str.length === 0) return 0;
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }

    let entropy = 0;
    const len = str.length;
    for (const count of freq.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Checks if a candidate string or context is a safe placeholder/test fixture.
   */
  static isSafePlaceholder(value: string, lineText: string, filePath: string): boolean {
    const vLower = value.toLowerCase();
    const lLower = lineText.toLowerCase();
    const fLower = filePath.toLowerCase();

    // 1. Documentation, mock/test paths, and example/sample configs
    if (
      fLower.endsWith(".md") ||
      fLower.endsWith(".txt") ||
      fLower.includes(".test.") ||
      fLower.includes(".spec.") ||
      fLower.includes("/fixtures/") ||
      fLower.includes("/mock/") ||
      fLower.includes("/mocks/") ||
      fLower.endsWith(".example") ||
      fLower.endsWith(".sample") ||
      fLower.includes(".env.example") ||
      fLower.includes(".env.sample")
    ) {
      // In test or doc/example files, if it contains explicit mock markers, ignore
      if (
        vLower.includes("mock") ||
        vLower.includes("fake") ||
        vLower.includes("dummy") ||
        vLower.includes("placeholder") ||
        vLower.includes("example") ||
        vLower.includes("sample") ||
        vLower.includes("your-") ||
        vLower.includes("your_") ||
        vLower.includes("insert_") ||
        vLower.includes("changeme") ||
        vLower.includes("replace_") ||
        vLower.includes("localhost") ||
        /^0+$/.test(value) ||
        /^x+$/i.test(value) ||
        vLower.includes("test")
      ) {
        return true;
      }
    }

    // 2. Placeholder markers in code
    if (
      vLower.includes("your-api-key") ||
      vLower.includes("your_api_key") ||
      vLower.includes("insert_key_here") ||
      vLower.includes("changeme") ||
      vLower.includes("your-secret") ||
      vLower.includes("placeholder") ||
      vLower.includes("dummy") ||
      vLower.includes("fake_key") ||
      vLower.includes("mock_key") ||
      vLower.includes("sk_test_") || // Stripe test keys are non-live
      vLower.includes("pk_test_") ||
      vLower === "password" ||
      vLower === "admin" ||
      vLower === "secret"
    ) {
      return true;
    }

    // 3. Environment variable access without string literals
    if (lLower.includes("process.env.") && !lineText.includes("=") && !lineText.includes(":")) {
      return true;
    }

    return false;
  }

  /**
   * Scans a file's content for hardcoded secrets, API tokens, and high-entropy credentials.
   */
  static scanFile(filePath: string, content: string, projectId: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    if (!content || content.trim() === "") return findings;

    const lines = content.split("\n");

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const trimmed = lineText.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

      // 1. Signature-based detection via SecretRedactor patterns
      const { detections, redactedText } = SecretRedactor.redact(trimmed);

      if (detections.length > 0) {
        for (const det of detections) {
          // Check if this is a safe placeholder
          if (this.isSafePlaceholder(trimmed, trimmed, filePath)) {
            continue;
          }

          const ruleId = "SEC-SEC-001";
          const finding: SecurityFinding = {
            id: `SEC-SECRET-${lineNum}`,
            projectId,
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            ruleId,
            category: "secrets",
            title: `Hardcoded Secret Detected: ${det.patternName}`,
            description: `A hardcoded credential (${det.patternName}) was identified in source code. Hardcoded credentials can lead to account takeover and data exfiltration if exposed in source control.`,
            severity: det.severity === "critical" ? "critical" : "high",
            confidence: "very_high",
            evidence: redactedText,
            remediation: "Move sensitive credentials to secure environment variables (.env) or a secret manager (Vault, AWS Secrets Manager). Never commit raw secrets to version control.",
            references: [
              "CWE-798: Use of Hard-coded Credentials",
              "OWASP Top 10 - A07:2021 Identification and Authentication Failures",
            ],
            fingerprint: "",
            createdAt: new Date().toISOString(),
          };

          finding.fingerprint = FindingDeduplicator.generateFingerprint({
            projectId,
            filePath,
            ruleId,
            startLine: lineNum,
            endLine: lineNum,
            evidence: redactedText,
          });

          findings.push(finding);
        }
      }

      // 2. Shannon Entropy & Contextual String Detection
      // Extracts string literals: "abc123xyz...", '...'
      const candidates: string[] = [];
      const stringMatches = trimmed.matchAll(/["']([a-zA-Z0-9_\-+/]{16,})["']/g);
      for (const m of stringMatches) {
        if (m[1]) candidates.push(m[1]);
      }

      // Also extract unquoted environment file / config assignments: KEY=value
      const envAssignMatch = trimmed.match(/^[A-Z0-9_]*(?:SECRET|KEY|PASSWORD|PASSWD|TOKEN|AUTH|CREDENTIAL|PRIVATE)[A-Z0-9_]*\s*=\s*(["']?)([a-zA-Z0-9_\-+/]{16,})\1/i);
      if (envAssignMatch && envAssignMatch[2]) {
        candidates.push(envAssignMatch[2]);
      }

      for (const candidate of candidates) {
        if (this.isSafePlaceholder(candidate, trimmed, filePath)) {
          continue;
        }

        const entropy = this.computeShannonEntropy(candidate);
        // Shannon entropy threshold: > 4.2 bits per char indicates random/cryptographic string
        if (entropy > 4.2) {
          // Check if variable context or file name suggests a secret
          const isSecretContext =
            /token|key|secret|credential|password|passwd|auth|private|signature/i.test(trimmed) ||
            /(?:^|[/\\])\.env(?:\.[a-zA-Z0-9_\-]+)?$/i.test(filePath);

          if (isSecretContext) {
            const { redactedText: maskedLine } = SecretRedactor.redact(trimmed);
            const ruleId = "SEC-SEC-002";

            const finding: SecurityFinding = {
              id: `SEC-ENTROPY-${lineNum}`,
              projectId,
              filePath,
              startLine: lineNum,
              endLine: lineNum,
              ruleId,
              category: "secrets",
              title: `High-Entropy Potential Credential Detected (${entropy.toFixed(2)} bits/char)`,
              description: `High Shannon entropy (${entropy.toFixed(2)} bits/char) in variable assignment suggests a high-probability cryptographic key or token.`,
              severity: "high",
              confidence: "high",
              evidence: maskedLine,
              remediation: "Verify if this high-entropy string is a sensitive key or credential, and store it in environment variables.",
              references: ["CWE-798: Use of Hard-coded Credentials"],
              fingerprint: "",
              createdAt: new Date().toISOString(),
            };

            finding.fingerprint = FindingDeduplicator.generateFingerprint({
              projectId,
              filePath,
              ruleId,
              startLine: lineNum,
              endLine: lineNum,
              evidence: maskedLine,
            });

            findings.push(finding);
          }
        }
      }
    });

    return FindingDeduplicator.deduplicate(findings);
  }
}

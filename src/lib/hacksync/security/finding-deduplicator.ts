/**
 * Security Finding Deduplicator & Deterministic SHA-256 Fingerprinter
 * Phase 3 Production Standard
 */

import { computeSha256Sync } from "@/lib/security/universal-hash";
import type { SecurityFinding } from "./finding-types";

export class FindingDeduplicator {
  /**
   * Generates a deterministic SHA-256 fingerprint for a finding.
   * Based on: projectId + filePath + ruleId + normalized line range + normalized evidence.
   */
  static generateFingerprint(params: {
    projectId: string;
    filePath: string;
    ruleId: string;
    startLine: number;
    endLine: number;
    evidence: string;
  }): string {
    const normFile = params.filePath.trim().replace(/\\/g, "/").toLowerCase();
    const normEvidence = params.evidence.replace(/\s+/g, " ").trim();
    const payload = `${params.projectId}:${normFile}:${params.ruleId}:${params.startLine}-${params.endLine}:${normEvidence}`;

    return computeSha256Sync(payload);
  }

  /**
   * Deduplicates an array of findings by their deterministic fingerprint.
   * If duplicates exist, preserves the one with highest confidence or earliest occurrence.
   */
  static deduplicate(findings: SecurityFinding[]): SecurityFinding[] {
    const seen = new Map<string, SecurityFinding>();

    for (const finding of findings) {
      const fp = finding.fingerprint || this.generateFingerprint(finding);
      const existing = seen.get(fp);

      if (!existing) {
        seen.set(fp, { ...finding, fingerprint: fp });
      } else {
        // If incoming has higher confidence, update
        const rank: Record<string, number> = { very_high: 4, high: 3, medium: 2, low: 1 };
        if ((rank[finding.confidence] || 0) > (rank[existing.confidence] || 0)) {
          seen.set(fp, { ...finding, fingerprint: fp });
        }
      }
    }

    return Array.from(seen.values());
  }
}

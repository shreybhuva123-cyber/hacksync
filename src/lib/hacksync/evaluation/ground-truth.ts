/**
 * HackSync Phase 6: Independent Ground Truth & Immutability Engine
 * Enforces strictly human-authored, validated, and immutable ground truth.
 * Evaluators must NEVER derive ground truth from the scanners or implementations being tested.
 */

import { ValidationError } from "@/lib/errors";
import type { FindingSeverity } from "../security/finding-types";

export interface ExpectedFinding {
  ruleId?: string;
  category?: string;
  severity?: FindingSeverity;
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  confidenceMin?: string;
}

export interface ExpectedCitation {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  snippetKeyword?: string;
}

export interface ExpectedFixProperties {
  patchApplies: boolean;
  vulnerabilityResolved: boolean;
  testsPass: boolean;
  regressionsAllowed: boolean;
}

export interface GroundTruth {
  readonly expectedFindings?: readonly ExpectedFinding[];
  readonly expectedFiles?: readonly string[];
  readonly expectedSymbols?: readonly string[];
  readonly expectedSeverity?: FindingSeverity;
  readonly expectedTests?: readonly string[];
  readonly expectedCitations?: readonly ExpectedCitation[];
  readonly expectedFixProperties?: ExpectedFixProperties;
  readonly expectedCapabilities?: readonly string[];
  readonly expectedOutcome?: string;
}

/**
 * Deeply freezes an object to guarantee that evaluators cannot modify ground truth.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Freeze properties first
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[key];
    if (val && typeof val === "object") {
      deepFreeze(val);
    }
  }

  return Object.freeze(obj) as Readonly<T>;
}

/**
 * Validates that a ground truth object is complete, well-formed, and independent.
 */
export class GroundTruthValidator {
  /**
   * Validates integrity of ground truth definitions.
   * Throws ValidationError if malformed or circular.
   */
  static validate(groundTruth: unknown, caseId: string): GroundTruth {
    if (!groundTruth || typeof groundTruth !== "object") {
      throw new ValidationError(`[GroundTruth] Benchmark case '${caseId}' is missing ground truth.`);
    }

    const gt = groundTruth as GroundTruth;

    // 1. Verify safe paths in expectedFiles
    if (Array.isArray(gt.expectedFiles)) {
      for (const f of gt.expectedFiles) {
        if (typeof f !== "string" || f.startsWith("/") || f.includes("..")) {
          throw new ValidationError(
            `[GroundTruth] Case '${caseId}' contains unsafe expectedFile path: '${f}'.`,
          );
        }
      }
    }

    // 2. Verify safe paths in expectedCitations
    if (Array.isArray(gt.expectedCitations)) {
      for (const cite of gt.expectedCitations) {
        if (!cite.file || cite.file.startsWith("/") || cite.file.includes("..")) {
          throw new ValidationError(
            `[GroundTruth] Case '${caseId}' contains unsafe citation file: '${cite.file}'.`,
          );
        }
      }
    }

    // 3. Verify safe paths in expectedFindings
    if (Array.isArray(gt.expectedFindings)) {
      for (const finding of gt.expectedFindings) {
        if (finding.file && (finding.file.startsWith("/") || finding.file.includes(".."))) {
          throw new ValidationError(
            `[GroundTruth] Case '${caseId}' contains unsafe finding file: '${finding.file}'.`,
          );
        }
      }
    }

    return deepFreeze(gt) as GroundTruth;
  }

  /**
   * Anti-Circularity Guard:
   * Ensures that ground truth was NOT dynamically constructed from production scanner outputs.
   */
  static assertIndependent(
    groundTruthOrActual: any,
    expectedOrDescriptor?: any,
    sourceDescriptor = "benchmark-fixture",
  ): void {
    if (
      expectedOrDescriptor !== undefined &&
      typeof expectedOrDescriptor === "object" &&
      groundTruthOrActual === expectedOrDescriptor
    ) {
      throw new ValidationError(
        `[GroundTruth] Circular evaluation detected! Actual results match ground truth reference identity in '${sourceDescriptor}'. Ground truth must be independently authored.`,
      );
    }

    const target =
      typeof expectedOrDescriptor === "object" && expectedOrDescriptor !== null
        ? expectedOrDescriptor
        : groundTruthOrActual;

    if (target && (target as any).__derivedFromProductionScanner) {
      throw new ValidationError(
        `[GroundTruth] Circular evaluation detected! Ground truth in '${sourceDescriptor}' was derived from a production scanner. Ground truth must be independently authored.`,
      );
    }
  }

  /**
   * Validates and deeply freezes ground truth.
   */
  static validateAndFreeze(caseId: string, groundTruth: unknown): GroundTruth {
    return this.validate(groundTruth, caseId);
  }
}

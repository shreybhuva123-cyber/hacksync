/**
 * Patch Generator Engine — HackSync Phase 4
 * Produces structured patches with unified diffs, explicit file operations,
 * and cryptographic SHA-256 base-state and diff hashes.
 */

import { createHash } from "crypto";
import type { Patch, PatchFile } from "./fix-types";

export class PatchGenerator {
  /**
   * Computes a SHA-256 hash for a given string content.
   */
  static sha256(content: string): string {
    return createHash("sha256").update(content || "").digest("hex");
  }

  /**
   * Generates a standard unified diff between oldContent and newContent.
   */
  static generateUnifiedDiff(filePath: string, oldContent: string, newContent: string): string {
    const oldLines = (oldContent || "").split("\n");
    const newLines = (newContent || "").split("\n");

    const header = [
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ];

    const diffBody: string[] = [];

    // Simple line-by-line unified diff generator
    let oIdx = 0;
    let nIdx = 0;

    while (oIdx < oldLines.length || nIdx < newLines.length) {
      if (oIdx < oldLines.length && nIdx < newLines.length && oldLines[oIdx] === newLines[nIdx]) {
        diffBody.push(` ${oldLines[oIdx]}`);
        oIdx++;
        nIdx++;
      } else {
        if (oIdx < oldLines.length) {
          diffBody.push(`-${oldLines[oIdx]}`);
          oIdx++;
        }
        if (nIdx < newLines.length) {
          diffBody.push(`+${newLines[nIdx]}`);
          nIdx++;
        }
      }
    }

    return [...header, ...diffBody].join("\n");
  }

  /**
   * Helper for generating a patch for a single file.
   */
  static generate(params: {
    projectId: string;
    filePath: string;
    originalContent: string;
    modifiedContent: string;
  }): Patch {
    return this.createPatch({
      projectId: params.projectId,
      files: [
        {
          path: params.filePath,
          operation: "modify",
          oldContent: params.originalContent,
          newContent: params.modifiedContent,
        },
      ],
    });
  }

  /**
   * Constructs a formal structured Patch record for one or multiple file modifications.
   */
  static createPatch(params: {
    projectId: string;
    files: {
      path: string;
      operation: "modify" | "create" | "delete" | "rename";
      oldContent?: string | undefined;
      newContent?: string | undefined;
    }[];
  }): Patch {
    const patchId = `patch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const patchFiles: PatchFile[] = [];
    let cumulativeDiff = "";
    let cumulativeBase = "";

    for (const f of params.files) {
      const oldStr = f.oldContent || "";
      const newStr = f.newContent || "";
      const oldHash = f.operation !== "create" ? this.sha256(oldStr) : undefined;
      const newHash = f.operation !== "delete" ? this.sha256(newStr) : undefined;

      const diff = this.generateUnifiedDiff(f.path, oldStr, newStr);
      cumulativeDiff += diff + "\n";
      cumulativeBase += `${f.path}:${oldHash || "NONE"}\n`;

      patchFiles.push({
        path: f.path,
        operation: f.operation,
        oldHash,
        newHash,
        diff,
      });
    }

    const diffHash = this.sha256(cumulativeDiff.trim());
    const baseStateHash = this.sha256(cumulativeBase.trim());

    return {
      id: patchId,
      projectId: params.projectId,
      baseStateHash,
      diffHash,
      files: patchFiles,
      createdAt: new Date().toISOString(),
    };
  }
}

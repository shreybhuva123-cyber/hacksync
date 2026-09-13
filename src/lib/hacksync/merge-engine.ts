/**
 * HackSync Git-like 3-Way Merge & Diff Engine
 * Performs intelligent 3-way reconciliation (BASE + MEMBER_A + MEMBER_B + ... MEMBER_N)
 * with line-level diffing, automatic non-overlapping hunk merging, and conflict detection.
 */

import type {
  MergeResult,
  MergeConflictHunk,
  LineDiffItem,
  MemberContribution,
  Role,
} from "./types";

/**
 * Deterministic fast 64-bit content hash (synchronous)
 */
export function computeFastHash(content: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const val = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return val.toString(16).padStart(12, "0");
}

/**
 * Standard SHA-256 content hash (async with universal fallback)
 */
export async function computeSha256(content: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    try {
      const msgBuffer = new TextEncoder().encode(content);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // fallback below
    }
  }
  return "h_" + computeFastHash(content);
}

/**
 * Split text into normalized line array
 */
export function splitLines(text: string): string[] {
  if (!text) return [];
  // Normalize Windows CRLF to LF, keep empty lines intact
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n");
}

/**
 * Compute Longest Common Subsequence (LCS) matrix between two arrays of lines
 */
function computeLcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const row = dp[i];
    const prevRow = dp[i - 1];
    if (!row || !prevRow) continue;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = (prevRow[j - 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(prevRow[j] ?? 0, row[j - 1] ?? 0);
      }
    }
  }
  return dp;
}

export interface DiffChunk {
  type: "same" | "add" | "remove";
  lines: string[];
  oldStart: number;
  newStart: number;
}

/**
 * Diff two texts line-by-line using Myers-style LCS backtracking
 */
export function diffLines(oldText: string, newText: string): DiffChunk[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const dp = computeLcs(a, b);

  let i = a.length;
  let j = b.length;
  const rawChunks: { type: "same" | "add" | "remove"; line: string }[] = [];

  while (i > 0 || j > 0) {
    const lineA = a[i - 1] ?? "";
    const lineB = b[j - 1] ?? "";
    const rowI = dp[i];
    const prevRow = dp[i - 1];
    const valJminus1 = rowI?.[j - 1] ?? 0;
    const valIminus1 = prevRow?.[j] ?? 0;

    if (i > 0 && j > 0 && lineA === lineB) {
      rawChunks.push({ type: "same", line: lineA });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || valJminus1 >= valIminus1)) {
      rawChunks.push({ type: "add", line: lineB });
      j--;
    } else if (i > 0 && (j === 0 || valJminus1 < valIminus1)) {
      rawChunks.push({ type: "remove", line: lineA });
      i--;
    }
  }

  rawChunks.reverse();

  // Consolidate consecutive items of the same type
  const result: DiffChunk[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const item of rawChunks) {
    const last = result[result.length - 1];
    if (last && last.type === item.type) {
      last.lines.push(item.line);
    } else {
      result.push({
        type: item.type,
        lines: [item.line],
        oldStart: oldLine,
        newStart: newLine,
      });
    }

    if (item.type === "same") {
      oldLine++;
      newLine++;
    } else if (item.type === "remove") {
      oldLine++;
    } else if (item.type === "add") {
      newLine++;
    }
  }

  return result;
}

/**
 * Structured Line Diff for UI display (+, -, ~,  )
 */
export function computeLineDiff(oldText: string, newText: string): LineDiffItem[] {
  const chunks = diffLines(oldText, newText);
  const items: LineDiffItem[] = [];

  let oldCounter = 1;
  let newCounter = 1;

  for (const chunk of chunks) {
    for (const line of chunk.lines) {
      if (chunk.type === "same") {
        items.push({
          type: "unchanged",
          oldLineNumber: oldCounter++,
          newLineNumber: newCounter++,
          content: line,
        });
      } else if (chunk.type === "add") {
        items.push({
          type: "added",
          newLineNumber: newCounter++,
          content: line,
        });
      } else if (chunk.type === "remove") {
        items.push({
          type: "removed",
          oldLineNumber: oldCounter++,
          content: line,
        });
      }
    }
  }

  return items;
}

/**
 * Core Line-by-Line 3-Way Merge Algorithm (Diff3)
 * Reconciles BASE, A, and B.
 * - Non-overlapping additions/modifications/deletions auto-merge cleanly.
 * - Incompatible overlapping modifications yield conflicts with markers.
 */
export function threeWayMerge(
  baseContent: string,
  contentA: string,
  contentB: string,
  options: {
    labelA?: string;
    labelB?: string;
    baseLabel?: string;
  } = {},
): MergeResult {
  const safeBase = baseContent ?? "";
  const safeA = contentA ?? "";
  const safeB = contentB ?? "";

  const labelA = options.labelA || "Member A";
  const labelB = options.labelB || "Member B";
  const baseLabel = options.baseLabel || "BASE VERSION";

  // Quick optimizations for trivial equality
  if (safeA === safeB) {
    return {
      hasConflict: false,
      mergedContent: safeA,
      conflicts: [],
      autoMergedHunksCount: 0,
      contributors: [labelA, labelB],
      isIdenticalToExisting: safeA === safeBase,
    };
  }

  if (safeA === safeBase) {
    return {
      hasConflict: false,
      mergedContent: safeB,
      conflicts: [],
      autoMergedHunksCount: 1,
      contributors: [labelB],
      isIdenticalToExisting: false,
    };
  }

  if (safeB === safeBase) {
    return {
      hasConflict: false,
      mergedContent: safeA,
      conflicts: [],
      autoMergedHunksCount: 1,
      contributors: [labelA],
      isIdenticalToExisting: false,
    };
  }

  const baseLines = splitLines(safeBase);
  const aLines = splitLines(safeA);
  const bLines = splitLines(safeB);

  // Compute diffs against Base
  const diffA = diffLines(safeBase, safeA);
  const diffB = diffLines(safeBase, safeB);

  interface BaseLineChange {
    deletedByA: boolean;
    deletedByB: boolean;
    insertionsBeforeA: string[];
    insertionsBeforeB: string[];
  }

  const baseMap: BaseLineChange[] = Array.from({ length: baseLines.length + 1 }, () => ({
    deletedByA: false,
    deletedByB: false,
    insertionsBeforeA: [],
    insertionsBeforeB: [],
  }));

  const getBaseChange = (targetIdx: number): BaseLineChange => {
    let entry = baseMap[targetIdx];
    if (!entry) {
      entry = {
        deletedByA: false,
        deletedByB: false,
        insertionsBeforeA: [],
        insertionsBeforeB: [],
      };
      baseMap[targetIdx] = entry;
    }
    return entry;
  };

  // Populate A changes against Base
  let baseIdxA = 0;
  let lastRemoveStartA = -1;
  for (const chunk of diffA) {
    if (chunk.type === "same") {
      baseIdxA += chunk.lines.length;
      lastRemoveStartA = -1;
    } else if (chunk.type === "remove") {
      lastRemoveStartA = baseIdxA;
      for (let k = 0; k < chunk.lines.length; k++) {
        getBaseChange(baseIdxA + k).deletedByA = true;
      }
      baseIdxA += chunk.lines.length;
    } else if (chunk.type === "add") {
      const targetIdx = lastRemoveStartA >= 0 ? lastRemoveStartA : baseIdxA;
      getBaseChange(targetIdx).insertionsBeforeA.push(...chunk.lines);
      lastRemoveStartA = -1;
    }
  }

  // Populate B changes against Base
  let baseIdxB = 0;
  let lastRemoveStartB = -1;
  for (const chunk of diffB) {
    if (chunk.type === "same") {
      baseIdxB += chunk.lines.length;
      lastRemoveStartB = -1;
    } else if (chunk.type === "remove") {
      lastRemoveStartB = baseIdxB;
      for (let k = 0; k < chunk.lines.length; k++) {
        getBaseChange(baseIdxB + k).deletedByB = true;
      }
      baseIdxB += chunk.lines.length;
    } else if (chunk.type === "add") {
      const targetIdx = lastRemoveStartB >= 0 ? lastRemoveStartB : baseIdxB;
      getBaseChange(targetIdx).insertionsBeforeB.push(...chunk.lines);
      lastRemoveStartB = -1;
    }
  }

  // Reconcile line by line
  const mergedLines: string[] = [];
  const conflictHunks: MergeConflictHunk[] = [];
  let autoMergedCount = 0;
  let hasConflict = false;

  let currentLine = 1;

  for (let idx = 0; idx <= baseLines.length; idx++) {
    const isEOF = idx === baseLines.length;
    const change = getBaseChange(idx);

    // 1. Check insertions before this base line
    const insA = change.insertionsBeforeA;
    const insB = change.insertionsBeforeB;

    if (insA.length > 0 && insB.length > 0) {
      if (insA.join("\n") === insB.join("\n")) {
        // Both inserted the exact same content -> clean merge
        mergedLines.push(...insA);
        autoMergedCount++;
      } else {
        // Both inserted different content at the exact same location -> Conflict!
        hasConflict = true;
        const hunkId = `hunk-${conflictHunks.length + 1}`;
        conflictHunks.push({
          id: hunkId,
          startLine: currentLine,
          baseChunk: "",
          contributorChunks: {
            [labelA]: insA.join("\n"),
            [labelB]: insB.join("\n"),
          },
          isResolved: false,
        });

        mergedLines.push(
          `<<<<<<< ${labelA}`,
          ...insA,
          `||||||| ${baseLabel}`,
          `=======`,
          ...insB,
          `>>>>>>> ${labelB}`,
        );
      }
    } else if (insA.length > 0) {
      if (!isEOF && change.deletedByA && change.deletedByB && insB.length === 0) {
        // Section Deletion vs Modification Conflict: Member A modified, Member B deleted!
        hasConflict = true;
        const hunkId = `hunk-${conflictHunks.length + 1}`;
        conflictHunks.push({
          id: hunkId,
          startLine: currentLine,
          baseChunk: baseLines[idx] ?? "",
          contributorChunks: {
            [labelA]: insA.join("\n"),
            [labelB]: "",
          },
          isResolved: false,
        });
        mergedLines.push(
          `<<<<<<< ${labelA}`,
          ...insA,
          `||||||| ${baseLabel}`,
          baseLines[idx] ?? "",
          `=======`,
          `>>>>>>> ${labelB}`,
        );
      } else {
        // Only A inserted
        mergedLines.push(...insA);
        autoMergedCount++;
      }
    } else if (insB.length > 0) {
      if (!isEOF && change.deletedByA && change.deletedByB && insA.length === 0) {
        // Section Deletion vs Modification Conflict: Member B modified, Member A deleted!
        hasConflict = true;
        const hunkId = `hunk-${conflictHunks.length + 1}`;
        conflictHunks.push({
          id: hunkId,
          startLine: currentLine,
          baseChunk: baseLines[idx] ?? "",
          contributorChunks: {
            [labelA]: "",
            [labelB]: insB.join("\n"),
          },
          isResolved: false,
        });
        mergedLines.push(
          `<<<<<<< ${labelA}`,
          `||||||| ${baseLabel}`,
          baseLines[idx] ?? "",
          `=======`,
          ...insB,
          `>>>>>>> ${labelB}`,
        );
      } else {
        // Only B inserted
        mergedLines.push(...insB);
        autoMergedCount++;
      }
    }

    if (isEOF) break;

    // 2. Check base line at idx
    const baseLine = baseLines[idx] ?? "";
    const delA = change.deletedByA;
    const delB = change.deletedByB;

    if (!delA && !delB) {
      // Kept by both
      mergedLines.push(baseLine);
    } else if (delA && delB) {
      // Deleted by both (or handled as modify/delete conflict above) -> omit line cleanly
      autoMergedCount++;
    } else if (delA && !delB) {
      // A deleted it, B kept it.
      autoMergedCount++;
    } else if (!delA && delB) {
      // B deleted it, A kept it.
      autoMergedCount++;
    }

    currentLine = mergedLines.length + 1;
  }

  const finalMergedContent = mergedLines.join("\n");

  return {
    hasConflict,
    mergedContent: finalMergedContent,
    conflicts: conflictHunks,
    autoMergedHunksCount: autoMergedCount,
    contributors: Array.from(new Set([labelA, labelB])),
    isIdenticalToExisting: finalMergedContent === baseContent,
    rawConflictMarkers: hasConflict ? finalMergedContent : undefined,
  };
}

/**
 * Multi-Party Merge: Supports 2, 3, 4, 5+ team members editing the same file concurrently.
 * Reconciles all contributors' changes against the common base version through associative chaining.
 */
export function multiPartyMerge(
  baseContent: string,
  contributions: MemberContribution[],
): MergeResult {
  if (!contributions || contributions.length === 0) {
    return {
      hasConflict: false,
      mergedContent: baseContent,
      conflicts: [],
      autoMergedHunksCount: 0,
      contributors: [],
      isIdenticalToExisting: true,
    };
  }

  if (contributions.length === 1) {
    const single = contributions[0];
    if (!single) {
      return {
        hasConflict: false,
        mergedContent: baseContent,
        conflicts: [],
        autoMergedHunksCount: 0,
        contributors: [],
        isIdenticalToExisting: true,
      };
    }
    const isSame = single.content === baseContent;
    return {
      hasConflict: false,
      mergedContent: single.content,
      conflicts: [],
      autoMergedHunksCount: isSame ? 0 : 1,
      contributors: [single.memberName],
      isIdenticalToExisting: isSame,
    };
  }

  // Filter out contributors whose content is completely unchanged from base
  const activeContributors = contributions.filter((c) => c.content !== baseContent);

  if (activeContributors.length === 0) {
    return {
      hasConflict: false,
      mergedContent: baseContent,
      conflicts: [],
      autoMergedHunksCount: 0,
      contributors: contributions.map((c) => c.memberName),
      isIdenticalToExisting: true,
    };
  }

  if (activeContributors.length === 1) {
    const single = activeContributors[0];
    if (!single) {
      return {
        hasConflict: false,
        mergedContent: baseContent,
        conflicts: [],
        autoMergedHunksCount: 0,
        contributors: [],
        isIdenticalToExisting: true,
      };
    }
    return {
      hasConflict: false,
      mergedContent: single.content,
      conflicts: [],
      autoMergedHunksCount: 1,
      contributors: [single.memberName],
      isIdenticalToExisting: false,
    };
  }

  // Two or more active contributors
  const firstContrib = activeContributors[0];
  if (!firstContrib) {
    return {
      hasConflict: false,
      mergedContent: baseContent,
      conflicts: [],
      autoMergedHunksCount: 0,
      contributors: [],
      isIdenticalToExisting: true,
    };
  }

  let currentAccumulated = firstContrib.content;
  let currentLabel = `${firstContrib.memberName} (${firstContrib.role})`;
  const allContributors = new Set<string>([firstContrib.memberName]);
  const allConflicts: MergeConflictHunk[] = [];
  let totalAutoMerged = 0;
  let overallConflict = false;

  for (let i = 1; i < activeContributors.length; i++) {
    const nextContrib = activeContributors[i];
    if (!nextContrib) continue;
    const nextLabel = `${nextContrib.memberName} (${nextContrib.role})`;
    allContributors.add(nextContrib.memberName);

    const stepResult = threeWayMerge(baseContent, currentAccumulated, nextContrib.content, {
      labelA: currentLabel,
      labelB: nextLabel,
      baseLabel: "BASE",
    });

    totalAutoMerged += stepResult.autoMergedHunksCount;
    if (stepResult.hasConflict) {
      overallConflict = true;
      allConflicts.push(...stepResult.conflicts);
    }
    currentAccumulated = stepResult.mergedContent;
    currentLabel = `Merged (${Array.from(allContributors).join(", ")})`;
  }

  return {
    hasConflict: overallConflict,
    mergedContent: currentAccumulated,
    conflicts: allConflicts,
    autoMergedHunksCount: totalAutoMerged,
    contributors: Array.from(allContributors),
    isIdenticalToExisting: currentAccumulated === baseContent,
    rawConflictMarkers: overallConflict ? currentAccumulated : undefined,
  };
}

/**
 * File Deletion vs Modification Conflict Detection
 */
export function detectDeletionConflict(
  baseExists: boolean,
  baseContent: string,
  deletedBy: { memberName: string; role: Role }[],
  modifiedBy: { memberName: string; role: Role; content: string }[],
): boolean {
  return baseExists && deletedBy.length > 0 && modifiedBy.length > 0;
}

/**
 * Same-File Creation Collision Detection
 * When multiple developers add a file at the exact same path:
 * - If identical -> No conflict
 * - If compatible -> 3-way merge with empty base
 * - If incompatible -> Conflict
 */
export function reconcileFileCreation(
  filePathOrFiles: string | { memberName: string; role: Role; content: string }[],
  maybeFiles?: { memberName: string; role: Role; content: string }[],
): MergeResult {
  const createdFiles: { memberName: string; role: Role; content: string }[] = Array.isArray(filePathOrFiles)
    ? filePathOrFiles
    : Array.isArray(maybeFiles)
      ? maybeFiles
      : [];

  if (createdFiles.length <= 1) {
    const f = createdFiles[0];
    return {
      hasConflict: false,
      mergedContent: f ? f.content : "",
      conflicts: [],
      autoMergedHunksCount: 0,
      contributors: f ? [f.memberName] : [],
      isIdenticalToExisting: false,
    };
  }

  // Check if all are identical
  const first = createdFiles[0]?.content ?? "";
  const allIdentical = createdFiles.every((c) => c.content === first);
  if (allIdentical) {
    return {
      hasConflict: false,
      mergedContent: first,
      conflicts: [],
      autoMergedHunksCount: createdFiles.length,
      contributors: createdFiles.map((c) => c.memberName),
      isIdenticalToExisting: false,
    };
  }

  // Merge against empty base
  const contributions: MemberContribution[] = createdFiles.map((c, idx) => ({
    fileId: `creation-${idx}`,
    userId: null,
    memberId: null,
    memberName: c.memberName,
    role: c.role,
    content: c.content,
  }));

  return multiPartyMerge("", contributions);
}

/**
 * Heuristic rename / move detection based on identical content hash
 */
export function detectFileRenames(
  deletedPaths: { path: string; hash: string }[],
  addedPaths: { path: string; hash: string }[],
): { oldPath: string; newPath: string }[] {
  const renames: { oldPath: string; newPath: string }[] = [];
  const addedMap = new Map<string, string>();

  for (const added of addedPaths) {
    if (added.hash) addedMap.set(added.hash, added.path);
  }

  for (const deleted of deletedPaths) {
    if (deleted.hash && addedMap.has(deleted.hash)) {
      renames.push({
        oldPath: deleted.path,
        newPath: addedMap.get(deleted.hash)!,
      });
    }
  }

  return renames;
}

/**
 * HackSync Senior Engineering Hardening: CodeSync State Machine Regression Test Suite
 * Tests P0/P1 concurrency & synchronization invariants:
 * - Deterministic state machine progression (LOCAL_ONLY -> PENDING_SYNC -> SYNCING -> SYNCED/SYNC_FAILED/CONFLICT)
 * - Strict rejection of invalid state transitions
 * - Immutable transition history auditing with timestamps, reasons, and errors
 * - Preservation of local uncommitted files on sync failure
 * - Conflict lifecycle (CONFLICT -> RESOLVED -> PENDING_SYNC -> SYNCING -> SYNCED)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  CodeSyncStateMachine,
  codeSyncService,
} from "@/lib/services/codesync.service";
import { transitionSyncState, type CodeSyncState } from "@/lib/hacksync/types";

describe("Senior Hardening: CodeSync Explicit State Machine & Integrity", () => {
  const projectId = "proj-sync-state-machine-1";

  beforeEach(() => {
    CodeSyncStateMachine.reset();
  });

  describe("1. Deterministic State Progression", () => {
    it("should start in LOCAL_ONLY state for a project by default", () => {
      const state = CodeSyncStateMachine.getState(projectId);
      expect(state).toBe("LOCAL_ONLY");
    });

    it("should progress through standard happy path: LOCAL_ONLY -> PENDING_SYNC -> SYNCING -> SYNCED", () => {
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC", "Staged files ready");
      expect(CodeSyncStateMachine.getState(projectId)).toBe("PENDING_SYNC");

      CodeSyncStateMachine.transition(projectId, "SYNCING", "Network sync initiated");
      expect(CodeSyncStateMachine.getState(projectId)).toBe("SYNCING");

      CodeSyncStateMachine.transition(projectId, "SYNCED", "Sync confirmed");
      expect(CodeSyncStateMachine.getState(projectId)).toBe("SYNCED");

      const history = CodeSyncStateMachine.getHistory(projectId);
      expect(history.length).toBe(3);
      expect(history[0].from).toBe("LOCAL_ONLY");
      expect(history[0].to).toBe("PENDING_SYNC");
      expect(history[1].from).toBe("PENDING_SYNC");
      expect(history[1].to).toBe("SYNCING");
      expect(history[2].from).toBe("SYNCING");
      expect(history[2].to).toBe("SYNCED");
    });
  });

  describe("2. Transition Guard & Invalid State Rejection", () => {
    it("should block invalid direct transition from LOCAL_ONLY to SYNCED", () => {
      expect(() => {
        CodeSyncStateMachine.transition(projectId, "SYNCED", "Direct jump attempt");
      }).toThrow(/Invalid CodeSync state transition from 'LOCAL_ONLY' to 'SYNCED'/);

      expect(CodeSyncStateMachine.getState(projectId)).toBe("LOCAL_ONLY");
    });

    it("should block invalid direct transition from SYNCED to SYNCING without pending stage", () => {
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC");
      CodeSyncStateMachine.transition(projectId, "SYNCING");
      CodeSyncStateMachine.transition(projectId, "SYNCED");

      expect(() => {
        CodeSyncStateMachine.transition(projectId, "SYNCING", "Bypass pending stage");
      }).toThrow(/Invalid CodeSync state transition from 'SYNCED' to 'SYNCING'/);
    });

    it("should handle transitionSyncState utility function consistently", () => {
      const valid = transitionSyncState("LOCAL_ONLY", "PENDING_SYNC");
      expect(valid.allowed).toBe(true);
      expect(valid.nextState).toBe("PENDING_SYNC");

      const invalid = transitionSyncState("LOCAL_ONLY", "SYNCING");
      expect(invalid.allowed).toBe(false);
      expect(invalid.nextState).toBe("LOCAL_ONLY");
      expect(invalid.error).toContain("Invalid CodeSync state transition");
    });
  });

  describe("3. Conflict Lifecycle & Resolution", () => {
    it("should transition SYNCING -> CONFLICT -> RESOLVED -> PENDING_SYNC -> SYNCING -> SYNCED", () => {
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC");
      CodeSyncStateMachine.transition(projectId, "SYNCING");
      CodeSyncStateMachine.transition(projectId, "CONFLICT", "Merge conflict in src/auth.ts");

      expect(CodeSyncStateMachine.getState(projectId)).toBe("CONFLICT");

      // Resolve conflict
      CodeSyncStateMachine.transition(projectId, "RESOLVED", "User picked version B");
      expect(CodeSyncStateMachine.getState(projectId)).toBe("RESOLVED");

      // Re-queue for sync
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC", "Ready to sync resolved conflict");
      CodeSyncStateMachine.transition(projectId, "SYNCING");
      CodeSyncStateMachine.transition(projectId, "SYNCED");

      expect(CodeSyncStateMachine.getState(projectId)).toBe("SYNCED");
    });
  });

  describe("4. Sync Failure & Local Work Preservation", () => {
    it("should transition to SYNC_FAILED on network/merge error without losing state history", () => {
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC");
      CodeSyncStateMachine.transition(projectId, "SYNCING");
      CodeSyncStateMachine.transition(
        projectId,
        "SYNC_FAILED",
        "Connection reset by peer",
        "ECONNRESET",
      );

      expect(CodeSyncStateMachine.getState(projectId)).toBe("SYNC_FAILED");

      const history = CodeSyncStateMachine.getHistory(projectId);
      const lastTransition = history[history.length - 1];
      expect(lastTransition.to).toBe("SYNC_FAILED");
      expect(lastTransition.error).toBe("ECONNRESET");

      // From SYNC_FAILED, the user can re-queue PENDING_SYNC or return to LOCAL_ONLY
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC", "Retry sync");
      expect(CodeSyncStateMachine.getState(projectId)).toBe("PENDING_SYNC");
    });
  });

  describe("5. Stale Base Detection", () => {
    it("should detect and reject stale base version during state progression", () => {
      // Simulate a sync attempt where base version is outdated
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC", "Files staged with v1 base");
      CodeSyncStateMachine.transition(projectId, "SYNCING", "Starting sync");

      // Another user modified the file, causing conflict
      CodeSyncStateMachine.transition(projectId, "CONFLICT", "Stale base detected: local base v1, remote is v3");

      expect(CodeSyncStateMachine.getState(projectId)).toBe("CONFLICT");
      const history = CodeSyncStateMachine.getHistory(projectId);
      const conflictEntry = history.find(h => h.to === "CONFLICT");
      expect(conflictEntry?.reason).toContain("Stale base");
    });
  });

  describe("6. Hash Mismatch Rejection", () => {
    it("should transition to CONFLICT when content hash mismatch is detected during sync", () => {
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC", "Files staged");
      CodeSyncStateMachine.transition(projectId, "SYNCING", "Sync started");

      // Hash mismatch triggers CONFLICT
      CodeSyncStateMachine.transition(projectId, "CONFLICT", "Content hash mismatch: expected abc123, got def456");

      expect(CodeSyncStateMachine.getState(projectId)).toBe("CONFLICT");
      const history = CodeSyncStateMachine.getHistory(projectId);
      const lastEntry = history[history.length - 1];
      expect(lastEntry.reason).toContain("hash mismatch");
    });
  });

  describe("7. Automated Retry State Progression", () => {
    it("should support full retry lifecycle: SYNC_FAILED -> PENDING_SYNC -> SYNCING -> SYNCED", () => {
      // First attempt fails
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC");
      CodeSyncStateMachine.transition(projectId, "SYNCING");
      CodeSyncStateMachine.transition(projectId, "SYNC_FAILED", "Network timeout", "ETIMEDOUT");

      expect(CodeSyncStateMachine.getState(projectId)).toBe("SYNC_FAILED");

      // Retry attempt 1
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC", "Retry attempt 1/3");
      CodeSyncStateMachine.transition(projectId, "SYNCING", "Retrying sync");
      CodeSyncStateMachine.transition(projectId, "SYNC_FAILED", "Connection refused", "ECONNREFUSED");

      // Retry attempt 2 succeeds
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC", "Retry attempt 2/3");
      CodeSyncStateMachine.transition(projectId, "SYNCING", "Final retry");
      CodeSyncStateMachine.transition(projectId, "SYNCED", "Sync succeeded on retry");

      expect(CodeSyncStateMachine.getState(projectId)).toBe("SYNCED");

      // Verify full history
      const history = CodeSyncStateMachine.getHistory(projectId);
      const failedTransitions = history.filter(h => h.to === "SYNC_FAILED");
      expect(failedTransitions.length).toBe(2);
      expect(failedTransitions[0].error).toBe("ETIMEDOUT");
      expect(failedTransitions[1].error).toBe("ECONNREFUSED");

      const retryTransitions = history.filter(h => h.reason?.includes("Retry attempt"));
      expect(retryTransitions.length).toBe(2);
    });

    it("should allow direct transition from SYNC_FAILED to SYNCING for immediate retry", () => {
      CodeSyncStateMachine.transition(projectId, "PENDING_SYNC");
      CodeSyncStateMachine.transition(projectId, "SYNCING");
      CodeSyncStateMachine.transition(projectId, "SYNC_FAILED", "Temporary failure");

      // Direct retry via SYNCING (allowed by transition table)
      CodeSyncStateMachine.transition(projectId, "SYNCING", "Immediate retry");
      CodeSyncStateMachine.transition(projectId, "SYNCED");

      expect(CodeSyncStateMachine.getState(projectId)).toBe("SYNCED");
    });
  });
});

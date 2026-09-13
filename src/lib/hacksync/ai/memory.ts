import type { ConversationState, AIIntentType } from "./types";

const DEFAULT_USER = "client-user";

export class ConversationMemory {
  /**
   * Per-user conversation state map.
   * Prevents cross-user state leakage in SSR or multi-tab environments.
   */
  private static stateMap = new Map<string, ConversationState>();

  private static getOrCreate(userId: string): ConversationState {
    const existing = this.stateMap.get(userId);
    if (existing) return existing;
    const fresh: ConversationState = { recentEntities: [] };
    this.stateMap.set(userId, fresh);
    return fresh;
  }

  static getState(userId = DEFAULT_USER): ConversationState {
    return { ...this.getOrCreate(userId) };
  }

  static update(partial: Partial<ConversationState>, userId = DEFAULT_USER): void {
    const current = this.getOrCreate(userId);
    const merged: ConversationState = {
      ...current,
      ...partial,
      recentEntities: partial.recentEntities
        ? Array.from(new Set([...partial.recentEntities, ...current.recentEntities])).slice(0, 10)
        : current.recentEntities,
    };
    this.stateMap.set(userId, merged);
  }

  static setActiveBug(bugId: string, filePath?: string, userId = DEFAULT_USER): void {
    const state = this.getOrCreate(userId);
    state.activeBugId = bugId;
    if (filePath) {
      state.activeFilePath = filePath;
      this.addEntity(filePath, userId);
    }
  }

  static addEntity(entity: string, userId = DEFAULT_USER): void {
    if (!entity) return;
    const state = this.getOrCreate(userId);
    const filtered = state.recentEntities.filter((e) => e !== entity);
    state.recentEntities = [entity, ...filtered].slice(0, 10);
  }

  static setLastFixPlan(plan: string, diff?: string, userId = DEFAULT_USER): void {
    const state = this.getOrCreate(userId);
    state.lastFixPlan = plan;
    if (diff) state.lastPatchDiff = diff;
  }

  static setLastTestReport(report: string, userId = DEFAULT_USER): void {
    const state = this.getOrCreate(userId);
    state.lastTestReport = report;
  }

  static clear(userId = DEFAULT_USER): void {
    this.stateMap.set(userId, { recentEntities: [] });
  }

  static clearAll(): void {
    this.stateMap.clear();
  }

  /**
   * Resolves contextual pronouns like "it", "this bug", "that file" using active memory.
   */
  static resolveContextualReferences(query: string, userId = DEFAULT_USER): {
    resolvedQuery: string;
    hasContext: boolean;
    activeBugId?: string | undefined;
    activeFilePath?: string | undefined;
  } {
    const state = this.getOrCreate(userId);
    const qLower = query.trim().toLowerCase();
    const hasContext = Boolean(state.activeBugId || state.activeFilePath);

    // If user says "fix it", "how to fix it", "patch it"
    if (
      (qLower === "fix it" || qLower.startsWith("fix it") || qLower.includes("patch it")) &&
      state.activeBugId
    ) {
      return {
        resolvedQuery: `Generate a fix plan and patch for identified bug ${state.activeBugId}${state.activeFilePath ? ` in ${state.activeFilePath}` : ""}.`,
        hasContext: true,
        activeBugId: state.activeBugId,
        activeFilePath: state.activeFilePath,
      };
    }

    // If user says "test it", "now test it", "run tests on it"
    if (
      (qLower === "test it" || qLower.startsWith("test it") || qLower.includes("test it") || qLower.includes("now test")) &&
      (state.activeBugId || state.activeFilePath)
    ) {
      return {
        resolvedQuery: `Generate and verify unit and regression tests for ${state.activeBugId ? `bug ${state.activeBugId}` : ""}${state.activeFilePath ? ` in ${state.activeFilePath}` : ""}.`,
        hasContext: true,
        activeBugId: state.activeBugId,
        activeFilePath: state.activeFilePath,
      };
    }

    // If user says "is it secure now?"
    if (
      qLower.includes("is it secure") &&
      (state.activeBugId || state.activeFilePath)
    ) {
      return {
        resolvedQuery: `Verify whether security risks in ${state.activeFilePath || state.activeBugId} have been resolved.`,
        hasContext: true,
        activeBugId: state.activeBugId,
        activeFilePath: state.activeFilePath,
      };
    }

    const isContextual = /\b(it|this|that|the bug|the file|the error|the fix|same)\b/i.test(query);
    return {
      resolvedQuery: query,
      hasContext: isContextual && hasContext,
      activeBugId: isContextual ? state.activeBugId : undefined,
      activeFilePath: isContextual ? state.activeFilePath : undefined,
    };
  }
}

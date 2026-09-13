/**
 * Project Index Manager
 * 
 * Scopes ProjectKnowledgeGraph instances strictly by projectId.
 * Ensures Project A never shares knowledge state, symbols, or AST index with Project B.
 */

import { ProjectKnowledgeGraph } from "./knowledge-graph";

export class ProjectIndexManager {
  private static graphs = new Map<string, { graph: ProjectKnowledgeGraph; lastAccessed: number }>();
  private static readonly MAX_PROJECTS = 50;
  private static readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Retrieves or instantiates an isolated ProjectKnowledgeGraph for the target project.
   */
  static getGraph(projectId: string): ProjectKnowledgeGraph {
    if (!projectId || projectId.trim() === "") {
      throw new Error("[ProjectIndexManager] Invalid projectId provided. Project isolation requires a non-empty projectId.");
    }

    const cleanId = projectId.trim();
    this.evictStale();

    const existing = this.graphs.get(cleanId);
    if (existing) {
      existing.lastAccessed = Date.now();
      return existing.graph;
    }

    const newGraph = new ProjectKnowledgeGraph();
    this.graphs.set(cleanId, { graph: newGraph, lastAccessed: Date.now() });
    return newGraph;
  }

  /**
   * Clears the cached knowledge graph for a specific project, or all projects.
   */
  static clear(projectId?: string): void {
    if (projectId) {
      const existing = this.graphs.get(projectId);
      if (existing) {
        existing.graph.clear();
        this.graphs.delete(projectId);
      }
    } else {
      for (const entry of this.graphs.values()) {
        entry.graph.clear();
      }
      this.graphs.clear();
    }
  }

  /**
   * Returns whether a project graph is currently cached in memory.
   */
  static hasProject(projectId: string): boolean {
    return this.graphs.has(projectId);
  }

  /**
   * Evicts least recently accessed projects when cache limit is reached or TTL expires.
   */
  private static evictStale(): void {
    const now = Date.now();

    // 1. Evict expired
    for (const [id, entry] of this.graphs.entries()) {
      if (now - entry.lastAccessed > this.TTL_MS) {
        entry.graph.clear();
        this.graphs.delete(id);
      }
    }

    // 2. Evict LRU if over capacity
    if (this.graphs.size >= this.MAX_PROJECTS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;

      for (const [id, entry] of this.graphs.entries()) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestId = id;
        }
      }

      if (oldestId) {
        this.graphs.get(oldestId)?.graph.clear();
        this.graphs.delete(oldestId);
      }
    }
  }
}

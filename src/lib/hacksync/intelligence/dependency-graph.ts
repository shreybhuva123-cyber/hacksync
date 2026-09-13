/**
 * Project-Scoped Dependency Graph
 * 
 * Represents semantic and structural relationships between files and symbols:
 * - IMPORTS (File A imports File B)
 * - EXPORTS (File A exports symbol X)
 * - REFERENCES (Symbol X references Symbol Y)
 * - CALLS (Function A invokes Function B)
 * - USES_API (Component/Service calls API endpoint)
 * - USES_DATABASE (Service queries database table)
 */

export type DependencyEdgeType =
  | "IMPORTS"
  | "EXPORTS"
  | "REFERENCES"
  | "CALLS"
  | "USES_API"
  | "USES_DATABASE";

export interface DependencyEdge {
  source: string; // File path or Symbol ID
  target: string; // File path, Symbol ID, or Table name
  type: DependencyEdgeType;
  confidence: number; // 0..100
  sourceLine: number;
  metadata?: Record<string, any> | undefined;
}

export class ProjectDependencyGraph {
  private edges: DependencyEdge[] = [];
  private forwardAdj = new Map<string, Set<string>>(); // source -> Set<target>
  private reverseAdj = new Map<string, Set<string>>(); // target -> Set<source>

  constructor(public readonly projectId?: string) {}

  /**
   * Adds an edge to the graph.
   */
  addEdge(edge: DependencyEdge): void {
    this.edges.push(edge);

    // Forward
    const fSet = this.forwardAdj.get(edge.source) || new Set();
    fSet.add(edge.target);
    this.forwardAdj.set(edge.source, fSet);

    // Reverse
    const rSet = this.reverseAdj.get(edge.target) || new Set();
    rSet.add(edge.source);
    this.reverseAdj.set(edge.target, rSet);
  }

  /**
   * Removes all edges originating from or pointing to a given source.
   */
  removeNode(nodeId: string): void {
    this.edges = this.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);

    // Rebuild adjacency
    this.rebuildAdjacency();
  }

  /**
   * Removes all edges originating from a specific source file or symbol.
   */
  removeEdgesForSource(source: string): void {
    this.edges = this.edges.filter((e) => e.source !== source);
    this.rebuildAdjacency();
  }

  private rebuildAdjacency(): void {
    this.forwardAdj.clear();
    this.reverseAdj.clear();
    for (const edge of this.edges) {
      const fSet = this.forwardAdj.get(edge.source) || new Set();
      fSet.add(edge.target);
      this.forwardAdj.set(edge.source, fSet);

      const rSet = this.reverseAdj.get(edge.target) || new Set();
      rSet.add(edge.source);
      this.reverseAdj.set(edge.target, rSet);
    }
  }

  /**
   * Direct files/symbols that `source` depends upon.
   */
  getDirectDependencies(source: string): string[] {
    return Array.from(this.forwardAdj.get(source) || []);
  }

  /**
   * Direct files/symbols that depend upon `target`.
   */
  getDirectDependents(target: string): string[] {
    return Array.from(this.reverseAdj.get(target) || []);
  }

  /**
   * Transitive dependents (reverse reachability): "What will break if I change X?"
   */
  getTransitiveDependents(target: string, maxDepth = 10): string[] {
    const visited = new Set<string>();
    const queue: { node: string; depth: number }[] = [{ node: target, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      const callers = this.reverseAdj.get(current.node) || new Set();
      for (const caller of callers) {
        if (!visited.has(caller) && caller !== target) {
          visited.add(caller);
          queue.push({ node: caller, depth: current.depth + 1 });
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Transitive dependencies (forward reachability): "What does X require directly or indirectly?"
   */
  getTransitiveDependencies(source: string, maxDepth = 10): string[] {
    const visited = new Set<string>();
    const queue: { node: string; depth: number }[] = [{ node: source, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      const deps = this.forwardAdj.get(current.node) || new Set();
      for (const dep of deps) {
        if (!visited.has(dep) && dep !== source) {
          visited.add(dep);
          queue.push({ node: dep, depth: current.depth + 1 });
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Detects circular dependencies (cycles) using depth-first search.
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = this.forwardAdj.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // Found cycle
          const cycleStartIndex = path.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            cycles.push([...path.slice(cycleStartIndex), neighbor]);
          }
        }
      }

      recStack.delete(node);
      path.pop();
    };

    for (const node of this.forwardAdj.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Returns all edges in graph.
   */
  getEdges(): DependencyEdge[] {
    return [...this.edges];
  }

  /**
   * Returns edges by source.
   */
  getEdgesFrom(source: string): DependencyEdge[] {
    return this.edges.filter((e) => e.source === source);
  }

  /**
   * Returns edges by target.
   */
  getEdgesTo(target: string): DependencyEdge[] {
    return this.edges.filter((e) => e.target === target);
  }

  /**
   * Clears the graph completely.
   */
  clear(): void {
    this.edges = [];
    this.forwardAdj.clear();
    this.reverseAdj.clear();
  }
}

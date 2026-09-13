/**
 * Tool: find_api_routes
 * Secure Read-Only lookup of API endpoints and contracts.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import type { Workspace } from "../../types";

export interface FindApiRoutesParams {
  method?: string | undefined;
  routePrefix?: string | undefined;
}

export interface ApiRouteInfo {
  method: string;
  route: string;
  filePath?: string | undefined;
  authRequired?: boolean | undefined;
  source: "AST_PARSER" | "WORKSPACE_CONTRACT";
}

export class FindApiRoutesTool {
  static readonly name = "find_api_routes";
  static readonly tier = "READ_ONLY";

  static execute(
    graph: ProjectKnowledgeGraph,
    params: FindApiRoutesParams,
    ws?: Workspace | null | undefined,
  ): ApiRouteInfo[] {
    const methodFilter = params.method ? params.method.toUpperCase().trim() : undefined;
    const prefixFilter = params.routePrefix ? params.routePrefix.trim() : undefined;

    const routes: ApiRouteInfo[] = [];
    const seen = new Set<string>();

    // 1. AST Parsed Routes from ProjectKnowledgeGraph
    const astRoutes = graph.getApiRoutes();
    for (const r of astRoutes) {
      const routeKey = `${r.method.toUpperCase()} ${r.path}`;
      if (!seen.has(routeKey)) {
        seen.add(routeKey);
        routes.push({
          method: r.method.toUpperCase(),
          route: r.path,
          filePath: r.filePath,
          authRequired: r.authRequired,
          source: "AST_PARSER",
        });
      }
    }

    // 2. Registered Workspace Contracts
    if (ws?.contracts) {
      for (const c of ws.contracts) {
        const routeKey = `${c.method.toUpperCase()} ${c.route}`;
        if (!seen.has(routeKey)) {
          seen.add(routeKey);
          routes.push({
            method: c.method.toUpperCase(),
            route: c.route,
            authRequired: c.auth_required,
            source: "WORKSPACE_CONTRACT",
          });
        }
      }
    }

    // Apply filters
    return routes.filter((r) => {
      if (methodFilter && r.method !== methodFilter) return false;
      if (prefixFilter && !r.route.startsWith(prefixFilter)) return false;
      return true;
    });
  }
}

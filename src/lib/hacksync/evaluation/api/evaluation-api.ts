/**
 * HackSync Phase 6: Evaluation Dashboard Server API Layer
 * Implements authoritative REST handlers for running benchmarks, retrieving history,
 * comparing models, tracking costs, and inspecting regressions.
 * Every endpoint strictly verifies caller identity and project membership.
 */

import { verifyProjectMembership } from "@/lib/security/tenant-verifier";
import { AuthenticationError, AuthorizationError, NotFoundError } from "@/lib/errors";
import { EvaluationEngine } from "../evaluation-engine";
import { BenchmarkLoader } from "../benchmark-loader";
import { CostTracker } from "../../observability/cost-tracker";
import { ModelComparisonEngine } from "../model-comparison";
import type { EvaluationRunnerOptions, BenchmarkRun } from "../types";

export interface EvaluationApiRequest {
  userId?: string | undefined;
  projectId?: string | undefined;
  body?: Record<string, unknown> | undefined;
  params?: Record<string, string> | undefined;
  query?: Record<string, string> | undefined;
}

export interface EvaluationApiResponse<T = unknown> {
  status: number;
  data?: T | undefined;
  error?: string | undefined;
}

export class EvaluationApi {
  /**
   * Helper: Authenticates session and validates project membership.
   */
  private static async authorize(req: EvaluationApiRequest): Promise<{ userId: string; projectId: string }> {
    const userId = req.userId;
    const projectId = req.projectId || req.query?.["projectId"] || (req.body?.["projectId"] as string);

    if (!userId) {
      throw new AuthenticationError("[EvaluationApi] Caller must be authenticated.");
    }
    if (!projectId) {
      throw new AuthorizationError("[EvaluationApi] Target projectId is required.");
    }

    const membership = await verifyProjectMembership(userId, projectId);
    if (!membership.allowed) {
      throw new AuthorizationError(
        `[EvaluationApi] User '${userId}' is not an authorized member of project '${projectId}'.`,
      );
    }

    return { userId, projectId };
  }

  /**
   * POST /api/evaluation/run
   * Executes a benchmark evaluation run on a project fixture or workspace.
   */
  static async handleRun(req: EvaluationApiRequest): Promise<EvaluationApiResponse<BenchmarkRun>> {
    try {
      const { userId, projectId } = await this.authorize(req);
      const body = req.body || {};

      const options: EvaluationRunnerOptions = {
        projectId,
        userId,
        provider: body["provider"] as string,
        model: body["model"] as string,
        filter: body["filter"] as any,
        timeoutMsPerCase: body["timeoutMsPerCase"] as number,
      };

      const result = await EvaluationEngine.runBenchmark(options);
      return { status: 200, data: result };
    } catch (err: any) {
      return {
        status: err instanceof AuthorizationError ? 403 : err instanceof AuthenticationError ? 401 : 500,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * GET /api/evaluation/runs
   * Lists historical benchmark runs for the authorized project.
   */
  static async handleListRuns(req: EvaluationApiRequest): Promise<EvaluationApiResponse<any[]>> {
    try {
      const { projectId } = await this.authorize(req);
      const runs = await EvaluationEngine.getRuns(projectId);
      return { status: 200, data: runs };
    } catch (err: any) {
      return {
        status: err instanceof AuthorizationError ? 403 : 500,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * GET /api/evaluation/runs/:id
   * Retrieves a specific benchmark run by ID.
   */
  static async handleGetRun(req: EvaluationApiRequest): Promise<EvaluationApiResponse<BenchmarkRun>> {
    try {
      const { projectId } = await this.authorize(req);
      const runId = req.params?.["id"] || req.query?.["id"];
      if (!runId) {
        throw new NotFoundError("[EvaluationApi] Run ID is required.");
      }

      const run = await EvaluationEngine.getRunById(runId);
      if (!run || run.projectId !== projectId) {
        throw new NotFoundError(`Benchmark run '${runId}' not found in project.`);
      }

      return { status: 200, data: run };
    } catch (err: any) {
      return {
        status: err instanceof NotFoundError ? 404 : err instanceof AuthorizationError ? 403 : 500,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * GET /api/evaluation/models
   * Compares two models head-to-head.
   */
  static async handleCompareModels(req: EvaluationApiRequest): Promise<EvaluationApiResponse> {
    try {
      await this.authorize(req);
      const modelA = req.body?.["modelA"] as any;
      const modelB = req.body?.["modelB"] as any;

      if (!modelA || !modelB) {
        return { status: 400, error: "Both modelA and modelB benchmark records are required." };
      }

      const comparison = ModelComparisonEngine.compareModels(modelA, modelB);
      return { status: 200, data: comparison };
    } catch (err: any) {
      return { status: 500, error: err?.message || String(err) };
    }
  }

  /**
   * GET /api/evaluation/metrics
   * Returns benchmark dataset catalog and available categories.
   */
  static async handleGetMetrics(req: EvaluationApiRequest): Promise<EvaluationApiResponse> {
    try {
      await this.authorize(req);
      const allCases = BenchmarkLoader.getAllCases();
      const categories = Array.from(new Set(allCases.map((c) => c.category)));

      return {
        status: 200,
        data: {
          totalCases: allCases.length,
          categories,
          difficulties: ["easy", "medium", "hard"],
        },
      };
    } catch (err: any) {
      return { status: 500, error: err?.message || String(err) };
    }
  }
}

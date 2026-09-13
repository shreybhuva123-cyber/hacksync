/**
 * HackSync Phase 5: JSON Benchmark Reporter
 * Serializes benchmark runs and case results to structured JSON.
 */

import type { BenchmarkRun } from "../types";

export class JsonReporter {
  /**
   * Generates formatted JSON output from a benchmark run.
   */
  static format(run: BenchmarkRun, pretty = true): string {
    return pretty ? JSON.stringify(run, null, 2) : JSON.stringify(run);
  }
}

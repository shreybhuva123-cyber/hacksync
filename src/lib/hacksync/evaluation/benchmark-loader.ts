/**
 * HackSync Phase 5: Benchmark Loader & Validator
 * Loads, filters, and validates ground truth benchmark cases.
 */

import { BENCHMARK_CASES } from "./benchmark-dataset";
import type { BenchmarkCase, BenchmarkFilterOptions } from "./types";

export class BenchmarkLoader {
  /**
   * Returns all validated benchmark cases.
   */
  static getAllCases(): BenchmarkCase[] {
    return this.validateCases(BENCHMARK_CASES);
  }

  /**
   * Retrieves a single benchmark case by its unique ID.
   */
  static getCaseById(id: string): BenchmarkCase | undefined {
    return this.getAllCases().find((c) => c.id === id);
  }

  /**
   * Filters benchmark cases according to criteria.
   */
  static filterCases(options: BenchmarkFilterOptions = {}): BenchmarkCase[] {
    let cases = this.getAllCases();

    if (options.categories && options.categories.length > 0) {
      const catSet = new Set(options.categories);
      cases = cases.filter((c) => catSet.has(c.category));
    }

    if (options.difficulties && options.difficulties.length > 0) {
      const diffSet = new Set(options.difficulties);
      cases = cases.filter((c) => diffSet.has(c.difficulty));
    }

    if (options.tags && options.tags.length > 0) {
      cases = cases.filter((c) =>
        options.tags!.some((tag) => c.tags.includes(tag)),
      );
    }

    if (options.ids && options.ids.length > 0) {
      const idSet = new Set(options.ids);
      cases = cases.filter((c) => idSet.has(c.id));
    }

    if (options.maxCases && options.maxCases > 0) {
      cases = cases.slice(0, options.maxCases);
    }

    return cases;
  }

  /**
   * Validates integrity of benchmark cases.
   * Throws an error if required properties or ground truth fields are invalid.
   */
  static validateCases(cases: BenchmarkCase[]): BenchmarkCase[] {
    const seenIds = new Set<string>();

    for (const c of cases) {
      if (!c.id || typeof c.id !== "string") {
        throw new Error(`Invalid benchmark case: id is missing or not a string.`);
      }
      if (seenIds.has(c.id)) {
        throw new Error(`Duplicate benchmark case ID detected: "${c.id}".`);
      }
      seenIds.add(c.id);

      if (!c.name || typeof c.name !== "string") {
        throw new Error(`Benchmark case "${c.id}" is missing a valid name.`);
      }
      if (!c.category || typeof c.category !== "string") {
        throw new Error(`Benchmark case "${c.id}" is missing a valid category.`);
      }
      if (!c.task || typeof c.task.query !== "string") {
        throw new Error(`Benchmark case "${c.id}" is missing task.query.`);
      }

      // If fixture is provided, validate file paths and contents
      if (c.projectFixture) {
        if (!c.projectFixture.id || !c.projectFixture.name) {
          throw new Error(`Benchmark fixture in "${c.id}" has invalid id or name.`);
        }
        for (const file of c.projectFixture.files || []) {
          if (!file.path || typeof file.path !== "string") {
            throw new Error(`Benchmark fixture in "${c.id}" contains a file without a path.`);
          }
          if (file.path.startsWith("/") || file.path.includes("..")) {
            throw new Error(`Benchmark fixture in "${c.id}" contains an unsafe path: "${file.path}".`);
          }
        }
      }
    }

    return cases;
  }
}

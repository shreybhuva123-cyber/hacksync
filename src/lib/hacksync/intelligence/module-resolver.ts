/**
 * Module Resolver for HackSync Project Intelligence
 * 
 * Resolves module import specifiers to real project file paths:
 * - Relative imports: `./foo`, `../bar/baz`
 * - Extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`, `.json`
 * - Directory index files: `./foo` -> `./foo/index.ts`, `./foo/index.tsx`, etc.
 * - Path aliases: `@/` -> `src/`
 * - Distinguishes 3rd-party/external dependencies from internal files
 * - Explicitly marks unresolved imports when file is missing from index
 */

export interface ResolvedModule {
  source: string;
  resolvedPath: string | null;
  isExternal: boolean;
  unresolved: boolean;
}

export class ModuleResolver {
  private static readonly CANDIDATE_EXTENSIONS = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".d.ts",
    ".json",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/index.jsx",
  ];

  /**
   * Normalizes path separators to forward slashes and removes duplicate slashes.
   */
  static normalizePath(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
  }

  /**
   * Resolves relative or aliased path segments.
   */
  static resolveRelativePath(fromFilePath: string, importSource: string): string {
    const cleanFrom = this.normalizePath(fromFilePath);
    const fromDir = cleanFrom.includes("/")
      ? cleanFrom.substring(0, cleanFrom.lastIndexOf("/"))
      : "";

    if (importSource.startsWith("@/")) {
      return this.normalizePath(importSource.replace(/^@\//, "src/"));
    }

    if (importSource.startsWith("./") || importSource.startsWith("../")) {
      const fromParts = fromDir ? fromDir.split("/") : [];
      const importParts = importSource.split("/");
      const stack: string[] = [...fromParts];

      for (const part of importParts) {
        if (!part || part === ".") continue;
        if (part === "..") {
          if (stack.length > 0) {
            stack.pop();
          }
        } else {
          stack.push(part);
        }
      }

      return stack.join("/");
    }

    return importSource;
  }

  /**
   * Checks if an import source is an external NPM / 3rd party package.
   */
  static isExternalPackage(importSource: string): boolean {
    if (importSource.startsWith(".") || importSource.startsWith("/") || importSource.startsWith("@/")) {
      return false;
    }
    // E.g. "react", "express", "@tanstack/react-query", "lodash/get"
    return true;
  }

  /**
   * Resolves an import source against a set of known project file paths.
   */
  static resolve(
    fromFilePath: string,
    importSource: string,
    knownFiles: Set<string> | string[],
  ): ResolvedModule {
    const fileSet = knownFiles instanceof Set ? knownFiles : new Set(knownFiles);

    // 1. External dependencies
    if (this.isExternalPackage(importSource)) {
      return {
        source: importSource,
        resolvedPath: null,
        isExternal: true,
        unresolved: false,
      };
    }

    // 2. Resolve relative or aliased base path
    const basePath = this.resolveRelativePath(fromFilePath, importSource);

    // 3. Test candidate extensions & directory index files
    for (const ext of this.CANDIDATE_EXTENSIONS) {
      const candidate = this.normalizePath(basePath + ext);
      if (fileSet.has(candidate)) {
        return {
          source: importSource,
          resolvedPath: candidate,
          isExternal: false,
          unresolved: false,
        };
      }
    }

    // 4. Fuzzy fallback: check if candidate matches end of any known path
    for (const known of fileSet) {
      const normalizedKnown = this.normalizePath(known);
      if (
        normalizedKnown.endsWith(`/${basePath}`) ||
        normalizedKnown.endsWith(`/${basePath}.ts`) ||
        normalizedKnown.endsWith(`/${basePath}.tsx`) ||
        normalizedKnown.endsWith(`/${basePath}.js`) ||
        normalizedKnown.endsWith(`/${basePath}.jsx`)
      ) {
        return {
          source: importSource,
          resolvedPath: known,
          isExternal: false,
          unresolved: false,
        };
      }
    }

    // 5. Unresolved internal import
    return {
      source: importSource,
      resolvedPath: null,
      isExternal: false,
      unresolved: true,
    };
  }
}

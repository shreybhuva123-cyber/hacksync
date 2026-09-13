/**
 * Project-Scoped Symbol Index
 * 
 * Provides fast definition lookup, symbol matching, and hierarchy queries
 * strictly isolated per project.
 */

import type { ParsedSymbol, SymbolKind } from "./parsers/parser-interface";

export class SymbolIndex {
  private symbolsByName = new Map<string, ParsedSymbol[]>();
  private symbolsByFile = new Map<string, ParsedSymbol[]>();
  private allSymbols: ParsedSymbol[] = [];

  constructor(public readonly projectId?: string) {}

  /**
   * Adds a parsed symbol into the index.
   */
  addSymbol(symbol: ParsedSymbol): void {
    const symbolWithProject: ParsedSymbol = {
      ...symbol,
      projectId: this.projectId || symbol.projectId,
    };

    this.allSymbols.push(symbolWithProject);

    // Index by symbol name
    const byName = this.symbolsByName.get(symbol.name) || [];
    byName.push(symbolWithProject);
    this.symbolsByName.set(symbol.name, byName);

    // Index by file path
    if (symbol.filePath) {
      const byFile = this.symbolsByFile.get(symbol.filePath) || [];
      byFile.push(symbolWithProject);
      this.symbolsByFile.set(symbol.filePath, byFile);
    }
  }

  /**
   * Adds an array of symbols into the index.
   */
  addSymbols(symbols: ParsedSymbol[]): void {
    symbols.forEach((s) => this.addSymbol(s));
  }

  /**
   * Removes all indexed symbols belonging to a specific file.
   */
  removeSymbolsForFile(filePath: string): void {
    const removedSymbols = this.symbolsByFile.get(filePath) || [];
    this.symbolsByFile.delete(filePath);

    const removedSet = new Set(removedSymbols);
    this.allSymbols = this.allSymbols.filter((s) => !removedSet.has(s));

    // Update byName maps
    removedSymbols.forEach((s) => {
      const list = this.symbolsByName.get(s.name);
      if (list) {
        const filtered = list.filter((item) => item !== s);
        if (filtered.length > 0) {
          this.symbolsByName.set(s.name, filtered);
        } else {
          this.symbolsByName.delete(s.name);
        }
      }
    });
  }

  /**
   * Retrieves symbols with exact matching name.
   */
  getSymbolsByName(name: string): ParsedSymbol[] {
    return this.symbolsByName.get(name) || [];
  }

  /**
   * Finds first exact match with optional kind filter.
   */
  findExact(name: string, kind?: SymbolKind): ParsedSymbol | undefined {
    const candidates = this.symbolsByName.get(name) || [];
    if (!kind) return candidates[0];
    return candidates.find((s) => s.kind === kind);
  }

  /**
   * Multi-strategy symbol search (exact > prefix > fuzzy substring).
   */
  search(query: string, limit = 10): ParsedSymbol[] {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];

    const exact: ParsedSymbol[] = [];
    const prefix: ParsedSymbol[] = [];
    const substring: ParsedSymbol[] = [];

    for (const sym of this.allSymbols) {
      const symNameLower = sym.name.toLowerCase();
      if (symNameLower === clean) {
        exact.push(sym);
      } else if (symNameLower.startsWith(clean)) {
        prefix.push(sym);
      } else if (symNameLower.includes(clean)) {
        substring.push(sym);
      }
    }

    const combined = [...exact, ...prefix, ...substring];
    return combined.slice(0, limit);
  }

  /**
   * Retrieves all symbols defined within a specific file.
   */
  getSymbolsForFile(filePath: string): ParsedSymbol[] {
    return this.symbolsByFile.get(filePath) || [];
  }

  /**
   * Retrieves all symbols that are exported.
   */
  getExportedSymbols(): ParsedSymbol[] {
    return this.allSymbols.filter((s) => s.isExported);
  }

  /**
   * Retrieves class methods for a given class name.
   */
  getMethodsForClass(className: string): ParsedSymbol[] {
    return this.allSymbols.filter(
      (s) => s.kind === "method" && s.parentSymbol === className,
    );
  }

  /**
   * Clears the index completely.
   */
  clear(): void {
    this.symbolsByName.clear();
    this.symbolsByFile.clear();
    this.allSymbols = [];
  }

  /**
   * Returns total symbol count.
   */
  size(): number {
    return this.allSymbols.length;
  }

  /**
   * Returns all symbols in index.
   */
  getAllSymbols(): ParsedSymbol[] {
    return [...this.allSymbols];
  }
}

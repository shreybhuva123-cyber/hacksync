/**
 * In-Memory BM25 Inverted Search Index for Fast Code Retrieval
 */

export interface IndexedDocument {
  id: string;
  path: string;
  tokens: string[];
  lines: string[];
  content: string;
}

export interface SearchResult {
  path: string;
  score: number;
  matchedLines: { line: number; text: string }[];
  snippet: string;
}

export class BM25SearchIndex {
  private documents: Map<string, IndexedDocument> = new Map();
  private docFrequency: Map<string, number> = new Map(); // Term -> number of docs containing term
  private avgDocLength = 0;
  private totalDocs = 0;

  private k1 = 1.2;
  private b = 0.75;

  private tokenize(text: string): string[] {
    if (!text) return [];

    // Split words, camelCase, snake_case, and path segments
    return text
      .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase split
      .replace(/[_\-/.:\\]/g, " ")
      .toLowerCase()
      .split(/[^a-zA-Z0-9]+/)
      .filter((t) => t.length > 1);
  }

  addDocument(path: string, content: string): void {
    const tokens = this.tokenize(path + " " + content);
    const lines = content.split("\n");

    const doc: IndexedDocument = {
      id: path,
      path,
      tokens,
      lines,
      content,
    };

    if (this.documents.has(path)) {
      const oldDoc = this.documents.get(path)!;
      const oldTokenSet = new Set(oldDoc.tokens);
      for (const term of oldTokenSet) {
        const count = this.docFrequency.get(term) || 0;
        if (count <= 1) this.docFrequency.delete(term);
        else this.docFrequency.set(term, count - 1);
      }
    }

    // Update term frequencies
    const uniqueTerms = new Set(tokens);
    uniqueTerms.forEach((term) => {
      this.docFrequency.set(term, (this.docFrequency.get(term) || 0) + 1);
    });

    this.documents.set(path, doc);
    this.totalDocs = this.documents.size;

    // Recalculate average doc length
    let totalLength = 0;
    this.documents.forEach((d) => (totalLength += d.tokens.length));
    this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
  }

  clear(): void {
    this.documents.clear();
    this.docFrequency.clear();
    this.totalDocs = 0;
    this.avgDocLength = 0;
  }

  search(query: string, limit = 5): SearchResult[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0 || this.totalDocs === 0) return [];

    const scores: { path: string; score: number; matchedLines: { line: number; text: string }[] }[] = [];

    this.documents.forEach((doc) => {
      let score = 0;
      const termCounts: Map<string, number> = new Map();
      doc.tokens.forEach((t) => termCounts.set(t, (termCounts.get(t) || 0) + 1));

      const matchedLines: { line: number; text: string }[] = [];

      queryTokens.forEach((qTerm) => {
        const tf = termCounts.get(qTerm) || 0;
        if (tf > 0) {
          const df = this.docFrequency.get(qTerm) || 1;
          const idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + (this.b * doc.tokens.length) / (this.avgDocLength || 1));
          score += idf * (numerator / denominator);

          // Path bonus
          if (doc.path.toLowerCase().includes(qTerm)) {
            score += 3.0;
          }

          // Locate matched lines
          doc.lines.forEach((lineText, idx) => {
            if (lineText.toLowerCase().includes(qTerm) && matchedLines.length < 5) {
              matchedLines.push({ line: idx + 1, text: lineText.trim() });
            }
          });
        }
      });

      if (score > 0) {
        scores.push({ path: doc.path, score, matchedLines });
      }
    });

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => {
        const doc = this.documents.get(item.path)!;
        const snippet = item.matchedLines.length > 0
          ? item.matchedLines.map((m) => `L${m.line}: ${m.text}`).join("\n")
          : doc.content.slice(0, 300);

        return {
          path: item.path,
          score: Number(item.score.toFixed(3)),
          matchedLines: item.matchedLines,
          snippet,
        };
      });
  }
}

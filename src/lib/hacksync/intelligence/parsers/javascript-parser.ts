import { TypeScriptParser } from "./typescript-parser";
import type { CodeParser, ParsedAstSummary } from "./parser-interface";

export class JavaScriptParser implements CodeParser {
  private tsParser = new TypeScriptParser();

  canParse(filePath: string): boolean {
    return /\.(js|jsx|mjs|cjs)$/i.test(filePath);
  }

  parse(filePath: string, content: string): ParsedAstSummary {
    const summary = this.tsParser.parse(filePath, content);
    return {
      ...summary,
      language: filePath.endsWith(".jsx") ? "jsx" : "javascript",
    };
  }
}

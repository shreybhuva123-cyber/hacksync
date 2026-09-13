/**
 * Source-Sink Data Flow Analyzer — HackSync Phase 3
 * 
 * ARCHITECTURAL SCOPE & HONESTY NOTICE:
 * This analyzer is a lightweight, heuristic, intra-file (single-file) data flow tracer
 * tracking untrusted inputs to dangerous execution sinks within common handler functions.
 * It is NOT a full, sound, whole-program interprocedural taint compiler.
 * Confidence ratings are calibrated honestly: direct local sinks are rated high/very_high,
 * while multi-step, distance-separated, or complex flows are rated medium to reflect heuristic limits.
 */

import type { FindingConfidence } from "./finding-types";

export interface DataFlowTrace {
  sourceType: "query_param" | "route_param" | "request_body" | "header" | "cookie" | "user_input";
  sinkType: "sql_execution" | "command_execution" | "filesystem" | "ssrf_request" | "dom_html" | "dynamic_eval";
  sourceVar: string;
  sourceLine: number;
  sourceSnippet: string;
  sinkLine: number;
  sinkSnippet: string;
  confidence: FindingConfidence;
  evidence: string;
}

export class SourceSinkAnalyzer {
  private static readonly SOURCE_PATTERNS: {
    type: DataFlowTrace["sourceType"];
    regex: RegExp;
    varExtractRegex: RegExp;
  }[] = [
    {
      type: "query_param",
      regex: /(?:req(?:uest)?\.query(?:\.([a-zA-Z0-9_]+)|\[["']([a-zA-Z0-9_]+)["']\])|searchParams\.get\(["']([a-zA-Z0-9_]+)["']\))/i,
      varExtractRegex: /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:req(?:uest)?\.query(?:\.([a-zA-Z0-9_]+)|\[["']([a-zA-Z0-9_]+)["']\])|searchParams\.get)/i,
    },
    {
      type: "route_param",
      regex: /(?:req(?:uest)?\.params(?:\.([a-zA-Z0-9_]+)|\[["']([a-zA-Z0-9_]+)["']\])|params\.([a-zA-Z0-9_]+))/i,
      varExtractRegex: /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:req(?:uest)?\.params|params\.)/i,
    },
    {
      type: "request_body",
      regex: /(?:req(?:uest)?\.body(?:\.([a-zA-Z0-9_]+)|\[["']([a-zA-Z0-9_]+)["']\])|await\s+req(?:uest)?\.json\(\))/i,
      varExtractRegex: /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:req(?:uest)?\.body|await\s+req(?:uest)?\.json\(\))/i,
    },
    {
      type: "header",
      regex: /req(?:uest)?\.headers?(?:\[["']([^"']+)["']\]|\.get\(["']([^"']+)["']\))/i,
      varExtractRegex: /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*req(?:uest)?\.headers?/i,
    },
  ];

  private static readonly SINK_PATTERNS: {
    type: DataFlowTrace["sinkType"];
    regex: RegExp;
    confidence: FindingConfidence;
  }[] = [
    {
      type: "sql_execution",
      regex: /(?:(?:db|client|pool|connection)\.query\s*\(|\$queryRaw\s*\(|\$executeRaw\s*\(|supabase\.rpc\s*\()/i,
      confidence: "high",
    },
    {
      type: "command_execution",
      regex: /(?:exec\s*\(|spawn\s*\(|execSync\s*\(|child_process\.(?:exec|spawn)\s*\()/i,
      confidence: "high",
    },
    {
      type: "filesystem",
      regex: /(?:fs\.(?:readFile|readFileSync|writeFile|writeFileSync|unlink|unlinkSync|createReadStream)\s*\()/i,
      confidence: "high",
    },
    {
      type: "ssrf_request",
      regex: /(?:fetch\s*\(|axios\.(?:get|post|put|delete|request)\s*\(|http\.get\s*\(|https\.get\s*\()/i,
      confidence: "medium",
    },
    {
      type: "dom_html",
      regex: /(?:dangerouslySetInnerHTML\s*=\s*\{\s*__html\s*:|\.innerHTML\s*=)/i,
      confidence: "high",
    },
    {
      type: "dynamic_eval",
      regex: /(?:eval\s*\(|new\s+Function\s*\()/i,
      confidence: "very_high",
    },
  ];

  /**
   * Analyzes file content for untrusted data flows from source to sink.
   */
  static analyze(filePath: string, content: string): DataFlowTrace[] {
    const traces: DataFlowTrace[] = [];
    const lines = content.split("\n");

    // Map of variable name -> { sourceLine, sourceType, snippet }
    const trackedVars = new Map<string, { line: number; type: DataFlowTrace["sourceType"]; snippet: string }>();

    // Pass 1: Identify source variables
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const trimmed = lineText.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

      for (const src of this.SOURCE_PATTERNS) {
        if (src.regex.test(trimmed)) {
          const match = trimmed.match(src.varExtractRegex);
          if (match && match[1]) {
            const varName = match[1].trim();
            trackedVars.set(varName, { line: lineNum, type: src.type, snippet: trimmed });
          } else {
            // Destructured pattern e.g. const { id, name } = req.query;
            const destructureMatch = trimmed.match(/(?:const|let|var)\s+\{([^}]+)\}\s*=\s*(?:req|searchParams|params)/i);
            if (destructureMatch && destructureMatch[1]) {
              destructureMatch[1].split(",").forEach((token) => {
                const varName = token.split(":")[0]?.trim();
                if (varName && /^[a-zA-Z0-9_]+$/.test(varName)) {
                  trackedVars.set(varName, { line: lineNum, type: src.type, snippet: trimmed });
                }
              });
            }
          }
        }
      }
    });

    // Pass 2: Trace into sinks
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const trimmed = lineText.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

      for (const sink of this.SINK_PATTERNS) {
        if (sink.regex.test(trimmed)) {
          // Check if any tracked untrusted variable reaches this sink
          trackedVars.forEach((sourceInfo, varName) => {
            // Variable is in the sink line and occurs on or after the source line
            const varUsageRegex = new RegExp(`\\b${varName}\\b`);
            if (lineNum >= sourceInfo.line && varUsageRegex.test(trimmed)) {
              // Exclude defensive patterns (e.g. parseInt(x), Number(x), parameterized query with $1, sanitize(x))
              const isSanitized =
                trimmed.includes(`parseInt(${varName}`) ||
                trimmed.includes(`Number(${varName}`) ||
                trimmed.includes(`sanitize`) ||
                trimmed.includes(`encodeURI`) ||
                (sink.type === "sql_execution" && trimmed.includes("$1") && !trimmed.includes("+") && !trimmed.includes("${"));

              if (!isSanitized) {
                // Calibrate confidence: long-distance or multi-line flows are rated honestly
                let calculatedConfidence = sink.confidence;
                if (lineNum - sourceInfo.line > 25) {
                  calculatedConfidence = calculatedConfidence === "very_high" ? "high" : "medium";
                }

                traces.push({
                  sourceType: sourceInfo.type,
                  sinkType: sink.type,
                  sourceVar: varName,
                  sourceLine: sourceInfo.line,
                  sourceSnippet: sourceInfo.snippet,
                  sinkLine: lineNum,
                  sinkSnippet: trimmed,
                  confidence: calculatedConfidence,
                  evidence: `Untrusted variable '${varName}' originating from ${sourceInfo.type} at line ${sourceInfo.line} flows into ${sink.type} at line ${lineNum} without defensive parameterization or sanitization.`,
                });
              }
            }
          });
        }
      }
    });

    return traces;
  }
}

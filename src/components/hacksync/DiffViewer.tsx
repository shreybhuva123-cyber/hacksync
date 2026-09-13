import { useMemo } from "react";
import { Check, Copy, FileCode2 } from "lucide-react";
import { CopyButton } from "./primitives";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  diff: string;
  filePath?: string | undefined;
  className?: string | undefined;
  maxHeight?: string | undefined;
}

interface ParsedDiffLine {
  type: "header" | "added" | "removed" | "context";
  content: string;
  oldLineNumber?: number | undefined;
  newLineNumber?: number | undefined;
}

export function DiffViewer({
  diff,
  filePath,
  className,
  maxHeight = "24rem",
}: DiffViewerProps) {
  const parsedLines = useMemo(() => {
    const lines = diff.split("\n");
    const result: ParsedDiffLine[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        // Hunk header e.g. @@ -10,5 +10,6 @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLine = parseInt(match[1] || "1", 10);
          newLine = parseInt(match[2] || "1", 10);
        }
        result.push({ type: "header", content: line });
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        result.push({
          type: "added",
          content: line.slice(1),
          newLineNumber: newLine++,
        });
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        result.push({
          type: "removed",
          content: line.slice(1),
          oldLineNumber: oldLine++,
        });
      } else {
        result.push({
          type: "context",
          content: line.startsWith(" ") ? line.slice(1) : line,
          oldLineNumber: line.startsWith("---") || line.startsWith("+++") ? undefined : oldLine++,
          newLineNumber: line.startsWith("---") || line.startsWith("+++") ? undefined : newLine++,
        });
      }
    }
    return result;
  }, [diff]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[8px] border border-border bg-background",
        className,
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2">
          <FileCode2 className="size-3.5 text-muted-foreground" />
          <span className="mono text-[11px] font-medium text-foreground">
            {filePath ?? "unified.diff"}
          </span>
        </div>
        <CopyButton value={diff} label="Copy Diff" />
      </div>

      {/* Diff content table */}
      <div className="overflow-x-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse text-left mono text-[11px] leading-relaxed">
          <tbody>
            {parsedLines.map((l, idx) => {
              if (l.type === "header") {
                return (
                  <tr key={idx} className="bg-primary/10 text-primary border-y border-border/50">
                    <td
                      colSpan={3}
                      className="px-3 py-1 font-semibold select-none text-[10px]"
                    >
                      {l.content}
                    </td>
                  </tr>
                );
              }

              const isAdded = l.type === "added";
              const isRemoved = l.type === "removed";

              return (
                <tr
                  key={idx}
                  className={cn(
                    "hover:bg-surface-raised/40 transition-colors",
                    isAdded && "bg-success/10 text-success border-l-2 border-l-success",
                    isRemoved && "bg-destructive/10 text-destructive border-l-2 border-l-destructive",
                    !isAdded && !isRemoved && "text-foreground/80",
                  )}
                >
                  <td className="w-10 px-2 py-0.5 text-right select-none text-[10px] text-muted-foreground/60 border-r border-border/30">
                    {l.oldLineNumber ?? ""}
                  </td>
                  <td className="w-10 px-2 py-0.5 text-right select-none text-[10px] text-muted-foreground/60 border-r border-border/30">
                    {l.newLineNumber ?? ""}
                  </td>
                  <td className="px-3 py-0.5 whitespace-pre font-mono">
                    <span className="select-none inline-block w-3 text-muted-foreground/80">
                      {isAdded ? "+" : isRemoved ? "-" : " "}
                    </span>
                    {l.content}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

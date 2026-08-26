import { Edit3, Eye, Save, Loader2, Check } from "lucide-react";
import { CodeBlock, CopyButton } from "@/components/hacksync/primitives";
import type { CodeNode } from "@/lib/hacksync/types";

interface CodeEditorViewProps {
  node: CodeNode;
  isEditing: boolean;
  editBuffer: string;
  isSaving: boolean;
  onToggleEdit: () => void;
  onBufferChange: (val: string) => void;
  onSave: () => void;
}

export function CodeEditorView({
  node,
  isEditing,
  editBuffer,
  isSaving,
  onToggleEdit,
  onBufferChange,
  onSave,
}: CodeEditorViewProps) {
  const content = node.content || "// File content not loaded";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="mono text-xs font-semibold">{node.path}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase font-bold text-muted-foreground">
            {node.language || "typescript"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CopyButton value={isEditing ? editBuffer : content} label="Copy Code" />

          <button
            type="button"
            onClick={onToggleEdit}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
              isEditing
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-accent text-foreground"
            }`}
          >
            {isEditing ? <Eye className="size-3.5" /> : <Edit3 className="size-3.5" />}
            <span>{isEditing ? "View Mode" : "Edit Code"}</span>
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-1 rounded-md bg-success px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              <span>Save Changes</span>
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={editBuffer}
          onChange={(e) => onBufferChange(e.target.value)}
          spellCheck={false}
          className="mono w-full h-[460px] rounded-lg border border-border bg-background p-4 text-xs font-medium leading-relaxed outline-none focus:border-primary resize-y text-foreground"
        />
      ) : (
        <CodeBlock code={content} language={node.language || "typescript"} />
      )}
    </div>
  );
}

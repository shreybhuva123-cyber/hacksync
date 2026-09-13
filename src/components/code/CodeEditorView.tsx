import { useState } from "react";
import { Edit3, Eye, Save, Loader2, Check, History } from "lucide-react";
import { CodeBlock, CopyButton } from "@/components/hacksync/primitives";
import { FileVersionHistoryModal } from "./FileVersionHistoryModal";
import type { CodeNode, FileVersion, Role } from "@/lib/hacksync/types";

interface CodeEditorViewProps {
  node: CodeNode;
  isEditing: boolean;
  editBuffer: string;
  isSaving: boolean;
  onToggleEdit: () => void;
  onBufferChange: (val: string) => void;
  onSave: () => void;
  projectId?: string;
  currentUserName?: string;
  currentUserRole?: Role;
  onVersionRestored?: (newVersion: FileVersion) => void;
}

export function CodeEditorView({
  node,
  isEditing,
  editBuffer,
  isSaving,
  onToggleEdit,
  onBufferChange,
  onSave,
  projectId,
  currentUserName,
  currentUserRole,
  onVersionRestored,
}: CodeEditorViewProps) {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const content = node.content || "// File content not loaded";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-xs font-semibold text-foreground">{node.path}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase font-bold text-muted-foreground">
            {node.language || "typescript"}
          </span>
          <span className="mono rounded bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold">
            V{node.current_version_number || 1}
          </span>
          {node.contributors && node.contributors.length > 0 && (
            <span
              className="text-[10px] text-muted-foreground hidden sm:inline"
              title={`Contributors: ${node.contributors.join(", ")}`}
            >
              ({node.contributors.join(", ")})
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={isEditing ? editBuffer : content} label="Copy Code" />

          {projectId && (
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              title="View immutable version history and restore past versions"
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <History className="size-3.5 text-primary" />
              <span>History</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const blob = new Blob([isEditing ? editBuffer : content], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = node.path.split("/").pop() || "file.txt";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            title="Download file to computer"
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <span>Download</span>
          </button>

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

      {/* Immutable Version History Modal */}
      {projectId && (
        <FileVersionHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          projectId={projectId}
          filePath={node.path}
          currentContent={node.content || ""}
          currentVersionNumber={node.current_version_number || 1}
          currentUserName={currentUserName || "Developer"}
          currentUserRole={currentUserRole || "lead"}
          onVersionRestored={(newVersion) => {
            setShowHistoryModal(false);
            onVersionRestored?.(newVersion);
          }}
        />
      )}
    </div>
  );
}

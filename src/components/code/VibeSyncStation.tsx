import { HardDrive, Folder, RefreshCw, Loader2, Sparkles, Check } from "lucide-react";
import { supportsFileSystemAccess } from "@/lib/hacksync/local-filesystem";

interface VibeSyncStationProps {
  directoryName: string | null;
  fileCount: number;
  isSyncing: boolean;
  onPickDirectory: () => void;
  onScanNow: () => void;
  feedback: string | null;
}

export function VibeSyncStation({
  directoryName,
  fileCount,
  isSyncing,
  onPickDirectory,
  onScanNow,
  feedback,
}: VibeSyncStationProps) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/20 text-primary">
            <HardDrive className="size-3.5" />
          </span>
          <div>
            <h4 className="text-xs font-semibold text-foreground">Vibe Coding Live Folder Sync</h4>
            <p className="text-[11px] text-muted-foreground">
              {directoryName
                ? `Active Directory: ${directoryName} (${fileCount} files scanned)`
                : "No local directory linked yet"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {directoryName && (
            <button
              type="button"
              onClick={onScanNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              {isSyncing ? (
                <Loader2 className="size-3 animate-spin text-primary" />
              ) : (
                <RefreshCw className="size-3 text-primary" />
              )}
              <span>Sync Now</span>
            </button>
          )}

          <button
            type="button"
            onClick={onPickDirectory}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Folder className="size-3.5" />
            <span>{directoryName ? "Change Folder" : "Link Local Folder"}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-success">
          <Check className="size-3" />
          <span>{feedback}</span>
        </div>
      )}
    </div>
  );
}

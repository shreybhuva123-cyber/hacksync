import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Loader2,
  Shield,
  ShieldAlert,
  TestTube2,
  XCircle,
} from "lucide-react";
import { DiffViewer } from "./DiffViewer";
import { StatusPill } from "./primitives";
import type { FixProposal } from "@/lib/hacksync/fixing/fix-types";

interface ApprovalGateProps {
  proposal: FixProposal;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (proposal: FixProposal) => Promise<void> | void;
  onReject?: ((proposal: FixProposal) => void) | undefined;
}

export function ApprovalGate({
  proposal,
  isOpen,
  onClose,
  onApprove,
  onReject,
}: ApprovalGateProps) {
  const [status, setStatus] = useState<"review" | "applying" | "verified" | "rejected">("review");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetPath = proposal.patch.files[0]?.path ?? proposal.affectedFiles[0] ?? "patch.diff";
  const patchDiff = proposal.patch.files[0]?.diff ?? "";

  const handleApprove = async () => {
    setStatus("applying");
    setErrorMessage(null);
    try {
      await onApprove(proposal);
      setStatus("verified");
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to apply and verify patch.");
      setStatus("review");
    }
  };

  const handleReject = () => {
    setStatus("rejected");
    if (onReject) onReject(proposal);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[10px] border border-border bg-surface shadow-2xl">
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-surface-raised">
          <div className="flex items-center gap-2.5">
            <Shield className="size-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Human-in-the-Loop Patch Approval Gate
              </h2>
              <p className="text-[11px] text-muted-foreground mono">
                ID: {proposal.id} · File: {targetPath}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            ✕
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Safety Notice Alert */}
          <div className="flex items-start gap-2.5 rounded-[6px] border border-warning/30 bg-warning/5 p-3 text-xs text-foreground/90">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-warning">Strict Safety Guarantee</p>
              <p className="text-muted-foreground leading-relaxed">
                HackSync will never autonomously alter project files without explicit confirmation.
                Review the diff below. Approving will apply the patch, execute targeted tests, and verify 0 regressions.
              </p>
            </div>
          </div>

          {/* Root Cause & Blast Radius */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[6px] border border-border bg-background p-3 text-xs space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase mono">Root Cause</span>
              <p className="text-foreground leading-snug">{proposal.rootCause}</p>
            </div>

            <div className="rounded-[6px] border border-border bg-background p-3 text-xs space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase mono">Regression Risk</span>
              <p className="text-foreground leading-snug">
                {proposal.regressionRisks?.length
                  ? proposal.regressionRisks.join(", ")
                  : "Low — Scoped strictly to offending function"}
              </p>
            </div>
          </div>

          {/* Diff Viewer */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-foreground">Unified Patch Diff</span>
              <StatusPill tone="info" dot={false}>
                Confidence {Math.round(proposal.confidence * 100)}%
              </StatusPill>
            </div>
            <DiffViewer
              diff={patchDiff}
              filePath={targetPath}
              maxHeight="16rem"
            />
          </div>

          {/* Error display if any */}
          {errorMessage ? (
            <div className="flex items-center gap-2 rounded-[6px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <XCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* Verified state display */}
          {status === "verified" ? (
            <div className="flex items-center gap-2.5 rounded-[6px] border border-success/30 bg-success/10 p-3 text-xs text-success">
              <CheckCircle2 className="size-4 shrink-0" />
              <span className="font-medium">
                Patch successfully applied! Targeted test suite executed and passed with 0 regressions.
              </span>
            </div>
          ) : null}
        </div>

        {/* Modal Action Footer */}
        <footer className="flex items-center justify-between border-t border-border px-5 py-3 bg-surface-raised">
          <button
            type="button"
            onClick={handleReject}
            disabled={status === "applying"}
            className="rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground transition-colors disabled:opacity-50"
          >
            Reject Proposal
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
            >
              Close
            </button>

            {status !== "verified" ? (
              <button
                type="button"
                onClick={handleApprove}
                disabled={status === "applying"}
                className="flex items-center gap-1.5 rounded-[6px] bg-success px-4 py-1.5 text-xs font-semibold text-background hover:bg-success/90 transition-colors disabled:opacity-50"
              >
                {status === "applying" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Applying & Verifying…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    <span>Approve & Apply Patch</span>
                  </>
                )}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  History,
  ChevronDown,
  Sparkles,
  Zap,
  Check,
} from "lucide-react";
import { useTopTimer } from "@/lib/hacksync/timer-store";
import { SessionHistoryModal } from "./SessionHistoryModal";

export function TopTimerWidget() {
  const {
    state,
    formattedDisplay,
    isRunning,
    mode,
    history,
    toggleRunning,
    resetTimer,
    setPresetDuration,
    setMode,
    addHistoryEntry,
    clearHistory,
  } = useTopTimer();

  const [showConfig, setShowConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <>
      <div className="relative flex items-center gap-1.5 rounded-lg border border-border bg-card/80 p-1 shadow-sm backdrop-blur">
        {/* Timer Display & Mode Popover Toggle */}
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
          title="Configure Hackathon Timer & Presets"
        >
          <div className="relative flex items-center">
            <Clock className="size-3.5 text-primary" />
            <span
              className={`absolute -top-0.5 -right-0.5 size-1.5 rounded-full ${
                isRunning ? "bg-success animate-pulse" : "bg-amber-500"
              }`}
            />
          </div>

          <span className="mono text-xs font-bold tracking-tight">{formattedDisplay}</span>
          <ChevronDown className="size-3 text-muted-foreground opacity-70" />
        </button>

        {/* Quick Play/Pause */}
        <button
          type="button"
          onClick={toggleRunning}
          className={`rounded-md p-1.5 transition-colors ${
            isRunning
              ? "text-amber-500 hover:bg-amber-500/10"
              : "text-success hover:bg-success/10"
          }`}
          title={isRunning ? "Pause Timer" : "Resume Timer"}
        >
          {isRunning ? <Pause className="size-3" /> : <Play className="size-3 fill-current" />}
        </button>

        {/* History Button with Counter Badge */}
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          title="View Timeline History (In this time you did this...)"
        >
          <History className="size-3.5" />
          <span className="hidden sm:inline">History</span>
          <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-primary-foreground">
            {history.length}
          </span>
        </button>

        {/* Timer Config Popover Dropdown */}
        {showConfig && (
          <div
            className="absolute left-0 top-11 z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl space-y-3 animate-in fade-in slide-in-from-top-2 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="font-semibold text-foreground">Timer Settings</span>
              <span className="mono text-[11px] text-primary">{formattedDisplay}</span>
            </div>

            {/* Mode Selector */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Mode</span>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setMode("countdown")}
                  className={`rounded-md py-1 text-xs font-medium border ${
                    mode === "countdown"
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border hover:bg-accent text-muted-foreground"
                  }`}
                >
                  Countdown ⏳
                </button>
                <button
                  type="button"
                  onClick={() => setMode("stopwatch")}
                  className={`rounded-md py-1 text-xs font-medium border ${
                    mode === "stopwatch"
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border hover:bg-accent text-muted-foreground"
                  }`}
                >
                  Stopwatch ⏱️
                </button>
              </div>
            </div>

            {/* Presets */}
            {mode === "countdown" && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  Hackathon Presets
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPresetDuration(24 * 3600);
                      setShowConfig(false);
                    }}
                    className="rounded-md border border-border bg-surface p-1.5 text-left hover:border-primary/40"
                  >
                    <p className="font-bold">24 Hours</p>
                    <p className="text-[10px] text-muted-foreground">Standard Hackathon</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPresetDuration(36 * 3600);
                      setShowConfig(false);
                    }}
                    className="rounded-md border border-border bg-surface p-1.5 text-left hover:border-primary/40"
                  >
                    <p className="font-bold">36 Hours</p>
                    <p className="text-[10px] text-muted-foreground">Weekend Sprint</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPresetDuration(48 * 3600);
                      setShowConfig(false);
                    }}
                    className="rounded-md border border-border bg-surface p-1.5 text-left hover:border-primary/40"
                  >
                    <p className="font-bold">48 Hours</p>
                    <p className="text-[10px] text-muted-foreground">Major Hackathon</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPresetDuration(2 * 3600);
                      setShowConfig(false);
                    }}
                    className="rounded-md border border-border bg-surface p-1.5 text-left hover:border-primary/40"
                  >
                    <p className="font-bold">2 Hours</p>
                    <p className="text-[10px] text-muted-foreground">Final Integration</p>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-2">
              <button
                type="button"
                onClick={() => {
                  resetTimer();
                  setShowConfig(false);
                }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Timeline History Modal */}
      <SessionHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        history={history}
        onAddEntry={addHistoryEntry}
        onClearHistory={clearHistory}
      />
    </>
  );
}

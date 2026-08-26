import { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Clock, AlertTriangle } from "lucide-react";

interface PitchCountdownClockProps {
  totalSeconds?: number;
}

export function PitchCountdownClock({ totalSeconds = 180 }: PitchCountdownClockProps) {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const formattedTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const pct = Math.round(((totalSeconds - timeLeft) / totalSeconds) * 100);

  const isLowTime = timeLeft <= 30;

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isLowTime
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-primary/20 bg-primary/5 text-foreground"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-9 place-items-center rounded-lg ${
              isLowTime ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
            }`}
          >
            {isLowTime ? <AlertTriangle className="size-4" /> : <Clock className="size-4" />}
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="mono text-2xl font-black">{formattedTime}</span>
              <span className="text-xs text-muted-foreground uppercase font-bold">
                Pitch Timer ({Math.round(totalSeconds / 60)} min limit)
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isLowTime ? "⚠️ Wrap up pitch & invite judge Q&A!" : "Deliver your key value proposition and live demo"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              isRunning
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {isRunning ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
            <span>{isRunning ? "Pause" : "Start Clock"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRunning(false);
              setTimeLeft(totalSeconds);
            }}
            className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full transition-all duration-300 ${
            isLowTime ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

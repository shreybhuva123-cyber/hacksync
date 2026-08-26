import { useState, useEffect, useCallback } from "react";

export interface TimelineEntry {
  id: string;
  timestamp: string; // ISO Date String
  timerOffset: string; // Formatted "HH:MM:SS" or "MM:SS"
  category: "contract" | "database" | "security" | "code" | "task" | "pitch" | "custom";
  title: string;
  description?: string | null | undefined;
  actor?: string | null | undefined;
}

export type TimerMode = "countdown" | "stopwatch";

interface StoredTimerState {
  secondsRemaining: number;
  stopwatchSeconds: number;
  totalDurationSeconds: number;
  mode: TimerMode;
  isRunning: boolean;
  lastUpdated: number;
}

const SESSION_TIMER_KEY = "hacksync_active_session_timer";
const PERSISTENT_HISTORY_KEY = "hacksync_timeline_history_v1";

const DEFAULT_HISTORY: TimelineEntry[] = [
  {
    id: "init-1",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    timerOffset: "00:15:30",
    category: "contract",
    title: "Locked API Contract: GET /api/events",
    description: "Defined single source of truth route and response schema",
    actor: "Rahul Verma (Backend)",
  },
  {
    id: "init-2",
    timestamp: new Date(Date.now() - 2400000).toISOString(),
    timerOffset: "00:35:12",
    category: "database",
    title: "Created Database Table: 'rsvps'",
    description: "Added primary key uuid and foreign key references",
    actor: "Meera Nair (Database)",
  },
  {
    id: "init-3",
    timestamp: new Date(Date.now() - 1200000).toISOString(),
    timerOffset: "00:55:04",
    category: "security",
    title: "Cyber Security Sentinel: Auto-Patched OWASP A01",
    description: "Enforced row-level ownership check on mutation routes",
    actor: "HackSync Sentinel",
  },
];

const DEFAULT_TIMER_STATE: StoredTimerState = {
  secondsRemaining: 24 * 3600,
  stopwatchSeconds: 0, // Starts at 00:00 on fresh program start
  totalDurationSeconds: 24 * 3600,
  mode: "stopwatch", // Defaults to 00:00 session stopwatch
  isRunning: true,
  lastUpdated: Date.now(),
};

function getStoredTimerState(): StoredTimerState {
  if (typeof window === "undefined") return DEFAULT_TIMER_STATE;
  try {
    // Uses sessionStorage so closing the platform/browser clears the timer and resets to 00:00
    const raw = sessionStorage.getItem(SESSION_TIMER_KEY);
    if (!raw) return DEFAULT_TIMER_STATE;
    const parsed = JSON.parse(raw) as StoredTimerState;
    if (parsed.isRunning && parsed.lastUpdated) {
      const elapsedSeconds = Math.floor((Date.now() - parsed.lastUpdated) / 1000);
      if (parsed.mode === "countdown") {
        parsed.secondsRemaining = Math.max(0, parsed.secondsRemaining - elapsedSeconds);
      } else {
        parsed.stopwatchSeconds += elapsedSeconds;
      }
    }
    return parsed;
  } catch {
    return DEFAULT_TIMER_STATE;
  }
}

function saveTimerState(state: StoredTimerState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_TIMER_KEY, JSON.stringify({ ...state, lastUpdated: Date.now() }));
  } catch {
    // Ignore quota issues
  }
}

function getStoredHistory(): TimelineEntry[] {
  if (typeof window === "undefined") return DEFAULT_HISTORY;
  try {
    const raw = localStorage.getItem(PERSISTENT_HISTORY_KEY);
    if (!raw) return DEFAULT_HISTORY;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_HISTORY;
  }
}

function saveStoredHistory(history: TimelineEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PERSISTENT_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore quota issues
  }
}

export function formatSecondsToTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function recordGlobalTimelineEvent(entry: {
  category: TimelineEntry["category"];
  title: string;
  description?: string;
  actor?: string;
}) {
  if (typeof window === "undefined") return;
  const currentTimer = getStoredTimerState();
  const currentHistory = getStoredHistory();

  const offset =
    currentTimer.mode === "countdown"
      ? formatSecondsToTime(currentTimer.totalDurationSeconds - currentTimer.secondsRemaining)
      : formatSecondsToTime(currentTimer.stopwatchSeconds);

  const newEntry: TimelineEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    timerOffset: offset,
    category: entry.category,
    title: entry.title,
    description: entry.description,
    actor: entry.actor || "Team Engineer",
  };

  saveStoredHistory([newEntry, ...currentHistory]);
}

export function useTopTimer() {
  const [timerState, setTimerState] = useState<StoredTimerState>(getStoredTimerState);
  const [history, setHistory] = useState<TimelineEntry[]>(getStoredHistory);

  // Tick effect
  useEffect(() => {
    if (!timerState.isRunning) return;

    const interval = setInterval(() => {
      setTimerState((prev) => {
        let nextRemaining = prev.secondsRemaining;
        let nextStopwatch = prev.stopwatchSeconds;

        if (prev.mode === "countdown") {
          if (nextRemaining > 0) {
            nextRemaining -= 1;
          }
        } else {
          nextStopwatch += 1;
        }

        const nextState = {
          ...prev,
          secondsRemaining: nextRemaining,
          stopwatchSeconds: nextStopwatch,
          lastUpdated: Date.now(),
        };
        saveTimerState(nextState);
        return nextState;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState.isRunning, timerState.mode]);

  const toggleRunning = useCallback(() => {
    setTimerState((prev) => {
      const next = { ...prev, isRunning: !prev.isRunning, lastUpdated: Date.now() };
      saveTimerState(next);
      return next;
    });
  }, []);

  const resetTimer = useCallback(() => {
    setTimerState((prev) => {
      const next = {
        ...prev,
        secondsRemaining: prev.totalDurationSeconds,
        stopwatchSeconds: 0,
        lastUpdated: Date.now(),
      };
      saveTimerState(next);
      return next;
    });
  }, []);

  const setPresetDuration = useCallback((seconds: number) => {
    setTimerState((prev) => {
      const next = {
        ...prev,
        totalDurationSeconds: seconds,
        secondsRemaining: seconds,
        mode: "countdown" as TimerMode,
        lastUpdated: Date.now(),
      };
      saveTimerState(next);
      return next;
    });
  }, []);

  const setMode = useCallback((mode: TimerMode) => {
    setTimerState((prev) => {
      const next = {
        ...prev,
        mode,
        stopwatchSeconds: mode === "stopwatch" ? 0 : prev.stopwatchSeconds,
        lastUpdated: Date.now(),
      };
      saveTimerState(next);
      return next;
    });
  }, []);

  const addHistoryEntry = useCallback(
    (entry: {
      category: TimelineEntry["category"];
      title: string;
      description?: string | null | undefined;
      actor?: string | null | undefined;
    }) => {
      const offset =
        timerState.mode === "countdown"
          ? formatSecondsToTime(timerState.totalDurationSeconds - timerState.secondsRemaining)
          : formatSecondsToTime(timerState.stopwatchSeconds);

      const newEntry: TimelineEntry = {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        timerOffset: offset,
        category: entry.category,
        title: entry.title,
        description: entry.description,
        actor: entry.actor || "You",
      };

      setHistory((prev) => {
        const next = [newEntry, ...prev];
        saveStoredHistory(next);
        return next;
      });
    },
    [timerState],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveStoredHistory([]);
  }, []);

  const formattedDisplay =
    timerState.mode === "countdown"
      ? formatSecondsToTime(timerState.secondsRemaining)
      : formatSecondsToTime(timerState.stopwatchSeconds);

  return {
    state: timerState,
    formattedDisplay,
    isRunning: timerState.isRunning,
    mode: timerState.mode,
    history,
    toggleRunning,
    resetTimer,
    setPresetDuration,
    setMode,
    addHistoryEntry,
    clearHistory,
  };
}

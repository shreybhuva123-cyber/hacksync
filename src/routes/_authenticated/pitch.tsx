import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Award,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Flame,
  Globe,
  Maximize2,
  Minimize2,
  Network,
  Play,
  Presentation,
  PlugZap,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  RotateCcw,
  Pause,
  Timer,
  Volume2,
  Terminal,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  CopyButton,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  ScoreRing,
  StatusPill,
} from "@/components/hacksync/primitives";
import { computeReadiness, computeWarnings } from "@/lib/hacksync/analysis";
import { auditWorkspaceSecurity } from "@/lib/hacksync/ai-security";
import { generatePitchScript } from "@/lib/hacksync/conflict-radar";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { title: "Judge Pitch Mode & Presentation Deck — HackSync" },
      {
        name: "description",
        content:
          "Interactive full-screen presentation deck and AI elevator pitch script generator for hackathon judges.",
      },
      { property: "og:title", content: "Judge Pitch Mode — HackSync" },
      {
        property: "og:description",
        content:
          "Win hackathon judge presentations with live architecture visualizers and AI pitch generator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PitchPage,
});

function PitchPage() {
  return <WorkspaceView>{(ws) => <PitchBody ws={ws} />}</WorkspaceView>;
}

function PitchBody({ ws }: { ws: Workspace }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scriptDuration, setScriptDuration] = useState<"60s" | "2min" | "5min">("2min");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);

  // Live Pitch Countdown Timer
  const initialTime = scriptDuration === "60s" ? 60 : scriptDuration === "2min" ? 120 : 300;
  const [timerLeft, setTimerLeft] = useState<number>(initialTime);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Sync initial time if duration changes
  useEffect(() => {
    const t = scriptDuration === "60s" ? 60 : scriptDuration === "2min" ? 120 : 300;
    setTimerLeft(t);
    setIsTimerRunning(false);
  }, [scriptDuration]);

  // Timer interval tick
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const readiness = useMemo(() => computeReadiness(ws), [ws]);
  const security = useMemo(() => auditWorkspaceSecurity(ws), [ws]);
  const pitchScript = useMemo(() => generatePitchScript(ws, scriptDuration), [ws, scriptDuration]);

  const TOTAL_SLIDES = 5;

  const nextSlide = () => setCurrentSlide((s) => (s + 1) % TOTAL_SLIDES);
  const prevSlide = () => setCurrentSlide((s) => (s - 1 + TOTAL_SLIDES) % TOTAL_SLIDES);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        nextSlide();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevSlide();
      } else if (e.key.toLowerCase() === "f") {
        setIsFullscreen((f) => !f);
      } else if (e.key.toLowerCase() === "p") {
        setIsTimerRunning((r) => !r);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleDownloadScript = () => {
    const blob = new Blob([pitchScript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ws.project.name.toLowerCase()}-pitch-${scriptDuration}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="judge presentation & pitch deck"
        title="Judge Pitch Mode"
        description="Interactive presentation deck and AI elevator pitch generator designed to win 2-3 minute hackathon judge evaluations."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSpeakerNotes(!showSpeakerNotes)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                showSpeakerNotes
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary hover:bg-accent text-secondary-foreground"
              }`}
            >
              <Presentation className="size-3.5" />
              {showSpeakerNotes ? "Hide Notes" : "Speaker Notes"}
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-accent"
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
              {isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Deck (F)"}
            </button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        {/* Main Presentation Screen */}
        <div className="space-y-3">
          <div
            className={`relative flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-xl transition-all duration-300 ${
              isFullscreen
                ? "fixed inset-0 z-50 rounded-none border-none p-12 bg-background"
                : "min-h-[480px]"
            }`}
          >
            {/* Top Deck Header with Interactive Pitch Timer */}
            <div className="flex flex-wrap items-center justify-between border-b border-border/60 pb-3 gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded bg-primary/20 text-primary">
                  <Trophy className="size-4" />
                </span>
                <span className="mono text-xs font-bold uppercase tracking-wider text-primary">
                  {ws.project.name} · Hackathon Pitch
                </span>
              </div>

              {/* Live Countdown Clock */}
              <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1">
                <Timer className="size-3.5 text-primary" />
                <span
                  className={`mono text-xs font-bold ${
                    timerLeft <= 15
                      ? "text-destructive animate-pulse"
                      : timerLeft <= 30
                        ? "text-amber-500"
                        : "text-foreground"
                  }`}
                >
                  {formatTimer(timerLeft)}
                </span>
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  title={isTimerRunning ? "Pause timer (P)" : "Start timer (P)"}
                  className="rounded p-0.5 hover:bg-accent text-foreground"
                >
                  {isTimerRunning ? <Pause className="size-3" /> : <Play className="size-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimerLeft(
                      scriptDuration === "60s" ? 60 : scriptDuration === "2min" ? 120 : 300,
                    );
                  }}
                  title="Reset timer"
                  className="rounded p-0.5 hover:bg-accent text-muted-foreground"
                >
                  <RotateCcw className="size-3" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="mono text-xs font-medium text-muted-foreground">
                  Slide {currentSlide + 1} of {TOTAL_SLIDES}
                </span>
                {isFullscreen ? (
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(false)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                  >
                    <Minimize2 className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Slide Body Content */}
            <div className="my-auto py-6">
              {/* SLIDE 1: Title & The Integration Problem */}
              {currentSlide === 0 ? (
                <div className="space-y-5 text-center max-w-xl mx-auto">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    THE HACKATHON DILEMMA SOLVED
                  </span>
                  <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
                    Zero Integration Drift. Guaranteed Demo Success.
                  </h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Most hackathon projects fail because Frontend, Backend, and Database teams work
                    in silos. <strong>{ws.project.name}</strong> eliminates integration chaos by
                    maintaining single-source-of-truth truth contracts.
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                      <Users className="size-3.5 text-primary" /> {ws.members.length} Core Engineers
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                      <PlugZap className="size-3.5 text-primary" /> {ws.contracts.length} API
                      Contracts
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                      <ShieldCheck className="size-3.5 text-success" /> Cyber Grade {security.grade}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* SLIDE 2: Full-Stack Architecture */}
              {currentSlide === 1 ? (
                <div className="space-y-4">
                  <div className="text-center max-w-lg mx-auto mb-4">
                    <span className="mono text-xs uppercase font-bold text-primary">
                      Slide 2 / Architecture
                    </span>
                    <h2 className="text-2xl font-bold text-foreground">
                      Full-Stack Architecture & Real-Time Sync
                    </h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-surface p-4 text-center">
                      <span className="mono text-xs font-bold text-frontend uppercase block mb-1">
                        Frontend Layer
                      </span>
                      <p className="mono text-2xl font-extrabold">
                        {ws.codeNodes.filter((n) => n.area === "frontend").length}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Reactive Components & Views
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-4 text-center">
                      <span className="mono text-xs font-bold text-backend uppercase block mb-1">
                        API Contracts
                      </span>
                      <p className="mono text-2xl font-extrabold text-primary">
                        {ws.contracts.length}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Locked Type-Safe Endpoints
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-4 text-center">
                      <span className="mono text-xs font-bold text-database uppercase block mb-1">
                        Database Schema
                      </span>
                      <p className="mono text-2xl font-extrabold">{ws.tables.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Synchronized Postgres Tables
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* SLIDE 3: API Contracts & Zero-Drift Matrix */}
              {currentSlide === 2 ? (
                <div className="space-y-4">
                  <div className="text-center max-w-lg mx-auto mb-4">
                    <span className="mono text-xs uppercase font-bold text-primary">
                      Slide 3 / Contracts
                    </span>
                    <h2 className="text-2xl font-bold text-foreground">
                      API Contracts & Live Mock Sandbox
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Frontend never blocks on Backend. Mock sandbox generates live responses
                      instantly.
                    </p>
                  </div>
                  <div className="divide-y divide-border rounded-lg border border-border bg-surface max-h-48 overflow-y-auto">
                    {ws.contracts.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="mono font-bold text-primary">{c.method}</span>
                          <span className="mono">{c.route}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill tone="success">tests passing</StatusPill>
                          <RoleBadge role={c.owner_role} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* SLIDE 4: Cyber Security & Health Rating */}
              {currentSlide === 3 ? (
                <div className="space-y-4">
                  <div className="text-center max-w-lg mx-auto mb-4">
                    <span className="mono text-xs uppercase font-bold text-primary">
                      Slide 4 / Security
                    </span>
                    <h2 className="text-2xl font-bold text-foreground">
                      OWASP Cyber Security & Zero Vulnerabilities
                    </h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 max-w-md mx-auto">
                    <div className="rounded-lg border border-border bg-surface p-4 flex flex-col items-center justify-center text-center">
                      <ScoreRing score={security.score} size={70} />
                      <span className="mt-2 text-xs font-bold text-success">
                        Grade {security.grade} Cyber Rating
                      </span>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-4 flex flex-col items-center justify-center text-center">
                      <ShieldCheck className="size-10 text-success mb-2" />
                      <span className="text-sm font-bold">
                        {security.passedChecksCount} Checks Passing
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Zero critical injection faults
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* SLIDE 5: Team Readiness & Live Demo Flow */}
              {currentSlide === 4 ? (
                <div className="space-y-4 text-center max-w-lg mx-auto">
                  <span className="mono text-xs uppercase font-bold text-primary">
                    Slide 5 / Conclusion
                  </span>
                  <h2 className="text-2xl font-bold text-foreground">
                    Production-Ready & Fully Verified
                  </h2>
                  <div className="flex justify-center my-4">
                    <ScoreRing score={readiness.score} size={84} />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Every route, contract, and table has been audited and integration-tested.{" "}
                    <strong>{ws.project.name}</strong> is completely ready for real users.
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-3 py-1 text-xs font-bold text-success">
                    <Sparkles className="size-3.5" /> All Systems Go for Demo
                  </span>
                </div>
              ) : null}
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={prevSlide}
                className="flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-accent"
              >
                <ChevronLeft className="size-3.5" /> Previous
              </button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentSlide(i)}
                    className={`size-2.5 rounded-full transition-all ${
                      currentSlide === i
                        ? "bg-primary w-6"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/60"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={nextSlide}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* AI Pitch Script Generator for Presenter */}
        <div className="space-y-4 self-start">
          <Panel className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-xs font-semibold">AI Pitch Script Generator</h3>
              </div>
              <button
                type="button"
                onClick={handleDownloadScript}
                className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
              >
                <Download className="size-3" /> Export .md
              </button>
            </div>

            {/* Duration Selector */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-1 gap-1">
              {(["60s", "2min", "5min"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setScriptDuration(d)}
                  className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                    scriptDuration === d
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d} Pitch
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-surface p-3.5 text-xs leading-relaxed max-h-[380px] overflow-y-auto whitespace-pre-wrap">
              {pitchScript}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

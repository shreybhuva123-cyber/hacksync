import { useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, CheckCircle2, Trophy, Shield, Zap } from "lucide-react";
import { StatusPill } from "@/components/hacksync/primitives";
import type { Workspace } from "@/lib/hacksync/types";

interface JudgeSlideDeckProps {
  ws: Workspace;
}

export function JudgeSlideDeck({ ws }: JudgeSlideDeckProps) {
  const [slideIdx, setSlideIdx] = useState(0);

  const slides = [
    {
      title: "1. The Hackathon Crisis We Solved",
      subtitle: "Why 80% of hackathon teams fail integration in the final 30 minutes",
      content: (
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            Distributed hackathon teams work across 3 separate laptops: Frontend in Next.js/React,
            Backend in Node/FastAPI, and Database in Supabase/PostgreSQL.
          </p>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive space-y-2">
            <h4 className="font-bold">❌ The Fatal Integration Breakdown:</h4>
            <ul className="list-disc list-inside text-xs space-y-1">
              <li>Frontend wrote API calls against assumptions that broke when backend deployed.</li>
              <li>Database schema drifted with extra columns, causing 500 runtime errors on stage.</li>
              <li>API keys leaked in git commits or client-side storage.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: "2. The HackSync Solution Architecture",
      subtitle: "Single source of truth control center for distributed hackathon teams",
      content: (
        <div className="space-y-4 text-sm leading-relaxed">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4 space-y-1">
              <h5 className="font-bold text-primary">📡 Locked Contracts</h5>
              <p className="text-xs text-muted-foreground">
                Routes & schemas defined once; SDK auto-generated for frontend.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-1">
              <h5 className="font-bold text-database">🗄️ Database Parity</h5>
              <p className="text-xs text-muted-foreground">
                Live schema sync across PostgreSQL, Prisma, and Drizzle ORM.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-1">
              <h5 className="font-bold text-success">🛡️ Cyber Sentinel</h5>
              <p className="text-xs text-muted-foreground">
                Automated OWASP A01/A03 scanner with 1-click auto-patching.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "3. Live Workspace Statistics",
      subtitle: `Metrics computed directly from ${ws.project.name}`,
      content: (
        <div className="grid gap-4 sm:grid-cols-3 text-center">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-3xl font-black text-primary">{ws.contracts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">API Endpoints Synchronized</p>
          </div>
          <div className="rounded-xl border border-database/20 bg-database/5 p-5">
            <p className="text-3xl font-black text-database">{ws.tables.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Database Tables Tracked</p>
          </div>
          <div className="rounded-xl border border-success/20 bg-success/5 p-5">
            <p className="text-3xl font-black text-success">{ws.members.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Active Team Engineers</p>
          </div>
        </div>
      ),
    },
  ];

  const current = slides[slideIdx];

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <span className="mono text-xs font-bold text-primary uppercase">
            Slide {slideIdx + 1} of {slides.length}
          </span>
          <h3 className="text-base font-bold text-foreground mt-0.5">{current?.title}</h3>
          <p className="text-xs text-muted-foreground">{current?.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={slideIdx === 0}
            onClick={() => setSlideIdx((prev) => Math.max(0, prev - 1))}
            className="rounded-lg border border-border p-2 text-foreground hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={slideIdx === slides.length - 1}
            onClick={() => setSlideIdx((prev) => Math.min(slides.length - 1, prev + 1))}
            className="rounded-lg bg-primary p-2 text-primary-foreground hover:opacity-90 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-[220px] pt-2">{current?.content}</div>
    </div>
  );
}

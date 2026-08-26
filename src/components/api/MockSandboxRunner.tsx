import { useState } from "react";
import { Play, Loader2, Check, RefreshCw, Send, Sparkles } from "lucide-react";
import { MethodBadge, CodeBlock, CopyButton } from "@/components/hacksync/primitives";
import type { ApiContract } from "@/lib/hacksync/types";

interface MockSandboxRunnerProps {
  contract: ApiContract;
}

export function MockSandboxRunner({ contract }: MockSandboxRunnerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [responsePayload, setResponsePayload] = useState<string | null>(null);

  const handleRunSimulation = async () => {
    setIsRunning(true);
    setStatus(null);
    setLatency(null);

    const start = performance.now();
    await new Promise((r) => setTimeout(r, 220));
    const duration = Math.round(performance.now() - start);

    try {
      if (contract.response_schema) {
        const parsed = JSON.parse(contract.response_schema);
        setResponsePayload(JSON.stringify(parsed, null, 2));
      } else {
        setResponsePayload(
          JSON.stringify(
            {
              success: true,
              endpoint: `${contract.method} ${contract.route}`,
              simulated: true,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      }
      setStatus(contract.method === "POST" ? 201 : 200);
      setLatency(duration);
    } catch {
      setResponsePayload(
        JSON.stringify(
          {
            success: true,
            status: "ok",
            route: contract.route,
          },
          null,
          2,
        ),
      );
      setStatus(200);
      setLatency(duration);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MethodBadge method={contract.method} />
          <span className="mono text-sm font-bold">{contract.route}</span>
        </div>

        <button
          type="button"
          onClick={handleRunSimulation}
          disabled={isRunning}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isRunning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5 fill-primary-foreground" />
          )}
          <span>Send Mock Request</span>
        </button>
      </div>

      {status !== null && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="rounded bg-success/20 px-2 py-0.5 font-bold text-success">
                HTTP {status} OK
              </span>
              <span className="mono text-muted-foreground">{latency}ms</span>
            </div>
            <CopyButton value={responsePayload ?? ""} label="Copy JSON" />
          </div>

          <CodeBlock code={responsePayload ?? "{}"} language="json" />
        </div>
      )}
    </div>
  );
}

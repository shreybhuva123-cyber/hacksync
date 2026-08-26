import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Code2,
  Copy,
  Download,
  Flame,
  Globe,
  Loader2,
  Lock,
  LockOpen,
  Play,
  PlugZap,
  Send,
  Sparkles,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  CopyButton,
  MethodBadge,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { logActivity, useRowMutation } from "@/lib/hacksync/workspace";
import { generateTypeScriptSDK } from "@/lib/hacksync/conflict-radar";
import type { ApiContract, Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/api")({
  head: () => ({
    meta: [
      { title: "API Contract Center & Mock Sandbox — HackSync" },
      {
        name: "description",
        content:
          "Locked, versioned API contracts with interactive mock sandbox runner and TypeScript SDK generation.",
      },
      { property: "og:title", content: "API Contract Center & Mock Sandbox — HackSync" },
      {
        property: "og:description",
        content:
          "Shared request/response contracts, in-browser mock sandbox, and type-safe SDK generator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiPage,
});

function ApiPage() {
  return <WorkspaceView>{(ws) => <ApiBody ws={ws} />}</WorkspaceView>;
}

function ApiBody({ ws }: { ws: Workspace }) {
  const [selectedId, setSelectedId] = useState<string | null>(ws.contracts[0]?.id ?? null);
  const [showSdkModal, setShowSdkModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"spec" | "mock" | "sdk">("spec");

  // Mock Sandbox State
  const [mockStatus, setMockStatus] = useState<number>(200);
  const [mockLatency, setMockLatency] = useState<number>(120);
  const [mockReqBody, setMockReqBody] = useState<string>("");
  const [mockAuthHeader, setMockAuthHeader] = useState<boolean>(true);
  const [mockResponse, setMockResponse] = useState<{
    status: number;
    timeMs: number;
    body: string;
  } | null>(null);
  const [isRunningMock, setIsRunningMock] = useState(false);

  const selected: ApiContract | undefined =
    ws.contracts.find((c) => c.id === selectedId) ?? ws.contracts[0];
  const update = useRowMutation();

  const toggleLock = (c: ApiContract) => {
    update.mutate(
      { table: "api_contracts", id: c.id, values: { locked: !c.locked } },
      {
        onSuccess: () =>
          void logActivity(
            ws.project.id,
            "contract",
            `${c.locked ? "Unlocked" : "Locked"} ${c.method} ${c.route}`,
          ),
      },
    );
  };

  const sdkCode = useMemo(() => generateTypeScriptSDK(ws.contracts), [ws.contracts]);

  const handleRunMock = () => {
    setIsRunningMock(true);
    setMockResponse(null);

    setTimeout(() => {
      let respBody = selected?.response_schema || '{"status": "success"}';
      if (mockStatus === 401) {
        respBody = '{"error": "Unauthorized", "message": "Missing Bearer token"}';
      } else if (mockStatus === 400) {
        respBody = '{"error": "Bad Request", "details": ["Invalid parameters provided"]}';
      } else if (mockStatus === 500) {
        respBody = '{"error": "Internal Server Error", "code": "DB_CONNECTION_TIMEOUT"}';
      }

      setMockResponse({
        status: mockStatus,
        timeMs: mockLatency + Math.floor(Math.random() * 20),
        body: respBody,
      });
      setIsRunningMock(false);
    }, mockLatency);
  };

  const handleDownloadSdk = () => {
    const blob = new Blob([sdkCode], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ws.project.name.toLowerCase()}-api-client.ts`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const comments = selected ? ws.comments.filter((cm) => cm.contract_id === selected.id) : [];

  return (
    <>
      <PageHeader
        eyebrow="contracts & live sandbox"
        title="API Contract Center"
        description="Locked, versioned API contracts shared by frontend and backend with integrated mock sandbox runner and 1-click TypeScript SDK generation."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSdkModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <Code2 className="size-3.5" />
              Generate TypeScript SDK
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Endpoints List */}
        <Panel>
          <PanelHeader
            title="Endpoints"
            icon={<PlugZap className="size-4" />}
            actions={
              <StatusPill tone="primary" dot={false}>
                {ws.contracts.length} routes
              </StatusPill>
            }
          />
          <ul className="divide-y divide-border">
            {ws.contracts.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id);
                    setMockResponse(null);
                    setMockReqBody(c.request_schema || "");
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
                    selected?.id === c.id ? "bg-accent/60" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <MethodBadge method={c.method} />
                    <span className="mono truncate text-[12px]">{c.route}</span>
                    {c.locked ? (
                      <Lock className="size-3 text-success" />
                    ) : (
                      <LockOpen className="size-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill>
                    <StatusPill tone={statusTone(c.test_status)}>{c.test_status}</StatusPill>
                    <RoleBadge role={c.owner_role} />
                    <span className="mono text-[10px] text-muted-foreground">{c.version}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Selected Endpoint Viewer & Mock Sandbox */}
        {selected ? (
          <Panel className="self-start">
            <PanelHeader
              title={`${selected.method} ${selected.route}`}
              subtitle={selected.summary ?? undefined}
              actions={
                <button
                  type="button"
                  onClick={() => toggleLock(selected)}
                  disabled={update.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  {selected.locked ? (
                    <LockOpen className="size-3.5" />
                  ) : (
                    <Lock className="size-3.5" />
                  )}
                  {selected.locked ? "Unlock contract" : "Lock contract"}
                </button>
              }
            />

            {/* View Mode Tabs */}
            <div className="flex border-b border-border bg-surface px-4 pt-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("spec")}
                className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "spec"
                    ? "border-primary text-foreground font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Contract Schema
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mock")}
                className={`flex items-center gap-1 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "mock"
                    ? "border-primary text-foreground font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Play className="size-3 text-primary" />
                Live Mock Sandbox
              </button>
            </div>

            {/* TAB 1: Contract Spec */}
            {activeTab === "spec" ? (
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={statusTone(selected.status)}>{selected.status}</StatusPill>
                  <StatusPill tone={statusTone(selected.test_status)}>
                    tests {selected.test_status}
                  </StatusPill>
                  <StatusPill tone={selected.auth_required ? "info" : "neutral"} dot={false}>
                    {selected.auth_required ? "auth required" : "public"}
                  </StatusPill>
                  <RoleBadge role={selected.owner_role} />
                </div>
                <CodeBlock
                  filename="request_schema"
                  code={selected.request_schema ?? "// no request body"}
                  maxHeight="12rem"
                />
                <CodeBlock
                  filename="response_schema"
                  code={selected.response_schema ?? "// no response documented"}
                  maxHeight="12rem"
                />
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                    Discussion & Notes
                  </p>
                  {comments.length ? (
                    <ul className="space-y-2">
                      {comments.map((cm) => (
                        <li
                          key={cm.id}
                          className="rounded-md border border-border bg-surface px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <RoleBadge role={cm.author_role ?? "shared"} />
                            <span className="text-[11px] font-medium">
                              {cm.author_name ?? "Teammate"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{cm.body}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No comments on this contract.</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* TAB 2: Live Mock API Sandbox Runner */}
            {activeTab === "mock" ? (
              <div className="p-4 space-y-4">
                {/* Live Mock URL Banner */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                      <Sparkles className="size-3.5" /> Live Mock Endpoint URL
                    </span>
                    <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                      Ready for Frontend
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 truncate rounded-md bg-secondary/80 px-2.5 py-1.5 text-xs mono text-foreground">
                      {`http://localhost:8080/api/mock${selected.route}`}
                    </div>
                    <CopyButton value={`http://localhost:8080/api/mock${selected.route}`} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Frontend devs can call this endpoint directly in React/Vite with zero waiting
                    for backend code!
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MethodBadge method={selected.method} />
                      <span className="mono text-xs font-semibold">{selected.route}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const curl = `curl -X ${selected.method} "http://localhost:8080/api/mock${selected.route}" ${
                            selected.auth_required
                              ? '-H "Authorization: Bearer mock_jwt_token"'
                              : ""
                          } ${mockReqBody ? `-H "Content-Type: application/json" -d '${mockReqBody.replace(/'/g, "\\'")}'` : ""}`;
                          navigator.clipboard.writeText(curl);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        <Copy className="size-3" /> cURL
                      </button>

                      <button
                        type="button"
                        disabled={isRunningMock}
                        onClick={handleRunMock}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm"
                      >
                        {isRunningMock ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        <span>{isRunningMock ? "Sending..." : "Send Request"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Sandbox Controls */}
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/60 text-xs">
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-1">
                        Mock Status Code
                      </label>
                      <select
                        value={mockStatus}
                        onChange={(e) => setMockStatus(Number(e.target.value))}
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs outline-none"
                      >
                        <option value={200}>200 OK</option>
                        <option value={201}>201 Created</option>
                        <option value={400}>400 Bad Request</option>
                        <option value={401}>401 Unauthorized</option>
                        <option value={500}>500 Server Error</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-1">
                        Simulated Latency ({mockLatency}ms)
                      </label>
                      <input
                        type="range"
                        min={50}
                        max={800}
                        step={50}
                        value={mockLatency}
                        onChange={(e) => setMockLatency(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Request Payload Editor */}
                {["POST", "PUT", "PATCH"].includes(selected.method) ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Request Body JSON
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (selected.request_schema) {
                            setMockReqBody(selected.request_schema);
                          } else {
                            setMockReqBody(
                              JSON.stringify(
                                {
                                  id: "usr_hacksync_" + Math.random().toString(36).substring(2, 7),
                                  name: "Alex Developer",
                                  role: "lead",
                                  timestamp: new Date().toISOString(),
                                },
                                null,
                                2,
                              ),
                            );
                          }
                        }}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <Sparkles className="size-3" /> Auto-fill Sample Data
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={mockReqBody}
                      onChange={(e) => setMockReqBody(e.target.value)}
                      placeholder={selected.request_schema || '{"key": "value"}'}
                      className="w-full rounded-lg border border-input bg-background p-2.5 mono text-xs outline-none focus:border-ring"
                    />
                  </div>
                ) : null}

                {/* Simulated Response Output */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-foreground">Response Output</span>
                    {mockResponse ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                            mockResponse.status < 300
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          HTTP {mockResponse.status}
                        </span>
                        <span className="mono text-[10px] text-muted-foreground">
                          {mockResponse.timeMs}ms
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {mockResponse ? (
                    <CodeBlock
                      filename="response.json"
                      code={mockResponse.body}
                      language="json"
                      maxHeight="14rem"
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      Click <strong>Send Request</strong> to test this endpoint in real-time.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </Panel>
        ) : null}
      </div>

      {/* Type-Safe TypeScript SDK Modal */}
      {showSdkModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="relative flex h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-surface-raised shadow-2xl overflow-hidden">
            <header className="flex h-14 items-center justify-between border-b border-border px-5 bg-surface">
              <div className="flex items-center gap-2">
                <Code2 className="size-4 text-primary" />
                <h3 className="text-sm font-semibold tracking-tight">
                  Auto-Generated TypeScript SDK & React Query Hooks
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSdk}
                  className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  <Download className="size-3" /> Download .ts
                </button>
                <button
                  type="button"
                  onClick={() => setShowSdkModal(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                >
                  ✕
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              <CodeBlock
                code={sdkCode}
                language="typescript"
                filename="api-client.ts"
                maxHeight="60vh"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

import React, { useState } from "react";
import { validateChatCompletionParams, type ChatCompletionChunk } from "@uoai/api-protocol";
import { Badge, Button, Card } from "@uoai/ui";
import { extensionBridge, useDashboardStore } from "../store/useDashboardStore";

interface ConnectionStepResult {
  step: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
}

export const DeveloperConsoleScreen: React.FC = () => {
  const { snapshot, clearDiagnostics } = useDashboardStore();
  const readyModels = snapshot.registry.models.filter((m) => {
    const st = snapshot.modelStates[m.id]?.status;
    return st === "ready" || st === "loaded";
  });
  const defaultModelId = readyModels[0]?.id ?? "gemma-4-e2b";

  const [connResults, setConnResults] = useState<ConnectionStepResult[]>([]);
  const [modelsJson, setModelsJson] = useState<string>("");
  const [playgroundJson, setPlaygroundJson] = useState(
    JSON.stringify(
      {
        model: defaultModelId,
        messages: [{ role: "user", content: "Explain how WebGPU works." }],
        temperature: 0.7,
        max_tokens: 256,
        stream: true
      },
      null,
      2
    )
  );
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);
  const [streamOutput, setStreamOutput] = useState("");
  const [chunkLog, setChunkLog] = useState<Array<{ seq: number; delta: string; elapsedMs: number }>>([]);
  const [rawResponse, setRawResponse] = useState("");
  const [running, setRunning] = useState(false);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [copiedNotice, setCopiedNotice] = useState("");

  const runConnectionTest = async () => {
    const results: ConnectionStepResult[] = [];
    const runStep = async (step: string, fn: () => Promise<unknown>) => {
      const t0 = performance.now();
      try {
        const res = await fn();
        results.push({
          step,
          ok: true,
          latencyMs: Math.round(performance.now() - t0),
          detail: JSON.stringify(res)
        });
      } catch (err) {
        results.push({
          step,
          ok: false,
          latencyMs: Math.round(performance.now() - t0),
          detail: err instanceof Error ? err.message : "Failed"
        });
      }
    };
    await runStep("GET /v1/health", () => extensionBridge.call({ action: "check_health" }));
    await runStep("GET /v1/runtime", () => extensionBridge.call({ action: "get_runtime_status" }));
    await runStep("GET /v1/models", async () => {
      const list = await extensionBridge.call({ action: "list_api_models" });
      setModelsJson(JSON.stringify(list, null, 2));
      return list;
    });
    setConnResults(results);
  };

  const runPlayground = async () => {
    setPlaygroundError(null);
    setStreamOutput("");
    setChunkLog([]);
    setRawResponse("");

    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(playgroundJson);
    } catch (err) {
      setPlaygroundError(`Invalid JSON: ${err instanceof Error ? err.message : "syntax error"}`);
      return;
    }

    let params;
    try {
      params = validateChatCompletionParams(parsedRaw);
    } catch (err) {
      setPlaygroundError(err instanceof Error ? err.message : "Schema validation failed");
      return;
    }

    const ctrl = new AbortController();
    setAbortCtrl(ctrl);
    setRunning(true);
    const t0 = performance.now();

    try {
      const completion = await extensionBridge.streamChat(
        params,
        (chunk: ChatCompletionChunk) => {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) setStreamOutput((prev) => prev + delta);
          setChunkLog((prev) => [
            ...prev,
            {
              seq: chunk.sequence ?? prev.length,
              delta: delta || `[finish:${chunk.choices[0]?.finish_reason ?? "init"}]`,
              elapsedMs: Math.round(performance.now() - t0)
            }
          ]);
        },
        ctrl.signal
      );
      setRawResponse(JSON.stringify(completion, null, 2));
    } catch (err) {
      setPlaygroundError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRunning(false);
      setAbortCtrl(null);
    }
  };

  const exportDiagnostics = () => {
    // Strictly content-free diagnostics JSON (FR-097, NFR-046, BR-05)
    const payload = {
      exportedAt: new Date().toISOString(),
      providerVersion: snapshot.providerVersion,
      capabilities: snapshot.capabilities,
      runtime: snapshot.runtime,
      offlineReadiness: snapshot.offlineReadiness,
      diagnostics: snapshot.diagnostics,
      networkActivity: snapshot.networkActivity
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uoai-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sdkSnippet = `import { UOAI } from "@uoai/sdk";

const ai = await UOAI.connect();
const models = await ai.models.list();

const stream = await ai.chat.completions.create({
  model: "${defaultModelId}",
  messages: [{ role: "user", content: "Write a short introduction to offline AI." }],
  stream: true
});

for await (const chunk of stream) {
  console.log(chunk.choices[0]?.delta?.content ?? "");
}`;

  const originStatus = originQuery.trim()
    ? snapshot.grants.find((g) => g.origin === originQuery.trim())?.status ?? "not_authorized"
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Connection & Logical API Tester"
          subtitle="FR-091 & FR-092 — Logical routes over extension messaging (no localhost TCP server)."
          actions={
            <Button size="sm" onClick={() => void runConnectionTest()}>
              Test Connection
            </Button>
          }
        >
          {connResults.length === 0 ? (
            <p className="text-xs text-slate-500">
              Click Test Connection to verify health, runtime status, and available models.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {connResults.map((r) => (
                <div key={r.step} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{r.step}</span>
                    <div className="flex items-center gap-2">
                      <span>{r.latencyMs} ms</span>
                      <Badge tone={r.ok ? "success" : "danger"}>{r.ok ? "OK" : "FAIL"}</Badge>
                    </div>
                  </div>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-slate-500">{r.detail}</pre>
                </div>
              ))}
            </div>
          )}
          {modelsJson && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium">Raw GET /v1/models JSON</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-slate-100">
                {modelsJson}
              </pre>
            </details>
          )}
        </Card>

        <Card
          title="SDK Quick-Start Snippet"
          subtitle="FR-090 — Pre-filled with your installed local model ID."
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard?.writeText(sdkSnippet);
                setCopiedNotice("Copied to clipboard");
                setTimeout(() => setCopiedNotice(""), 2000);
              }}
            >
              Copy Snippet
            </Button>
          }
        >
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">
            <code>{sdkSnippet}</code>
          </pre>
          <div className="sr-only" aria-live="polite">
            {copiedNotice}
          </div>
          {copiedNotice && <p className="mt-1 text-xs text-emerald-600">{copiedNotice}</p>}
        </Card>
      </div>

      <Card
        title="API Playground & Streaming Inspector"
        subtitle="FR-093 & FR-094 — Validated against @uoai/api-protocol Zod schemas before sending."
        actions={
          <div className="flex gap-2">
            {running ? (
              <Button size="sm" variant="danger" onClick={() => abortCtrl?.abort("generation_cancelled")}>
                Cancel Stream
              </Button>
            ) : (
              <Button size="sm" onClick={() => void runPlayground()}>
                Send Request
              </Button>
            )}
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="playground-json" className="mb-1 block text-xs font-medium">
              POST /v1/chat/completions Payload (JSON)
            </label>
            <textarea
              id="playground-json"
              rows={10}
              value={playgroundJson}
              onChange={(e) => setPlaygroundJson(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-slate-100 dark:border-slate-700"
            />
            {playgroundError && (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {playgroundError}
              </p>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium">Rendered Stream Output</p>
              <div className="min-h-[80px] rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800">
                {streamOutput || <span className="text-xs text-slate-400">No output yet.</span>}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Chunk Log ({chunkLog.length} chunks)</p>
              <div className="max-h-36 overflow-y-auto rounded-lg bg-slate-900 p-2 font-mono text-[11px] text-slate-200">
                {chunkLog.length === 0
                  ? "No chunks received yet."
                  : chunkLog.map((c) => (
                      <div key={c.seq}>
                        #{c.seq} (+{c.elapsedMs}ms): {JSON.stringify(c.delta)}
                      </div>
                    ))}
              </div>
            </div>
            {rawResponse && (
              <details>
                <summary className="cursor-pointer text-xs font-medium">Raw ChatCompletion JSON</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2 font-mono text-[11px] text-slate-100">
                  {rawResponse}
                </pre>
              </details>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Origin Permission Status Checker" subtitle="FR-096">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://notes.example.com"
              value={originQuery}
              onChange={(e) => setOriginQuery(e.target.value)}
              aria-label="Check origin permission status"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            {originStatus && (
              <Badge
                tone={
                  originStatus === "allowed"
                    ? "success"
                    : originStatus === "denied"
                      ? "danger"
                      : "neutral"
                }
              >
                {originStatus}
              </Badge>
            )}
          </div>
        </Card>

        <Card
          title="Content-Free Runtime Diagnostics & Error Log"
          subtitle="FR-095, FR-097, NFR-046 — Zero prompt/response content ever logged or exported."
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={exportDiagnostics}>
                Export Diagnostics JSON
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void clearDiagnostics()}>
                Clear
              </Button>
            </div>
          }
        >
          <div className="max-h-44 space-y-1 overflow-y-auto font-mono text-[11px]">
            {snapshot.diagnostics.length === 0 ? (
              <p className="text-slate-500">No diagnostic events recorded yet.</p>
            ) : (
              snapshot.diagnostics.slice(-30).reverse().map((ev) => (
                <div key={ev.id} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">
                  [{new Date(ev.timestamp).toLocaleTimeString()}] ({ev.category}) {ev.event}
                  {ev.code ? ` code=${ev.code}` : ""}
                  {ev.modelId ? ` model=${ev.modelId}` : ""}
                  {ev.origin ? ` origin=${ev.origin}` : ""}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

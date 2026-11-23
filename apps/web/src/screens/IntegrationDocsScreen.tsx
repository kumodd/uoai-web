import React, { useMemo, useState } from "react";
import { ERROR_CATALOGUE, type UOAIErrorCode } from "@uoai/api-protocol";
import { formatBytes } from "@uoai/model-registry";
import { Badge, Button, Card } from "@uoai/ui";
import { extensionBridge, useDashboardStore } from "../store/useDashboardStore";

type DocTab = "prompt" | "website" | "extension" | "reference";
type TargetPlatform = "website-react" | "website-vanilla" | "chrome-extension";
type FeaturePreset = "chat" | "summarize" | "coding" | "rewrite";

export const IntegrationDocsScreen: React.FC = () => {
  const { snapshot } = useDashboardStore();
  const [tab, setTab] = useState<DocTab>("prompt");
  const [target, setTarget] = useState<TargetPlatform>("website-react");
  const [feature, setFeature] = useState<FeaturePreset>("chat");
  const [errorSearch, setErrorSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const liveExtensionId = extensionBridge.getExtensionId() ?? "<YOUR_UOAI_EXTENSION_ID>";

  const readyModels = snapshot.registry.models.filter((m) => {
    const st = snapshot.modelStates[m.id]?.status;
    return st === "ready" || st === "loaded";
  });
  const defaultModelId =
    snapshot.runtime.loadedModel ?? readyModels[0]?.id ?? "qwen2-5-0-5b-instruct";
  const [selectedModel, setSelectedModel] = useState<string>(defaultModelId);

  const activeModelId =
    snapshot.registry.models.some((m) => m.id === selectedModel) ? selectedModel : defaultModelId;

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const downloadPromptFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const featureGoalText: Record<FeaturePreset, string> = {
    chat: "Add a streaming local AI chat panel with conversation state, model selector, Stop button, and graceful fallback when UOAI is not installed or authorized.",
    summarize: "Add a one-click 'Summarize Locally (On-Device AI)' button that streams a concise bulleted summary of the page/document content without sending any text to cloud servers.",
    coding: "Add an offline coding assistant panel for explaining, refactoring, and generating code snippets using the local WebGPU model with Markdown code block rendering and Stop cancellation.",
    rewrite: "Add an inline 'Rewrite / Polish Locally' action for text inputs (Tone: Concise, Professional, Friendly) streaming directly from the user's local UOAI model."
  };

  const generatedPrompt = useMemo(() => {
    const isExt = target === "chrome-extension";
    const frameworkLabel =
      target === "website-react"
        ? "an existing React / TypeScript web application"
        : target === "website-vanilla"
          ? "an existing Vanilla JavaScript / TypeScript website"
          : "an existing Chromium Manifest V3 browser extension";

    return `# Task: Integrate Universal Offline AI (UOAI) into ${frameworkLabel}

## Goal
${featureGoalText[feature]}

## Critical UOAI Platform Constraints (Do NOT Violate)
1. **Use \`@uoai/sdk\` — NEVER \`http://localhost\`:** UOAI is a Chromium MV3 browser extension, NOT a localhost HTTP server. Never use \`fetch("http://localhost:...")\` or point the OpenAI REST SDK at a \`baseURL\`.
2. **Two-Layer Per-Origin Permission Flow:** Websites cannot silently trigger browser permission dialogs.
   - If \`UOAI.connect()\` throws \`UOAIError\` with \`code: "extension_not_detected"\` or \`"permission_required"\`, display a clear connect banner telling the user to click the **UOAI toolbar icon -> Allow This Site** OR click an **Authorize with UOAI** button calling \`UOAI.openAuthorizeWindow("${liveExtensionId}")\` inside a click handler.
   - For local dev on \`http://localhost:<port>\`, remind the developer to toggle **Settings & Privacy -> Developer Mode** in UOAI.
3. **Top-Level Frames Only:** Do not call \`@uoai/sdk\` inside cross-origin iframes (\`origin_not_allowed\`).
4. **Dynamic Model Discovery:** Call \`await ai.models.list()\` after connecting. Prefer \`models.find(m => m.uoai.loaded)?.id ?? "${activeModelId}" ?? models[0]?.id\`.
5. **Strict Supported Parameters:** Only pass \`model\`, \`messages\` (\`system\` | \`user\` | \`assistant\`, <= 200 messages, <= 256 KB serialized), \`temperature\` (0..2), \`top_p\` (0..1), \`max_tokens\` (default website cap 1024), \`stop\` (<= 4 strings), \`seed\`, \`stream\`, and \`stream_options: { include_usage: true }\`. Do NOT send \`tools\`, \`functions\`, \`logprobs\`, or \`response_format\`.
6. **Streaming + Cancellation:** Always pass \`{ signal: abortController.signal }\` and wire a Stop button (or \`break\` out of \`for await\`) that cleanly catches \`UOAIError(code: "generation_cancelled")\`.
7. **Zero Cloud Fallback & Sanitized Output:** Never fall back to a cloud API silently; never render raw model text with \`dangerouslySetInnerHTML\` / \`innerHTML\`.
${
  isExt
    ? `8. **Extension-to-UOAI Integration Pattern (MV3):**
   - For web-page enhancements: run \`@uoai/sdk\` in the page MAIN world on authorized HTTPS origins (\`allFrames: false\`) so UOAI's isolated-world Content-Script Bridge relays requests safely.
   - For direct extension-to-extension messaging: whitelist this extension's ID in UOAI's \`externally_connectable.ids\` and call \`UOAI.connect({ extensionId: "${liveExtensionId}" })\`.
   - Maintain strict MV3 CSP (zero remote scripts, zero \`eval\`).`
    : ""
}

## Exact \`@uoai/sdk\` Reference Implementation
\`\`\`ts
import { UOAI, UOAIError, type UOAIClient } from "@uoai/sdk";

const UOAI_EXTENSION_ID = "${liveExtensionId}";
const PREFERRED_MODEL = "${activeModelId}";

export async function runLocalStream(
  prompt: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const ai: UOAIClient = await UOAI.connect({ timeoutMs: 2500 });
  ai.on("permission_revoked", () => {
    // Cleanly disable local AI UI if user revokes access
  });

  const { data: models } = await ai.models.list();
  const model =
    models.find((m) => m.id === PREFERRED_MODEL)?.id ??
    models.find((m) => m.uoai.loaded)?.id ??
    models[0]?.id;

  if (!model) {
    throw new UOAIError("model_not_found", "Install a model in UOAI Model Library first.");
  }

  const stream = await ai.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: "You are a helpful, concise local AI assistant." },
        { role: "user", content: prompt }
      ],
      stream: true,
      stream_options: { include_usage: true }
    },
    { signal }
  );

  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      full += delta;
      onDelta(delta);
    }
  }
  return full;
}

// Call inside a user click handler when code === "permission_required":
export function requestSiteAuthorization() {
  UOAI.openAuthorizeWindow(UOAI_EXTENSION_ID);
}
\`\`\`

## Required Error Handling (\`err instanceof UOAIError\`)
- \`extension_not_detected\` / \`permission_required\`: Show install/authorize banner.
- \`permission_denied\` / \`permission_revoked\`: Disable controls without nagging.
- \`model_not_found\` / \`model_not_loaded\`: Let user pick an installed/loaded model from \`ai.models.list()\`.
- \`context_length_exceeded\`: Shorten input or lower \`max_tokens\`.
- \`rate_limited\` / \`queue_full\`: Retryable; respect \`err.retryAfterMs\`.
- \`webgpu_unavailable\` / \`insufficient_resources\`: Display honest device limitation message.
- \`generation_cancelled\`: Preserve partial output and reset loading state.
- \`runtime_restarted\` / \`connection_lost\`: Retryable; offer Retry button.

## Deliverables Expected
1. Install or link \`@uoai/sdk\`.
2. Implement the ${target === "website-react" ? "React hook (`useLocalAI.ts`) and UI component" : target === "website-vanilla" ? "TypeScript module (`localAI.ts`) and UI bindings" : "MV3 extension bridge module (`uoaiBridge.ts`) and UI states"}.
3. Verify strict TypeScript compilation and add tests covering connect, streaming, cancellation, and error fallbacks.`;
  }, [activeModelId, feature, liveExtensionId, target]);

  const reactHookCode = `import { useCallback, useEffect, useRef, useState } from "react";
import { UOAI, UOAIError, type ModelInfo, type UOAIClient } from "@uoai/sdk";

export function useUOAI(extensionId = "${liveExtensionId}") {
  const clientRef = useRef<UOAIClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"idle" | "connected" | "needs_auth" | "revoked">("idle");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const ai = await UOAI.connect({ timeoutMs: 2500 });
      clientRef.current = ai;
      setStatus("connected");
      ai.on("permission_revoked", () => {
        clientRef.current = null;
        setStatus("revoked");
      });
      const res = await ai.models.list();
      setModels(res.data);
    } catch (err) {
      setStatus("needs_auth");
      setError(err instanceof UOAIError ? \`\${err.code}: \${err.message}\` : String(err));
    }
  }, []);

  const authorize = useCallback(() => {
    UOAI.openAuthorizeWindow(extensionId);
  }, [extensionId]);

  const streamChat = useCallback(
    async (model: string, prompt: string, onDelta: (chunk: string) => void) => {
      if (!clientRef.current) throw new UOAIError("connection_lost");
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const stream = await clientRef.current.chat.completions.create(
          { model, messages: [{ role: "user", content: prompt }], stream: true },
          { signal: ctrl.signal }
        );
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) onDelta(delta);
        }
      } finally {
        abortRef.current = null;
      }
    },
    []
  );

  const stop = useCallback(() => abortRef.current?.abort("generation_cancelled"), []);
  useEffect(() => () => clientRef.current?.close(), []);

  return { status, models, error, connect, authorize, streamChat, stop };
}`;

  const extensionBridgeCode = `// Pattern A: From an existing MV3 extension's MAIN-world script on an authorized HTTPS page
import { UOAI, UOAIError } from "@uoai/sdk";

export async function summarizeSelectionLocally(selectedText: string, onChunk: (t: string) => void) {
  const ai = await UOAI.connect({ timeoutMs: 2500 });
  const { data: models } = await ai.models.list();
  const model = models.find((m) => m.uoai.loaded)?.id ?? models[0]?.id;
  if (!model) throw new UOAIError("model_not_found");

  const stream = await ai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Summarize the selection in 3 crisp bullet points." },
      { role: "user", content: selectedText }
    ],
    max_tokens: 300,
    stream: true
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) onChunk(delta);
  }
}

// Pattern B: Direct extension-to-extension (when whitelisted in externally_connectable.ids)
// const ai = await UOAI.connect({ extensionId: "${liveExtensionId}" });`;

  const filteredErrors = useMemo(() => {
    const q = errorSearch.trim().toLowerCase();
    return (Object.keys(ERROR_CATALOGUE) as UOAIErrorCode[])
      .filter(
        (code) =>
          !q ||
          code.toLowerCase().includes(q) ||
          ERROR_CATALOGUE[code].userTitle.toLowerCase().includes(q) ||
          ERROR_CATALOGUE[code].defaultMessage.toLowerCase().includes(q)
      )
      .map((code) => ({ code, ...ERROR_CATALOGUE[code] }));
  }, [errorSearch]);

  return (
    <div className="space-y-6">
      <Card
        title="Integration Docs & Copy-Paste AI Prompts"
        subtitle="Integrate UOAI into any existing website or Chromium MV3 extension — 100% available offline."
        actions={
          <Badge tone="info">Extension ID: {liveExtensionId}</Badge>
        }
      >
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["prompt", "AI Integration Prompt"],
              ["website", "Website Integration Guide"],
              ["extension", "Browser Extension Guide"],
              ["reference", "API, Models & Error Reference"]
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={tab === id ? "primary" : "secondary"}
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>

      {/* TAB 1: Copy-Paste AI Integration Prompt Generator */}
      {tab === "prompt" && (
        <Card
          title="Ready-to-Paste AI Coding Prompt"
          subtitle="Paste this prompt into Claude, Cursor, Windsurf, Copilot, or Antigravity inside your existing repo to wire UOAI accurately on the first try."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void copyText("main-prompt", generatedPrompt)}
              >
                {copiedId === "main-prompt" ? "Copied Prompt!" : "Copy Full Prompt"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadPromptFile(`uoai-integrate-${target}-${feature}.md`, generatedPrompt)
                }
              >
                Download .md
              </Button>
            </div>
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">Target Project</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as TargetPlatform)}
                aria-label="Target project type"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="website-react">Existing Website (React / Next.js / TS)</option>
                <option value="website-vanilla">Existing Website (Vanilla JS / TS)</option>
                <option value="chrome-extension">Existing Chrome / Brave Extension (MV3)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">Use Case / Feature</span>
              <select
                value={feature}
                onChange={(e) => setFeature(e.target.value as FeaturePreset)}
                aria-label="Feature preset"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="chat">Streaming AI Chat Panel</option>
                <option value="summarize">One-Click Page / Text Summarizer</option>
                <option value="coding">Offline Coding Assistant</option>
                <option value="rewrite">Inline Rewrite / Polish Action</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">Preferred Local Model</span>
              <select
                value={activeModelId}
                onChange={(e) => setSelectedModel(e.target.value)}
                aria-label="Preferred local model"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {snapshot.registry.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <pre className="max-h-[460px] overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
            <code>{generatedPrompt}</code>
          </pre>
        </Card>
      )}

      {/* TAB 2: Website Integration Guide */}
      {tab === "website" && (
        <div className="space-y-4">
          <Card
            title="1. Install & Connect in Any Website"
            subtitle="Logical API over secure extension messaging — zero API keys, zero localhost server."
          >
            <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li>
                <strong>1. Install SDK:</strong> <code>npm install @uoai/sdk</code>
              </li>
              <li>
                <strong>2. Serve over HTTPS:</strong> Remote sites must use <code>https://</code>. For local development (<code>http://localhost:5173</code>), toggle <strong>Settings &amp; Privacy → Developer Mode</strong>.
              </li>
              <li>
                <strong>3. Authorize Origin:</strong> Users approve your site once via the UOAI toolbar popup or via <code>UOAI.openAuthorizeWindow(&quot;{liveExtensionId}&quot;)</code> on button click.
              </li>
              <li>
                <strong>4. Discover &amp; Stream:</strong> Call <code>ai.models.list()</code> and <code>ai.chat.completions.create({"{ stream: true }"})</code> with an <code>AbortSignal</code>.
              </li>
            </ol>
          </Card>

          <Card
            title="2. Drop-in React Hook (useUOAI.ts)"
            subtitle="Handles connect, authorization window, model discovery, streaming, Stop cancellation, and revocation events."
            actions={
              <Button size="sm" variant="secondary" onClick={() => void copyText("react-hook", reactHookCode)}>
                {copiedId === "react-hook" ? "Copied!" : "Copy React Hook"}
              </Button>
            }
          >
            <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100">
              <code>{reactHookCode}</code>
            </pre>
          </Card>
        </div>
      )}

      {/* TAB 3: Browser Extension Integration Guide */}
      {tab === "extension" && (
        <div className="space-y-4">
          <Card
            title="Integrating UOAI Inside Another Chromium Extension (MV3)"
            subtitle="Share the user's downloaded WebGPU models without duplicating gigabyte weights or ONNX WASM."
          >
            <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p>
                <strong>Pattern A — Page-Injected UI (Recommended, works out of the box):</strong>{" "}
                If your extension injects a sidebar, tooltip, or writing helper into web pages, execute{" "}
                <code>@uoai/sdk</code> in the page&apos;s <code>MAIN</code> world on top-level frames (
                <code>allFrames: false</code>). Once the user approves the site in UOAI, UOAI&apos;s
                isolated-world Content-Script Bridge relays your requests cleanly.
              </p>
              <p>
                <strong>Pattern B — Direct Extension-to-Extension:</strong> If you maintain a custom or
                enterprise UOAI build, add your consumer extension ID to UOAI&apos;s{" "}
                <code>externally_connectable.ids</code> in <code>apps/extension/scripts/build.mjs</code>{" "}
                and connect directly via{" "}
                <code>UOAI.connect({`{ extensionId: "${liveExtensionId}" }`})</code>.
              </p>
              <p>
                <strong>Security Checklist:</strong> Never render raw LLM tokens with{" "}
                <code>innerHTML</code>, respect 30 req/min and 256 KB limits, and never send user
                prompts to analytics.
              </p>
            </div>
          </Card>

          <Card
            title="Extension Integration Example (uoaiBridge.ts)"
            actions={
              <Button size="sm" variant="secondary" onClick={() => void copyText("ext-code", extensionBridgeCode)}>
                {copiedId === "ext-code" ? "Copied!" : "Copy Example"}
              </Button>
            }
          >
            <pre className="overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100">
              <code>{extensionBridgeCode}</code>
            </pre>
          </Card>
        </div>
      )}

      {/* TAB 4: API, Models & Error Reference */}
      {tab === "reference" && (
        <div className="space-y-4">
          <Card
            title="Logical API Routes & Limits"
            subtitle="Exposed via @uoai/sdk over extension messaging (no localhost TCP server)."
          >
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-3">Logical Route</th>
                    <th className="py-2 pr-3">SDK Method</th>
                    <th className="py-2">Behavior &amp; Limits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-2 pr-3 font-mono">GET /v1/health</td>
                    <td className="py-2 pr-3 font-mono">ai.health.check()</td>
                    <td className="py-2">Answered by Service Worker without starting GPU.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-mono">GET /v1/runtime</td>
                    <td className="py-2 pr-3 font-mono">ai.runtime.get()</td>
                    <td className="py-2">State, loaded model, WebGPU status, queue depth (origin-scoped).</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-mono">GET /v1/models</td>
                    <td className="py-2 pr-3 font-mono">ai.models.list()</td>
                    <td className="py-2">Lists installed SHA-256-verified Ready models only.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-mono">POST /v1/chat/completions</td>
                    <td className="py-2 pr-3 font-mono">ai.chat.completions.create()</td>
                    <td className="py-2">≤ 256 KB, ≤ 200 msgs, 30 req/min/origin, max 2 queued/origin (5 global).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={`Verified WebGPU Model Identifiers (${snapshot.registry.models.length})`}>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              {snapshot.registry.models.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <div>
                    <p className="font-semibold">{m.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {m.id} • {m.quantization} • {formatBytes(m.hardware_requirements.estimated_download_size_bytes)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void copyText(`mid-${m.id}`, m.id)}>
                    {copiedId === `mid-${m.id}` ? "Copied" : "Copy ID"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title={`Error Code Reference (${filteredErrors.length} / 26)`}
            actions={
              <input
                type="search"
                placeholder="Search error codes…"
                value={errorSearch}
                onChange={(e) => setErrorSearch(e.target.value)}
                aria-label="Search error codes"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            }
          >
            <div className="max-h-80 space-y-2 overflow-y-auto text-xs">
              {filteredErrors.map((e) => (
                <div
                  key={e.code}
                  className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {e.code}
                    </span>
                    <div className="flex gap-1.5">
                      <Badge tone="neutral">{e.type}</Badge>
                      <Badge tone={e.retryable ? "warning" : "neutral"}>
                        {e.retryable ? "retryable" : "non-retryable"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{e.defaultMessage}</p>
                  <p className="mt-0.5 text-slate-500">{e.userGuidance}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

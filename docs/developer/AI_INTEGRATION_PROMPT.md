# Universal Offline AI (UOAI) — Ready-to-Use AI Integration Prompts

Copy and paste the appropriate prompt below into any AI coding assistant (Antigravity, Claude, Cursor, Windsurf, Copilot, etc.) when working inside an **existing website** or **existing browser extension** so it integrates **Universal Offline AI (UOAI)** accurately on the first try.

---

## Prompt 1 — Integrate UOAI into an Existing Website / Web App

```markdown
Integrate **Universal Offline AI (UOAI)** into this web application so users can run private, offline, on-device AI directly in their Chromium browser with zero cloud API keys or backend proxies.

### Mandatory Architectural Constraints (Do NOT violate)
1. **Use `@uoai/sdk` — NEVER `http://localhost`:** UOAI is a Chromium MV3 browser extension, NOT a localhost HTTP server. Do not use `fetch("http://localhost:...")` or point the OpenAI REST SDK at a `baseURL`.
2. **Two-Layer Per-Origin Authorization:** Websites cannot silently trigger browser permission dialogs. If `UOAI.connect()` throws `UOAIError` with `code: "extension_not_detected"` or `"permission_required"`, show a clean UI banner guiding the user to either:
   - Click the **UOAI extension toolbar icon** and click **Allow This Site to Use UOAI**, OR
   - Click an "Authorize with UOAI" button calling `UOAI.openAuthorizeWindow(UOAI_EXTENSION_ID)` (if an extension ID is configured).
   - For local development on `http://localhost:<port>`, remind the user to enable **Developer Mode** in UOAI Settings.
3. **Top-Level Frames Only:** Do not call `@uoai/sdk` from cross-origin iframes (`origin_not_allowed`).
4. **Stateless & Model-Aware:** Always call `await ai.models.list()` after connecting, prefer the model with `m.uoai.loaded === true` (falling back to `models[0].id`), and handle `model_not_loaded` / `model_not_found` gracefully.
5. **Strict Parameter Compliance:** Only send supported parameters: `model`, `messages` (`system` | `user` | `assistant`, max 200 messages, ≤ 256 KB total), `temperature` (0–2), `top_p` (0–1), `max_tokens` (≤ 1024 default website cap), `stop` (up to 4 strings), `seed`, `stream`, `stream_options: { include_usage: true }`. Do NOT send `tools`, `functions`, `logprobs`, or `response_format`.
6. **Streaming & Cancellation:** Support `stream: true` with `for await (const chunk of stream)`, pass an `AbortController().signal` via `{ signal }`, and wire a Stop/Cancel button that aborts generation cleanly (catching `UOAIError` with `code === "generation_cancelled"`).

### Exact `@uoai/sdk` API Surface
```ts
import { UOAI, UOAIError, type UOAIClient, type ModelInfo } from "@uoai/sdk";

const ai: UOAIClient = await UOAI.connect({ timeoutMs: 2500 });
ai.on("permission_revoked", () => { /* disable UI cleanly */ });

const health = await ai.health.check();        // { status, provider, provider_version, protocol_version }
const runtime = await ai.runtime.get();        // { state, loaded_model, webgpu_available, queue_length, origin_pending_requests }
const { data: models } = await ai.models.list(); // ModelInfo[]

// Streaming chat completion
const controller = new AbortController();
const stream = await ai.chat.completions.create(
  {
    model: models.find((m) => m.uoai.loaded)?.id ?? models[0].id,
    messages: [
      { role: "system", content: "You are a helpful local assistant." },
      { role: "user", content: userInput }
    ],
    stream: true,
    stream_options: { include_usage: true }
  },
  { signal: controller.signal }
);

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? "";
  // Append delta incrementally to UI
}
```

### Error Codes to Handle Explicitly (`err instanceof UOAIError`)
- `extension_not_detected` / `permission_required`: Show connect/authorize guidance.
- `permission_denied` / `permission_revoked`: Respect user choice and disable AI controls.
- `model_not_found` / `model_not_loaded`: Prompt user to select/load an installed model in UOAI.
- `context_length_exceeded`: Trim prompt history or reduce `max_tokens`.
- `rate_limited` / `queue_full`: Retryable (`err.retryAfterMs`).
- `webgpu_unavailable` / `insufficient_resources`: Show honest hardware limitation message (no silent cloud fallback).
- `generation_cancelled`: Keep partial output and mark as stopped.
- `runtime_restarted` / `connection_lost`: Retryable; allow user to retry.

### Task
1. Install `@uoai/sdk` (or wire our workspace package `@uoai/sdk`).
2. Create a clean service/hook (`useLocalAI` or `uoaiClient.ts`) encapsulating connection, model listing, streaming, cancellation, and revocation listeners.
3. Add the requested AI feature UI into this codebase with loading, streaming, Stop, error, and graceful "UOAI not connected" states.
4. Verify TypeScript types (`strict: true`) and write unit tests mocking `UOAI.connect()`.
```

---

## Prompt 2 — Integrate UOAI into an Existing Chromium Extension (Manifest V3)

```markdown
Integrate **Universal Offline AI (UOAI)** into this Chromium Manifest V3 browser extension so it can run private, offline, WebGPU-accelerated local LLM inference without bundling multi-gigabyte weights or ONNX WASM runtimes inside this extension.

### Architecture Rules
1. **No Localhost Server:** UOAI communicates over browser extension messaging via `@uoai/sdk`, never `http://localhost`.
2. **Choose the Matching Integration Pattern:**
   - **Page-Injected UI / Content-Script Enhancement:** Inject a MAIN-world helper script on authorized `https://` pages (top-level frames only, `allFrames: false`) that uses `@uoai/sdk`'s `UOAI.connect()`, and relay results to your extension UI. Ask the user to authorize the active site origin in UOAI's popup (or open `UOAI.openAuthorizeWindow(UOAI_EXTENSION_ID)` on user click).
   - **Direct Extension-to-Extension (`externally_connectable`):** If our extension ID is whitelisted in UOAI's `externally_connectable.ids`, connect directly via `UOAI.connect({ extensionId: UOAI_EXTENSION_ID })` from our popup, side panel, or service worker.
3. **MV3 Lifecycle & Security:**
   - Handle `connection_lost` and `runtime_restarted` cleanly (MV3 service workers sleep when idle).
   - Never log user prompts or model responses to console or remote telemetry.
   - Sanitize any model output rendered in HTML/Markdown (no `innerHTML` with raw model output, no `<script>` execution).
   - Respect UOAI limits: ≤ 256 KB payload, ≤ 200 messages, ≤ 30 req/min/origin, max 2 pending requests per origin.

### Task
1. Add `@uoai/sdk` to this extension's dependencies.
2. Build a `uoaiBridge.ts` module handling `UOAI.connect()`, `ai.models.list()` (preferring `m.uoai.loaded`), streaming `ai.chat.completions.create({ stream: true }, { signal })`, and `AbortSignal` cancellation.
3. Add clear UI states for `extension_not_detected`, `permission_required`, `permission_revoked`, `webgpu_unavailable`, and `generation_cancelled`.
4. Verify MV3 CSP compliance (zero remotely hosted scripts, zero `eval`) and run build + tests.
```

---

## Available Verified WebGPU Model IDs in UOAI

- **Lightweight (< 600 MB):** `smollm2-360m-instruct`, `qwen2-5-0-5b-instruct`, `qwen3-0-6b`, `qwen2-5-coder-0-5b-instruct`
- **Balanced General (780 MB – 1.4 GB):** `gemma-3-1b-it`, `llama-3-2-1b-instruct`, `smollm2-1-7b-instruct`, `qwen3-1-7b`
- **Coding Specialist:** `qwen2-5-coder-1-5b-instruct`
- **Reasoning Specialist:** `deepseek-r1-distill-qwen-1-5b`
- **High-Capability (2.3 – 3.1 GB):** `phi-3-5-mini-instruct`, `gemma-4-e2b`
- **Fast Offline Verification / CI:** `uoai-local-smoke-v1`

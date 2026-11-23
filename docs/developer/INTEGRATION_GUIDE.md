# Universal Offline AI (UOAI) — Developer Integration Guide

This guide explains how to integrate **Universal Offline AI (UOAI)** into:
1. **Existing Websites & Web Applications** (React, Next.js, Vue, Svelte, or Vanilla TypeScript/JavaScript)
2. **Existing Chromium Browser Extensions (Manifest V3)**

---

## 1. Architecture at a Glance (Important Constraints)

Before integrating, keep these foundational platform rules in mind:

- **Logical API, NOT a `localhost` HTTP Server:** UOAI runs as a Chromium MV3 browser extension. It does **not** bind `http://localhost:PORT`. Do not point standard OpenAI HTTP REST clients (`baseURL: "http://localhost:..."`) at UOAI. Always use `@uoai/sdk`, which transports OpenAI-shaped calls over secure browser extension messaging (`window.postMessage` ↔ isolated-world Content-Script Bridge ↔ `chrome.runtime.Port`).
- **Two-Layer Per-Origin Authorization:** Third-party origins (`scheme://host:port`) have **zero** access until the user explicitly grants both UOAI consent and the browser's optional host permission.
- **Top-Level Frames Only:** Embedded cross-origin iframes (`frameId !== 0`) are rejected (`origin_not_allowed`).
- **HTTPS Required (or `http://localhost:<port>` in Developer Mode):** Production websites must use `https://`. For local development (`http://localhost:5173`, `http://127.0.0.1:3000`), enable **Settings & Privacy → Developer Mode** in UOAI.
- **Zero Cloud Fallback & Zero Workspace Leakage:** All inference runs locally via WebGPU inside UOAI's dedicated Web Worker. Website requests are strictly stateless and never read the user's Workspace history.

---

## 2. Integrating into an Existing Website / Web App

### Step 1: Install `@uoai/sdk`

```bash
npm install @uoai/sdk
```

### Step 2: Check Availability & Connect with Graceful Fallback

```ts
import { UOAI, UOAIError, type UOAIClient } from "@uoai/sdk";

export async function connectLocalAI(): Promise<UOAIClient | null> {
  try {
    const ai = await UOAI.connect({ timeoutMs: 2500 });
    return ai;
  } catch (err) {
    if (err instanceof UOAIError) {
      if (err.code === "extension_not_detected" || err.code === "permission_required") {
        // Show an unobtrusive banner:
        // "Install UOAI extension or click the UOAI toolbar icon -> Allow this site"
        return null;
      }
      if (err.code === "permission_denied") {
        // Respect user denial; do not spam prompts
        return null;
      }
    }
    throw err;
  }
}
```

### Step 3: Triggering User Authorization (Two Supported Flows)

Because UOAI never requests broad `<all_urls>` host permissions, websites cannot silently pop up browser permission dialogs. Use either:

1. **Toolbar Popup Flow (Zero Extension ID Needed):** Display instructions: *"Click the UOAI extension icon in your browser toolbar and select **Allow This Site to Use UOAI**."* Once approved, UOAI immediately injects the bridge into the active tab and emits a `permission_granted` event.
2. **Direct Consent Popup Flow (If Extension ID Is Configured):** Inside a user `onClick` handler:
   ```ts
   // Opens chrome-extension://<extensionId>/authorize.html?origin=<currentOrigin>
   UOAI.openAuthorizeWindow(UOAI_EXTENSION_ID);
   ```

### Step 4: List Installed Local Models

```ts
const { data: models } = await ai.models.list();
if (models.length === 0) {
  throw new Error("No local models installed in UOAI yet. Open UOAI Model Library to download one.");
}
const modelId = models.find((m) => m.uoai.loaded)?.id ?? models[0].id;
```

### Step 5: Non-Streaming Chat Completion

```ts
const completion = await ai.chat.completions.create({
  model: modelId,
  messages: [
    { role: "system", content: "Summarize concisely in 3 bullet points." },
    { role: "user", content: articleText }
  ],
  temperature: 0.4,
  max_tokens: 512
});

console.log(completion.choices[0].message.content);
console.log(completion.usage); // { prompt_tokens, completion_tokens, total_tokens }
```

### Step 6: Streaming Chat Completion with `AbortSignal` Cancellation

```ts
const controller = new AbortController();

const stream = await ai.chat.completions.create(
  {
    model: modelId,
    messages: [{ role: "user", content: "Explain WebGPU shaders clearly." }],
    stream: true,
    stream_options: { include_usage: true }
  },
  { signal: controller.signal }
);

// Wire to a Stop button: stopBtn.onclick = () => controller.abort();
// Or break out of `for await` early to auto-cancel within <= 500 ms.
let fullText = "";
try {
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      fullText += delta;
      renderIncrementalText(fullText);
    }
  }
} catch (err) {
  if (err instanceof UOAIError && err.code === "generation_cancelled") {
    // Clean user-initiated stop
  } else {
    throw err;
  }
}
```

### Step 7: React Hook Pattern (`useLocalAI`)

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { UOAI, UOAIError, type ModelInfo, type UOAIClient } from "@uoai/sdk";

export function useLocalAI() {
  const clientRef = useRef<UOAIClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"idle" | "connected" | "needs_setup" | "revoked">("idle");
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
      const list = await ai.models.list();
      setModels(list.data);
    } catch (err) {
      setStatus("needs_setup");
      setError(err instanceof UOAIError ? `${err.code}: ${err.message}` : String(err));
    }
  }, []);

  useEffect(() => () => clientRef.current?.close(), []);

  const streamReply = useCallback(
    async (
      model: string,
      prompt: string,
      onDelta: (text: string) => void
    ) => {
      const ai = clientRef.current;
      if (!ai) throw new UOAIError("connection_lost");
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const stream = await ai.chat.completions.create(
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

  return { status, models, error, connect, streamReply, stop };
}
```

---

## 3. Integrating into an Existing Chromium Extension (Manifest V3)

When building another browser extension that wants to leverage a user's local UOAI models without bundling its own 20 MB WASM runtime and gigabyte weights:

### Pattern A — Enhancing Web Pages via Your Extension's Content Script (Recommended)
If your extension injects a UI widget (e.g., a sidebar, highlighter, or writing assistant) into web pages the user visits:
1. Ensure the user has authorized the target website's origin in UOAI (or prompt them to click the UOAI toolbar icon / open `UOAI.openAuthorizeWindow(uoaiExtensionId)`).
2. Run `@uoai/sdk` in the page's **MAIN world** (or communicate through a page-world script via `window.postMessage` with exact `window.location.origin`), because UOAI's isolated-world Content-Script Bridge relays messages over `window.postMessage` on the authorized origin.
3. Never hardcode an assumption that a specific model is loaded; always call `ai.models.list()` first and handle `model_not_loaded` cleanly.

### Pattern B — Trusted Origin / Dedicated Extension Integration
If you control a custom fork or enterprise build of UOAI and want your own extension's popup/sidepanel/service worker to call UOAI directly without a web tab:
1. Add your consumer extension's ID to UOAI's `externally_connectable.ids` array in `apps/extension/scripts/build.mjs`.
2. Connect directly from your extension's popup, side panel, or service worker using `ExtensionRuntimePortTransport` / `UOAI.connect({ extensionId: "<UOAI_EXTENSION_ID>" })`.
3. Handle `runtime_restarted` and `connection_lost` with automatic retry backoff (already built into `@uoai/sdk` for SW idle restarts).

---

## 4. Logical API Operations & Operational Limits

| Logical Route | SDK Method | Notes & Limits |
|---|---|---|
| `GET /v1/health` | `ai.health.check()` | Answered directly by SW without waking GPU. |
| `GET /v1/runtime` | `ai.runtime.get()` | Returns `state`, `loaded_model`, `webgpu_available`, `queue_length`, `origin_pending_requests`. |
| `GET /v1/models` | `ai.models.list()` | Lists installed, SHA-256-verified `Ready` models only. |
| `POST /v1/chat/completions` | `ai.chat.completions.create(params, { signal })` | Max payload **256 KB**, max **200 messages**, default website `max_tokens` cap **1,024** (configurable in Settings), rate limit **30 req/min/origin**, queue max **2 pending/origin** (5 global, Workspace prioritized). |

---

## 5. Key Error Codes to Handle Gracefully

| Code | Retryable | Recommended UX Action |
|---|---|---|
| `extension_not_detected` | No | Show install/enable UOAI guidance or fall back to non-AI workflow. |
| `permission_required` | No | Ask user to click the UOAI toolbar icon → **Allow This Site**, or call `UOAI.openAuthorizeWindow(id)` on button click. |
| `permission_denied` / `permission_revoked` | No | Disable local AI controls cleanly without nagging. |
| `model_not_found` | No | Call `ai.models.list()` and let user pick an installed model (or open UOAI Model Library). |
| `model_not_loaded` | No | Another model is loaded and cross-model switching is disabled; either use the `loaded` model from `models.list()` or ask user to switch in UOAI. |
| `context_length_exceeded` | No | Trim conversation history or lower `max_tokens`. |
| `rate_limited` / `queue_full` | Yes | Respect `err.retryAfterMs` and retry with backoff. |
| `webgpu_unavailable` / `insufficient_resources` | No | Explain hardware limitation honestly; never fail silently. |
| `generation_cancelled` | No | Keep partial output and reset button state. |
| `runtime_restarted` / `connection_lost` | Yes | Show brief "Reconnecting…" and allow one-click retry. |

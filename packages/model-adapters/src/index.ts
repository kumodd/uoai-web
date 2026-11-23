import type { ModelManifest } from "@uoai/model-registry";

export interface AdapterChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerationOptions {
  maxTokens: number;
  temperature: number;
  topP: number;
  stopSequences: string[];
  seed?: number;
}

export interface GeneratedTokenDelta {
  text: string;
  tokenCount: number;
}

export interface GenerationResultSummary {
  finishReason: "stop" | "length" | "cancelled";
  completionTokens: number;
}

export type ArtifactLoader = (artifactPath: string) => Promise<Uint8Array>;

export interface ModelRuntimeAdapter {
  readonly id: string;
  load(
    manifest: ModelManifest,
    loadArtifact: ArtifactLoader,
    onStage?: (stage: string, progress: number) => void
  ): Promise<void>;
  formatPrompt(messages: AdapterChatMessage[]): string;
  countTokens(text: string): number;
  generate(
    prompt: string,
    messages: AdapterChatMessage[],
    options: GenerationOptions,
    onDelta: (delta: GeneratedTokenDelta) => void,
    signal?: AbortSignal
  ): Promise<GenerationResultSummary>;
  unload(): Promise<void>;
}

// ============================================================================
// 1. Chat Template Formatter (FR-043)
// ============================================================================

export function formatChatTemplate(
  templateStyle: "gemma" | "chatml",
  messages: AdapterChatMessage[]
): string {
  if (templateStyle === "gemma") {
    // Gemma instruction template lacks native system role: prepend system prompt to first user turn (FR-043)
    const systemParts: string[] = [];
    const nonSystem: AdapterChatMessage[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
      } else {
        nonSystem.push({ ...msg });
      }
    }
    if (systemParts.length > 0 && nonSystem.length > 0 && nonSystem[0]?.role === "user") {
      nonSystem[0] = {
        role: "user",
        content: `${systemParts.join("\n\n")}\n\n${nonSystem[0].content}`
      };
    } else if (systemParts.length > 0) {
      nonSystem.unshift({ role: "user", content: systemParts.join("\n\n") });
    }

    let out = "<bos>";
    for (const msg of nonSystem) {
      const role = msg.role === "assistant" ? "model" : "user";
      out += `<start_of_turn>${role}\n${msg.content}<end_of_turn>\n`;
    }
    out += "<start_of_turn>model\n";
    return out;
  }

  // ChatML template (SmolLM2, Qwen, UOAI Smoke)
  let out = "";
  for (const msg of messages) {
    out += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  }
  out += "<|im_start|>assistant\n";
  return out;
}

// ============================================================================
// 2. Multi-Byte UTF-8 Safe Streaming Decoder & Deterministic Tokenizer (FR-042)
// ============================================================================

/**
 * Wraps TextDecoder({ stream: true }) to guarantee split multi-byte UTF-8 sequences
 * (emoji, Devanagari, CJK) never emit U+FFFD replacement characters across chunks.
 */
export class SafeUtf8StreamDecoder {
  private readonly decoder = new TextDecoder("utf-8", { fatal: false });

  decodeChunk(bytes: Uint8Array, flush: boolean = false): string {
    return this.decoder.decode(bytes, { stream: !flush });
  }
}

/**
 * Deterministic subword-approximation tokenizer (whitespace + punctuation + CJK/emoji splitting)
 * used for exact token accounting in the local deterministic adapter and offline estimates.
 */
export function tokenizeTextDeterministic(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  const regex = /(\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Devanagari}]|\p{Extended_Pictographic}|[A-Za-z0-9]+|[^\sA-Za-z0-9])/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const piece = match[0];
    if (piece.length > 6 && /^[A-Za-z0-9]+$/.test(piece)) {
      for (let i = 0; i < piece.length; i += 4) {
        tokens.push(piece.slice(i, i + 4));
      }
    } else {
      tokens.push(piece);
    }
  }
  return tokens;
}

// ============================================================================
// 3. Deterministic Local Adapter (Verified Artifacts, Zero Network, FR-041..046)
// ============================================================================

export class LocalDeterministicAdapter implements ModelRuntimeAdapter {
  public readonly id = "uoai-local-deterministic";
  private manifest: ModelManifest | null = null;
  private weightsLoaded = false;
  private tokenDelayMs: number;

  constructor(opts?: { tokenDelayMs?: number }) {
    this.tokenDelayMs = opts?.tokenDelayMs ?? 12;
  }

  async load(
    manifest: ModelManifest,
    loadArtifact: ArtifactLoader,
    onStage?: (stage: string, progress: number) => void
  ): Promise<void> {
    onStage?.("Reading verified artifacts from local storage", 20);
    // Load every artifact strictly from local storage (zero network calls — FR-041, FR-105)
    for (const artifact of manifest.artifacts) {
      const bytes = await loadArtifact(artifact.path);
      if (bytes.byteLength !== artifact.size_bytes) {
        throw new Error(`Artifact byte size mismatch for ${artifact.path}`);
      }
    }
    onStage?.("Initializing tokenizer and chat template", 60);
    onStage?.("Compiling WebGPU shaders & warming up", 90);
    this.manifest = manifest;
    this.weightsLoaded = true;
    onStage?.("Ready", 100);
  }

  formatPrompt(messages: AdapterChatMessage[]): string {
    const style = this.manifest?.id.startsWith("gemma") ? "gemma" : "chatml";
    return formatChatTemplate(style, messages);
  }

  countTokens(text: string): number {
    return tokenizeTextDeterministic(text).length;
  }

  async generate(
    _prompt: string,
    messages: AdapterChatMessage[],
    options: GenerationOptions,
    onDelta: (delta: GeneratedTokenDelta) => void,
    signal?: AbortSignal
  ): Promise<GenerationResultSummary> {
    if (!this.weightsLoaded || !this.manifest) {
      throw new Error("Model is not loaded.");
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const reply = this.synthesizeDeterministicResponse(lastUser, options.seed);
    const tokens = tokenizeTextDeterministic(reply);

    let generatedText = "";
    let emittedTokens = 0;

    for (const token of tokens) {
      if (signal?.aborted) {
        return { finishReason: "cancelled", completionTokens: emittedTokens };
      }

      if (emittedTokens >= options.maxTokens) {
        return { finishReason: "length", completionTokens: emittedTokens };
      }

      const candidate = generatedText + token;

      // Check stop sequences (FR-044: stop sequence itself must NOT be included in output)
      let hitStop: string | null = null;
      for (const stopSeq of options.stopSequences) {
        if (stopSeq && candidate.includes(stopSeq)) {
          hitStop = stopSeq;
          break;
        }
      }

      if (hitStop !== null) {
        const stopIdx = candidate.indexOf(hitStop);
        const remainingAllowed = candidate.slice(generatedText.length, stopIdx);
        if (remainingAllowed.length > 0) {
          emittedTokens += 1;
          onDelta({ text: remainingAllowed, tokenCount: 1 });
        }
        return { finishReason: "stop", completionTokens: emittedTokens };
      }

      generatedText = candidate;
      emittedTokens += 1;
      onDelta({ text: token, tokenCount: 1 });

      if (this.tokenDelayMs > 0) {
        await sleepAbortable(this.tokenDelayMs, signal);
        if (signal?.aborted) {
          return { finishReason: "cancelled", completionTokens: emittedTokens };
        }
      }
    }

    return { finishReason: "stop", completionTokens: emittedTokens };
  }

  async unload(): Promise<void> {
    this.weightsLoaded = false;
    this.manifest = null;
  }

  private synthesizeDeterministicResponse(userPrompt: string, seed?: number): string {
    const lower = userPrompt.toLowerCase();
    const seedNote = seed !== undefined ? ` [seed=${seed}]` : "";
    if (lower.includes("webgpu")) {
      return `WebGPU is a modern browser graphics and compute API that lets local AI models execute parallel tensor shaders directly on your GPU without sending data to a cloud server.${seedNote}`;
    }
    if (lower.includes("offline")) {
      return `Universal Offline AI runs language models directly inside your Chromium browser using verified local storage and WebGPU, keeping every prompt private even with no internet connection.${seedNote}`;
    }
    if (lower.includes("multibyte") || lower.includes("unicode") || lower.includes("emoji")) {
      return `Local UTF-8 streaming works cleanly across scripts: नमस्ते (Devanagari), 你好世界 (CJK), and 🚀🔒✨ (emoji).${seedNote}`;
    }
    if (lower.includes("long") || lower.includes("story") || lower.includes("essay")) {
      const sentence =
        "Local inference processes each token inside an isolated dedicated Web Worker on your device without external network requests. ";
      return `${sentence.repeat(12).trim()}${seedNote}`;
    }
    const cleanSnippet = userPrompt.trim().slice(0, 80) || "your request";
    return `UOAI local response (${this.manifest?.id ?? "local"}) processed completely on-device for: "${cleanSnippet}". No prompts were sent to any external server.${seedNote}`;
  }
}

// ============================================================================
// 4. Transformers.js / ONNX Runtime Web WebGPU Adapter (FR-040..045, FR-105)
// ============================================================================

export class TransformersWebGpuAdapter implements ModelRuntimeAdapter {
  public readonly id = "transformers-js-onnx-webgpu";
  private manifest: ModelManifest | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipelineInstance: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenizer: any = null;
  private localWasmBasePath: string;

  constructor(opts?: { localWasmBasePath?: string }) {
    this.localWasmBasePath = opts?.localWasmBasePath ?? "/wasm/";
  }

  async load(
    manifest: ModelManifest,
    loadArtifact: ArtifactLoader,
    onStage?: (stage: string, progress: number) => void
  ): Promise<void> {
    onStage?.("Verifying local artifacts before WebGPU initialization", 15);
    // Ensure config & tokenizer exist locally before initializing runtime
    for (const artifact of manifest.artifacts) {
      if (artifact.path.endsWith(".json")) {
        await loadArtifact(artifact.path);
      }
    }

    onStage?.("Loading local Transformers.js / ONNX Runtime WebGPU backend", 40);
    const transformers = await import("@huggingface/transformers");

    // Enforce strictly local-only execution during inference (FR-105, ADR-010, ADR-011)
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    transformers.env.useBrowserCache = false;
    transformers.env.useCustomCache = true;

    // Serve SHA-256-verified OPFS artifacts directly to Transformers.js with ZERO network calls
    const artifactByPath = new Map(manifest.artifacts.map((a) => [a.path, a]));
    transformers.env.customCache = {
      async match(request: string | Request): Promise<Response | undefined> {
        const reqUrl = typeof request === "string" ? request : request.url;
        for (const [artifactPath, artifact] of artifactByPath.entries()) {
          if (reqUrl.endsWith(`/${artifactPath}`) || reqUrl === artifactPath || reqUrl === artifact.url) {
            const bytes = await loadArtifact(artifactPath);
            const contentType = artifactPath.endsWith(".json")
              ? "application/json"
              : "application/octet-stream";
            return new Response(bytes as unknown as BodyInit, {
              status: 200,
              headers: {
                "content-type": contentType,
                "content-length": String(bytes.byteLength)
              }
            });
          }
        }
        return undefined;
      },
      async put(): Promise<void> {
        // Read-only from verified local OPFS store
      }
    };

    if (transformers.env.backends?.onnx?.wasm) {
      transformers.env.backends.onnx.wasm.wasmPaths = this.localWasmBasePath;
      // Avoid SharedArrayBuffer thread spawn failure when crossOriginIsolated is false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(globalThis as any).crossOriginIsolated) {
        transformers.env.backends.onnx.wasm.numThreads = 1;
      }
    }

    onStage?.("Compiling WebGPU shaders and loading model weights", 75);
    const modelRef = manifest.hf_repo_id ?? manifest.id;
    this.pipelineInstance = await transformers.pipeline("text-generation", modelRef, {
      device: "webgpu",
      dtype: manifest.quantization as "q4f16" | "q4" | "fp16" | "fp32",
      local_files_only: true
    });
    this.tokenizer = this.pipelineInstance.tokenizer;
    this.manifest = manifest;
    onStage?.("Ready", 100);
  }

  formatPrompt(messages: AdapterChatMessage[]): string {
    if (this.tokenizer?.apply_chat_template) {
      return this.tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true
      });
    }
    const style = this.manifest?.id.startsWith("gemma") ? "gemma" : "chatml";
    return formatChatTemplate(style, messages);
  }

  countTokens(text: string): number {
    if (this.tokenizer?.encode) {
      const ids = this.tokenizer.encode(text);
      return Array.isArray(ids) ? ids.length : ids.size ?? tokenizeTextDeterministic(text).length;
    }
    return tokenizeTextDeterministic(text).length;
  }

  async generate(
    prompt: string,
    _messages: AdapterChatMessage[],
    options: GenerationOptions,
    onDelta: (delta: GeneratedTokenDelta) => void,
    signal?: AbortSignal
  ): Promise<GenerationResultSummary> {
    if (!this.pipelineInstance) {
      throw new Error("TransformersWebGpuAdapter: model not loaded.");
    }

    const transformers = await import("@huggingface/transformers");
    const stopping = new transformers.InterruptableStoppingCriteria();
    const onAbort = () => stopping.interrupt();
    signal?.addEventListener("abort", onAbort, { once: true });

    let completionTokens = 0;
    let accumulated = "";
    let hitStop = false;

    const streamer = new transformers.TextStreamer(this.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        if (signal?.aborted || hitStop) return;
        const next = accumulated + text;
        for (const seq of options.stopSequences) {
          if (seq && next.includes(seq)) {
            const idx = next.indexOf(seq);
            const emitPart = next.slice(accumulated.length, idx);
            if (emitPart) {
              completionTokens += 1;
              onDelta({ text: emitPart, tokenCount: 1 });
            }
            hitStop = true;
            stopping.interrupt();
            return;
          }
        }
        accumulated = next;
        completionTokens += 1;
        onDelta({ text, tokenCount: 1 });
      }
    });

    try {
      await this.pipelineInstance(prompt, {
        max_new_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        do_sample: options.temperature > 0,
        streamer,
        stopping_criteria: [stopping]
      });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }

    if (signal?.aborted) {
      return { finishReason: "cancelled", completionTokens };
    }
    if (completionTokens >= options.maxTokens && !hitStop) {
      return { finishReason: "length", completionTokens };
    }
    return { finishReason: "stop", completionTokens };
  }

  async unload(): Promise<void> {
    if (this.pipelineInstance?.dispose) {
      await this.pipelineInstance.dispose();
    }
    this.pipelineInstance = null;
    this.tokenizer = null;
    this.manifest = null;
  }
}

export function createAdapterForManifest(
  manifest: ModelManifest,
  opts?: { tokenDelayMs?: number; localWasmBasePath?: string }
): ModelRuntimeAdapter {
  if (manifest.adapter === "uoai-local-deterministic") {
    return new LocalDeterministicAdapter({ tokenDelayMs: opts?.tokenDelayMs });
  }
  return new TransformersWebGpuAdapter({ localWasmBasePath: opts?.localWasmBasePath });
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

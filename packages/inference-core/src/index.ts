import {
  CRASH_WINDOW_MS,
  MAX_CONSECUTIVE_CRASHES,
  type RuntimeState,
  type WebGPUCapabilityInfo
} from "@uoai/shared-types";
import {
  UOAIError,
  generateRequestId,
  validateChatCompletionParams,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionCreateParams
} from "@uoai/api-protocol";
import type { ModelManifest } from "@uoai/model-registry";
import type { ArtifactStore, ModelDownloader } from "@uoai/model-storage";
import {
  createAdapterForManifest,
  type ModelRuntimeAdapter
} from "@uoai/model-adapters";

// ============================================================================
// 1. WebGPU Capability Detection inside Worker / Runtime Context (FR-003, FR-040)
// ============================================================================

export interface WebGPUDetectorOverride {
  detect(): Promise<WebGPUCapabilityInfo>;
}

export async function detectWebGPUCapabilities(): Promise<WebGPUCapabilityInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpu = (globalThis as any).navigator?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return {
      status: "unsupported",
      reasonCode: "no_webgpu_api",
      features: [],
      limits: { maxBufferSize: 0, maxStorageBufferBindingSize: 0 },
      limitations: ["navigator.gpu is not exposed in this browser or context."]
    };
  }

  let adapter;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch {
    adapter = null;
  }

  if (!adapter) {
    return {
      status: "unsupported",
      reasonCode: "no_gpu_adapter",
      features: [],
      limits: { maxBufferSize: 0, maxStorageBufferBindingSize: 0 },
      limitations: ["No WebGPU adapter found (GPU may be blocklisted or hardware acceleration disabled)."]
    };
  }

  const features: string[] = [];
  if (adapter.features) {
    for (const f of adapter.features) {
      features.push(String(f));
    }
  }

  const limits = {
    maxBufferSize: Number(adapter.limits?.maxBufferSize ?? 268_435_456),
    maxStorageBufferBindingSize: Number(adapter.limits?.maxStorageBufferBindingSize ?? 134_217_728),
    maxComputeWorkgroupStorageSize: Number(adapter.limits?.maxComputeWorkgroupStorageSize ?? 16384)
  };

  let device;
  try {
    device = await adapter.requestDevice();
    device?.destroy?.();
  } catch {
    return {
      status: "unsupported",
      reasonCode: "device_creation_failed",
      features,
      limits,
      limitations: ["WebGPU adapter was found, but device creation failed."]
    };
  }

  const info = adapter.info ?? {};
  const limitations: string[] = [];
  if (!features.includes("shader-f16")) {
    limitations.push("GPU lacks shader-f16; fp16-quantized models such as Gemma 4 E2B (q4f16) may be incompatible.");
  }
  if (limits.maxBufferSize < 1_073_741_824) {
    limitations.push("maxBufferSize is below 1 GB; only lightweight models may fit.");
  }

  return {
    status: limitations.length > 0 ? "supported_with_limitations" : "supported",
    adapterVendor: info.vendor || "Unknown GPU Vendor",
    adapterArchitecture: info.architecture || "Unknown Architecture",
    adapterDescription: info.description || info.device || "WebGPU Adapter",
    features,
    limits,
    limitations
  };
}

// ============================================================================
// 2. Inference Engine (State Machine, Streaming, Cancellation, Recovery)
// ============================================================================

export interface InferenceEngineStateSnapshot {
  state: RuntimeState;
  loadedModelId: string | null;
  webgpu: WebGPUCapabilityInfo | null;
  loadStage?: string;
  loadProgress?: number;
  lastErrorCode: string | null;
  consecutiveCrashes: number;
  idleSince?: number;
}

export interface InferenceEngineOptions {
  artifactStore: ArtifactStore;
  verifier: Pick<ModelDownloader, "verifyInstalledModel">;
  webgpuDetector?: WebGPUDetectorOverride;
  adapterFactory?: (manifest: ModelManifest) => ModelRuntimeAdapter;
  onStateChange?: (snapshot: InferenceEngineStateSnapshot) => void;
}

export class InferenceEngine {
  private readonly store: ArtifactStore;
  private readonly verifier: Pick<ModelDownloader, "verifyInstalledModel">;
  private readonly webgpuDetector: WebGPUDetectorOverride;
  private readonly adapterFactory: (manifest: ModelManifest) => ModelRuntimeAdapter;
  private readonly onStateChange?: (snapshot: InferenceEngineStateSnapshot) => void;

  private state: RuntimeState = "not_started";
  private loadedManifest: ModelManifest | null = null;
  private activeAdapter: ModelRuntimeAdapter | null = null;
  private webgpu: WebGPUCapabilityInfo | null = null;
  private loadStage?: string;
  private loadProgress?: number;
  private lastErrorCode: string | null = null;
  private idleSince?: number;
  private activeCancelController: AbortController | null = null;
  private activeRequestId: string | null = null;
  private crashTimestamps: number[] = [];

  constructor(opts: InferenceEngineOptions) {
    this.store = opts.artifactStore;
    this.verifier = opts.verifier;
    this.webgpuDetector = opts.webgpuDetector ?? { detect: detectWebGPUCapabilities };
    this.adapterFactory = opts.adapterFactory ?? ((m) => createAdapterForManifest(m));
    this.onStateChange = opts.onStateChange;
  }

  getSnapshot(): InferenceEngineStateSnapshot {
    return {
      state: this.state,
      loadedModelId: this.loadedManifest?.id ?? null,
      webgpu: this.webgpu,
      loadStage: this.loadStage,
      loadProgress: this.loadProgress,
      lastErrorCode: this.lastErrorCode,
      consecutiveCrashes: this.pruneCrashTimestamps().length,
      idleSince: this.idleSince
    };
  }

  private transition(
    nextState: RuntimeState,
    extra?: { loadStage?: string; loadProgress?: number; lastErrorCode?: string | null }
  ): void {
    this.state = nextState;
    if (extra?.loadStage !== undefined) this.loadStage = extra.loadStage;
    if (extra?.loadProgress !== undefined) this.loadProgress = extra.loadProgress;
    if (extra?.lastErrorCode !== undefined) this.lastErrorCode = extra.lastErrorCode;
    if (nextState === "idle" || nextState === "ready") {
      this.idleSince = Date.now();
    } else if (nextState === "generating") {
      this.idleSince = undefined;
    }
    this.onStateChange?.(this.getSnapshot());
  }

  private pruneCrashTimestamps(): number[] {
    const cutoff = Date.now() - CRASH_WINDOW_MS;
    this.crashTimestamps = this.crashTimestamps.filter((ts) => ts >= cutoff);
    return this.crashTimestamps;
  }

  /**
   * Initialize WebGPU device check (FR-040, OQ-07 = Option A strict WebGPU).
   */
  async initialize(): Promise<WebGPUCapabilityInfo> {
    this.transition("starting");
    const cap = await this.webgpuDetector.detect();
    this.webgpu = cap;
    if (cap.status === "unsupported") {
      this.transition("error", { lastErrorCode: "webgpu_unavailable" });
      return cap;
    }
    this.transition("idle", { lastErrorCode: null });
    return cap;
  }

  /**
   * Load a verified local model into the active worker (FR-041, FR-119, BR-08, BR-12).
   */
  async loadModel(
    manifest: ModelManifest,
    opts?: { fullHash?: boolean }
  ): Promise<void> {
    if (!this.webgpu || this.state === "not_started") {
      await this.initialize();
    }
    if (this.webgpu?.status === "unsupported") {
      throw new UOAIError("webgpu_unavailable");
    }

    // Verify local integrity before loading (BR-08, FR-119, OQ-17 = Option A)
    const verification = await this.verifier.verifyInstalledModel(manifest.id, {
      fullHash: opts?.fullHash ?? false
    });
    if (!verification.valid) {
      this.transition("error", { lastErrorCode: "model_not_verified" });
      throw new UOAIError("model_not_verified", verification.reason);
    }

    // Unload existing model first (BR-12, UC-15)
    if (this.activeAdapter) {
      await this.unloadModel("model_unloaded");
    }

    this.transition("loading_model", {
      loadStage: "Preparing local runtime",
      loadProgress: 5,
      lastErrorCode: null
    });

    const adapter = this.adapterFactory(manifest);
    try {
      await adapter.load(
        manifest,
        (artifactPath) => this.store.readFinal(manifest.id, artifactPath),
        (stage, progress) => {
          this.transition("loading_model", { loadStage: stage, loadProgress: progress });
        }
      );
      this.activeAdapter = adapter;
      this.loadedManifest = manifest;
      this.transition("ready", { loadStage: "Ready", loadProgress: 100, lastErrorCode: null });
    } catch (err) {
      await adapter.unload().catch(() => undefined);
      const msg = err instanceof Error ? err.message : String(err);
      const isOom = /oom|out of memory|allocation|buffer size|insufficient/i.test(msg);
      const code = isOom ? "insufficient_resources" : "internal_error";
      this.transition("error", { lastErrorCode: code, loadStage: undefined, loadProgress: undefined });
      throw new UOAIError(code, msg);
    }
  }

  /**
   * Unload active model and release GPU/Worker resources (FR-050, NFR-041).
   */
  async unloadModel(cancelReason: "model_unloaded" | "generation_cancelled" = "model_unloaded"): Promise<void> {
    if (this.activeCancelController) {
      this.activeCancelController.abort(cancelReason);
      this.activeCancelController = null;
      this.activeRequestId = null;
    }
    if (!this.activeAdapter && !this.loadedManifest) {
      if (this.state !== "not_started" && this.state !== "error") {
        this.transition("idle");
      }
      return;
    }
    this.transition("unloading");
    try {
      await this.activeAdapter?.unload();
    } finally {
      this.activeAdapter = null;
      this.loadedManifest = null;
      this.transition("idle", { loadStage: undefined, loadProgress: undefined });
    }
  }

  /**
   * Cancel active generation by requestId (FR-046, NFR-004).
   */
  cancelActive(requestId?: string, reason: string = "generation_cancelled"): boolean {
    if (!this.activeCancelController) return false;
    if (requestId && this.activeRequestId !== requestId) return false;
    this.activeCancelController.abort(reason);
    return true;
  }

  /**
   * Execute a validated chat completion locally (FR-042..046, BR-23 stateless).
   */
  async runChatCompletion(
    rawParams: ChatCompletionCreateParams,
    opts?: {
      requestId?: string;
      maxTokensCap?: number;
      signal?: AbortSignal;
      onChunk?: (chunk: ChatCompletionChunk) => void;
    }
  ): Promise<ChatCompletion> {
    // Defense-in-depth second boundary Zod validation (FR-116)
    const params = validateChatCompletionParams(rawParams);

    if (this.webgpu?.status === "unsupported") {
      throw new UOAIError("webgpu_unavailable");
    }
    if (!this.activeAdapter || !this.loadedManifest) {
      throw new UOAIError("model_not_loaded");
    }
    if (this.state === "generating") {
      throw new UOAIError("queue_full", "Runtime is already processing an active generation.");
    }

    const requestId = opts?.requestId ?? generateRequestId("chatcmpl_uoai");
    const created = Math.floor(Date.now() / 1000);
    const modelId = this.loadedManifest.id;

    // Context window and max_tokens enforcement (FR-043, BR-14)
    const prompt = this.activeAdapter.formatPrompt(params.messages);
    const promptTokens = this.activeAdapter.countTokens(prompt);
    const contextLimit = this.loadedManifest.context_length.uoai_default;
    const requestedMaxTokens = params.max_tokens ?? Math.min(1024, Math.max(1, contextLimit - promptTokens));

    if (opts?.maxTokensCap !== undefined && requestedMaxTokens > opts.maxTokensCap) {
      throw new UOAIError(
        "invalid_request",
        `max_tokens (${requestedMaxTokens}) exceeds configured cap (${opts.maxTokensCap}).`,
        { param: "max_tokens", requestId }
      );
    }

    if (promptTokens + requestedMaxTokens > contextLimit) {
      throw new UOAIError(
        "context_length_exceeded",
        `Prompt (${promptTokens} tokens) + max_tokens (${requestedMaxTokens}) exceeds context limit (${contextLimit}).`,
        { requestId, promptTokens, maxContext: contextLimit }
      );
    }

    const stopList = params.stop
      ? Array.isArray(params.stop)
        ? params.stop
        : [params.stop]
      : this.loadedManifest.default_sampling.stop_sequences;

    const localAbort = new AbortController();
    this.activeCancelController = localAbort;
    this.activeRequestId = requestId;

    const forwardAbort = () => localAbort.abort(opts?.signal?.reason ?? "generation_cancelled");
    if (opts?.signal?.aborted) {
      forwardAbort();
    } else {
      opts?.signal?.addEventListener("abort", forwardAbort, { once: true });
    }

    this.transition("generating");
    let sequence = 0;
    let content = "";

    const emitChunk = (chunk: ChatCompletionChunk) => {
      opts?.onChunk?.(chunk);
    };

    try {
      if (params.stream) {
        emitChunk({
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model: modelId,
          sequence: sequence++,
          choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]
        });
      }

      const summary = await this.activeAdapter.generate(
        prompt,
        params.messages,
        {
          maxTokens: requestedMaxTokens,
          temperature: params.temperature ?? this.loadedManifest.default_sampling.temperature,
          topP: params.top_p ?? this.loadedManifest.default_sampling.top_p,
          stopSequences: stopList,
          seed: params.seed
        },
        (delta) => {
          content += delta.text;
          if (params.stream) {
            emitChunk({
              id: requestId,
              object: "chat.completion.chunk",
              created,
              model: modelId,
              sequence: sequence++,
              choices: [{ index: 0, delta: { content: delta.text }, finish_reason: null }]
            });
          }
        },
        localAbort.signal
      );

      if (localAbort.signal.aborted || summary.finishReason === "cancelled") {
        const reason = String(localAbort.signal.reason ?? "generation_cancelled");
        const errorCode =
          reason === "permission_revoked"
            ? "permission_revoked"
            : reason === "model_unloaded"
              ? "model_unloaded"
              : reason === "runtime_restarted"
                ? "runtime_restarted"
                : "generation_cancelled";
        throw new UOAIError(errorCode, undefined, { requestId });
      }

      const usage = {
        prompt_tokens: promptTokens,
        completion_tokens: summary.completionTokens,
        total_tokens: promptTokens + summary.completionTokens
      };

      if (params.stream) {
        const includeUsage = params.stream_options?.include_usage ?? true;
        emitChunk({
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model: modelId,
          sequence: sequence++,
          choices: [{ index: 0, delta: {}, finish_reason: summary.finishReason }],
          ...(includeUsage ? { usage } : {})
        });
      }

      return {
        id: requestId,
        object: "chat.completion",
        created,
        model: modelId,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: summary.finishReason
          }
        ],
        usage
      };
    } finally {
      opts?.signal?.removeEventListener("abort", forwardAbort);
      if (this.activeRequestId === requestId) {
        this.activeCancelController = null;
        this.activeRequestId = null;
      }
      if (this.getSnapshot().state === "generating") {
        this.transition(this.activeAdapter ? "ready" : "idle");
      }
    }
  }

  /**
   * Simulate or handle WebGPU device loss / Worker crash with bounded recovery (FR-049, NFR-044, UC-14).
   */
  async handleRuntimeFailureAndRecover(): Promise<{ recovered: boolean; errorCode: string }> {
    const previousManifest = this.loadedManifest;

    // Abort in-flight request immediately with retryable runtime_restarted
    if (this.activeCancelController) {
      this.activeCancelController.abort("runtime_restarted");
      this.activeCancelController = null;
      this.activeRequestId = null;
    }

    this.crashTimestamps.push(Date.now());
    const recentCrashes = this.pruneCrashTimestamps();

    await this.activeAdapter?.unload().catch(() => undefined);
    this.activeAdapter = null;
    this.loadedManifest = null;

    if (recentCrashes.length > MAX_CONSECUTIVE_CRASHES) {
      this.transition("error", { lastErrorCode: "runtime_unavailable" });
      return { recovered: false, errorCode: "runtime_unavailable" };
    }

    this.transition("recovering", { lastErrorCode: "runtime_restarted" });
    try {
      const cap = await this.webgpuDetector.detect();
      this.webgpu = cap;
      if (cap.status === "unsupported") {
        this.transition("error", { lastErrorCode: "webgpu_unavailable" });
        return { recovered: false, errorCode: "webgpu_unavailable" };
      }
      if (previousManifest) {
        await this.loadModel(previousManifest);
      } else {
        this.transition("idle", { lastErrorCode: null });
      }
      return { recovered: true, errorCode: "runtime_restarted" };
    } catch {
      this.transition("error", { lastErrorCode: "runtime_unavailable" });
      return { recovered: false, errorCode: "runtime_unavailable" };
    }
  }
}

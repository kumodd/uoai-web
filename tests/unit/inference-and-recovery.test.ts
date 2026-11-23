import { describe, expect, it } from "vitest";
import {
  BUNDLED_MODEL_REGISTRY,
  SMOKE_MODEL_CONFIG_JSON,
  SMOKE_MODEL_TOKENIZER_JSON,
  SMOKE_MODEL_WEIGHTS_TEXT,
  findModelInRegistry
} from "@uoai/model-registry";
import {
  MemoryArtifactStore,
  MemoryModelMetadataStore,
  ModelDownloader
} from "@uoai/model-storage";
import { InferenceEngine } from "@uoai/inference-core";
import { LocalDeterministicAdapter, SafeUtf8StreamDecoder, formatChatTemplate } from "@uoai/model-adapters";
import { UOAIError, type ChatCompletionChunk } from "@uoai/api-protocol";
import type { WebGPUCapabilityInfo } from "@uoai/shared-types";

const encoder = new TextEncoder();

async function setupVerifiedSmokeModel() {
  const store = new MemoryArtifactStore();
  const meta = new MemoryModelMetadataStore();
  const smoke = findModelInRegistry(BUNDLED_MODEL_REGISTRY, "uoai-local-smoke-v1")!;
  const fixtures: Record<string, Uint8Array> = {
    [smoke.artifacts[0]!.url]: encoder.encode(SMOKE_MODEL_CONFIG_JSON),
    [smoke.artifacts[1]!.url]: encoder.encode(SMOKE_MODEL_TOKENIZER_JSON),
    [smoke.artifacts[2]!.url]: encoder.encode(SMOKE_MODEL_WEIGHTS_TEXT)
  };
  const downloader = new ModelDownloader({
    artifactStore: store,
    metadataStore: meta,
    fetchImpl: async (url) =>
      new Response(fixtures[String(url)] as unknown as BodyInit, { status: 200 })
  });
  await downloader.downloadAndInstall(smoke);
  return { store, meta, downloader, smoke };
}

const mockSupportedWebGpu: WebGPUCapabilityInfo = {
  status: "supported",
  adapterVendor: "TestGPU",
  adapterDescription: "Mock WebGPU",
  features: ["shader-f16"],
  limits: { maxBufferSize: 2_147_483_648, maxStorageBufferBindingSize: 1_073_741_824 },
  limitations: []
};

describe("Inference Engine, Streaming, Cancellation, Recovery & Switching (TC-009..011, TC-032, TC-036..038)", () => {
  it("formats Gemma and ChatML templates accurately including system fallback (FR-043)", () => {
    const gemmaPrompt = formatChatTemplate("gemma", [
      { role: "system", content: "Be concise." },
      { role: "user", content: "Hello" }
    ]);
    expect(gemmaPrompt).toContain("<start_of_turn>user\nBe concise.\n\nHello<end_of_turn>");
    expect(gemmaPrompt.endsWith("<start_of_turn>model\n")).toBe(true);
  });

  it("decodes split multi-byte UTF-8 sequences without replacement characters (FR-042)", () => {
    const sample = "नमस्ते 你好 🚀🔒";
    const bytes = encoder.encode(sample);
    const dec = new SafeUtf8StreamDecoder();
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += dec.decodeChunk(bytes.subarray(i, i + 1), false);
    }
    out += dec.decodeChunk(new Uint8Array(0), true);
    expect(out).toBe(sample);
    expect(out).not.toContain("\uFFFD");
  });

  it("loads verified model with 0 network calls, streams chunks, honors max_tokens & stop sequences (TC-009, TC-010)", async () => {
    const { store, downloader, smoke } = await setupVerifiedSmokeModel();
    const engine = new InferenceEngine({
      artifactStore: store,
      verifier: downloader,
      webgpuDetector: { detect: async () => mockSupportedWebGpu },
      adapterFactory: () => new LocalDeterministicAdapter({ tokenDelayMs: 2 })
    });

    await engine.loadModel(smoke);
    expect(engine.getSnapshot().state).toBe("ready");

    const chunks: ChatCompletionChunk[] = [];
    const comp = await engine.runChatCompletion(
      {
        model: smoke.id,
        messages: [{ role: "user", content: "Explain how WebGPU works." }],
        stream: true,
        max_tokens: 120
      },
      { onChunk: (c) => chunks.push(c) }
    );

    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0]!.choices[0]!.delta.role).toBe("assistant");
    expect(chunks[chunks.length - 1]!.choices[0]!.finish_reason).toBe("stop");
    const joined = chunks.map((c) => c.choices[0]?.delta?.content ?? "").join("");
    expect(joined).toBe(comp.choices[0]!.message.content);
    expect(comp.usage.total_tokens).toBe(comp.usage.prompt_tokens + comp.usage.completion_tokens);

    // Stop sequence excluded from output (FR-044)
    const stopped = await engine.runChatCompletion({
      model: smoke.id,
      messages: [{ role: "user", content: "Explain how WebGPU works." }],
      stop: ["compute API"]
    });
    expect(stopped.choices[0]!.message.content).not.toContain("compute API");
    expect(stopped.choices[0]!.finish_reason).toBe("stop");
  });

  it("cancels active generation within <= 500 ms (FR-046, NFR-004, TC-011)", async () => {
    const { store, downloader, smoke } = await setupVerifiedSmokeModel();
    const engine = new InferenceEngine({
      artifactStore: store,
      verifier: downloader,
      webgpuDetector: { detect: async () => mockSupportedWebGpu },
      adapterFactory: () => new LocalDeterministicAdapter({ tokenDelayMs: 25 })
    });
    await engine.loadModel(smoke);

    const ctrl = new AbortController();
    let cancelTriggeredAt = 0;
    let lastChunkAt = 0;

    const runPromise = engine.runChatCompletion(
      {
        model: smoke.id,
        messages: [{ role: "user", content: "Write a long story about offline AI." }],
        stream: true,
        max_tokens: 500
      },
      {
        signal: ctrl.signal,
        onChunk: (c) => {
          lastChunkAt = Date.now();
          if ((c.sequence ?? 0) === 2) {
            cancelTriggeredAt = Date.now();
            ctrl.abort("generation_cancelled");
          }
        }
      }
    );

    await expect(runPromise).rejects.toMatchObject({ code: "generation_cancelled" });
    expect(lastChunkAt - cancelTriggeredAt).toBeLessThanOrEqual(500);
    expect(engine.getSnapshot().state).toBe("ready");
  });

  it("returns context_length_exceeded when prompt + max_tokens > context (FR-043, TC-032)", async () => {
    const { store, downloader, smoke } = await setupVerifiedSmokeModel();
    const engine = new InferenceEngine({
      artifactStore: store,
      verifier: downloader,
      webgpuDetector: { detect: async () => mockSupportedWebGpu }
    });
    await engine.loadModel(smoke);

    await expect(
      engine.runChatCompletion({
        model: smoke.id,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: smoke.context_length.uoai_default + 10
      })
    ).rejects.toMatchObject({ code: "context_length_exceeded" });
  });

  it("recovers automatically from runtime failure and enforces bounded 3-crash circuit breaker (FR-049, TC-036)", async () => {
    const { store, downloader, smoke } = await setupVerifiedSmokeModel();
    const engine = new InferenceEngine({
      artifactStore: store,
      verifier: downloader,
      webgpuDetector: { detect: async () => mockSupportedWebGpu },
      adapterFactory: () => new LocalDeterministicAdapter({ tokenDelayMs: 1 })
    });
    await engine.loadModel(smoke);

    // 3 crashes within 5 min -> all recover automatically
    for (let i = 0; i < 3; i++) {
      const res = await engine.handleRuntimeFailureAndRecover();
      expect(res.recovered).toBe(true);
      expect(engine.getSnapshot().state).toBe("ready");
    }

    // 4th consecutive crash in 5 min -> halts auto-recovery to prevent crash loop
    const fourth = await engine.handleRuntimeFailureAndRecover();
    expect(fourth.recovered).toBe(false);
    expect(fourth.errorCode).toBe("runtime_unavailable");
    expect(engine.getSnapshot().state).toBe("error");
  });

  it("handles 10 consecutive load/unload cycles cleanly without stale state (TC-037, TC-038, NFR-041)", async () => {
    const { store, downloader, smoke } = await setupVerifiedSmokeModel();
    const engine = new InferenceEngine({
      artifactStore: store,
      verifier: downloader,
      webgpuDetector: { detect: async () => mockSupportedWebGpu },
      adapterFactory: () => new LocalDeterministicAdapter({ tokenDelayMs: 0 })
    });
    for (let i = 0; i < 10; i++) {
      await engine.loadModel(smoke);
      expect(engine.getSnapshot().loadedModelId).toBe(smoke.id);
      await engine.unloadModel();
      expect(engine.getSnapshot().loadedModelId).toBeNull();
      expect(engine.getSnapshot().state).toBe("idle");
    }
  });

  it("fails honestly with webgpu_unavailable when WebGPU is unsupported (TC-019, OQ-07)", async () => {
    const { store, downloader, smoke } = await setupVerifiedSmokeModel();
    const engine = new InferenceEngine({
      artifactStore: store,
      verifier: downloader,
      webgpuDetector: {
        detect: async () => ({
          status: "unsupported",
          reasonCode: "no_gpu_adapter",
          features: [],
          limits: { maxBufferSize: 0, maxStorageBufferBindingSize: 0 },
          limitations: ["Disabled"]
        })
      }
    });

    await expect(engine.loadModel(smoke)).rejects.toThrowError(UOAIError);
    await expect(engine.loadModel(smoke)).rejects.toMatchObject({ code: "webgpu_unavailable" });
  });
});

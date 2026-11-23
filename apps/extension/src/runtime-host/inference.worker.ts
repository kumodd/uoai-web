/**
 * Dedicated Inference Web Worker (PC-06, ADR-002, OQ-02 = Option B).
 * Runs inside the visible extension page / Side Panel Runtime Host — NEVER inside the MV3 Service Worker.
 * Owns WebGPU capability detection, model downloading/SHA-256 verification, and local token generation.
 */
import {
  BUNDLED_MODEL_REGISTRY,
  SMOKE_MODEL_CONFIG_JSON,
  SMOKE_MODEL_TOKENIZER_JSON,
  SMOKE_MODEL_WEIGHTS_TEXT,
  findModelInRegistry,
  type ModelRegistry
} from "@uoai/model-registry";
import {
  IndexedDbModelMetadataStore,
  MemoryArtifactStore,
  ModelDownloader,
  OpfsArtifactStore,
  type ArtifactStore,
  type DownloadProgressEvent
} from "@uoai/model-storage";
import { InferenceEngine, detectWebGPUCapabilities } from "@uoai/inference-core";
import { createAdapterForManifest } from "@uoai/model-adapters";
import { UOAIError, type ChatCompletionChunk, type ChatCompletionCreateParams } from "@uoai/api-protocol";
import type { CapabilityProfile } from "@uoai/shared-types";

const encoder = new TextEncoder();

/**
 * Local verified smoke-fixture fetch wrapper:
 * - Serves `https://models.uoai.local/uoai-local-smoke-v1/*` with real HTTP Range support & ETag
 *   so full staging -> streaming SHA-256 -> atomic OPFS commit works offline & in E2E tests.
 * - All external model URLs (e.g. Hugging Face / CDN mirror) go through standard `fetch`.
 */
const smokeFiles: Record<string, Uint8Array> = {
  "https://models.uoai.local/uoai-local-smoke-v1/config.json": encoder.encode(SMOKE_MODEL_CONFIG_JSON),
  "https://models.uoai.local/uoai-local-smoke-v1/tokenizer.json": encoder.encode(SMOKE_MODEL_TOKENIZER_JSON),
  "https://models.uoai.local/uoai-local-smoke-v1/weights.bin": encoder.encode(SMOKE_MODEL_WEIGHTS_TEXT)
};

const workerFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const fixture = smokeFiles[url];
  if (fixture) {
    const rangeHeader =
      init?.headers && !Array.isArray(init.headers)
        ? (init.headers as Record<string, string>)["Range"]
        : undefined;
    if (rangeHeader?.startsWith("bytes=")) {
      const start = Number(rangeHeader.replace("bytes=", "").split("-")[0] ?? 0);
      const slice = fixture.subarray(start);
      return new Response(slice as unknown as BodyInit, {
        status: 206,
        headers: {
          "content-length": String(slice.byteLength),
          "accept-ranges": "bytes",
          etag: '"uoai-smoke-v1"'
        }
      });
    }
    return new Response(fixture as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-length": String(fixture.byteLength),
        "accept-ranges": "bytes",
        etag: '"uoai-smoke-v1"'
      }
    });
  }
  return fetch(input, init);
};

function createArtifactStore(): ArtifactStore {
  if (typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function") {
    return new OpfsArtifactStore();
  }
  return new MemoryArtifactStore();
}

const artifactStore = createArtifactStore();
const metadataStore = new IndexedDbModelMetadataStore("uoai_models");
let registry: ModelRegistry = BUNDLED_MODEL_REGISTRY;

const downloader = new ModelDownloader({
  artifactStore,
  metadataStore,
  fetchImpl: workerFetch,
  onProgress: (evt: DownloadProgressEvent) => {
    self.postMessage({ type: "download_progress", event: evt });
  }
});

const localWasmBasePath =
  typeof self !== "undefined" && self.location?.href
    ? new URL("./wasm/", self.location.href).href
    : "./wasm/";

const engine = new InferenceEngine({
  artifactStore,
  verifier: downloader,
  adapterFactory: (manifest) => createAdapterForManifest(manifest, { localWasmBasePath }),
  onStateChange: (snapshot) => {
    self.postMessage({ type: "runtime_state", snapshot });
  }
});

const activeAbortControllers = new Map<string, AbortController>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.onmessage = async (event: MessageEvent<any>) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  const callId: string = msg.callId;

  const replyOk = (data: unknown) => self.postMessage({ type: "rpc_result", callId, data });
  const replyErr = (err: unknown) => {
    const uoaiErr =
      err instanceof UOAIError
        ? err
        : new UOAIError(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((err as any)?.code as any) ?? "internal_error",
            err instanceof Error ? err.message : String(err)
          );
    self.postMessage({ type: "rpc_error", callId, error: uoaiErr.toPayload().error });
  };

  try {
    switch (msg.action) {
      case "detect_capabilities": {
        const webgpu = await detectWebGPUCapabilities();
        let usageBytes = 0;
        let quotaBytes = 4 * 1024 * 1024 * 1024;
        let persisted: boolean | "unknown" = "unknown";
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          usageBytes = est.usage ?? 0;
          quotaBytes = est.quota ?? quotaBytes;
        }
        if (navigator.storage?.persisted) {
          persisted = await navigator.storage.persisted().catch(() => "unknown" as const);
        }
        const profile: CapabilityProfile = {
          checkedAt: Date.now(),
          browserName: "Chromium",
          browserVersion: navigator.userAgent.match(/Chrom(?:e|ium)\/([\d.]+)/)?.[1] ?? "unknown",
          isSupportedBrowser: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          deviceMemoryGb: (navigator as any).deviceMemory,
          checks: [
            {
              id: "worker",
              label: "Dedicated Web Worker Isolation",
              status: "pass",
              message: "Inference executes in a dedicated Web Worker outside the UI & Service Worker."
            },
            {
              id: "webgpu",
              label: "WebGPU Hardware Acceleration",
              status:
                webgpu.status === "supported"
                  ? "pass"
                  : webgpu.status === "supported_with_limitations"
                    ? "warn"
                    : "fail",
              message:
                webgpu.status === "unsupported"
                  ? webgpu.limitations[0] ?? "WebGPU unavailable."
                  : `WebGPU active (${webgpu.adapterDescription ?? "GPU"}).`,
              remedy:
                webgpu.status === "unsupported"
                  ? "Enable hardware acceleration in chrome://settings/system and inspect chrome://gpu."
                  : undefined
            },
            {
              id: "storage",
              label: "Extension-Origin Local Storage (OPFS + IndexedDB)",
              status: quotaBytes - usageBytes > 100 * 1024 * 1024 ? "pass" : "warn",
              message: `Available quota: ${Math.round((quotaBytes - usageBytes) / 1e6)} MB.`
            }
          ],
          webgpu,
          storage: {
            usageBytes,
            quotaBytes,
            availableBytes: Math.max(0, quotaBytes - usageBytes),
            persisted
          }
        };
        replyOk(profile);
        break;
      }

      case "get_storage_state": {
        const records = await metadataStore.list();
        const usedBytesByModel = await artifactStore.getUsedBytesByModel();
        replyOk({ records, usedBytesByModel, runtime: engine.getSnapshot() });
        break;
      }

      case "download_model": {
        const manifest = findModelInRegistry(registry, msg.modelId);
        if (!manifest) throw new UOAIError("model_not_found");
        const rec = await downloader.downloadAndInstall(manifest);
        replyOk(rec);
        break;
      }

      case "pause_download": {
        replyOk({ paused: downloader.pause(msg.modelId) });
        break;
      }

      case "cancel_download": {
        await downloader.cancel(msg.modelId);
        replyOk({ cancelled: true });
        break;
      }

      case "verify_model": {
        const res = await downloader.verifyInstalledModel(msg.modelId, {
          fullHash: Boolean(msg.fullHash)
        });
        replyOk(res);
        break;
      }

      case "load_model": {
        const manifest = findModelInRegistry(registry, msg.modelId);
        if (!manifest) throw new UOAIError("model_not_found");
        await engine.loadModel(manifest, { fullHash: Boolean(msg.fullHash) });
        replyOk(engine.getSnapshot());
        break;
      }

      case "unload_model": {
        await engine.unloadModel();
        replyOk(engine.getSnapshot());
        break;
      }

      case "remove_model": {
        if (engine.getSnapshot().loadedModelId === msg.modelId) {
          await engine.unloadModel("model_unloaded");
        }
        await downloader.removeModel(msg.modelId);
        replyOk({ removed: true });
        break;
      }

      case "run_chat": {
        const requestId: string = msg.requestId;
        const params: ChatCompletionCreateParams = msg.params;
        const ctrl = new AbortController();
        activeAbortControllers.set(requestId, ctrl);
        try {
          const completion = await engine.runChatCompletion(params, {
            requestId,
            maxTokensCap: msg.maxTokensCap,
            signal: ctrl.signal,
            onChunk: (chunk: ChatCompletionChunk) => {
              self.postMessage({ type: "chat_chunk", requestId, chunk });
            }
          });
          replyOk(completion);
        } finally {
          activeAbortControllers.delete(requestId);
        }
        break;
      }

      case "cancel_chat": {
        const ctrl = activeAbortControllers.get(msg.requestId);
        if (ctrl) ctrl.abort(msg.reason ?? "generation_cancelled");
        engine.cancelActive(msg.requestId, msg.reason ?? "generation_cancelled");
        replyOk({ cancelled: Boolean(ctrl) });
        break;
      }

      case "recover_runtime": {
        const result = await engine.handleRuntimeFailureAndRecover();
        replyOk(result);
        break;
      }

      case "reset_storage": {
        await engine.unloadModel("model_unloaded");
        await artifactStore.clearAll();
        await metadataStore.clear();
        replyOk({ reset: true });
        break;
      }

      default:
        throw new UOAIError("unsupported_operation", `Unknown worker action: ${String(msg.action)}`);
    }
  } catch (err) {
    replyErr(err);
  }
};

import { describe, expect, it } from "vitest";
import {
  BUNDLED_LICENSES,
  BUNDLED_MODEL_REGISTRY,
  ModelRegistrySchema,
  SMOKE_MODEL_CONFIG_JSON,
  SMOKE_MODEL_TOKENIZER_JSON,
  SMOKE_MODEL_WEIGHTS_TEXT,
  assessModelCompatibility,
  findModelInRegistry,
  verifySignedRegistryUpdate
} from "@uoai/model-registry";
import {
  MemoryArtifactStore,
  MemoryModelMetadataStore,
  ModelDownloader,
  StreamingSha256,
  sha256Hex
} from "@uoai/model-storage";
import type { CapabilityProfile } from "@uoai/shared-types";

const encoder = new TextEncoder();

function makeCapabilities(overrides?: Partial<CapabilityProfile>): CapabilityProfile {
  return {
    checkedAt: Date.now(),
    browserName: "Chrome",
    browserVersion: "134.0",
    isSupportedBrowser: true,
    deviceMemoryGb: 16,
    checks: [],
    webgpu: {
      status: "supported",
      features: ["shader-f16"],
      limits: {
        maxBufferSize: 2 * 1024 * 1024 * 1024,
        maxStorageBufferBindingSize: 1024 * 1024 * 1024
      },
      limitations: []
    },
    storage: {
      usageBytes: 0,
      quotaBytes: 20 * 1024 * 1024 * 1024,
      availableBytes: 20 * 1024 * 1024 * 1024,
      persisted: true
    },
    ...overrides
  };
}

describe("Model Registry, Compatibility, Signed Updates & Storage (TC-003..008, TC-012, TC-013)", () => {
  it("computes exact streaming SHA-256 matching single-shot digest", () => {
    const data = encoder.encode("Universal Offline AI streaming SHA-256 verification test payload!");
    const single = sha256Hex(data);
    const streamer = new StreamingSha256();
    for (let i = 0; i < data.length; i += 7) {
      streamer.update(data.subarray(i, i + 7));
    }
    expect(streamer.digestHex()).toBe(single);
  });

  it("verifies signed remote registry updates with WebCrypto ECDSA P-256 and rejects tampered JSON (OQ-08, FR-010)", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const pubJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const json = JSON.stringify(BUNDLED_MODEL_REGISTRY);
    const sigBuf = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      encoder.encode(json)
    );
    const sigB64 = Buffer.from(sigBuf).toString("base64");

    const ok = await verifySignedRegistryUpdate(json, sigB64, pubJwk);
    expect(ok.valid).toBe(true);

    const tampered = await verifySignedRegistryUpdate(json.replace("1.0.0", "9.9.9"), sigB64, pubJwk);
    expect(tampered.valid).toBe(false);
  });

  it("assesses WebGPU feature/buffer/storage compatibility accurately (FR-012, BR-13, TC-003, TC-019)", () => {
    const gemma = findModelInRegistry(BUNDLED_MODEL_REGISTRY, "gemma-4-e2b")!;
    const smol = findModelInRegistry(BUNDLED_MODEL_REGISTRY, "smollm2-360m-instruct")!;

    // Device lacking shader-f16 -> Gemma incompatible, SmolLM2 compatible
    const noF16 = makeCapabilities({
      webgpu: {
        status: "supported_with_limitations",
        features: [],
        limits: {
          maxBufferSize: 2 * 1024 * 1024 * 1024,
          maxStorageBufferBindingSize: 1024 * 1024 * 1024
        },
        limitations: ["No shader-f16"]
      }
    });
    const gemmaEval = assessModelCompatibility(gemma, noF16);
    expect(gemmaEval.classification).toBe("incompatible");
    expect(gemmaEval.canDownload).toBe(false);

    const smolEval = assessModelCompatibility(smol, noF16);
    expect(smolEval.canDownload).toBe(true);

    // Unsupported WebGPU -> all WebGPU models incompatible (TC-019, BR-13)
    const noGpu = makeCapabilities({
      webgpu: {
        status: "unsupported",
        reasonCode: "no_gpu_adapter",
        features: [],
        limits: { maxBufferSize: 0, maxStorageBufferBindingSize: 0 },
        limitations: ["No GPU"]
      }
    });
    expect(assessModelCompatibility(smol, noGpu).canDownload).toBe(false);
  });

  it("enforces mandatory license acceptance before download (FR-015, BR-19, TC-006)", async () => {
    const gemma = findModelInRegistry(BUNDLED_MODEL_REGISTRY, "gemma-4-e2b")!;
    const downloader = new ModelDownloader({
      artifactStore: new MemoryArtifactStore(),
      metadataStore: new MemoryModelMetadataStore(),
      isLicenseAccepted: async () => false
    });
    await expect(downloader.downloadAndInstall(gemma)).rejects.toThrow(/License/i);
  });

  it("blocks download upfront when storage quota is insufficient (FR-048, TC-004, TC-020)", async () => {
    const smoke = findModelInRegistry(BUNDLED_MODEL_REGISTRY, "uoai-local-smoke-v1")!;
    const downloader = new ModelDownloader({
      artifactStore: new MemoryArtifactStore(),
      metadataStore: new MemoryModelMetadataStore(),
      getAvailableStorageBytes: async () => 10
    });
    await expect(downloader.downloadAndInstall(smoke)).rejects.toMatchObject({
      code: "insufficient_storage"
    });
  });

  it("verifies streaming SHA-256, commits atomically, detects 1-byte corruption before/after install, and supports HTTP Range resume (TC-005, TC-007, TC-008, TC-012)", async () => {
    const fileBytes = encoder.encode("A".repeat(400) + "B".repeat(400));
    const expectedHash = sha256Hex(fileBytes);
    const manifest = {
      ...findModelInRegistry(BUNDLED_MODEL_REGISTRY, "uoai-local-smoke-v1")!,
      id: "test-range-model",
      artifacts: [
        {
          path: "weights.bin",
          url: "https://models.test/weights.bin",
          size_bytes: fileBytes.byteLength,
          sha256: expectedHash
        }
      ]
    };

    const store = new MemoryArtifactStore();
    const meta = new MemoryModelMetadataStore();

    // 1. Corrupt transfer (1 byte flipped) -> MUST fail SHA-256 verification & never become ready (TC-008)
    const corruptBytes = new Uint8Array(fileBytes);
    corruptBytes[123] = corruptBytes[123]! ^ 0x01;
    const corruptDownloader = new ModelDownloader({
      artifactStore: store,
      metadataStore: meta,
      fetchImpl: async () => new Response(corruptBytes as unknown as BodyInit, { status: 200 })
    });
    await expect(corruptDownloader.downloadAndInstall(manifest)).rejects.toMatchObject({
      code: "model_not_verified"
    });
    expect((await meta.get(manifest.id))?.status).toBe("failed_integrity");
    expect(await store.statFinal(manifest.id, "weights.bin")).toBeNull();

    // 2. Simulate partial staged download followed by HTTP Range 206 resume (TC-005, OQ-09)
    await store.writeStagingChunk(manifest.id, "weights.bin", 0, fileBytes.subarray(0, 400));
    let sawRangeHeader = "";
    const rangeDownloader = new ModelDownloader({
      artifactStore: store,
      metadataStore: meta,
      fetchImpl: async (_url, init) => {
        const hdrs = (init?.headers ?? {}) as Record<string, string>;
        sawRangeHeader = hdrs["Range"] ?? "";
        const start = sawRangeHeader.startsWith("bytes=")
          ? Number(sawRangeHeader.replace("bytes=", "").split("-")[0])
          : 0;
        const slice = fileBytes.subarray(start);
        return new Response(slice as unknown as BodyInit, {
          status: start > 0 ? 206 : 200,
          headers: { "accept-ranges": "bytes", etag: '"v1"' }
        });
      }
    });

    const installed = await rangeDownloader.downloadAndInstall(manifest);
    expect(sawRangeHeader).toBe("bytes=400-");
    expect(installed.status).toBe("ready");
    expect((await rangeDownloader.verifyInstalledModel(manifest.id, { fullHash: true })).valid).toBe(
      true
    );

    // 3. Post-install 1-byte tampering detected on fullHash verify (TC-008, OQ-17)
    store._corruptFinalArtifactForTest(manifest.id, "weights.bin", 50);
    const recheck = await rangeDownloader.verifyInstalledModel(manifest.id, { fullHash: true });
    expect(recheck.valid).toBe(false);

    // 4. Removal reclaims storage completely (TC-012)
    await rangeDownloader.removeModel(manifest.id);
    expect(await store.getUsedBytesByModel()).toEqual({});
    expect(await meta.get(manifest.id)).toBeNull();
  });

  it("validates every model in BUNDLED_MODEL_REGISTRY (schema, real SHA-256 hashes, exact sizes, offline licenses)", () => {
    const parsed = ModelRegistrySchema.parse(BUNDLED_MODEL_REGISTRY);
    expect(parsed.models.length).toBeGreaterThanOrEqual(13);

    const ids = new Set<string>();
    for (const model of parsed.models) {
      expect(ids.has(model.id)).toBe(false);
      ids.add(model.id);

      // Bundled offline license copy must exist (FR-015)
      expect(BUNDLED_LICENSES[model.license.bundled_license_path]).toBeTruthy();

      // Exact download size must equal artifact sum (FR-013)
      const artifactSum = model.artifacts.reduce((acc, a) => acc + a.size_bytes, 0);
      expect(model.hardware_requirements.estimated_download_size_bytes).toBe(artifactSum);

      // Every artifact must have a genuine non-placeholder 64-char SHA-256 (BR-08)
      for (const a of model.artifacts) {
        expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(a.sha256.startsWith("000000000000")).toBe(false);
      }
    }
  });

  it("matches bundled smoke model SHA-256 digests exactly", () => {
    const smoke = findModelInRegistry(BUNDLED_MODEL_REGISTRY, "uoai-local-smoke-v1")!;
    expect(smoke.artifacts[0]!.sha256).toBe(sha256Hex(SMOKE_MODEL_CONFIG_JSON));
    expect(smoke.artifacts[1]!.sha256).toBe(sha256Hex(SMOKE_MODEL_TOKENIZER_JSON));
    expect(smoke.artifacts[2]!.sha256).toBe(sha256Hex(SMOKE_MODEL_WEIGHTS_TEXT));
  });

  it("supports live Pause -> Resume and active Cancel during streaming downloads (FR-017, FR-108)", async () => {
    const payload = encoder.encode("X".repeat(2048));
    const manifest = {
      ...findModelInRegistry(BUNDLED_MODEL_REGISTRY, "uoai-local-smoke-v1")!,
      id: "test-pause-cancel",
      artifacts: [
        {
          path: "weights.bin",
          url: "https://models.test/slow.bin",
          size_bytes: payload.byteLength,
          sha256: sha256Hex(payload)
        }
      ]
    };

    const store = new MemoryArtifactStore();
    const meta = new MemoryModelMetadataStore();
    const statuses: string[] = [];

    const makeSlowStreamFetch = (): typeof fetch => async (_url, init) => {
      const hdrs = (init?.headers ?? {}) as Record<string, string>;
      const range = hdrs["Range"] ?? "";
      const start = range.startsWith("bytes=")
        ? Number(range.replace("bytes=", "").split("-")[0])
        : 0;
      const slice = payload.subarray(start);
      let pos = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(ctrl) {
          if (init?.signal?.aborted) {
            ctrl.error(new DOMException("Aborted", "AbortError"));
            return;
          }
          if (pos >= slice.byteLength) {
            ctrl.close();
            return;
          }
          await new Promise((r) => setTimeout(r, 10));
          const next = slice.subarray(pos, Math.min(pos + 256, slice.byteLength));
          pos += next.byteLength;
          ctrl.enqueue(next);
        }
      });
      return new Response(stream, {
        status: start > 0 ? 206 : 200,
        headers: { "accept-ranges": "bytes", etag: '"slow-v1"' }
      });
    };

    const downloader = new ModelDownloader({
      artifactStore: store,
      metadataStore: meta,
      fetchImpl: makeSlowStreamFetch(),
      chunkFlushBytes: 256,
      onProgress: (e) => statuses.push(e.status)
    });

    // 1. Start and Pause mid-stream
    const p1 = downloader.downloadAndInstall(manifest);
    await new Promise((r) => setTimeout(r, 35));
    expect(downloader.pause(manifest.id)).toBe(true);
    await expect(p1).rejects.toMatchObject({ code: "download_paused" });
    expect((await meta.get(manifest.id))?.status).toBe("paused");
    const stagedBytes = await store.getStagingSize(manifest.id, "weights.bin");
    expect(stagedBytes).toBeGreaterThan(0);
    expect(stagedBytes).toBeLessThan(payload.byteLength);

    // 2. Resume and Cancel mid-stream -> must clean staging & metadata completely
    const p2 = downloader.downloadAndInstall(manifest);
    await new Promise((r) => setTimeout(r, 25));
    await downloader.cancel(manifest.id);
    await expect(p2).rejects.toMatchObject({ code: "download_cancelled" });
    expect(await meta.get(manifest.id)).toBeNull();
    expect(await store.getStagingSize(manifest.id, "weights.bin")).toBe(0);
    expect(statuses).toContain("paused");
    expect(statuses).toContain("not_installed");
  });
});

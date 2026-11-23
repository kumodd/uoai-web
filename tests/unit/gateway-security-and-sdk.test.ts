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
import { LocalDeterministicAdapter } from "@uoai/model-adapters";
import { UOAI, UOAIError } from "@uoai/sdk";
import type { TransportLike } from "@uoai/browser-bridge";
import {
  UOAIProviderGateway,
  type GatewayStorageAdapter,
  type RuntimeExecutor,
  type VerifiedSenderContext
} from "../../apps/extension/src/core/providerGateway";
import {
  DEFAULT_EXTENSION_SETTINGS,
  type PermissionGrant,
  type UOAIExtensionSettings
} from "@uoai/shared-types";
import type { ClientEnvelope, ProviderEnvelope } from "@uoai/api-protocol";

const encoder = new TextEncoder();

async function createTestRig(opts?: { tokenDelayMs?: number }) {
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

  const engine = new InferenceEngine({
    artifactStore: store,
    verifier: downloader,
    webgpuDetector: {
      detect: async () => ({
        status: "supported",
        features: ["shader-f16"],
        limits: { maxBufferSize: 2_147_483_648, maxStorageBufferBindingSize: 1_073_741_824 },
        limitations: []
      })
    },
    adapterFactory: () => new LocalDeterministicAdapter({ tokenDelayMs: opts?.tokenDelayMs ?? 3 })
  });

  let savedSettings: UOAIExtensionSettings = { ...DEFAULT_EXTENSION_SETTINGS };
  let savedGrants: Record<string, PermissionGrant> = {};
  const browserPerms = new Set<string>();
  let runtimeWakeCount = 0;

  const storage: GatewayStorageAdapter = {
    getSettings: async () => ({ ...savedSettings }),
    saveSettings: async (s) => {
      savedSettings = { ...s };
    },
    getGrants: async () => structuredClone(savedGrants),
    saveGrants: async (g) => {
      savedGrants = structuredClone(g);
    },
    hasBrowserHostPermission: async (origin) => browserPerms.has(origin),
    removeBrowserHostPermission: async (origin) => {
      browserPerms.delete(origin);
    },
    unregisterOriginContentScript: async () => undefined
  };

  const executor: RuntimeExecutor = {
    getRuntimeSummary: () => {
      const s = engine.getSnapshot();
      return {
        state: s.state,
        loadedModel: s.loadedModelId,
        webgpuAvailable: s.webgpu ? s.webgpu.status !== "unsupported" : true,
        lastErrorCode: s.lastErrorCode
      };
    },
    listInstalledReadyModels: async () => [
      {
        id: smoke.id,
        object: "model",
        created: 1732406400,
        owned_by: "uoai",
        uoai: {
          version: smoke.version,
          quantization: smoke.quantization,
          max_context_length: smoke.context_length.max_supported,
          default_context_length: smoke.context_length.uoai_default,
          loaded: engine.getSnapshot().loadedModelId === smoke.id,
          license: smoke.license.id
        }
      }
    ],
    ensureModelLoadedForRequest: async (modelId, reqOpts) => {
      runtimeWakeCount++;
      if (modelId !== smoke.id) throw new UOAIError("model_not_found");
      if (engine.getSnapshot().loadedModelId === modelId) return;
      if (!reqOpts.isFirstParty && engine.getSnapshot().loadedModelId && !reqOpts.allowCrossModelSwitch) {
        throw new UOAIError("model_not_loaded");
      }
      await engine.loadModel(smoke);
    },
    executeChatCompletion: (params, reqOpts) => engine.runChatCompletion(params, reqOpts)
  };

  const gateway = new UOAIProviderGateway(storage, executor);
  await gateway.hydrate();

  const authorize = async (origin: string) => {
    browserPerms.add(origin);
    await gateway.commitOriginGrant(origin, true);
  };

  const makeTransportFactory = (sender: Omit<VerifiedSenderContext, "portId">) => {
    return (): TransportLike => {
      const portId = `port_${Math.random().toString(16).slice(2, 10)}`;
      const msgHandlers = new Set<(m: ProviderEnvelope) => void>();
      const discHandlers = new Set<() => void>();
      let disconnected = false;

      gateway.registerPort({
        sender: { ...sender, portId },
        send: (env) => {
          if (disconnected) return;
          for (const h of msgHandlers) h(env);
        },
        disconnect: () => {
          if (disconnected) return;
          disconnected = true;
          for (const h of discHandlers) h();
        }
      });

      return {
        send: (msg: ClientEnvelope) => {
          if (disconnected) return;
          void gateway.handlePortMessage(portId, msg);
        },
        onMessage: (h) => {
          msgHandlers.add(h);
          return () => msgHandlers.delete(h);
        },
        onDisconnect: (h) => {
          discHandlers.add(h);
          return () => discHandlers.delete(h);
        },
        close: () => {
          if (!disconnected) {
            disconnected = true;
            gateway.handlePortDisconnect(portId);
          }
        }
      };
    };
  };

  return {
    gateway,
    engine,
    smoke,
    authorize,
    makeTransportFactory,
    getRuntimeWakeCount: () => runtimeWakeCount
  };
}

describe("Provider Gateway Security, Permissions, Priority-FIFO Queue, Privacy & SDK (TC-021..030, TC-035, TC-040, TC-041)", () => {
  it("rejects unauthorized websites without waking the runtime (TC-027, FR-111)", async () => {
    const rig = await createTestRig();
    const transportFactory = rig.makeTransportFactory({
      origin: "https://evil.example.com",
      frameId: 0,
      isExtensionPage: false,
      isTrustedPwa: false,
      senderExtensionIdMatches: true
    });

    await expect(UOAI.connect({ transportFactory })).rejects.toMatchObject({
      code: "permission_required"
    });
    expect(rig.getRuntimeWakeCount()).toBe(0);
  });

  it("rejects embedded iframes and scheme/port mismatches (TC-028, BR-04, BR-25, OQ-15)", async () => {
    const rig = await createTestRig();
    await rig.authorize("https://app.example.com");

    // Iframe (frameId !== 0) rejected even on authorized origin
    const iframeFactory = rig.makeTransportFactory({
      origin: "https://app.example.com",
      frameId: 42,
      isExtensionPage: false,
      isTrustedPwa: false,
      senderExtensionIdMatches: true
    });
    await expect(UOAI.connect({ transportFactory: iframeFactory })).rejects.toMatchObject({
      code: "origin_not_allowed"
    });

    // Different port rejected (BR-04)
    const diffPortFactory = rig.makeTransportFactory({
      origin: "https://app.example.com:8443",
      frameId: 0,
      isExtensionPage: false,
      isTrustedPwa: false,
      senderExtensionIdMatches: true
    });
    await expect(UOAI.connect({ transportFactory: diffPortFactory })).rejects.toMatchObject({
      code: "permission_required"
    });
  });

  it("completes SDK connect, models.list, non-streaming, streaming, and break-cancellation (TC-021..023, TC-040)", async () => {
    const rig = await createTestRig({ tokenDelayMs: 10 });
    await rig.authorize("https://notes.example.com");
    const factory = rig.makeTransportFactory({
      origin: "https://notes.example.com",
      frameId: 0,
      isExtensionPage: false,
      isTrustedPwa: false,
      senderExtensionIdMatches: true
    });

    const ai = await UOAI.connect({ transportFactory: factory });
    const health = await ai.health.check();
    expect(health.status).toBe("ok");

    const models = await ai.models.list();
    expect(models.data[0]?.id).toBe("uoai-local-smoke-v1");

    // Auto-loads installed model when idle (OQ-13 = Option A)
    const comp = await ai.chat.completions.create({
      model: "uoai-local-smoke-v1",
      messages: [{ role: "user", content: "Explain how WebGPU works." }]
    });
    expect(comp.choices[0]!.message.content).toContain("WebGPU");

    // Streaming + early `break` cancellation (TC-023, TC-040)
    const stream = await ai.chat.completions.create({
      model: "uoai-local-smoke-v1",
      messages: [{ role: "user", content: "Write a long story about offline AI." }],
      stream: true
    });
    let received = 0;
    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) received++;
      if (received >= 3) break;
    }
    expect(received).toBe(3);
    ai.close();
  });

  it("enforces immediate revocation, aborting in-flight streams and rejecting 100% of subsequent calls (TC-030, BR-06)", async () => {
    const rig = await createTestRig({ tokenDelayMs: 25 });
    await rig.authorize("https://revoke-me.example.com");
    const factory = rig.makeTransportFactory({
      origin: "https://revoke-me.example.com",
      frameId: 0,
      isExtensionPage: false,
      isTrustedPwa: false,
      senderExtensionIdMatches: true
    });

    const ai = await UOAI.connect({ transportFactory: factory });
    let revokedEventFired = false;
    ai.on("permission_revoked", () => {
      revokedEventFired = true;
    });

    const stream = await ai.chat.completions.create({
      model: "uoai-local-smoke-v1",
      messages: [{ role: "user", content: "Write a long story about privacy." }],
      stream: true
    });

    let caughtCode = "";
    try {
      let n = 0;
      for await (const _chunk of stream) {
        n++;
        if (n === 2) {
          await rig.gateway.revokeOrigin("https://revoke-me.example.com");
        }
      }
    } catch (err) {
      caughtCode = err instanceof UOAIError ? err.code : "";
    }

    expect(caughtCode).toBe("permission_revoked");
    expect(revokedEventFired).toBe(true);

    // 100% of post-revocation attempts rejected
    await expect(UOAI.connect({ transportFactory: factory })).rejects.toMatchObject({
      code: "permission_required"
    });
  });

  it("enforces Priority-FIFO queue favoring first-party Workspace over third-party sites and bounded limits (TC-024, TC-025, OQ-10=B)", async () => {
    const rig = await createTestRig({ tokenDelayMs: 15 });
    await rig.authorize("https://site-a.example.com");
    await rig.authorize("https://site-b.example.com");

    const siteA = await UOAI.connect({
      transportFactory: rig.makeTransportFactory({
        origin: "https://site-a.example.com",
        frameId: 0,
        isExtensionPage: false,
        isTrustedPwa: false,
        senderExtensionIdMatches: true
      })
    });
    const workspace = await UOAI.connect({
      transportFactory: rig.makeTransportFactory({
        origin: "chrome-extension://self",
        frameId: 0,
        isExtensionPage: true,
        isTrustedPwa: false,
        senderExtensionIdMatches: true
      })
    });

    const order: string[] = [];
    // Request 1 occupies active slot
    const p1 = siteA.chat.completions
      .create({ model: "uoai-local-smoke-v1", messages: [{ role: "user", content: "long story 1" }], max_tokens: 15 })
      .then(() => order.push("siteA-active"));
    // Request 2 & 3 fill siteA's 2 pending slots
    const p2 = siteA.chat.completions
      .create({ model: "uoai-local-smoke-v1", messages: [{ role: "user", content: "short 2" }], max_tokens: 5 })
      .then(() => order.push("siteA-pending-1"));
    const p3 = siteA.chat.completions
      .create({ model: "uoai-local-smoke-v1", messages: [{ role: "user", content: "short 3" }], max_tokens: 5 })
      .then(() => order.push("siteA-pending-2"));

    // 3rd pending from same origin rejected with queue_full (BR-10, TC-025)
    await expect(
      siteA.chat.completions.create({
        model: "uoai-local-smoke-v1",
        messages: [{ role: "user", content: "overflow" }],
        max_tokens: 5
      })
    ).rejects.toMatchObject({ code: "queue_full" });

    // Workspace request enqueued AFTER siteA-pending-1 & 2 jumps ahead of them (OQ-10 = Option B)
    const pWs = workspace.chat.completions
      .create({ model: "uoai-local-smoke-v1", messages: [{ role: "user", content: "workspace urgent" }], max_tokens: 5 })
      .then(() => order.push("workspace-priority"));

    await Promise.all([p1, p2, p3, pWs]);
    expect(order[0]).toBe("siteA-active");
    expect(order[1]).toBe("workspace-priority");
    siteA.close();
    workspace.close();
  });

  it("enforces 30 req/min per-origin rate limit (TC-026, BR-15)", async () => {
    const rig = await createTestRig({ tokenDelayMs: 0 });
    await rig.authorize("https://burst.example.com");
    const ai = await UOAI.connect({
      transportFactory: rig.makeTransportFactory({
        origin: "https://burst.example.com",
        frameId: 0,
        isExtensionPage: false,
        isTrustedPwa: false,
        senderExtensionIdMatches: true
      })
    });

    for (let i = 0; i < 30; i++) {
      await ai.health.check();
    }
    await expect(ai.health.check()).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true
    });
    ai.close();
  });

  it("passes canary-string privacy audit: zero prompt/response content in diagnostics (TC-035, BR-05, FR-114)", async () => {
    const rig = await createTestRig({ tokenDelayMs: 0 });
    await rig.authorize("https://privacy.example.com");
    const ai = await UOAI.connect({
      transportFactory: rig.makeTransportFactory({
        origin: "https://privacy.example.com",
        frameId: 0,
        isExtensionPage: false,
        isTrustedPwa: false,
        senderExtensionIdMatches: true
      })
    });

    const canary = "CANARY_SECRET_UUID_9f8a7b6c5d4e";
    await ai.chat.completions.create({
      model: "uoai-local-smoke-v1",
      messages: [{ role: "user", content: `Private clinical note ${canary}` }]
    });

    const diagJson = JSON.stringify(rig.gateway.getDiagnostics());
    expect(diagJson).not.toContain(canary);
    ai.close();
  });
});

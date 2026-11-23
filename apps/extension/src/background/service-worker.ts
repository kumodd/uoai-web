/**
 * UOAI Manifest V3 Service Worker Coordinator (PC-06, ADR-002, ADR-004, ADR-005).
 * NEVER runs model inference. Handles:
 *  - Origin & two-layer permission verification (chrome.storage.local + chrome.permissions)
 *  - Dynamic Content-Script Bridge registration/unregistration
 *  - Priority-FIFO bounded queue & rate limiting via UOAIProviderGateway
 *  - Forwarding inference calls to the visible Runtime Host (app.html / sidePanel) + Dedicated Worker
 */
import {
  DEFAULT_EXTENSION_SETTINGS,
  UOAI_BRIDGE_CHANNEL,
  UOAI_DASHBOARD_PORT_NAME,
  UOAI_PORT_NAME,
  UOAI_PROVIDER_VERSION,
  UOAI_RUNTIME_HOST_PORT_NAME,
  type CapabilityProfile,
  type LicenseAcceptanceRecord,
  type NetworkActivityEntry,
  type OfflineReadinessReport,
  type PermissionGrant,
  type RuntimeState,
  type UOAIExtensionSettings
} from "@uoai/shared-types";
import {
  UOAIError,
  generateRequestId,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionCreateParams,
  type ModelInfo
} from "@uoai/api-protocol";
import { BUNDLED_MODEL_REGISTRY, findModelInRegistry } from "@uoai/model-registry";
import {
  UOAIProviderGateway,
  type GatewayStorageAdapter,
  type RuntimeExecutor,
  type VerifiedSenderContext
} from "../core/providerGateway.js";

const STORAGE_KEYS = {
  SETTINGS: "uoai_settings_v1",
  GRANTS: "uoai_grants_v1",
  CAPABILITIES: "uoai_capabilities_v1",
  LICENSES: "uoai_licenses_v1",
  NETWORK_LOG: "uoai_network_log_v1"
} as const;

let runtimeHostPort: chrome.runtime.Port | null = null;
const dashboardPorts = new Set<chrome.runtime.Port>();
const workerRpcPending = new Map<
  string,
  { resolve: (data: unknown) => void; reject: (err: UOAIError) => void }
>();
const activeWorkerStreams = new Map<string, (chunk: ChatCompletionChunk) => void>();

let latestCapabilities: CapabilityProfile | null = null;
let latestRuntimeSnapshot: {
  state: RuntimeState;
  loadedModelId: string | null;
  webgpuAvailable: boolean;
  lastErrorCode: string | null;
  loadStage?: string;
  loadProgress?: number;
  consecutiveCrashes: number;
} = {
  state: "not_started",
  loadedModelId: null,
  webgpuAvailable: false,
  lastErrorCode: null,
  consecutiveCrashes: 0
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modelStates: Record<string, any> = {};
let usedBytesByModel: Record<string, number> = {};
let licenseAcceptances: LicenseAcceptanceRecord[] = [];
let networkActivity: NetworkActivityEntry[] = [];

function contentScriptIdForOrigin(origin: string): string {
  return `uoai-bridge-${origin.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

async function registerOriginBridge(origin: string): Promise<void> {
  const id = contentScriptIdForOrigin(origin);
  const pattern = `${origin}/*`;
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    // Not registered yet
  }
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [pattern],
      js: ["content-bridge.js"],
      runAt: "document_start",
      allFrames: false // Top-level frames only (OQ-15 = Option A)
    }
  ]);

  // Inject into already-open tabs matching this origin so user doesn't need to reload (UC-06)
  const tabs = await chrome.tabs.query({ url: pattern }).catch(() => []);
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await chrome.scripting
        .executeScript({
          target: { tabId: tab.id, allFrames: false },
          files: ["content-bridge.js"]
        })
        .catch(() => undefined);
    }
  }
}

async function unregisterOriginBridge(origin: string): Promise<void> {
  const id = contentScriptIdForOrigin(origin);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    // Already unregistered
  }
}

async function ensureRuntimeHostConnected(): Promise<chrome.runtime.Port> {
  if (runtimeHostPort) return runtimeHostPort;

  // Per OQ-02 = Option B (ADR-002): ensure visible extension page/tab is open to host the dedicated Worker
  const appUrl = chrome.runtime.getURL("app.html");
  const existingTabs = await chrome.tabs.query({ url: `${appUrl}*` }).catch(() => []);
  if (existingTabs.length === 0) {
    await chrome.tabs.create({ url: appUrl, active: false });
  }

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (runtimeHostPort) {
        resolve(runtimeHostPort);
        return;
      }
      if (Date.now() - start > 8000) {
        reject(new UOAIError("runtime_unavailable", "Timed out waiting for Runtime Host tab."));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

async function callWorker<T = unknown>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const port = await ensureRuntimeHostConnected();
  const callId = generateRequestId("wk");
  return new Promise<T>((resolve, reject) => {
    workerRpcPending.set(callId, {
      resolve: (data) => resolve(data as T),
      reject
    });
    port.postMessage({ callId, action, ...(payload ?? {}) });
  });
}

const storageAdapter: GatewayStorageAdapter = {
  async getSettings(): Promise<UOAIExtensionSettings> {
    const res = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_EXTENSION_SETTINGS, ...(res[STORAGE_KEYS.SETTINGS] ?? {}) };
  },
  async saveSettings(settings: UOAIExtensionSettings): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  },
  async getGrants(): Promise<Record<string, PermissionGrant>> {
    const res = await chrome.storage.local.get(STORAGE_KEYS.GRANTS);
    return (res[STORAGE_KEYS.GRANTS] as Record<string, PermissionGrant>) ?? {};
  },
  async saveGrants(grants: Record<string, PermissionGrant>): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.GRANTS]: grants });
  },
  async hasBrowserHostPermission(origin: string): Promise<boolean> {
    return chrome.permissions.contains({ origins: [`${origin}/*`] });
  },
  async removeBrowserHostPermission(origin: string): Promise<void> {
    await chrome.permissions.remove({ origins: [`${origin}/*`] });
  },
  async unregisterOriginContentScript(origin: string): Promise<void> {
    await unregisterOriginBridge(origin);
  }
};

const runtimeExecutor: RuntimeExecutor = {
  getRuntimeSummary() {
    return {
      state: latestRuntimeSnapshot.state,
      loadedModel: latestRuntimeSnapshot.loadedModelId,
      webgpuAvailable: latestRuntimeSnapshot.webgpuAvailable,
      lastErrorCode: latestRuntimeSnapshot.lastErrorCode
    };
  },

  async listInstalledReadyModels(): Promise<ModelInfo[]> {
    if (runtimeHostPort) {
      await syncStorageStateFromWorker().catch(() => undefined);
    }
    const list: ModelInfo[] = [];
    for (const manifest of BUNDLED_MODEL_REGISTRY.models) {
      const st = modelStates[manifest.id];
      if (st && (st.status === "ready" || st.status === "loaded")) {
        list.push({
          id: manifest.id,
          object: "model",
          created: Math.floor((st.installedAt || Date.now()) / 1000),
          owned_by: manifest.publisher.toLowerCase(),
          uoai: {
            version: manifest.version,
            quantization: manifest.quantization,
            max_context_length: manifest.context_length.max_supported,
            default_context_length: manifest.context_length.uoai_default,
            loaded: latestRuntimeSnapshot.loadedModelId === manifest.id,
            license: manifest.license.id
          }
        });
      }
    }
    return list;
  },

  async ensureModelLoadedForRequest(modelId, opts) {
    const manifest = findModelInRegistry(BUNDLED_MODEL_REGISTRY, modelId);
    if (!manifest) throw new UOAIError("model_not_found");
    await syncStorageStateFromWorker().catch(() => undefined);
    const st = modelStates[manifest.id];
    if (!st || (st.status !== "ready" && st.status !== "loaded")) {
      throw new UOAIError("model_not_found");
    }

    if (latestRuntimeSnapshot.loadedModelId === manifest.id) {
      return;
    }

    // OQ-13 = Option A: Auto-load when runtime is idle; reject cross-model switch for 3rd-party unless enabled
    if (
      !opts.isFirstParty &&
      latestRuntimeSnapshot.loadedModelId !== null &&
      !opts.allowCrossModelSwitch
    ) {
      throw new UOAIError(
        "model_not_loaded",
        `Model '${latestRuntimeSnapshot.loadedModelId}' is currently loaded and website model switching is disabled.`
      );
    }

    await callWorker("load_model", { modelId: manifest.id });
  },

  async executeChatCompletion(params, opts): Promise<ChatCompletion> {
    activeWorkerStreams.set(opts.requestId, opts.onChunk);
    const onAbort = () => {
      if (runtimeHostPort) {
        runtimeHostPort.postMessage({
          callId: generateRequestId("cn"),
          action: "cancel_chat",
          requestId: opts.requestId,
          reason: String(opts.signal.reason ?? "generation_cancelled")
        });
      }
    };
    opts.signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await callWorker<ChatCompletion>("run_chat", {
        requestId: opts.requestId,
        params,
        maxTokensCap: opts.maxTokensCap
      });
    } finally {
      opts.signal.removeEventListener("abort", onAbort);
      activeWorkerStreams.delete(opts.requestId);
    }
  }
};

const gateway = new UOAIProviderGateway(storageAdapter, runtimeExecutor, () => {
  void broadcastSnapshot();
});

async function syncStorageStateFromWorker(): Promise<void> {
  if (!runtimeHostPort) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await callWorker<any>("get_storage_state");
  const seen = new Set<string>();
  for (const rec of res.records ?? []) {
    seen.add(rec.modelId);
    const live = modelStates[rec.modelId];
    // Preserve live in-flight progress metrics (percent, bytesPerSecond, etaSeconds, currentFile)
    if (
      live &&
      (live.status === "downloading" || live.status === "verifying" || live.status === "paused") &&
      (rec.status === "downloading" || rec.status === "paused")
    ) {
      modelStates[rec.modelId] = { ...rec, ...live };
    } else {
      modelStates[rec.modelId] = rec;
    }
  }
  for (const k of Object.keys(modelStates)) {
    if (!seen.has(k) && modelStates[k]?.status !== "downloading") {
      delete modelStates[k];
    }
  }
  usedBytesByModel = res.usedBytesByModel ?? {};
  if (res.runtime) {
    latestRuntimeSnapshot = {
      state: res.runtime.state,
      loadedModelId: res.runtime.loadedModelId,
      webgpuAvailable: res.runtime.webgpu ? res.runtime.webgpu.status !== "unsupported" : false,
      lastErrorCode: res.runtime.lastErrorCode,
      loadStage: res.runtime.loadStage,
      loadProgress: res.runtime.loadProgress,
      consecutiveCrashes: res.runtime.consecutiveCrashes ?? 0
    };
  }
}

function buildOfflineReadiness(): OfflineReadinessReport {
  const hasReadyModel = Object.values(modelStates).some(
    (m) => m.status === "ready" || m.status === "loaded"
  );
  const hasMissingFiles = Object.values(modelStates).some((m) => m.status === "missing_files");
  const checks: OfflineReadinessReport["checks"] = [
    {
      id: "app_shell",
      label: "Packaged Application Shell",
      passed: true,
      detail: "Dashboard HTML/JS/CSS bundled inside extension package."
    },
    {
      id: "runtime_wasm",
      label: "Local Inference Runtime & Worker",
      passed: true,
      detail: "Bundled locally with zero external CDN scripts."
    },
    {
      id: "registry_copy",
      label: "Verified Model Registry Copy",
      passed: true,
      detail: `Registry ${BUNDLED_MODEL_REGISTRY.registry_version} available offline.`
    },
    {
      id: "verified_model",
      label: "SHA-256 Verified Local Model",
      passed: hasReadyModel,
      detail: hasReadyModel
        ? "At least one verified model is stored locally."
        : "Download and verify at least one model to use offline."
    },
    {
      id: "persistent_storage",
      label: "Persistent Storage Requested",
      passed: latestCapabilities?.storage.persisted === true || hasReadyModel,
      detail:
        latestCapabilities?.storage.persisted === true
          ? "Browser granted persistent storage."
          : "Extension holds unlimitedStorage; persistence requested on download."
    }
  ];
  const missingItems = checks.filter((c) => !c.passed).map((c) => c.label);
  const status =
    hasReadyModel && !hasMissingFiles
      ? "offline_ready"
      : hasReadyModel
        ? "partially_ready"
        : "not_ready";

  return {
    status,
    checkedAt: Date.now(),
    checks,
    missingItems
  };
}

async function buildDashboardSnapshot() {
  await gateway.hydrate();
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.CAPABILITIES,
    STORAGE_KEYS.LICENSES,
    STORAGE_KEYS.NETWORK_LOG
  ]);
  if (!latestCapabilities && stored[STORAGE_KEYS.CAPABILITIES]) {
    latestCapabilities = stored[STORAGE_KEYS.CAPABILITIES] as CapabilityProfile;
  }
  licenseAcceptances = (stored[STORAGE_KEYS.LICENSES] as LicenseAcceptanceRecord[]) ?? [];
  networkActivity = (stored[STORAGE_KEYS.NETWORK_LOG] as NetworkActivityEntry[]) ?? [];

  if (!runtimeHostPort) {
    // Wait briefly if a newly opened Dashboard tab is in the middle of booting runtime-host.js
    const waitStart = Date.now();
    while (!runtimeHostPort && Date.now() - waitStart < 600) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  if (runtimeHostPort) {
    await syncStorageStateFromWorker().catch(() => undefined);
  }

  const queue = gateway.getQueueSummaries();
  return {
    extensionDetected: true,
    providerVersion: UOAI_PROVIDER_VERSION,
    settings: gateway.getSettings(),
    capabilities: latestCapabilities,
    registry: BUNDLED_MODEL_REGISTRY,
    modelStates,
    usedBytesByModel,
    licenseAcceptances,
    runtime: {
      state: latestRuntimeSnapshot.state,
      loadedModel: latestRuntimeSnapshot.loadedModelId,
      webgpuAvailable: latestRuntimeSnapshot.webgpuAvailable,
      queueLength: queue.pendingQueue.length,
      activeRequest: queue.activeRequest,
      pendingQueue: queue.pendingQueue,
      lastErrorCode: latestRuntimeSnapshot.lastErrorCode,
      loadStage: latestRuntimeSnapshot.loadStage,
      loadProgress: latestRuntimeSnapshot.loadProgress,
      consecutiveCrashes: latestRuntimeSnapshot.consecutiveCrashes
    },
    grants: gateway.getGrantsList(),
    offlineReadiness: buildOfflineReadiness(),
    diagnostics: gateway.getDiagnostics(),
    networkActivity
  };
}

async function broadcastSnapshot(): Promise<void> {
  if (dashboardPorts.size === 0) return;
  const snap = await buildDashboardSnapshot();
  for (const p of dashboardPorts) {
    try {
      p.postMessage({ type: "snapshot_update", data: snap });
    } catch {
      dashboardPorts.delete(p);
    }
  }
}

// ============================================================================
// Extension Lifecycle Hooks
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  await gateway.hydrate();
  if (details.reason === "install") {
    // FR-001: Open onboarding welcome screen on fresh install
    await chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  }
});

// Detect browser-level permission removal and revoke UOAI grant immediately (FR-064)
chrome.permissions.onRemoved.addListener(async (removed) => {
  for (const pattern of removed.origins ?? []) {
    const origin = pattern.replace(/\/\*$/, "");
    await gateway.revokeOrigin(origin);
  }
});

// ============================================================================
// Port Connections: Runtime Host, Dashboard, Authorized Third-Party Bridges, Trusted PWA
// ============================================================================

function handleClientPortConnection(port: chrome.runtime.Port, isExternal: boolean): void {
  const portId = generateRequestId("port");
  const sender = port.sender;
  const senderUrl = sender?.url ?? "";
  let origin = "";
  try {
    origin = sender?.origin ?? (senderUrl ? new URL(senderUrl).origin : "");
  } catch {
    origin = "";
  }

  const isExtensionPage = !isExternal && origin === `chrome-extension://${chrome.runtime.id}`;
  const isTrustedPwa = isExternal && origin === gateway.getSettings().trustedPwaOrigin;
  const verifiedSender: VerifiedSenderContext = {
    portId,
    origin,
    frameId: sender?.frameId ?? 0,
    isExtensionPage,
    isTrustedPwa,
    senderExtensionIdMatches: isExternal ? isTrustedPwa : sender?.id === chrome.runtime.id
  };

  gateway.registerPort({
    sender: verifiedSender,
    send: (envelope) => port.postMessage(envelope),
    disconnect: () => port.disconnect()
  });

  port.onMessage.addListener((msg) => {
    void gateway.handlePortMessage(portId, msg);
  });

  port.onDisconnect.addListener(() => {
    gateway.handlePortDisconnect(portId);
  });
}

chrome.runtime.onConnect.addListener((port) => {
  // 1. Visible Extension Runtime Host (Dedicated Worker bridge)
  if (port.name === UOAI_RUNTIME_HOST_PORT_NAME && port.sender?.id === chrome.runtime.id) {
    runtimeHostPort = port;
    port.onMessage.addListener((msg) => {
      if (msg.type === "rpc_result" && workerRpcPending.has(msg.callId)) {
        const p = workerRpcPending.get(msg.callId)!;
        workerRpcPending.delete(msg.callId);
        p.resolve(msg.data);
        return;
      }
      if (msg.type === "rpc_error" && workerRpcPending.has(msg.callId)) {
        const p = workerRpcPending.get(msg.callId)!;
        workerRpcPending.delete(msg.callId);
        p.reject(UOAIError.fromPayload({ error: msg.error }));
        return;
      }
      if (msg.type === "chat_chunk") {
        activeWorkerStreams.get(msg.requestId)?.(msg.chunk);
        return;
      }
      if (msg.type === "download_progress") {
        const evt = msg.event;
        if (evt.status === "not_installed") {
          delete modelStates[evt.modelId];
        } else {
          modelStates[evt.modelId] = {
            ...(modelStates[evt.modelId] ?? {}),
            ...evt
          };
        }
        // Fast lightweight push without triggering a worker RPC round-trip per tick
        for (const p of dashboardPorts) {
          try {
            p.postMessage({ type: "download_progress", data: evt });
          } catch {
            dashboardPorts.delete(p);
          }
        }
        // Only run full snapshot sync on terminal/transition states
        if (evt.status !== "downloading") {
          void broadcastSnapshot();
        }
        return;
      }
      if (msg.type === "runtime_state") {
        const snap = msg.snapshot;
        latestRuntimeSnapshot = {
          state: snap.state,
          loadedModelId: snap.loadedModelId,
          webgpuAvailable: snap.webgpu ? snap.webgpu.status !== "unsupported" : false,
          lastErrorCode: snap.lastErrorCode,
          loadStage: snap.loadStage,
          loadProgress: snap.loadProgress,
          consecutiveCrashes: snap.consecutiveCrashes ?? 0
        };
        void broadcastSnapshot();
        return;
      }
      if (msg.type === "worker_crashed") {
        gateway.recordDiagnostic("error", "inference_worker_crashed", { code: "runtime_restarted" });
        for (const [id, pending] of workerRpcPending.entries()) {
          workerRpcPending.delete(id);
          pending.reject(new UOAIError("runtime_restarted"));
        }
        void broadcastSnapshot();
      }
    });

    port.onDisconnect.addListener(() => {
      if (runtimeHostPort === port) {
        runtimeHostPort = null;
        latestRuntimeSnapshot.state = "not_started";
        latestRuntimeSnapshot.loadedModelId = null;
        for (const [id, pending] of workerRpcPending.entries()) {
          workerRpcPending.delete(id);
          pending.reject(new UOAIError("runtime_restarted"));
        }
        void broadcastSnapshot();
      }
    });

    void syncStorageStateFromWorker().then(() => broadcastSnapshot());
    return;
  }

  // 2. Dashboard Push + Workspace Chat Port
  if (port.name === UOAI_DASHBOARD_PORT_NAME && port.sender?.id === chrome.runtime.id) {
    dashboardPorts.add(port);
    const dashPortId = generateRequestId("dash");
    gateway.registerPort({
      sender: {
        portId: dashPortId,
        origin: `chrome-extension://${chrome.runtime.id}`,
        frameId: 0,
        isExtensionPage: true,
        isTrustedPwa: false,
        senderExtensionIdMatches: true
      },
      send: (env) => {
        if (env.type === "stream_chunk") {
          const delta = env.chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            workspaceAccumulators.set(
              env.clientRequestId,
              (workspaceAccumulators.get(env.clientRequestId) ?? "") + delta
            );
          }
          if (env.chunk.usage) {
            workspaceLastUsage.set(env.clientRequestId, env.chunk.usage);
          }
          port.postMessage({
            type: "stream_chunk",
            requestId: env.clientRequestId,
            chunk: env.chunk
          });
        } else if (env.type === "stream_done") {
          const text = workspaceAccumulators.get(env.clientRequestId) ?? "";
          workspaceAccumulators.delete(env.clientRequestId);
          port.postMessage({
            type: "chat_complete",
            requestId: env.clientRequestId,
            completion: {
              id: env.providerRequestId,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: latestRuntimeSnapshot.loadedModelId ?? "",
              choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
              usage: workspaceLastUsage.get(env.clientRequestId) ?? {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
              }
            }
          });
          workspaceLastUsage.delete(env.clientRequestId);
        } else if (env.type === "api_response") {
          port.postMessage({
            type: "chat_complete",
            requestId: env.clientRequestId,
            completion: env.data
          });
        } else if (env.type === "api_error") {
          workspaceAccumulators.delete(env.clientRequestId);
          workspaceLastUsage.delete(env.clientRequestId);
          port.postMessage({
            type: "chat_error",
            requestId: env.clientRequestId,
            error: env.error
          });
        }
      },
      disconnect: () => port.disconnect()
    });

    port.onMessage.addListener((msg) => {
      if (msg.action === "workspace_chat") {
        workspaceAccumulators.set(msg.requestId, "");
        void gateway.handlePortMessage(dashPortId, {
          channel: UOAI_BRIDGE_CHANNEL,
          type: "api_request",
          clientRequestId: msg.requestId,
          operation: "POST /v1/chat/completions",
          payload: msg.params
        });
      } else if (msg.action === "cancel_request") {
        void gateway.handlePortMessage(dashPortId, {
          channel: UOAI_BRIDGE_CHANNEL,
          type: "cancel",
          clientRequestId: msg.requestId
        });
      }
    });

    port.onDisconnect.addListener(() => {
      dashboardPorts.delete(port);
      gateway.handlePortDisconnect(dashPortId);
    });
    return;
  }

  // 3. Content-Script Bridge SDK Port
  if (port.name === UOAI_PORT_NAME) {
    handleClientPortConnection(port, false);
  }
});

const workspaceAccumulators = new Map<string, string>();
const workspaceLastUsage = new Map<
  string,
  { prompt_tokens: number; completion_tokens: number; total_tokens: number }
>();

// Intercept stream chunks to track accumulated text for Workspace completion response
const origSend = gateway.registerPort.bind(gateway);
void origSend;

// Trusted First-Party PWA externally_connectable Port (BR-18, ADR-004)
chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name === UOAI_PORT_NAME) {
    handleClientPortConnection(port, true);
  }
});

// ============================================================================
// Admin RPC Messages (from Dashboard / Popup / Authorize Page)
// ============================================================================

async function handleAdminAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msg: any,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const isInternal = sender.id === chrome.runtime.id;
  const isTrustedPwa = sender.origin === gateway.getSettings().trustedPwaOrigin;
  if (!isInternal && !isTrustedPwa) {
    throw new UOAIError("origin_not_allowed");
  }

  await gateway.hydrate();

  switch (msg.action) {
    case "get_snapshot":
      return buildDashboardSnapshot();

    case "run_capability_check": {
      const profile = await callWorker<CapabilityProfile>("detect_capabilities");
      latestCapabilities = profile;
      latestRuntimeSnapshot.webgpuAvailable = profile.webgpu.status !== "unsupported";
      await chrome.storage.local.set({ [STORAGE_KEYS.CAPABILITIES]: profile });
      gateway.recordDiagnostic("runtime", "capability_check_completed");
      await broadcastSnapshot();
      return buildDashboardSnapshot();
    }

    case "accept_license": {
      const record: LicenseAcceptanceRecord = {
        modelId: msg.modelId,
        licenseId: msg.licenseId,
        licenseVersion: msg.licenseVersion,
        acceptedAt: Date.now()
      };
      licenseAcceptances = [
        ...licenseAcceptances.filter((r) => r.modelId !== msg.modelId),
        record
      ];
      await chrome.storage.local.set({ [STORAGE_KEYS.LICENSES]: licenseAcceptances });
      await broadcastSnapshot();
      return buildDashboardSnapshot();
    }

    case "download_model": {
      const manifest = findModelInRegistry(BUNDLED_MODEL_REGISTRY, msg.modelId);
      if (!manifest) throw new UOAIError("model_not_found");
      const netEntry: NetworkActivityEntry = {
        id: generateRequestId("net"),
        timestamp: Date.now(),
        purpose: "model_download",
        host: new URL(manifest.artifacts[0]!.url).host,
        bytesTransferred: manifest.hardware_requirements.estimated_download_size_bytes,
        status: "in_progress"
      };
      networkActivity = [...networkActivity.slice(-99), netEntry];
      await chrome.storage.local.set({ [STORAGE_KEYS.NETWORK_LOG]: networkActivity });

      // Mark downloading immediately and return so onMessage channel never blocks or times out
      modelStates[manifest.id] = {
        ...(modelStates[manifest.id] ?? {}),
        modelId: manifest.id,
        version: manifest.version,
        status: "downloading",
        totalBytes: manifest.artifacts.reduce((acc, a) => acc + a.size_bytes, 0),
        downloadedBytes: modelStates[manifest.id]?.downloadedBytes ?? 0,
        percent: modelStates[manifest.id]?.percent ?? 0,
        currentFile: manifest.artifacts[0]?.path ?? null,
        errorMessage: undefined
      };

      void (async () => {
        try {
          await callWorker("download_model", { modelId: manifest.id });
          netEntry.status = "completed";
        } catch (err) {
          const msgText = err instanceof Error ? err.message : String(err);
          if (/paused/i.test(msgText)) {
            netEntry.status = "paused";
          } else if (/cancelled/i.test(msgText)) {
            netEntry.status = "failed";
            delete modelStates[manifest.id];
          } else {
            netEntry.status = "failed";
            modelStates[manifest.id] = {
              ...(modelStates[manifest.id] ?? { modelId: manifest.id, version: manifest.version }),
              status: "failed_download",
              errorMessage: msgText
            };
          }
        } finally {
          await chrome.storage.local.set({ [STORAGE_KEYS.NETWORK_LOG]: networkActivity });
          await syncStorageStateFromWorker().catch(() => undefined);
          await broadcastSnapshot();
        }
      })();

      await broadcastSnapshot();
      return buildDashboardSnapshot();
    }

    case "pause_download":
      await callWorker("pause_download", { modelId: msg.modelId });
      if (modelStates[msg.modelId]) {
        modelStates[msg.modelId] = { ...modelStates[msg.modelId], status: "paused" };
      }
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "cancel_download":
      await callWorker("cancel_download", { modelId: msg.modelId });
      delete modelStates[msg.modelId];
      await syncStorageStateFromWorker().catch(() => undefined);
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "verify_model":
      return callWorker("verify_model", { modelId: msg.modelId, fullHash: Boolean(msg.fullHash) });

    case "load_model":
      gateway.cancelRequestsForModelUnload();
      await callWorker("load_model", { modelId: msg.modelId });
      await syncStorageStateFromWorker();
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "unload_model":
      gateway.cancelRequestsForModelUnload();
      await callWorker("unload_model");
      await syncStorageStateFromWorker();
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "remove_model":
      gateway.cancelRequestsForModelUnload(msg.modelId);
      await callWorker("remove_model", { modelId: msg.modelId });
      delete modelStates[msg.modelId];
      await syncStorageStateFromWorker();
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "restart_runtime":
      await callWorker("recover_runtime");
      await syncStorageStateFromWorker();
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "cancel_request":
      gateway.cancelByProviderRequestId(msg.requestId);
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "authorize_origin": {
      const origin: string = msg.origin;
      // Caller UI (popup, Dashboard, or authorize.html) already requested browser permission or we verify here
      let granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
      if (!granted) {
        granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
      }
      await gateway.commitOriginGrant(origin, granted);
      await registerOriginBridge(origin);
      await broadcastSnapshot();
      return buildDashboardSnapshot();
    }

    case "deny_origin":
      await gateway.denyOrigin(msg.origin);
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "revoke_origin":
      await gateway.revokeOrigin(msg.origin);
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "revoke_all_origins":
      await gateway.revokeAllThirdPartyOrigins();
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "update_settings":
      await gateway.updateSettings(msg.patch ?? {});
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "clear_diagnostics":
      gateway.clearDiagnostics();
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "reset_all_data":
      await gateway.revokeAllThirdPartyOrigins();
      if (runtimeHostPort) {
        await callWorker("reset_storage").catch(() => undefined);
      }
      await chrome.storage.local.clear();
      latestCapabilities = null;
      licenseAcceptances = [];
      networkActivity = [];
      for (const k of Object.keys(modelStates)) delete modelStates[k];
      usedBytesByModel = {};
      gateway.clearDiagnostics();
      await gateway.hydrate();
      await broadcastSnapshot();
      return buildDashboardSnapshot();

    case "check_health":
      return {
        status: latestRuntimeSnapshot.state === "error" ? "degraded" : "ok",
        provider: "uoai-extension",
        provider_version: UOAI_PROVIDER_VERSION,
        protocol_version: "1.0"
      };

    case "get_runtime_status":
      return {
        state: latestRuntimeSnapshot.state,
        loaded_model: latestRuntimeSnapshot.loadedModelId,
        webgpu_available: latestRuntimeSnapshot.webgpuAvailable,
        queue_length: gateway.getQueueSummaries().pendingQueue.length,
        origin_pending_requests: 0
      };

    case "list_api_models":
      return {
        object: "list",
        data: await runtimeExecutor.listInstalledReadyModels()
      };

    default:
      throw new UOAIError("unsupported_operation");
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.channel !== "uoai-admin-v1") return false;
  handleAdminAction(msg, sender)
    .then((data) => sendResponse({ data }))
    .catch((err) => {
      const uoaiErr =
        err instanceof UOAIError
          ? err
          : new UOAIError("internal_error", err instanceof Error ? err.message : String(err));
      sendResponse({ error: uoaiErr.toPayload().error });
    });
  return true;
});

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.channel !== "uoai-admin-v1") return false;
  handleAdminAction(msg, sender)
    .then((data) => sendResponse({ data }))
    .catch((err) => {
      const uoaiErr =
        err instanceof UOAIError
          ? err
          : new UOAIError("internal_error", err instanceof Error ? err.message : String(err));
      sendResponse({ error: uoaiErr.toPayload().error });
    });
  return true;
});

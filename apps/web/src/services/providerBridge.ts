import {
  DEFAULT_EXTENSION_SETTINGS,
  UOAI_DASHBOARD_PORT_NAME,
  type CapabilityProfile,
  type DiagnosticEvent,
  type LicenseAcceptanceRecord,
  type ModelInstallStatus,
  type NetworkActivityEntry,
  type OfflineReadinessReport,
  type PermissionGrant,
  type ProviderDiagnosticsStatus,
  type UOAIExtensionSettings
} from "@uoai/shared-types";
import {
  UOAIError,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionCreateParams,
  type HealthStatus,
  type ModelListResponse,
  type RuntimeStatus
} from "@uoai/api-protocol";
import { BUNDLED_MODEL_REGISTRY, type ModelRegistry } from "@uoai/model-registry";

export interface ModelStateEntry {
  modelId: string;
  version: string;
  status: ModelInstallStatus;
  installedAt: number;
  verifiedAt: number;
  totalBytes: number;
  downloadedBytes?: number;
  percent?: number;
  bytesPerSecond?: number;
  etaSeconds?: number | null;
  currentFile?: string | null;
  errorMessage?: string;
}

export interface DashboardSnapshot {
  extensionDetected: boolean;
  providerVersion: string;
  settings: UOAIExtensionSettings;
  capabilities: CapabilityProfile | null;
  registry: ModelRegistry;
  modelStates: Record<string, ModelStateEntry>;
  usedBytesByModel: Record<string, number>;
  licenseAcceptances: LicenseAcceptanceRecord[];
  runtime: ProviderDiagnosticsStatus;
  grants: PermissionGrant[];
  offlineReadiness: OfflineReadinessReport;
  diagnostics: DiagnosticEvent[];
  networkActivity: NetworkActivityEntry[];
}

export type AdminRpcAction =
  | { action: "get_snapshot" }
  | { action: "run_capability_check" }
  | { action: "accept_license"; modelId: string; licenseId: string; licenseVersion: string }
  | { action: "download_model"; modelId: string }
  | { action: "pause_download"; modelId: string }
  | { action: "cancel_download"; modelId: string }
  | { action: "verify_model"; modelId: string; fullHash: boolean }
  | { action: "load_model"; modelId: string }
  | { action: "unload_model" }
  | { action: "remove_model"; modelId: string }
  | { action: "restart_runtime" }
  | { action: "cancel_request"; requestId: string }
  | { action: "authorize_origin"; origin: string }
  | { action: "deny_origin"; origin: string }
  | { action: "revoke_origin"; origin: string }
  | { action: "revoke_all_origins" }
  | { action: "update_settings"; patch: Partial<UOAIExtensionSettings> }
  | { action: "clear_diagnostics" }
  | { action: "reset_all_data" }
  | { action: "check_health" }
  | { action: "get_runtime_status" }
  | { action: "list_api_models" }
  | { action: "workspace_chat"; requestId: string; params: ChatCompletionCreateParams };

export interface ExtensionBridgeApi {
  isExtensionContext(): boolean;
  getExtensionId(): string | null;
  call<T = unknown>(msg: AdminRpcAction): Promise<T>;
  streamChat(
    params: ChatCompletionCreateParams,
    onChunk: (chunk: ChatCompletionChunk) => void,
    signal?: AbortSignal
  ): Promise<ChatCompletion>;
  subscribePush(handler: (event: { type: string; data?: unknown }) => void): () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getChromeRuntime(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).chrome?.runtime ?? null;
}

function getConfiguredExtensionId(): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.protocol === "chrome-extension:") {
    return window.location.host;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("extensionId") ?? localStorage.getItem("uoai_extension_id");
}

/**
 * Primary bridge connecting apps/web (whether running as chrome-extension://<id>/app.html
 * or as a trusted-origin PWA via externally_connectable) to the MV3 Service Worker.
 */
export function createExtensionBridge(): ExtensionBridgeApi {
  const pushListeners = new Set<(event: { type: string; data?: unknown }) => void>();
  let port: chrome.runtime.Port | null = null;
  const activeStreams = new Map<
    string,
    {
      onChunk: (chunk: ChatCompletionChunk) => void;
      resolve: (comp: ChatCompletion) => void;
      reject: (err: UOAIError) => void;
    }
  >();

  const ensurePort = (): chrome.runtime.Port | null => {
    const runtime = getChromeRuntime();
    if (!runtime?.connect) return null;
    if (port) return port;
    try {
      const extId =
        window.location.protocol === "chrome-extension:" ? undefined : getConfiguredExtensionId();
      if (window.location.protocol !== "chrome-extension:" && !extId) {
        return null;
      }
      port = extId
        ? runtime.connect(extId, { name: UOAI_DASHBOARD_PORT_NAME })
        : runtime.connect({ name: UOAI_DASHBOARD_PORT_NAME });

      port!.onMessage.addListener((msg: Record<string, unknown>) => {
        if (msg.type === "stream_chunk" && typeof msg.requestId === "string") {
          activeStreams.get(msg.requestId)?.onChunk(msg.chunk as ChatCompletionChunk);
          return;
        }
        if (msg.type === "chat_complete" && typeof msg.requestId === "string") {
          const entry = activeStreams.get(msg.requestId);
          if (entry) {
            activeStreams.delete(msg.requestId);
            entry.resolve(msg.completion as ChatCompletion);
          }
          return;
        }
        if (msg.type === "chat_error" && typeof msg.requestId === "string") {
          const entry = activeStreams.get(msg.requestId);
          if (entry) {
            activeStreams.delete(msg.requestId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entry.reject(UOAIError.fromPayload({ error: msg.error as any }));
          }
          return;
        }
        for (const listener of pushListeners) {
          listener({ type: String(msg.type ?? "update"), data: msg.data });
        }
      });

      port!.onDisconnect.addListener(() => {
        port = null;
        for (const [id, entry] of activeStreams.entries()) {
          activeStreams.delete(id);
          entry.reject(new UOAIError("connection_lost"));
        }
      });

      return port;
    } catch {
      port = null;
      return null;
    }
  };

  return {
    isExtensionContext(): boolean {
      return typeof window !== "undefined" && window.location.protocol === "chrome-extension:";
    },

    getExtensionId(): string | null {
      return getConfiguredExtensionId();
    },

    async call<T = unknown>(msg: AdminRpcAction): Promise<T> {
      const runtime = getChromeRuntime();
      if (!runtime?.sendMessage) {
        throw new UOAIError("extension_not_detected");
      }
      const extId =
        window.location.protocol === "chrome-extension:" ? undefined : getConfiguredExtensionId();
      if (window.location.protocol !== "chrome-extension:" && !extId) {
        throw new UOAIError("extension_not_detected");
      }

      return new Promise<T>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cb = (response: any) => {
          const lastErr = runtime.lastError;
          if (lastErr) {
            reject(new UOAIError("extension_not_detected", lastErr.message));
            return;
          }
          if (!response) {
            reject(new UOAIError("extension_not_detected"));
            return;
          }
          if (response.error) {
            reject(UOAIError.fromPayload({ error: response.error }));
            return;
          }
          resolve(response.data as T);
        };

        try {
          if (extId) {
            runtime.sendMessage(extId, { channel: "uoai-admin-v1", ...msg }, cb);
          } else {
            runtime.sendMessage({ channel: "uoai-admin-v1", ...msg }, cb);
          }
        } catch (err) {
          reject(
            new UOAIError(
              "extension_not_detected",
              err instanceof Error ? err.message : undefined
            )
          );
        }
      });
    },

    async streamChat(
      params: ChatCompletionCreateParams,
      onChunk: (chunk: ChatCompletionChunk) => void,
      signal?: AbortSignal
    ): Promise<ChatCompletion> {
      const p = ensurePort();
      if (!p) throw new UOAIError("extension_not_detected");

      const requestId = `ws_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      return new Promise<ChatCompletion>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new UOAIError("generation_cancelled"));
          return;
        }
        const onAbort = () => {
          p.postMessage({ action: "cancel_request", requestId });
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        activeStreams.set(requestId, {
          onChunk,
          resolve: (comp) => {
            signal?.removeEventListener("abort", onAbort);
            resolve(comp);
          },
          reject: (err) => {
            signal?.removeEventListener("abort", onAbort);
            reject(err);
          }
        });

        p.postMessage({
          action: "workspace_chat",
          requestId,
          params
        });
      });
    },

    subscribePush(handler: (event: { type: string; data?: unknown }) => void): () => void {
      pushListeners.add(handler);
      ensurePort();
      return () => {
        pushListeners.delete(handler);
      };
    }
  };
}

export function createEmptyDisconnectedSnapshot(): DashboardSnapshot {
  return {
    extensionDetected: false,
    providerVersion: "0.1.0",
    settings: { ...DEFAULT_EXTENSION_SETTINGS },
    capabilities: null,
    registry: BUNDLED_MODEL_REGISTRY,
    modelStates: {},
    usedBytesByModel: {},
    licenseAcceptances: [],
    runtime: {
      state: "not_started",
      loadedModel: null,
      webgpuAvailable: false,
      queueLength: 0,
      activeRequest: null,
      pendingQueue: [],
      lastErrorCode: null,
      consecutiveCrashes: 0
    },
    grants: [],
    offlineReadiness: {
      status: "not_ready",
      checkedAt: Date.now(),
      checks: [],
      missingItems: ["UOAI Browser Extension not detected"]
    },
    diagnostics: [],
    networkActivity: []
  };
}

export type { HealthStatus, ModelListResponse, RuntimeStatus };

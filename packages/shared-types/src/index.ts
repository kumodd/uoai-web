export const UOAI_PROVIDER_VERSION = "0.1.0";
export const UOAI_PROTOCOL_VERSION = "1.0";
export const UOAI_SUPPORTED_PROTOCOL_VERSIONS = ["1.0"] as const;

export const UOAI_BRIDGE_CHANNEL = "uoai-bridge-v1";
export const UOAI_PORT_NAME = "uoai-client-v1";
export const UOAI_RUNTIME_HOST_PORT_NAME = "uoai-runtime-host-v1";
export const UOAI_DASHBOARD_PORT_NAME = "uoai-dashboard-v1";

// Business Rules defaults (BR-09, BR-10, BR-14, BR-15, BR-16, BR-20)
export const MAX_ACTIVE_GENERATIONS = 1;
export const MAX_GLOBAL_PENDING_QUEUE = 5;
export const MAX_ORIGIN_PENDING_QUEUE = 2;
export const MAX_REQUEST_PAYLOAD_BYTES = 256 * 1024; // 256 KB (BR-16)
export const MAX_MESSAGES_PER_REQUEST = 200; // FR-117
export const DEFAULT_WEBSITE_MAX_TOKENS = 1024; // BR-14
export const DEFAULT_RATE_LIMIT_PER_MIN = 30; // BR-15
export const DEFAULT_IDLE_UNLOAD_MINUTES = 15; // BR-20
export const MAX_CONSECUTIVE_CRASHES = 3; // FR-049
export const CRASH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes (FR-049)
export const DIAGNOSTIC_RING_BUFFER_SIZE = 1000; // NFR-046
export const STORAGE_SAFETY_MARGIN_RATIO = 0.1; // 10% safety margin (FR-006, FR-048)
export const DEFAULT_TRUSTED_PWA_ORIGIN = "https://app.uoai.local";

export type RuntimeState =
  | "not_started"
  | "starting"
  | "idle"
  | "loading_model"
  | "ready"
  | "generating"
  | "unloading"
  | "recovering"
  | "error";

export type ModelInstallStatus =
  | "not_installed"
  | "queued"
  | "downloading"
  | "paused"
  | "verifying"
  | "installing"
  | "ready"
  | "loaded"
  | "missing_files"
  | "failed_integrity"
  | "failed_download"
  | "update_available";

export type CompatibilityClass =
  | "compatible"
  | "compatible_with_limitations"
  | "incompatible"
  | "unknown";

export type WebGPUStatus =
  | "supported"
  | "supported_with_limitations"
  | "unsupported";

export interface BrowserCheckItem {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  remedy?: string;
}

export interface WebGPUCapabilityInfo {
  status: WebGPUStatus;
  reasonCode?: "no_webgpu_api" | "no_gpu_adapter" | "device_creation_failed";
  adapterVendor?: string;
  adapterArchitecture?: string;
  adapterDescription?: string;
  features: string[];
  limits: {
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupStorageSize?: number;
  };
  limitations: string[];
}

export interface StorageCapabilityInfo {
  usageBytes: number;
  quotaBytes: number;
  availableBytes: number;
  persisted: boolean | "unknown";
}

export interface CapabilityProfile {
  checkedAt: number;
  browserName: string;
  browserVersion: string;
  isSupportedBrowser: boolean;
  deviceMemoryGb?: number;
  checks: BrowserCheckItem[];
  webgpu: WebGPUCapabilityInfo;
  storage: StorageCapabilityInfo;
}

export interface CompatibilityAssessment {
  modelId: string;
  classification: CompatibilityClass;
  reasons: string[];
  canDownload: boolean;
}

export interface PermissionGrant {
  origin: string;
  status: "allowed" | "denied" | "built_in";
  grantedAt: number;
  lastUsedAt?: number;
  requestCount: number;
  browserPermissionGranted: boolean;
}

export interface QueueItemSummary {
  requestId: string;
  origin: string;
  isFirstParty: boolean;
  model: string;
  status: "active" | "queued";
  enqueuedAt: number;
}

export interface ProviderDiagnosticsStatus {
  state: RuntimeState;
  loadedModel: string | null;
  webgpuAvailable: boolean;
  queueLength: number;
  activeRequest: QueueItemSummary | null;
  pendingQueue: QueueItemSummary[];
  lastErrorCode: string | null;
  loadStage?: string;
  loadProgress?: number;
  idleSince?: number;
  consecutiveCrashes: number;
}

/**
 * Strictly content-free diagnostic event (BR-05, FR-114, NFR-046).
 * Never add prompt, message, or response text fields here.
 */
export interface DiagnosticEvent {
  id: string;
  timestamp: number;
  category: "runtime" | "permission" | "storage" | "download" | "api" | "error";
  event: string;
  code?: string;
  origin?: string;
  modelId?: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Network activity transparency record (FR-124, BR-21).
 */
export interface NetworkActivityEntry {
  id: string;
  timestamp: number;
  purpose: "model_download" | "registry_refresh" | "pwa_update";
  host: string;
  bytesTransferred: number;
  status: "in_progress" | "completed" | "failed" | "paused";
}

export interface OfflineReadinessCheck {
  id: "app_shell" | "runtime_wasm" | "registry_copy" | "verified_model" | "persistent_storage";
  label: string;
  passed: boolean;
  detail: string;
}

export interface OfflineReadinessReport {
  status: "offline_ready" | "partially_ready" | "not_ready";
  checkedAt: number;
  checks: OfflineReadinessCheck[];
  missingItems: string[];
}

export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
  modelId?: string;
  stopped?: boolean;
  errorCode?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
}

export interface LicenseAcceptanceRecord {
  modelId: string;
  licenseId: string;
  licenseVersion: string;
  acceptedAt: number;
}

export interface UOAIExtensionSettings {
  onboardingComplete: boolean;
  idleUnloadMinutes: number; // 0 = never (BR-20)
  websiteMaxTokens: number; // default 1024 (BR-14)
  rateLimitPerMin: number; // default 30 (BR-15)
  allowWebsiteModelSwitch: boolean; // default false (OQ-13 = Option A)
  ephemeralHistory: boolean; // default false (FR-036)
  developerMode: boolean; // enables http://localhost:<port> (OQ-22 = Option A)
  allowIncompatibleDownloadOverride: boolean; // default false (FR-012)
  trustedPwaOrigin: string;
}

export const DEFAULT_EXTENSION_SETTINGS: UOAIExtensionSettings = {
  onboardingComplete: false,
  idleUnloadMinutes: DEFAULT_IDLE_UNLOAD_MINUTES,
  websiteMaxTokens: DEFAULT_WEBSITE_MAX_TOKENS,
  rateLimitPerMin: DEFAULT_RATE_LIMIT_PER_MIN,
  allowWebsiteModelSwitch: false,
  ephemeralHistory: false,
  developerMode: false,
  allowIncompatibleDownloadOverride: false,
  trustedPwaOrigin: DEFAULT_TRUSTED_PWA_ORIGIN
};

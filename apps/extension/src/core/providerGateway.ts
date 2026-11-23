import {
  DEFAULT_EXTENSION_SETTINGS,
  DIAGNOSTIC_RING_BUFFER_SIZE,
  MAX_GLOBAL_PENDING_QUEUE,
  MAX_ORIGIN_PENDING_QUEUE,
  UOAI_BRIDGE_CHANNEL,
  UOAI_PROTOCOL_VERSION,
  UOAI_PROVIDER_VERSION,
  UOAI_SUPPORTED_PROTOCOL_VERSIONS,
  type DiagnosticEvent,
  type PermissionGrant,
  type QueueItemSummary,
  type RuntimeState,
  type UOAIExtensionSettings
} from "@uoai/shared-types";
import {
  ClientEnvelopeSchema,
  UOAIError,
  assertPayloadSizeWithinLimit,
  generateRequestId,
  validateChatCompletionParams,
  validateOriginString,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionCreateParams,
  type HealthStatus,
  type LogicalOperation,
  type ModelInfo,
  type ModelListResponse,
  type ProviderEnvelope,
  type RuntimeStatus
} from "@uoai/api-protocol";

/**
 * Browser-verified sender metadata derived strictly from chrome.runtime.MessageSender,
 * NEVER from message payload (FR-065, FR-115, T-02, T-03).
 */
export interface VerifiedSenderContext {
  portId: string;
  origin: string;
  frameId: number;
  isExtensionPage: boolean;
  isTrustedPwa: boolean;
  senderExtensionIdMatches: boolean;
}

export interface ConnectedClientPort {
  readonly sender: VerifiedSenderContext;
  send(envelope: ProviderEnvelope): void;
  disconnect(): void;
}

export interface RuntimeExecutor {
  getRuntimeSummary(): {
    state: RuntimeState;
    loadedModel: string | null;
    webgpuAvailable: boolean;
    lastErrorCode: string | null;
  };
  listInstalledReadyModels(): Promise<ModelInfo[]>;
  ensureModelLoadedForRequest(
    modelId: string,
    opts: { isFirstParty: boolean; allowCrossModelSwitch: boolean }
  ): Promise<void>;
  executeChatCompletion(
    params: ChatCompletionCreateParams,
    opts: {
      requestId: string;
      maxTokensCap?: number;
      signal: AbortSignal;
      onChunk: (chunk: ChatCompletionChunk) => void;
    }
  ): Promise<ChatCompletion>;
}

export interface GatewayStorageAdapter {
  getSettings(): Promise<UOAIExtensionSettings>;
  saveSettings(settings: UOAIExtensionSettings): Promise<void>;
  getGrants(): Promise<Record<string, PermissionGrant>>;
  saveGrants(grants: Record<string, PermissionGrant>): Promise<void>;
  hasBrowserHostPermission(origin: string): Promise<boolean>;
  removeBrowserHostPermission(origin: string): Promise<void>;
  unregisterOriginContentScript(origin: string): Promise<void>;
}

interface QueuedExecution {
  providerRequestId: string;
  clientRequestId: string;
  portId: string;
  origin: string;
  isFirstParty: boolean;
  params: ChatCompletionCreateParams;
  enqueuedAt: number;
  controller: AbortController;
}

/**
 * Authoritative security, permission, rate-limit, and Priority-FIFO queue coordinator
 * used by the MV3 Service Worker (FR-046, FR-051, FR-061..068, FR-111..118).
 */
export class UOAIProviderGateway {
  private settings: UOAIExtensionSettings = { ...DEFAULT_EXTENSION_SETTINGS };
  private grants: Record<string, PermissionGrant> = {};
  private readonly ports = new Map<string, ConnectedClientPort>();
  private readonly rateWindowByOrigin = new Map<string, number[]>();
  private readonly pendingQueue: QueuedExecution[] = [];
  private activeExecution: QueuedExecution | null = null;
  private readonly diagnostics: DiagnosticEvent[] = [];
  private hydrated = false;

  constructor(
    private readonly storage: GatewayStorageAdapter,
    private readonly runtime: RuntimeExecutor,
    private readonly onStateUpdated?: () => void
  ) {}

  async hydrate(): Promise<void> {
    const loadedSettings = await this.storage.getSettings().catch(() => ({
      ...DEFAULT_EXTENSION_SETTINGS
    }));
    this.settings = { ...DEFAULT_EXTENSION_SETTINGS, ...loadedSettings };
    this.grants = await this.storage.getGrants().catch(() => ({}));
    this.hydrated = true;
  }

  private async ensureHydrated(): Promise<void> {
    if (!this.hydrated) await this.hydrate();
  }

  getSettings(): UOAIExtensionSettings {
    return { ...this.settings };
  }

  async updateSettings(patch: Partial<UOAIExtensionSettings>): Promise<UOAIExtensionSettings> {
    await this.ensureHydrated();
    this.settings = { ...this.settings, ...patch };
    await this.storage.saveSettings(this.settings);
    this.recordDiagnostic("runtime", "settings_updated");
    this.onStateUpdated?.();
    return this.getSettings();
  }

  getGrantsList(): PermissionGrant[] {
    return Object.values(this.grants);
  }

  getDiagnostics(): DiagnosticEvent[] {
    return [...this.diagnostics];
  }

  clearDiagnostics(): void {
    this.diagnostics.length = 0;
  }

  getQueueSummaries(): {
    activeRequest: QueueItemSummary | null;
    pendingQueue: QueueItemSummary[];
  } {
    return {
      activeRequest: this.activeExecution
        ? {
            requestId: this.activeExecution.providerRequestId,
            origin: this.activeExecution.isFirstParty ? "Workspace" : this.activeExecution.origin,
            isFirstParty: this.activeExecution.isFirstParty,
            model: this.activeExecution.params.model,
            status: "active",
            enqueuedAt: this.activeExecution.enqueuedAt
          }
        : null,
      pendingQueue: this.pendingQueue.map((q) => ({
        requestId: q.providerRequestId,
        origin: q.isFirstParty ? "Workspace" : q.origin,
        isFirstParty: q.isFirstParty,
        model: q.params.model,
        status: "queued",
        enqueuedAt: q.enqueuedAt
      }))
    };
  }

  /**
   * Strictly content-free diagnostic logger (FR-114, NFR-046, BR-05).
   */
  recordDiagnostic(
    category: DiagnosticEvent["category"],
    event: string,
    extra?: { code?: string; origin?: string; modelId?: string; durationMs?: number }
  ): void {
    this.diagnostics.push({
      id: generateRequestId("diag"),
      timestamp: Date.now(),
      category,
      event,
      ...extra
    });
    if (this.diagnostics.length > DIAGNOSTIC_RING_BUFFER_SIZE) {
      this.diagnostics.splice(0, this.diagnostics.length - DIAGNOSTIC_RING_BUFFER_SIZE);
    }
  }

  /**
   * Commit a two-layer origin grant after user consent + browser host permission (FR-061, ADR-005).
   */
  async commitOriginGrant(origin: string, browserPermissionGranted: boolean): Promise<PermissionGrant> {
    await this.ensureHydrated();
    const validation = validateOriginString(origin, {
      allowLocalhostHttp: this.settings.developerMode
    });
    if (!validation.valid) {
      throw new UOAIError("origin_not_allowed", validation.reason);
    }
    if (!browserPermissionGranted) {
      throw new UOAIError(
        "permission_denied",
        "Browser host permission was not granted for this origin."
      );
    }
    const grant: PermissionGrant = {
      origin: validation.origin,
      status: "allowed",
      grantedAt: Date.now(),
      requestCount: this.grants[validation.origin]?.requestCount ?? 0,
      browserPermissionGranted: true
    };
    this.grants[validation.origin] = grant;
    await this.storage.saveGrants(this.grants);
    this.recordDiagnostic("permission", "origin_granted", { origin: validation.origin });
    this.onStateUpdated?.();
    return grant;
  }

  async denyOrigin(origin: string): Promise<void> {
    await this.ensureHydrated();
    const validation = validateOriginString(origin, { allowLocalhostHttp: true });
    if (!validation.valid) return;
    this.grants[validation.origin] = {
      origin: validation.origin,
      status: "denied",
      grantedAt: Date.now(),
      requestCount: 0,
      browserPermissionGranted: false
    };
    await this.storage.saveGrants(this.grants);
    this.recordDiagnostic("permission", "origin_denied", { origin: validation.origin });
    this.onStateUpdated?.();
  }

  /**
   * Immediately revoke an origin (FR-064, FR-112, BR-06, TC-030):
   * 1. Synchronously remove from in-memory grant cache.
   * 2. Cancel all active/queued requests from that origin with `permission_revoked`.
   * 3. Send `permission_revoked` event and disconnect all open ports for that origin.
   * 4. Unregister content script and remove browser host permission.
   */
  async revokeOrigin(origin: string): Promise<void> {
    await this.ensureHydrated();
    // 1. Synchronous in-memory cache invalidation
    delete this.grants[origin];

    // 2. Abort active request if owned by revoked origin
    if (this.activeExecution && this.activeExecution.origin === origin && !this.activeExecution.isFirstParty) {
      this.activeExecution.controller.abort("permission_revoked");
    }

    // Remove queued requests from revoked origin
    for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
      const item = this.pendingQueue[i]!;
      if (item.origin === origin && !item.isFirstParty) {
        this.pendingQueue.splice(i, 1);
        this.sendErrorToPort(item.portId, item.clientRequestId, new UOAIError("permission_revoked"));
      }
    }

    // 3. Emit event & close all ports for this origin
    for (const [portId, port] of this.ports.entries()) {
      if (port.sender.origin === origin && !port.sender.isExtensionPage && !port.sender.isTrustedPwa) {
        try {
          port.send({
            channel: UOAI_BRIDGE_CHANNEL,
            type: "event",
            event: "permission_revoked"
          });
        } catch {
          // Port may already be closing
        }
        port.disconnect();
        this.ports.delete(portId);
      }
    }

    // 4. Persist removal + browser permission cleanup
    await this.storage.saveGrants(this.grants);
    await this.storage.unregisterOriginContentScript(origin).catch(() => undefined);
    await this.storage.removeBrowserHostPermission(origin).catch(() => undefined);
    this.recordDiagnostic("permission", "origin_revoked", { origin });
    this.onStateUpdated?.();
  }

  async revokeAllThirdPartyOrigins(): Promise<void> {
    await this.ensureHydrated();
    const origins = Object.keys(this.grants);
    for (const origin of origins) {
      await this.revokeOrigin(origin);
    }
  }

  /**
   * Cancel active & queued requests targeting a model being unloaded/switched (OQ-11 = A, BR-12).
   */
  cancelRequestsForModelUnload(modelId?: string): void {
    if (
      this.activeExecution &&
      (!modelId || this.activeExecution.params.model === modelId)
    ) {
      this.activeExecution.controller.abort("model_unloaded");
    }
    for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
      const item = this.pendingQueue[i]!;
      if (!modelId || item.params.model === modelId) {
        this.pendingQueue.splice(i, 1);
        this.sendErrorToPort(item.portId, item.clientRequestId, new UOAIError("model_unloaded"));
      }
    }
    this.onStateUpdated?.();
  }

  /**
   * Cancel any request by providerRequestId (e.g. from Provider Dashboard Queue Monitor).
   */
  cancelByProviderRequestId(providerRequestId: string): boolean {
    if (this.activeExecution?.providerRequestId === providerRequestId) {
      this.activeExecution.controller.abort("generation_cancelled");
      return true;
    }
    const idx = this.pendingQueue.findIndex((q) => q.providerRequestId === providerRequestId);
    if (idx >= 0) {
      const [removed] = this.pendingQueue.splice(idx, 1);
      if (removed) {
        this.sendErrorToPort(
          removed.portId,
          removed.clientRequestId,
          new UOAIError("generation_cancelled")
        );
      }
      this.onStateUpdated?.();
      return true;
    }
    return false;
  }

  registerPort(port: ConnectedClientPort): void {
    this.ports.set(port.sender.portId, port);
  }

  /**
   * Automatically cancels queued & active requests owned by a disconnected port (FR-046).
   */
  handlePortDisconnect(portId: string): void {
    this.ports.delete(portId);
    if (this.activeExecution?.portId === portId) {
      this.activeExecution.controller.abort("generation_cancelled");
    }
    for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
      if (this.pendingQueue[i]!.portId === portId) {
        this.pendingQueue.splice(i, 1);
      }
    }
    this.onStateUpdated?.();
  }

  /**
   * Mandatory authorization middleware executed on EVERY incoming message (FR-065, FR-111, FR-112, FR-115).
   */
  private async authorizeSender(sender: VerifiedSenderContext): Promise<void> {
    await this.ensureHydrated();

    // Extension's own pages (chrome-extension://<self>) are first-party trusted
    if (sender.isExtensionPage && sender.senderExtensionIdMatches) {
      return;
    }

    // Build-time configured trusted first-party PWA origin (BR-18, OQ-14 = Option A)
    if (sender.isTrustedPwa && sender.origin === this.settings.trustedPwaOrigin) {
      return;
    }

    // Third-party websites: MUST come from UOAI's own content script bridge
    if (!sender.senderExtensionIdMatches) {
      this.recordDiagnostic("permission", "unauthorized_sender_id", { origin: sender.origin });
      throw new UOAIError("origin_not_allowed", "Untrusted extension sender.");
    }

    // Strict top-level frame enforcement (OQ-15 = Option A, BR-25, TC-028)
    if (sender.frameId !== 0) {
      this.recordDiagnostic("permission", "iframe_rejected", { origin: sender.origin });
      throw new UOAIError(
        "origin_not_allowed",
        "Embedded iframes are not permitted to access UOAI."
      );
    }

    // Strict scheme/host/port validation (BR-04, OQ-22 = Option A)
    const originCheck = validateOriginString(sender.origin, {
      allowLocalhostHttp: this.settings.developerMode
    });
    if (!originCheck.valid) {
      this.recordDiagnostic("permission", "invalid_origin_rejected", { origin: sender.origin });
      throw new UOAIError("origin_not_allowed", originCheck.reason);
    }

    const grant = this.grants[originCheck.origin];
    if (!grant) {
      this.recordDiagnostic("permission", "unauthorized_attempt", { origin: originCheck.origin });
      throw new UOAIError("permission_required");
    }
    if (grant.status === "denied") {
      this.recordDiagnostic("permission", "denied_attempt", { origin: originCheck.origin });
      throw new UOAIError("permission_denied");
    }

    // Two-layer verification: confirm browser-level host permission is still active (ADR-005)
    const hasBrowserPerm = await this.storage.hasBrowserHostPermission(originCheck.origin);
    if (!hasBrowserPerm) {
      await this.revokeOrigin(originCheck.origin);
      throw new UOAIError("permission_revoked");
    }
  }

  /**
   * Sliding-window per-origin rate limiter (FR-117, BR-15, TC-026).
   */
  private enforceRateLimit(sender: VerifiedSenderContext): void {
    if (sender.isExtensionPage || sender.isTrustedPwa) return;
    const now = Date.now();
    const windowMs = 60_000;
    const timestamps = (this.rateWindowByOrigin.get(sender.origin) ?? []).filter(
      (t) => now - t < windowMs
    );
    if (timestamps.length >= this.settings.rateLimitPerMin) {
      const oldest = timestamps[0] ?? now;
      const retryAfterMs = Math.max(100, windowMs - (now - oldest));
      this.recordDiagnostic("api", "rate_limited", {
        code: "rate_limited",
        origin: sender.origin
      });
      throw new UOAIError(
        "rate_limited",
        `Origin ${sender.origin} exceeded ${this.settings.rateLimitPerMin} requests/minute.`,
        { retryAfterMs }
      );
    }
    timestamps.push(now);
    this.rateWindowByOrigin.set(sender.origin, timestamps);
  }

  /**
   * Primary entrypoint for all messages received on a connected port.
   */
  async handlePortMessage(portId: string, rawMessage: unknown): Promise<void> {
    const port = this.ports.get(portId);
    if (!port) return;

    // 1. Payload size cap before parsing (BR-16, FR-116)
    try {
      assertPayloadSizeWithinLimit(rawMessage);
    } catch (err) {
      const clientReqId =
        rawMessage && typeof rawMessage === "object" && "clientRequestId" in rawMessage
          ? String((rawMessage as Record<string, unknown>).clientRequestId ?? "unknown")
          : "unknown";
      this.sendErrorToPort(
        portId,
        clientReqId,
        err instanceof UOAIError ? err : new UOAIError("payload_too_large")
      );
      return;
    }

    // 2. Envelope schema validation (FR-066, TC-031)
    const parsedEnvelope = ClientEnvelopeSchema.safeParse(rawMessage);
    if (!parsedEnvelope.success) {
      const rawObj =
        rawMessage && typeof rawMessage === "object"
          ? (rawMessage as Record<string, unknown>)
          : {};
      const clientReqId =
        typeof rawObj.clientRequestId === "string" ? rawObj.clientRequestId : "unknown";
      const opInvalid =
        rawObj.type === "api_request" &&
        typeof rawObj.operation === "string" &&
        !["GET /v1/health", "GET /v1/runtime", "GET /v1/models", "POST /v1/chat/completions"].includes(
          rawObj.operation
        );
      this.sendErrorToPort(
        portId,
        clientReqId,
        new UOAIError(opInvalid ? "unsupported_operation" : "invalid_request")
      );
      return;
    }

    const env = parsedEnvelope.data;

    // 3. Mandatory sender/origin authorization BEFORE any operation handling (FR-111, FR-115)
    try {
      await this.authorizeSender(port.sender);
    } catch (err) {
      const uoaiErr = err instanceof UOAIError ? err : new UOAIError("origin_not_allowed");
      if (env.type === "handshake_init") {
        port.send({
          channel: UOAI_BRIDGE_CHANNEL,
          type: "handshake_error",
          nonce: env.nonce,
          error: uoaiErr.toPayload().error
        });
      } else if (env.type === "api_request" || env.type === "cancel") {
        this.sendErrorToPort(portId, env.clientRequestId, uoaiErr);
      }
      return;
    }

    // 4. Handshake protocol version negotiation (FR-071, NFR-038)
    if (env.type === "handshake_init") {
      const negotiated = env.sdkProtocolVersions.find((v) =>
        (UOAI_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(v)
      );
      if (!negotiated) {
        const err = new UOAIError(
          "protocol_version_unsupported",
          `Unsupported protocol versions: ${env.sdkProtocolVersions.join(", ")}`,
          { supportedVersions: [...UOAI_SUPPORTED_PROTOCOL_VERSIONS] }
        );
        port.send({
          channel: UOAI_BRIDGE_CHANNEL,
          type: "handshake_error",
          nonce: env.nonce,
          error: err.toPayload().error
        });
        return;
      }
      port.send({
        channel: UOAI_BRIDGE_CHANNEL,
        type: "handshake_ack",
        nonce: env.nonce,
        protocolVersion: negotiated,
        providerVersion: UOAI_PROVIDER_VERSION
      });
      return;
    }

    // 5. Cancellation (strictly enforces per-port ownership, FR-046, FR-118)
    if (env.type === "cancel") {
      if (
        this.activeExecution &&
        this.activeExecution.portId === portId &&
        this.activeExecution.clientRequestId === env.clientRequestId
      ) {
        this.activeExecution.controller.abort("generation_cancelled");
        return;
      }
      const qIdx = this.pendingQueue.findIndex(
        (q) => q.portId === portId && q.clientRequestId === env.clientRequestId
      );
      if (qIdx >= 0) {
        const [removed] = this.pendingQueue.splice(qIdx, 1);
        if (removed) {
          this.sendErrorToPort(
            portId,
            removed.clientRequestId,
            new UOAIError("generation_cancelled", undefined, {
              requestId: removed.providerRequestId
            })
          );
        }
        this.onStateUpdated?.();
        return;
      }
      this.sendErrorToPort(portId, env.clientRequestId, new UOAIError("request_not_found"));
      return;
    }

    // 6. Logical API Request Routing (FR-073..078)
    await this.routeLogicalOperation(port, env.clientRequestId, env.operation, env.payload);
  }

  private async routeLogicalOperation(
    port: ConnectedClientPort,
    clientRequestId: string,
    operation: LogicalOperation,
    payload: unknown
  ): Promise<void> {
    const providerRequestId = generateRequestId("req");
    const isFirstParty = port.sender.isExtensionPage || port.sender.isTrustedPwa;

    try {
      this.enforceRateLimit(port.sender);
    } catch (err) {
      this.sendErrorToPort(
        port.sender.portId,
        clientRequestId,
        err instanceof UOAIError ? err : new UOAIError("rate_limited")
      );
      return;
    }

    // Update local origin request stats (FR-063)
    if (!isFirstParty && this.grants[port.sender.origin]) {
      this.grants[port.sender.origin]!.lastUsedAt = Date.now();
      this.grants[port.sender.origin]!.requestCount += 1;
      void this.storage.saveGrants(this.grants);
    }

    if (operation === "GET /v1/health") {
      const rt = this.runtime.getRuntimeSummary();
      const health: HealthStatus = {
        status: rt.state === "error" ? "degraded" : "ok",
        provider: "uoai-extension",
        provider_version: UOAI_PROVIDER_VERSION,
        protocol_version: UOAI_PROTOCOL_VERSION
      };
      port.send({
        channel: UOAI_BRIDGE_CHANNEL,
        type: "api_response",
        clientRequestId,
        providerRequestId,
        data: health
      });
      return;
    }

    if (operation === "GET /v1/runtime") {
      const rt = this.runtime.getRuntimeSummary();
      const originPending = this.pendingQueue.filter(
        (q) => q.origin === port.sender.origin
      ).length;
      // Website-facing reduced view: contains NO other origins' info (FR-047, FR-078, T-12)
      const status: RuntimeStatus = {
        state: rt.state,
        loaded_model: rt.loadedModel,
        webgpu_available: rt.webgpuAvailable,
        queue_length: this.pendingQueue.length,
        origin_pending_requests: originPending
      };
      port.send({
        channel: UOAI_BRIDGE_CHANNEL,
        type: "api_response",
        clientRequestId,
        providerRequestId,
        data: status
      });
      return;
    }

    if (operation === "GET /v1/models") {
      const models = await this.runtime.listInstalledReadyModels();
      const response: ModelListResponse = {
        object: "list",
        data: models
      };
      port.send({
        channel: UOAI_BRIDGE_CHANNEL,
        type: "api_response",
        clientRequestId,
        providerRequestId,
        data: response
      });
      return;
    }

    if (operation === "POST /v1/chat/completions") {
      let params: ChatCompletionCreateParams;
      try {
        params = validateChatCompletionParams(payload);
      } catch (err) {
        this.sendErrorToPort(
          port.sender.portId,
          clientRequestId,
          err instanceof UOAIError ? err : new UOAIError("invalid_request")
        );
        return;
      }

      // Enforce global (5) & per-origin (2) bounded queue limits (BR-10, FR-051, TC-025)
      if (this.activeExecution !== null) {
        if (this.pendingQueue.length >= MAX_GLOBAL_PENDING_QUEUE) {
          this.sendErrorToPort(
            port.sender.portId,
            clientRequestId,
            new UOAIError("queue_full", "Global pending request queue limit (5) reached.", {
              requestId: providerRequestId,
              retryAfterMs: 2000
            })
          );
          return;
        }
        const originPendingCount = this.pendingQueue.filter(
          (q) => q.origin === port.sender.origin
        ).length;
        if (!isFirstParty && originPendingCount >= MAX_ORIGIN_PENDING_QUEUE) {
          this.sendErrorToPort(
            port.sender.portId,
            clientRequestId,
            new UOAIError("queue_full", "Per-origin pending request limit (2) reached.", {
              requestId: providerRequestId,
              retryAfterMs: 2000
            })
          );
          return;
        }
      }

      const item: QueuedExecution = {
        providerRequestId,
        clientRequestId,
        portId: port.sender.portId,
        origin: port.sender.origin,
        isFirstParty,
        params,
        enqueuedAt: Date.now(),
        controller: new AbortController()
      };

      // Priority-FIFO insertion (OQ-10 = Option B): first-party Workspace requests jump ahead of pending third-party requests
      if (isFirstParty) {
        const firstThirdPartyIdx = this.pendingQueue.findIndex((q) => !q.isFirstParty);
        if (firstThirdPartyIdx === -1) {
          this.pendingQueue.push(item);
        } else {
          this.pendingQueue.splice(firstThirdPartyIdx, 0, item);
        }
      } else {
        this.pendingQueue.push(item);
      }

      this.onStateUpdated?.();
      void this.pumpQueue();
    }
  }

  private async pumpQueue(): Promise<void> {
    if (this.activeExecution || this.pendingQueue.length === 0) return;

    const next = this.pendingQueue.shift()!;
    this.activeExecution = next;
    this.onStateUpdated?.();

    const startMs = Date.now();
    try {
      const port = this.ports.get(next.portId);
      if (!port || next.controller.signal.aborted) {
        return;
      }

      // Ensure requested installed model is loaded per OQ-13 = Option A
      await this.runtime.ensureModelLoadedForRequest(next.params.model, {
        isFirstParty: next.isFirstParty,
        allowCrossModelSwitch: this.settings.allowWebsiteModelSwitch
      });

      const completion = await this.runtime.executeChatCompletion(next.params, {
        requestId: next.providerRequestId,
        maxTokensCap: next.isFirstParty ? undefined : this.settings.websiteMaxTokens,
        signal: next.controller.signal,
        onChunk: (chunk) => {
          // Deliver chunk STRICTLY to the single originating port (FR-045, TC-029)
          const target = this.ports.get(next.portId);
          target?.send({
            channel: UOAI_BRIDGE_CHANNEL,
            type: "stream_chunk",
            clientRequestId: next.clientRequestId,
            providerRequestId: next.providerRequestId,
            chunk
          });
        }
      });

      const target = this.ports.get(next.portId);
      if (target) {
        if (next.params.stream) {
          target.send({
            channel: UOAI_BRIDGE_CHANNEL,
            type: "stream_done",
            clientRequestId: next.clientRequestId,
            providerRequestId: next.providerRequestId
          });
        } else {
          target.send({
            channel: UOAI_BRIDGE_CHANNEL,
            type: "api_response",
            clientRequestId: next.clientRequestId,
            providerRequestId: next.providerRequestId,
            data: completion
          });
        }
      }

      this.recordDiagnostic("api", "chat_completion_succeeded", {
        modelId: next.params.model,
        origin: next.isFirstParty ? "first_party" : next.origin,
        durationMs: Date.now() - startMs
      });
    } catch (err) {
      const uoaiErr =
        err instanceof UOAIError
          ? err
          : new UOAIError("internal_error", err instanceof Error ? err.message : undefined, {
              requestId: next.providerRequestId
            });
      this.recordDiagnostic("error", "chat_completion_failed", {
        code: uoaiErr.code,
        modelId: next.params.model,
        origin: next.isFirstParty ? "first_party" : next.origin,
        durationMs: Date.now() - startMs
      });
      this.sendErrorToPort(next.portId, next.clientRequestId, uoaiErr);
    } finally {
      this.activeExecution = null;
      this.onStateUpdated?.();
      if (this.pendingQueue.length > 0) {
        void this.pumpQueue();
      }
    }
  }

  private sendErrorToPort(portId: string, clientRequestId: string, err: UOAIError): void {
    const port = this.ports.get(portId);
    if (!port) return;
    try {
      port.send({
        channel: UOAI_BRIDGE_CHANNEL,
        type: "api_error",
        clientRequestId,
        providerRequestId: err.requestId ?? undefined,
        error: err.toPayload().error
      });
    } catch {
      // Ignore closed port
    }
  }
}

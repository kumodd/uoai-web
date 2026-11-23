import {
  UOAI_BRIDGE_CHANNEL,
  UOAI_SUPPORTED_PROTOCOL_VERSIONS
} from "@uoai/shared-types";
import {
  UOAIError,
  generateRequestId,
  validateChatCompletionParams,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionCreateParams,
  type HealthStatus,
  type LogicalOperation,
  type ModelListResponse,
  type ProviderEnvelope,
  type RuntimeStatus
} from "@uoai/api-protocol";
import {
  ExtensionRuntimePortTransport,
  WindowPostMessageTransport,
  type TransportLike
} from "@uoai/browser-bridge";

export {
  UOAIError,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionCreateParams,
  type HealthStatus,
  type ModelListResponse,
  type RuntimeStatus
};

export interface ConnectOptions {
  /** Connection handshake timeout in milliseconds (default 3000, FR-071). */
  timeoutMs?: number;
  /** Optional AbortSignal to cancel connection attempt. */
  signal?: AbortSignal;
  /** Optional extension ID for trusted first-party PWA externally_connectable transport. */
  extensionId?: string;
  /** Custom transport factory (used in tests and custom runtimes). */
  transportFactory?: () => TransportLike;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export type UOAIClientEvent =
  | "connected"
  | "disconnected"
  | "permission_revoked"
  | "runtime_status";

export interface UOAIStream extends AsyncIterable<ChatCompletionChunk> {
  readonly controller: AbortController;
}

type PendingRequest =
  | {
      kind: "unary";
      resolve: (data: unknown) => void;
      reject: (err: UOAIError) => void;
    }
  | {
      kind: "stream";
      push: (chunk: ChatCompletionChunk) => void;
      done: () => void;
      fail: (err: UOAIError) => void;
    };

/**
 * Connected UOAI provider client (FR-071 – FR-080).
 * Exposes an OpenAI-inspired logical API over browser extension messaging.
 */
export class UOAIClient {
  public readonly protocolVersion: string;
  public readonly providerVersion: string;

  private transport: TransportLike;
  private readonly transportFactory: () => TransportLike;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Map<UOAIClientEvent, Set<(payload?: unknown) => void>>();
  private unsubMessage: (() => void) | null = null;
  private unsubDisconnect: (() => void) | null = null;
  private revoked = false;
  private closed = false;
  private reconnectingPromise: Promise<void> | null = null;

  constructor(
    transport: TransportLike,
    transportFactory: () => TransportLike,
    protocolVersion: string,
    providerVersion: string
  ) {
    this.transport = transport;
    this.transportFactory = transportFactory;
    this.protocolVersion = protocolVersion;
    this.providerVersion = providerVersion;
    this.bindTransport(transport);
  }

  private bindTransport(transport: TransportLike): void {
    this.unsubMessage?.();
    this.unsubDisconnect?.();

    this.unsubMessage = transport.onMessage((msg: ProviderEnvelope) => {
      if (msg.type === "event") {
        if (msg.event === "permission_revoked") {
          this.revoked = true;
          this.failAllPending(new UOAIError("permission_revoked"));
          this.emit("permission_revoked");
          this.close();
          return;
        }
        if (msg.event === "runtime_status") {
          this.emit("runtime_status", msg.data);
          return;
        }
        if (msg.event === "disconnected") {
          this.handleDisconnect();
          return;
        }
      }

      if (msg.type === "api_response") {
        const entry = this.pending.get(msg.clientRequestId);
        if (entry?.kind === "unary") {
          this.pending.delete(msg.clientRequestId);
          entry.resolve(msg.data);
        }
        return;
      }

      if (msg.type === "api_error") {
        const entry = this.pending.get(msg.clientRequestId);
        if (entry) {
          this.pending.delete(msg.clientRequestId);
          const err = UOAIError.fromPayload({ error: msg.error });
          if (entry.kind === "unary") entry.reject(err);
          else entry.fail(err);
        }
        return;
      }

      if (msg.type === "stream_chunk") {
        const entry = this.pending.get(msg.clientRequestId);
        if (entry?.kind === "stream") {
          entry.push(msg.chunk);
        }
        return;
      }

      if (msg.type === "stream_done") {
        const entry = this.pending.get(msg.clientRequestId);
        if (entry?.kind === "stream") {
          this.pending.delete(msg.clientRequestId);
          entry.done();
        }
      }
    });

    this.unsubDisconnect = transport.onDisconnect(() => {
      this.handleDisconnect();
    });
  }

  private handleDisconnect(): void {
    if (this.closed || this.revoked) return;
    this.failAllPending(new UOAIError("connection_lost"));
    this.emit("disconnected");
  }

  private failAllPending(err: UOAIError): void {
    for (const [id, entry] of this.pending.entries()) {
      this.pending.delete(id);
      if (entry.kind === "unary") entry.reject(err);
      else entry.fail(err);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.revoked) throw new UOAIError("permission_revoked");
    if (this.closed) throw new UOAIError("connection_lost", "Client connection is closed.");
    if (this.reconnectingPromise) {
      return this.reconnectingPromise;
    }
    return;
  }

  /**
   * Transparent auto-reconnect after MV3 Service Worker idle restart (FR-072, TC-041).
   * Never auto-reconnects after permission revocation.
   */
  private async reconnectWithBackoff(): Promise<void> {
    if (this.revoked) throw new UOAIError("permission_revoked");
    if (this.closed) throw new UOAIError("connection_lost");
    if (this.reconnectingPromise) return this.reconnectingPromise;

    this.reconnectingPromise = (async () => {
      const maxAttempts = 5;
      let delayMs = 50;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (this.revoked || this.closed) throw new UOAIError("permission_revoked");
        try {
          this.transport.close();
          const next = this.transportFactory();
          await performHandshake(next, 2000);
          this.transport = next;
          this.bindTransport(next);
          this.emit("connected");
          return;
        } catch (err) {
          if (err instanceof UOAIError && err.code === "permission_revoked") {
            this.revoked = true;
            throw err;
          }
          if (attempt === maxAttempts) {
            throw err instanceof UOAIError ? err : new UOAIError("connection_lost");
          }
          await new Promise((r) => setTimeout(r, delayMs));
          delayMs *= 2;
        }
      }
    })().finally(() => {
      this.reconnectingPromise = null;
    });

    return this.reconnectingPromise;
  }

  private async callUnary<T>(
    operation: LogicalOperation,
    payload?: unknown,
    options?: RequestOptions,
    retryOnDisconnect: boolean = true
  ): Promise<T> {
    await this.ensureConnected();
    const clientRequestId = generateRequestId("cli");

    const run = () =>
      new Promise<T>((resolve, reject) => {
        if (options?.signal?.aborted) {
          reject(new UOAIError("generation_cancelled"));
          return;
        }

        const onAbort = () => {
          this.transport.send({
            channel: UOAI_BRIDGE_CHANNEL,
            type: "cancel",
            clientRequestId
          });
        };
        options?.signal?.addEventListener("abort", onAbort, { once: true });

        this.pending.set(clientRequestId, {
          kind: "unary",
          resolve: (data) => {
            options?.signal?.removeEventListener("abort", onAbort);
            resolve(data as T);
          },
          reject: (err) => {
            options?.signal?.removeEventListener("abort", onAbort);
            reject(err);
          }
        });

        this.transport.send({
          channel: UOAI_BRIDGE_CHANNEL,
          type: "api_request",
          clientRequestId,
          operation,
          payload
        });
      });

    try {
      return await run();
    } catch (err) {
      if (retryOnDisconnect && err instanceof UOAIError && err.code === "connection_lost" && !this.revoked) {
        await this.reconnectWithBackoff();
        return this.callUnary<T>(operation, payload, options, false);
      }
      throw err;
    }
  }

  private createStream(
    params: ChatCompletionCreateParams,
    options?: RequestOptions
  ): UOAIStream {
    const controller = new AbortController();
    const clientRequestId = generateRequestId("cli");

    const forwardExternalAbort = () => controller.abort(options?.signal?.reason);
    if (options?.signal?.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options?.signal?.addEventListener("abort", forwardExternalAbort, { once: true });
    }

    const buffer: ChatCompletionChunk[] = [];
    let ended = false;
    let failure: UOAIError | null = null;
    let notifyNext: (() => void) | null = null;

    const wake = () => {
      const fn = notifyNext;
      notifyNext = null;
      fn?.();
    };

    const sendCancel = () => {
      if (ended) return;
      this.transport.send({
        channel: UOAI_BRIDGE_CHANNEL,
        type: "cancel",
        clientRequestId
      });
    };

    controller.signal.addEventListener("abort", sendCancel, { once: true });

    this.pending.set(clientRequestId, {
      kind: "stream",
      push: (chunk) => {
        buffer.push(chunk);
        wake();
      },
      done: () => {
        ended = true;
        options?.signal?.removeEventListener("abort", forwardExternalAbort);
        wake();
      },
      fail: (err) => {
        failure = err;
        ended = true;
        options?.signal?.removeEventListener("abort", forwardExternalAbort);
        wake();
      }
    });

    this.transport.send({
      channel: UOAI_BRIDGE_CHANNEL,
      type: "api_request",
      clientRequestId,
      operation: "POST /v1/chat/completions",
      payload: { ...params, stream: true }
    });

    const self = this;
    const stream: UOAIStream = {
      controller,
      [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
        return {
          async next(): Promise<IteratorResult<ChatCompletionChunk>> {
            while (buffer.length === 0 && !ended) {
              await new Promise<void>((r) => {
                notifyNext = r;
              });
            }
            if (buffer.length > 0) {
              return { value: buffer.shift()!, done: false };
            }
            if (failure) {
              throw failure;
            }
            return { value: undefined, done: true };
          },
          async return(): Promise<IteratorResult<ChatCompletionChunk>> {
            // Breaking out of `for await` cancels the generation cleanly (FR-075, TC-040)
            if (!ended) {
              controller.abort("generation_cancelled");
              self.pending.delete(clientRequestId);
              ended = true;
            }
            return { value: undefined, done: true };
          }
        };
      }
    };

    return stream;
  }

  public readonly health = {
    check: (options?: RequestOptions): Promise<HealthStatus> =>
      this.callUnary<HealthStatus>("GET /v1/health", undefined, options)
  };

  public readonly runtime = {
    get: (options?: RequestOptions): Promise<RuntimeStatus> =>
      this.callUnary<RuntimeStatus>("GET /v1/runtime", undefined, options)
  };

  public readonly models = {
    list: (options?: RequestOptions): Promise<ModelListResponse> =>
      this.callUnary<ModelListResponse>("GET /v1/models", undefined, options)
  };

  public readonly chat = {
    completions: {
      create: (((
        params: ChatCompletionCreateParams,
        options?: RequestOptions
      ): Promise<ChatCompletion | UOAIStream> => {
        // Validate client-side before sending
        const validated = validateChatCompletionParams(params);
        if (validated.stream) {
          return this.ensureConnected().then(() => this.createStream(validated, options));
        }
        return this.callUnary<ChatCompletion>(
          "POST /v1/chat/completions",
          { ...validated, stream: false },
          options
        );
      }) as unknown) as {
        (
          params: ChatCompletionCreateParams & { stream: true },
          options?: RequestOptions
        ): Promise<UOAIStream>;
        (
          params: ChatCompletionCreateParams & { stream?: false },
          options?: RequestOptions
        ): Promise<ChatCompletion>;
      }
    }
  };

  on(event: UOAIClientEvent, handler: (payload?: unknown) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  private emit(event: UOAIClientEvent, payload?: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of set) h(payload);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubMessage?.();
    this.unsubDisconnect?.();
    this.failAllPending(new UOAIError("connection_lost", "Client closed."));
    this.transport.close();
    this.listeners.clear();
  }
}

async function performHandshake(
  transport: TransportLike,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ protocolVersion: string; providerVersion: string }> {
  const nonce = generateRequestId("hs");

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UOAIError("generation_cancelled", "Connection cancelled."));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new UOAIError(
          "extension_not_detected",
          "UOAI extension was not detected or this origin is not authorized. Install UOAI or click the UOAI toolbar icon to allow this site."
        )
      );
    }, timeoutMs);

    const onAbort = () => {
      cleanup();
      reject(new UOAIError("generation_cancelled", "Connection cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const unsubMsg = transport.onMessage((msg) => {
      if (msg.type === "handshake_ack" && msg.nonce === nonce) {
        cleanup();
        resolve({
          protocolVersion: msg.protocolVersion,
          providerVersion: msg.providerVersion
        });
      } else if (msg.type === "handshake_error" && msg.nonce === nonce) {
        cleanup();
        reject(UOAIError.fromPayload({ error: msg.error }));
      }
    });

    const unsubDisc = transport.onDisconnect(() => {
      cleanup();
      reject(new UOAIError("extension_not_detected"));
    });

    const cleanup = () => {
      clearTimeout(timer);
      unsubMsg();
      unsubDisc();
      signal?.removeEventListener("abort", onAbort);
    };

    transport.send({
      channel: UOAI_BRIDGE_CHANNEL,
      type: "handshake_init",
      nonce,
      sdkProtocolVersions: [...UOAI_SUPPORTED_PROTOCOL_VERSIONS]
    });
  });
}

function createDefaultTransportFactory(options?: ConnectOptions): () => TransportLike {
  if (options?.transportFactory) {
    return options.transportFactory;
  }
  if (options?.extensionId) {
    return () => new ExtensionRuntimePortTransport(options.extensionId);
  }
  // If running inside an extension page itself, connect directly via chrome.runtime.connect
  if (
    typeof window !== "undefined" &&
    window.location?.protocol === "chrome-extension:" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome?.runtime?.connect
  ) {
    return () => new ExtensionRuntimePortTransport();
  }
  return () => new WindowPostMessageTransport(window);
}

/**
 * Primary public entrypoint for developers integrating UOAI (FR-070 – FR-072).
 */
export const UOAI = {
  /**
   * Non-throwing availability check (FR-070, FR-071, TC-045).
   * Safely resolves `false` on Firefox/Safari or when extension/permission is missing.
   */
  async isAvailable(options?: ConnectOptions): Promise<boolean> {
    if (typeof window === "undefined" && !options?.transportFactory) {
      return false;
    }
    try {
      const client = await UOAI.connect({
        ...options,
        timeoutMs: options?.timeoutMs ?? 600
      });
      client.close();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Connect to the local UOAI extension provider and negotiate protocol version.
   */
  async connect(options?: ConnectOptions): Promise<UOAIClient> {
    if (typeof window === "undefined" && !options?.transportFactory) {
      throw new UOAIError("browser_unsupported", "UOAI SDK requires a browser environment.");
    }
    const timeoutMs = options?.timeoutMs ?? 3000;
    const factory = createDefaultTransportFactory(options);
    let transport: TransportLike;
    try {
      transport = factory();
    } catch {
      throw new UOAIError("extension_not_detected");
    }

    try {
      const ack = await performHandshake(transport, timeoutMs, options?.signal);
      return new UOAIClient(transport, factory, ack.protocolVersion, ack.providerVersion);
    } catch (err) {
      transport.close();
      throw err;
    }
  },

  /**
   * Opens the extension's parameter-validated consent page (OQ-04 Option B).
   * Must be called inside a user click event handler.
   */
  openAuthorizeWindow(extensionId: string): Window | null {
    if (typeof window === "undefined") return null;
    const origin = encodeURIComponent(window.location.origin);
    const url = `chrome-extension://${encodeURIComponent(extensionId)}/authorize.html?origin=${origin}`;
    return window.open(url, "uoai-authorize", "width=460,height=620,noopener=no");
  }
};

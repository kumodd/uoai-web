import { UOAI_BRIDGE_CHANNEL, UOAI_PORT_NAME } from "@uoai/shared-types";
import {
  ClientEnvelopeSchema,
  ProviderEnvelopeSchema,
  type ClientEnvelope,
  type ProviderEnvelope
} from "@uoai/api-protocol";

export interface TransportLike {
  send(message: ClientEnvelope): void;
  onMessage(handler: (message: ProviderEnvelope) => void): () => void;
  onDisconnect(handler: () => void): () => void;
  close(): void;
}

/**
 * Page-side transport communicating with the isolated-world Content-Script Bridge
 * strictly via window.postMessage targeting window.location.origin (never "*") (FR-067, T-03).
 */
export class WindowPostMessageTransport implements TransportLike {
  private readonly messageHandlers = new Set<(msg: ProviderEnvelope) => void>();
  private readonly disconnectHandlers = new Set<() => void>();
  private readonly listener: (event: MessageEvent) => void;
  private closed = false;

  constructor(private readonly targetWindow: Window = window) {
    this.listener = (event: MessageEvent) => {
      if (this.closed) return;
      // Strict security checks (FR-067, T-03)
      if (event.source !== this.targetWindow) return;
      if (event.origin !== this.targetWindow.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.channel !== UOAI_BRIDGE_CHANNEL) return;
      const parsed = ProviderEnvelopeSchema.safeParse(event.data);
      if (!parsed.success) return;
      for (const h of this.messageHandlers) {
        h(parsed.data);
      }
      if (parsed.data.type === "event" && parsed.data.event === "disconnected") {
        for (const h of this.disconnectHandlers) h();
      }
    };
    this.targetWindow.addEventListener("message", this.listener);
  }

  send(message: ClientEnvelope): void {
    if (this.closed) return;
    // Never pass "*" as targetOrigin (FR-067, T-03)
    this.targetWindow.postMessage(message, this.targetWindow.location.origin);
  }

  onMessage(handler: (message: ProviderEnvelope) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.targetWindow.removeEventListener("message", this.listener);
    this.messageHandlers.clear();
    this.disconnectHandlers.clear();
  }
}

/**
 * Direct chrome.runtime.connect transport for the trusted first-party PWA origin
 * (externally_connectable) or extension-packaged Dashboard pages (ADR-004).
 */
export class ExtensionRuntimePortTransport implements TransportLike {
  private readonly messageHandlers = new Set<(msg: ProviderEnvelope) => void>();
  private readonly disconnectHandlers = new Set<() => void>();
  private port: chrome.runtime.Port | null = null;
  private closed = false;

  constructor(extensionId?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = (globalThis as any).chrome?.runtime;
    if (!runtime?.connect) {
      throw new Error("chrome.runtime.connect is unavailable in this context.");
    }
    this.port = extensionId
      ? runtime.connect(extensionId, { name: UOAI_PORT_NAME })
      : runtime.connect({ name: UOAI_PORT_NAME });

    this.port!.onMessage.addListener((raw: unknown) => {
      if (this.closed) return;
      const parsed = ProviderEnvelopeSchema.safeParse(raw);
      if (!parsed.success) return;
      for (const h of this.messageHandlers) h(parsed.data);
    });

    this.port!.onDisconnect.addListener(() => {
      this.port = null;
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h();
      }
    });
  }

  send(message: ClientEnvelope): void {
    if (this.closed || !this.port) return;
    this.port.postMessage(message);
  }

  onMessage(handler: (message: ProviderEnvelope) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.port?.disconnect();
    } catch {
      // Ignore already disconnected port
    }
    this.port = null;
    this.messageHandlers.clear();
    this.disconnectHandlers.clear();
  }
}

/**
 * Isolated-world Content-Script Bridge (FR-067, T-03, ADR-004).
 * Relays validated envelopes between the web page and the extension Service Worker.
 * Never exposes chrome.* APIs to the page and never posts with targetOrigin "*".
 */
export function attachContentScriptBridge(
  win: Window = window,
  connectPort: () => chrome.runtime.Port = () => chrome.runtime.connect({ name: UOAI_PORT_NAME })
): () => void {
  let port: chrome.runtime.Port | null = null;

  const ensurePort = (): chrome.runtime.Port => {
    if (port) return port;
    port = connectPort();
    port.onMessage.addListener((raw: unknown) => {
      const parsed = ProviderEnvelopeSchema.safeParse(raw);
      if (!parsed.success) return;
      win.postMessage(parsed.data, win.location.origin);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      const disconnectedEvent: ProviderEnvelope = {
        channel: UOAI_BRIDGE_CHANNEL,
        type: "event",
        event: "disconnected"
      };
      win.postMessage(disconnectedEvent, win.location.origin);
    });
    return port;
  };

  const onWindowMessage = (event: MessageEvent) => {
    if (event.source !== win) return;
    if (event.origin !== win.location.origin) return;
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.channel !== UOAI_BRIDGE_CHANNEL) return;
    const parsed = ClientEnvelopeSchema.safeParse(event.data);
    if (!parsed.success) return;
    try {
      ensurePort().postMessage(parsed.data);
    } catch {
      port = null;
    }
  };

  win.addEventListener("message", onWindowMessage);

  // Announce bridge presence to page so SDK knows permission is granted
  const grantedEvent: ProviderEnvelope = {
    channel: UOAI_BRIDGE_CHANNEL,
    type: "event",
    event: "permission_granted"
  };
  win.postMessage(grantedEvent, win.location.origin);

  return () => {
    win.removeEventListener("message", onWindowMessage);
    try {
      port?.disconnect();
    } catch {
      // Ignore
    }
    port = null;
  };
}

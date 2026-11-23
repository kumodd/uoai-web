/**
 * Visible Extension Runtime Host (OQ-02 = Option B, ADR-002).
 * Loaded inside chrome-extension://<id>/app.html (both full Dashboard tab and chrome.sidePanel).
 * Spawns the dedicated Inference Web Worker and bridges it to the MV3 Service Worker over a Port.
 */
import { UOAI_RUNTIME_HOST_PORT_NAME } from "@uoai/shared-types";

function bootRuntimeHost(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return;
  // Prevent duplicate workers if script runs twice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).__UOAI_RUNTIME_HOST_BOOTED__) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__UOAI_RUNTIME_HOST_BOOTED__ = true;

  let worker = new Worker(chrome.runtime.getURL("inference.worker.js"), { type: "module" });
  let swPort: chrome.runtime.Port | null = null;

  const wireWorker = (w: Worker) => {
    w.onmessage = (event: MessageEvent) => {
      try {
        swPort?.postMessage(event.data);
      } catch {
        // SW may have restarted; reconnect
        connectToServiceWorker();
      }
    };
    w.onerror = () => {
      try {
        swPort?.postMessage({ type: "worker_crashed" });
      } catch {
        // Ignore
      }
      // Recreate worker cleanly (FR-049)
      worker.terminate();
      worker = new Worker(chrome.runtime.getURL("inference.worker.js"), { type: "module" });
      wireWorker(worker);
    };
  };

  const connectToServiceWorker = () => {
    try {
      swPort = chrome.runtime.connect({ name: UOAI_RUNTIME_HOST_PORT_NAME });
      swPort.onMessage.addListener((msg: unknown) => {
        worker.postMessage(msg);
      });
      swPort.onDisconnect.addListener(() => {
        swPort = null;
        // Reconnect quickly when MV3 SW wakes up
        setTimeout(connectToServiceWorker, 250);
      });
    } catch {
      setTimeout(connectToServiceWorker, 1000);
    }
  };

  wireWorker(worker);
  connectToServiceWorker();
}

bootRuntimeHost();

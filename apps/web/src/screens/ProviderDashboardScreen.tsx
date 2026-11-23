import React from "react";
import { formatBytes } from "@uoai/model-registry";
import { Badge, Button, Card, ErrorAlert } from "@uoai/ui";
import { useDashboardStore } from "../store/useDashboardStore";

export const ProviderDashboardScreen: React.FC = () => {
  const {
    snapshot,
    unloadModel,
    restartRuntime,
    cancelQueuedRequest,
    runCapabilityCheck
  } = useDashboardStore();

  const { runtime, offlineReadiness, capabilities } = snapshot;

  return (
    <div className="space-y-6">
      {runtime.state === "error" && (
        <ErrorAlert
          code={runtime.lastErrorCode ?? "runtime_unavailable"}
          actionLabel="Reset & Restart Runtime"
          onAction={() => void restartRuntime()}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title="Local Inference Runtime"
          subtitle="FR-047 & ADR-002 — Dedicated Web Worker executing inside the visible extension host."
          actions={
            <div className="flex gap-2">
              {runtime.loadedModel && (
                <Button size="sm" variant="secondary" onClick={() => void unloadModel()}>
                  Unload Model
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => void restartRuntime()}>
                Restart Runtime
              </Button>
            </div>
          }
        >
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Runtime State</dt>
              <dd className="mt-0.5 font-semibold" role="status">
                <Badge
                  tone={
                    runtime.state === "ready" || runtime.state === "generating"
                      ? "success"
                      : runtime.state === "error"
                        ? "danger"
                        : "info"
                  }
                >
                  {runtime.state}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Loaded Model</dt>
              <dd className="mt-0.5 font-mono text-xs">
                {runtime.loadedModel ?? "None (0 MB GPU memory in use)"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">WebGPU Acceleration</dt>
              <dd className="mt-0.5">{runtime.webgpuAvailable ? "Available" : "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Idle Auto-Unload Policy</dt>
              <dd className="mt-0.5">
                {snapshot.settings.idleUnloadMinutes > 0
                  ? `${snapshot.settings.idleUnloadMinutes} minutes`
                  : "Disabled (Manual)"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Offline Readiness Checklist"
          subtitle="FR-100 – FR-103 — All local dependencies checked with zero network requests."
          actions={
            <Badge
              tone={
                offlineReadiness.status === "offline_ready"
                  ? "success"
                  : offlineReadiness.status === "partially_ready"
                    ? "warning"
                    : "danger"
              }
            >
              {offlineReadiness.status.replace(/_/g, " ")}
            </Badge>
          }
        >
          <ul className="space-y-2 text-sm">
            {offlineReadiness.checks.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-slate-500">{c.detail}</p>
                </div>
                <Badge tone={c.passed ? "success" : "danger"}>{c.passed ? "Pass" : "Missing"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Priority-FIFO Request Queue Monitor"
        subtitle="BR-09, BR-10, OQ-10 Option B — 1 active generation max, up to 5 pending globally (2 per origin). Workspace prioritized."
      >
        {!runtime.activeRequest && runtime.pendingQueue.length === 0 ? (
          <p className="text-sm text-slate-500">Queue is empty. No active or pending inference requests.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {[...(runtime.activeRequest ? [runtime.activeRequest] : []), ...runtime.pendingQueue].map(
              (item) => (
                <div
                  key={item.requestId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div>
                    <p className="font-mono text-xs">
                      {item.requestId} • <strong>{item.origin}</strong> ({item.model})
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.isFirstParty ? "First-Party Priority" : "Third-Party Website"} • Enqueued{" "}
                      {new Date(item.enqueuedAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={item.status === "active" ? "info" : "neutral"}>{item.status}</Badge>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={`Cancel request from ${item.origin}`}
                      onClick={() => void cancelQueuedRequest(item.requestId)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </Card>

      <Card
        title="Hardware & WebGPU Profile"
        subtitle="FR-002 & FR-003"
        actions={
          <Button size="sm" variant="secondary" onClick={() => void runCapabilityCheck()}>
            Re-run Capability Check
          </Button>
        }
      >
        {capabilities ? (
          <div className="grid gap-3 text-xs sm:grid-cols-2 md:grid-cols-3">
            <div>
              <span className="text-slate-500">Browser:</span>{" "}
              <strong>
                {capabilities.browserName} {capabilities.browserVersion}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">WebGPU Status:</span>{" "}
              <strong>{capabilities.webgpu.status}</strong>
            </div>
            <div>
              <span className="text-slate-500">GPU Adapter:</span>{" "}
              <strong>{capabilities.webgpu.adapterDescription ?? "Unavailable"}</strong>
            </div>
            <div>
              <span className="text-slate-500">maxBufferSize:</span>{" "}
              <strong>{formatBytes(capabilities.webgpu.limits.maxBufferSize)}</strong>
            </div>
            <div>
              <span className="text-slate-500">maxStorageBufferBindingSize:</span>{" "}
              <strong>{formatBytes(capabilities.webgpu.limits.maxStorageBufferBindingSize)}</strong>
            </div>
            <div>
              <span className="text-slate-500">shader-f16:</span>{" "}
              <strong>{capabilities.webgpu.features.includes("shader-f16") ? "Supported" : "Not present"}</strong>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Click Re-run Capability Check to inspect hardware limits.</p>
        )}
      </Card>
    </div>
  );
};

import React, { useMemo, useState } from "react";
import {
  assessModelCompatibility,
  formatBytes,
  getBundledLicenseText,
  type ModelManifest
} from "@uoai/model-registry";
import { Badge, Button, Card, ModalDialog, ProgressBar } from "@uoai/ui";
import { useDashboardStore } from "../store/useDashboardStore";

export const ModelLibraryScreen: React.FC = () => {
  const {
    snapshot,
    isOnline,
    acceptLicense,
    downloadModel,
    pauseDownload,
    cancelDownload,
    verifyModel,
    loadModel,
    unloadModel,
    removeModel
  } = useDashboardStore();

  const [filter, setFilter] = useState<"all" | "installed" | "compatible">("all");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "general" | "coding" | "reasoning" | "lightweight" | "testing"
  >("all");
  const [search, setSearch] = useState("");
  const [detailsModel, setDetailsModel] = useState<ModelManifest | null>(null);
  const [licenseModalModel, setLicenseModalModel] = useState<ModelManifest | null>(null);
  const [removeConfirmModel, setRemoveConfirmModel] = useState<ModelManifest | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const totalUsedBytes = Object.values(snapshot.usedBytesByModel).reduce((a, b) => a + b, 0);

  const filteredModels = useMemo(() => {
    return snapshot.registry.models.filter((m) => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) {
        return false;
      }
      if (
        search &&
        !m.name.toLowerCase().includes(search.toLowerCase()) &&
        !m.id.toLowerCase().includes(search.toLowerCase()) &&
        !m.description.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      const st = snapshot.modelStates[m.id]?.status ?? "not_installed";
      if (filter === "installed") {
        return st === "ready" || st === "loaded" || st === "missing_files";
      }
      if (filter === "compatible" && snapshot.capabilities) {
        const a = assessModelCompatibility(m, snapshot.capabilities, {
          allowOverride: snapshot.settings.allowIncompatibleDownloadOverride
        });
        return a.classification !== "incompatible";
      }
      return true;
    });
  }, [snapshot, filter, categoryFilter, search]);

  const isAccepted = (m: ModelManifest) =>
    !m.license.requires_acceptance ||
    snapshot.licenseAcceptances.some(
      (rec) => rec.modelId === m.id && rec.licenseVersion === m.license.version
    );

  return (
    <div className="space-y-6">
      <Card
        title="Local Model Storage Summary"
        subtitle="FR-023 & FR-106 — Models are stored once in extension-origin storage and shared across authorized sites."
      >
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-xs text-slate-500">UOAI Model Storage</p>
            <p className="text-lg font-semibold">{formatBytes(totalUsedBytes)}</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-xs text-slate-500">Estimated Browser Available Quota</p>
            <p className="text-lg font-semibold">
              {snapshot.capabilities
                ? formatBytes(snapshot.capabilities.storage.availableBytes)
                : "Not checked"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-xs text-slate-500">Storage Persistence Status</p>
            <p className="text-lg font-semibold">
              {snapshot.capabilities?.storage.persisted === true
                ? "Persisted (Eviction-resistant)"
                : "Not Guaranteed (Browser-managed)"}
            </p>
          </div>
        </div>
      </Card>

      {verifyNotice && (
        <div role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
          {verifyNotice}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "installed", "compatible"] as const).map((tab) => (
            <Button
              key={tab}
              size="sm"
              variant={filter === tab ? "primary" : "secondary"}
              onClick={() => setFilter(tab)}
            >
              {tab === "all" ? `All Models (${snapshot.registry.models.length})` : tab === "installed" ? "Installed" : "Compatible"}
            </Button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search WebGPU models (Qwen, Gemma, Llama, Phi, Coder…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          aria-label="Filter models"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-slate-500">Specialty:</span>
        {(["all", "lightweight", "general", "coding", "reasoning", "testing"] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-full px-2.5 py-1 font-medium capitalize transition-colors ${
              categoryFilter === cat
                ? "bg-indigo-600 text-white"
                : "bg-slate-200/70 text-slate-700 hover:bg-slate-300/70 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filteredModels.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            {filter === "installed"
              ? "No models installed yet. Switch to All Qualified Models to download a compatible model."
              : "No models match your filter."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredModels.map((model) => {
            const st = snapshot.modelStates[model.id];
            const status = st?.status ?? "not_installed";
            const isLoaded = snapshot.runtime.loadedModel === model.id;
            const compat = snapshot.capabilities
              ? assessModelCompatibility(model, snapshot.capabilities, {
                  allowOverride: snapshot.settings.allowIncompatibleDownloadOverride
                })
              : null;

            return (
              <article
                key={model.id}
                aria-label={model.name}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{model.name}</h3>
                      <p className="font-mono text-xs text-slate-500">
                        {model.id} • v{model.version} • {model.publisher}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {model.category && <Badge tone="neutral">{model.category}</Badge>}
                      {isLoaded && <Badge tone="info">Loaded</Badge>}
                      {!isLoaded && status === "ready" && <Badge tone="success">Ready Offline</Badge>}
                      {status === "failed_integrity" && <Badge tone="danger">Integrity Failed</Badge>}
                      {status === "missing_files" && <Badge tone="danger">Missing Files</Badge>}
                      {compat && (
                        <Badge
                          tone={
                            compat.classification === "compatible"
                              ? "success"
                              : compat.classification === "compatible_with_limitations"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {compat.classification.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-300">{model.description}</p>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                    <div>
                      <span className="text-slate-500">Download Size:</span>{" "}
                      <strong>{formatBytes(model.hardware_requirements.estimated_download_size_bytes)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Quantization:</span>{" "}
                      <strong>{model.quantization}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Context (Default / Max):</span>{" "}
                      <strong>
                        {model.context_length.uoai_default} / {model.context_length.max_supported}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">License:</span>{" "}
                      <strong>{model.license.name}</strong>
                    </div>
                  </div>

                  {compat && compat.classification !== "compatible" && (
                    <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-300">
                      {compat.reasons.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  )}

                  {(status === "downloading" ||
                    status === "verifying" ||
                    status === "installing" ||
                    status === "paused") &&
                    st && (
                      <div className="pt-2">
                        <ProgressBar
                          value={st.percent ?? 0}
                          label={
                            status === "verifying"
                              ? "Verifying SHA-256 hashes…"
                              : status === "installing"
                                ? "Committing verified model to local storage…"
                                : status === "paused"
                                  ? `Paused (${formatBytes(st.downloadedBytes ?? 0)} / ${formatBytes(st.totalBytes || model.hardware_requirements.estimated_download_size_bytes)})`
                                  : `Downloading ${st.currentFile ?? ""}`
                          }
                          valueText={`${st.percent ?? 0}%${
                            status === "downloading" && st.bytesPerSecond
                              ? ` • ${formatBytes(st.bytesPerSecond)}/s${st.etaSeconds ? ` • ~${st.etaSeconds}s` : ""}`
                              : ""
                          }`}
                        />
                      </div>
                    )}

                  {(status === "failed_download" || status === "failed_integrity") && st?.errorMessage && (
                    <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                      {st.errorMessage}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {status === "ready" || isLoaded ? (
                    <>
                      {isLoaded ? (
                        <Button size="sm" variant="secondary" onClick={() => void unloadModel()}>
                          Unload Model
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={snapshot.runtime.state === "loading_model"}
                          onClick={() => void loadModel(model.id)}
                        >
                          Load Model
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const res = await verifyModel(model.id, true);
                          setVerifyNotice(
                            res.valid
                              ? `SHA-256 verification PASSED for ${model.id}.`
                              : `Verification FAILED for ${model.id}: ${res.reason}`
                          );
                        }}
                      >
                        Verify SHA-256
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setRemoveConfirmModel(model)}>
                        Remove
                      </Button>
                    </>
                  ) : status === "downloading" || status === "verifying" || status === "installing" ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={status !== "downloading"}
                        onClick={() => void pauseDownload(model.id)}
                      >
                        Pause
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void cancelDownload(model.id)}>
                        Cancel
                      </Button>
                    </>
                  ) : status === "paused" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={!isOnline}
                        onClick={() => void downloadModel(model.id)}
                      >
                        {!isOnline ? "Requires Internet" : "Resume Download"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void cancelDownload(model.id)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!isOnline || (compat ? !compat.canDownload : false)}
                      onClick={() => {
                        if (!isAccepted(model)) {
                          setLicenseModalModel(model);
                        } else {
                          void downloadModel(model.id);
                        }
                      }}
                    >
                      {!isOnline
                        ? "Requires Internet"
                        : status === "failed_download" || status === "failed_integrity"
                          ? "Retry Download"
                          : "Download Model"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDetailsModel(model)}>
                    Details &amp; License
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      <ModalDialog
        open={Boolean(detailsModel)}
        title={detailsModel?.name ?? ""}
        onClose={() => setDetailsModel(null)}
      >
        {detailsModel && (
          <div className="space-y-3 text-sm">
            <p>{detailsModel.description}</p>
            <p className="text-xs text-slate-500">
              <strong>API ID:</strong> <code>{detailsModel.id}</code> • <strong>Version:</strong>{" "}
              {detailsModel.version} • <strong>Adapter:</strong> {detailsModel.adapter}
            </p>
            <p className="text-xs">
              <strong>Intended Uses:</strong> {detailsModel.intended_uses}
            </p>
            <p className="text-xs">
              <strong>Limitations:</strong> {detailsModel.limitations}
            </p>
            <div>
              <p className="text-xs font-semibold">Artifacts (SHA-256 Verified)</p>
              <ul className="mt-1 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {detailsModel.artifacts.map((a) => (
                  <li key={a.path}>
                    {a.path} ({formatBytes(a.size_bytes)}) — {a.sha256.slice(0, 16)}…
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold">Offline License Copy ({detailsModel.license.name})</p>
              <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-2.5 text-xs dark:bg-slate-800">
                {getBundledLicenseText(detailsModel.license.bundled_license_path)}
              </pre>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Mandatory License Acceptance Modal (FR-015, BR-19) */}
      <ModalDialog
        open={Boolean(licenseModalModel)}
        title={`Accept License: ${licenseModalModel?.license.name ?? ""}`}
        role="alertdialog"
        onClose={() => setLicenseModalModel(null)}
      >
        {licenseModalModel && (
          <div className="space-y-4 text-sm">
            <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">
              {getBundledLicenseText(licenseModalModel.license.bundled_license_path)}
            </pre>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLicenseModalModel(null)}>
                Decline
              </Button>
              <Button
                onClick={async () => {
                  const m = licenseModalModel;
                  setLicenseModalModel(null);
                  await acceptLicense(m.id, m.license.id, m.license.version);
                  await downloadModel(m.id);
                }}
              >
                Accept &amp; Start Download
              </Button>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Remove Confirmation Modal (FR-020) */}
      <ModalDialog
        open={Boolean(removeConfirmModel)}
        title={`Remove ${removeConfirmModel?.name ?? ""}?`}
        role="alertdialog"
        onClose={() => setRemoveConfirmModel(null)}
      >
        {removeConfirmModel && (
          <div className="space-y-4 text-sm">
            <p>
              This will free approximately{" "}
              <strong>
                {formatBytes(
                  snapshot.usedBytesByModel[removeConfirmModel.id] ??
                    removeConfirmModel.hardware_requirements.estimated_download_size_bytes
                )}
              </strong>{" "}
              of local storage. Re-downloading later will require an internet connection.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoveConfirmModel(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const id = removeConfirmModel.id;
                  setRemoveConfirmModel(null);
                  await removeModel(id);
                }}
              >
                Remove Model
              </Button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};

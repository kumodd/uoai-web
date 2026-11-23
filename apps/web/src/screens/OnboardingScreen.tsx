import React, { useMemo, useState } from "react";
import { assessModelCompatibility, formatBytes } from "@uoai/model-registry";
import { Badge, Button, Card, ErrorAlert, ProgressBar } from "@uoai/ui";
import { useDashboardStore } from "../store/useDashboardStore";

export const OnboardingScreen: React.FC = () => {
  const {
    snapshot,
    isOnline,
    runCapabilityCheck,
    acceptLicense,
    downloadModel,
    pauseDownload,
    cancelDownload,
    loadModel,
    sendPrompt,
    updateSettings,
    setScreen,
    refreshSnapshot
  } = useDashboardStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [samplePrompt, setSamplePrompt] = useState(
    "Explain how WebGPU runs local AI offline in two sentences."
  );
  const [sampleReply, setSampleReply] = useState<string>("");
  const [runningSample, setRunningSample] = useState(false);
  const [loadingStepModel, setLoadingStepModel] = useState(false);
  const [licenseChecked, setLicenseChecked] = useState(false);

  const capabilities = snapshot.capabilities;

  const recommendedModel = useMemo(() => {
    // 1. Prefer whichever model is already loaded in the runtime
    if (snapshot.runtime.loadedModel) {
      const loaded = snapshot.registry.models.find((m) => m.id === snapshot.runtime.loadedModel);
      if (loaded) return loaded;
    }
    // 2. Otherwise prefer any model already verified & installed offline
    const installed = snapshot.registry.models.find((m) => {
      const st = snapshot.modelStates[m.id]?.status;
      return st === "ready" || st === "loaded";
    });
    if (installed) return installed;

    // 3. Otherwise pick a qualified compatible model first (prefer SmolLM2 / fast setup over 3.1 GB candidate)
    if (!capabilities) {
      return (
        snapshot.registry.models.find((m) => m.id === "smollm2-360m-instruct") ??
        snapshot.registry.models[0] ??
        null
      );
    }
    const compatible = snapshot.registry.models.filter((m) => {
      const a = assessModelCompatibility(m, capabilities);
      return a.classification === "compatible" || a.classification === "compatible_with_limitations";
    });
    return (
      compatible.find((m) => m.status === "qualified") ??
      compatible[0] ??
      null
    );
  }, [capabilities, snapshot.modelStates, snapshot.registry.models, snapshot.runtime.loadedModel]);

  const modelState = recommendedModel ? snapshot.modelStates[recommendedModel.id] : undefined;

  if (!snapshot.extensionDetected) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card
          title="Install the Universal Offline AI (UOAI) Extension"
          subtitle="FR-004 — The Chromium MV3 browser extension is required as the local AI provider."
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            UOAI runs AI models locally inside your browser without a native desktop app, Docker, or
            cloud API keys. Install or enable the UOAI Chromium extension, then check again.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void refreshSnapshot()}>I&apos;ve Installed It — Check Again</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          [1, "1. Welcome"],
          [2, "2. System Check"],
          [3, "3. Download Model"],
          [4, "4. Test Local AI"],
          [5, "5. Offline Ready"]
        ].map(([num, label]) => (
          <Badge key={num} tone={step === num ? "info" : step > Number(num) ? "success" : "neutral"}>
            {label}
          </Badge>
        ))}
      </div>

      {step === 1 && (
        <Card
          title="Welcome to Universal Offline AI (UOAI)"
          subtitle="Private, offline-first AI running locally in your browser."
        >
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <li>• <strong>100% Local Inference:</strong> Your prompts and conversations never leave your device.</li>
            <li>• <strong>Offline After Setup:</strong> Internet is used only once to download verified model files.</li>
            <li>• <strong>Zero Cloud Fallback &amp; Zero Telemetry:</strong> No accounts, subscriptions, or API keys.</li>
            <li>• <strong>You Control Website Access:</strong> Websites can use your local AI only when you approve them.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                await runCapabilityCheck();
                setStep(2);
              }}
            >
              Get Started
            </Button>
            <Button variant="secondary" onClick={() => setScreen("settings")}>
              Learn About Privacy
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card
          title="Browser & WebGPU Capability Check"
          subtitle="FR-002 & FR-003 — Verified directly inside the dedicated worker execution context."
          actions={
            <Button size="sm" variant="secondary" onClick={() => void runCapabilityCheck()}>
              Re-run Check
            </Button>
          }
        >
          {capabilities ? (
            <div className="space-y-4">
              <div className="space-y-2">
                {capabilities.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="flex items-start justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
                  >
                    <div>
                      <p className="font-medium">{chk.label}</p>
                      <p className="text-xs text-slate-500">{chk.message}</p>
                      {chk.remedy && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{chk.remedy}</p>}
                    </div>
                    <Badge tone={chk.status === "pass" ? "success" : chk.status === "warn" ? "warning" : "danger"}>
                      {chk.status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>

              {capabilities.webgpu.status === "unsupported" ? (
                <ErrorAlert
                  code="webgpu_unavailable"
                  message="WebGPU hardware acceleration is unavailable on this browser or GPU. Downloads for WebGPU models are disabled."
                />
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setScreen("models")}>
                    Browse Full Library
                  </Button>
                  <Button onClick={() => setStep(3)}>Continue to Model Setup</Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Running capability checks…</p>
          )}
        </Card>
      )}

      {step === 3 && (
        <Card
          title="Download Your First Qualified Model"
          subtitle="FR-006 — Verified with streaming SHA-256 hashes before installation."
        >
          {!recommendedModel ? (
            <ErrorAlert
              code="insufficient_resources"
              message="No catalog model fits your detected WebGPU/storage limits."
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{recommendedModel.name}</h3>
                    <p className="text-xs text-slate-500">
                      ID: <code>{recommendedModel.id}</code> • Quantization: {recommendedModel.quantization} • Size:{" "}
                      {formatBytes(recommendedModel.hardware_requirements.estimated_download_size_bytes)} • License:{" "}
                      {recommendedModel.license.name}
                    </p>
                  </div>
                  <Badge tone="success">Recommended</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {recommendedModel.description}
                </p>

                {recommendedModel.license.requires_acceptance && (
                  <label className="mt-3 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={licenseChecked}
                      onChange={(e) => setLicenseChecked(e.target.checked)}
                    />
                    I accept the {recommendedModel.license.name} ({recommendedModel.license.version})
                  </label>
                )}

                {modelState &&
                  (modelState.status === "downloading" ||
                    modelState.status === "verifying" ||
                    modelState.status === "installing" ||
                    modelState.status === "paused") && (
                    <div className="mt-3">
                      <ProgressBar
                        value={modelState.percent ?? 0}
                        label={
                          modelState.status === "verifying"
                            ? "Verifying SHA-256 integrity…"
                            : modelState.status === "installing"
                              ? "Installing verified model…"
                              : modelState.status === "paused"
                                ? "Paused (Resumable)"
                                : `Downloading ${modelState.currentFile ?? ""}`
                        }
                        valueText={`${modelState.percent ?? 0}%${
                          modelState.status === "downloading" && modelState.bytesPerSecond
                            ? ` • ${formatBytes(modelState.bytesPerSecond)}/s`
                            : ""
                        }`}
                      />
                    </div>
                  )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {modelState?.status === "ready" || modelState?.status === "loaded" ? (
                    <Button
                      disabled={loadingStepModel}
                      onClick={async () => {
                        setLoadingStepModel(true);
                        try {
                          if (snapshot.runtime.loadedModel !== recommendedModel.id) {
                            await loadModel(recommendedModel.id);
                          }
                          const curState = useDashboardStore.getState();
                          if (
                            !curState.bannerError &&
                            curState.snapshot.runtime.loadedModel === recommendedModel.id
                          ) {
                            setStep(4);
                          }
                        } finally {
                          setLoadingStepModel(false);
                        }
                      }}
                    >
                      {loadingStepModel
                        ? "Loading Model into WebGPU…"
                        : "Model Verified — Load & Test Local AI"}
                    </Button>
                  ) : modelState?.status === "downloading" ? (
                    <>
                      <Button variant="secondary" onClick={() => void pauseDownload(recommendedModel.id)}>
                        Pause
                      </Button>
                      <Button variant="danger" onClick={() => void cancelDownload(recommendedModel.id)}>
                        Cancel
                      </Button>
                    </>
                  ) : modelState?.status === "paused" ? (
                    <>
                      <Button disabled={!isOnline} onClick={() => void downloadModel(recommendedModel.id)}>
                        Resume Download
                      </Button>
                      <Button variant="danger" onClick={() => void cancelDownload(recommendedModel.id)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={
                        !isOnline ||
                        (recommendedModel.license.requires_acceptance && !licenseChecked)
                      }
                      onClick={async () => {
                        if (recommendedModel.license.requires_acceptance) {
                          await acceptLicense(
                            recommendedModel.id,
                            recommendedModel.license.id,
                            recommendedModel.license.version
                          );
                        }
                        await downloadModel(recommendedModel.id);
                      }}
                    >
                      {!isOnline ? "Requires Internet to Download" : "Download & Verify Model"}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setScreen("models")}>
                    Choose Different Model
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 4 && (
        <Card
          title="Run Your First Local Inference"
          subtitle="FR-008 — Confirm generation works on-device with zero network prompt traffic."
        >
          <div className="space-y-3">
            {snapshot.runtime.state === "loading_model" && (
              <ProgressBar
                value={snapshot.runtime.loadProgress ?? 50}
                label={snapshot.runtime.loadStage ?? "Loading model…"}
              />
            )}
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              rows={2}
              value={samplePrompt}
              onChange={(e) => setSamplePrompt(e.target.value)}
              aria-label="Sample onboarding prompt"
            />
            <div className="flex gap-2">
              <Button
                disabled={runningSample}
                onClick={async () => {
                  const targetModelId = snapshot.runtime.loadedModel ?? recommendedModel?.id;
                  setRunningSample(true);
                  const ok = await sendPrompt(samplePrompt, targetModelId);
                  setRunningSample(false);
                  if (ok) {
                    const latest = useDashboardStore.getState().conversations[0];
                    const lastAssistant = [...(latest?.messages ?? [])]
                      .reverse()
                      .find((m) => m.role === "assistant");
                    setSampleReply(lastAssistant?.content ?? "Local response generated.");
                    await updateSettings({ onboardingComplete: true });
                    setStep(5);
                  }
                }}
              >
                {runningSample ? "Generating Locally…" : "Run Sample Prompt"}
              </Button>
            </div>
            {sampleReply && (
              <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{sampleReply}</div>
            )}
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card
          title="You're Set Up & Offline Ready"
          subtitle="FR-005 — All required local assets and verified model weights are stored on your device."
        >
          <div className="space-y-2">
            {snapshot.offlineReadiness.checks.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span>{c.label}</span>
                <Badge tone={c.passed ? "success" : "danger"}>{c.passed ? "Ready" : "Missing"}</Badge>
              </div>
            ))}
          </div>
          {sampleReply && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
              <strong>First Local Response:</strong> {sampleReply}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setScreen("workspace")}>Open AI Workspace</Button>
            <Button variant="secondary" onClick={() => setScreen("integrations")}>
              Manage Website Integrations
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

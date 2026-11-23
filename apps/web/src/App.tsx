import React, { useEffect } from "react";
import { Badge, ErrorAlert } from "@uoai/ui";
import { useDashboardStore, type ScreenId } from "./store/useDashboardStore";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { ModelLibraryScreen } from "./screens/ModelLibraryScreen";
import { WorkspaceScreen } from "./screens/WorkspaceScreen";
import { ProviderDashboardScreen } from "./screens/ProviderDashboardScreen";
import { WebsiteIntegrationsScreen } from "./screens/WebsiteIntegrationsScreen";
import { DeveloperConsoleScreen } from "./screens/DeveloperConsoleScreen";
import { IntegrationDocsScreen } from "./screens/IntegrationDocsScreen";
import { SettingsPrivacyScreen } from "./screens/SettingsPrivacyScreen";

const NAV_ITEMS: Array<{ id: ScreenId; label: string }> = [
  { id: "workspace", label: "AI Workspace" },
  { id: "models", label: "Model Library" },
  { id: "provider", label: "Provider Dashboard" },
  { id: "integrations", label: "Website Integrations" },
  { id: "console", label: "Developer Console" },
  { id: "docs", label: "Docs & AI Prompts" },
  { id: "settings", label: "Settings & Privacy" },
  { id: "onboarding", label: "Onboarding Wizard" }
];

export const App: React.FC = () => {
  const {
    activeScreen,
    isOnline,
    bannerError,
    snapshot,
    setScreen,
    setOnline,
    clearBannerError,
    initialize
  } = useDashboardStore();

  useEffect(() => {
    void initialize();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [initialize, setOnline]);

  const readinessTone =
    snapshot.offlineReadiness.status === "offline_ready"
      ? "success"
      : snapshot.offlineReadiness.status === "partially_ready"
        ? "warning"
        : "neutral";

  const runtimeLabel =
    snapshot.runtime.state === "ready" && snapshot.runtime.loadedModel
      ? `Ready: ${snapshot.runtime.loadedModel}`
      : snapshot.runtime.state === "generating"
        ? `Generating (${snapshot.runtime.loadedModel ?? "local"})…`
        : snapshot.runtime.state === "loading_model"
          ? `Loading ${snapshot.runtime.loadProgress ?? 0}%`
          : `Runtime: ${snapshot.runtime.state}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Persistent Top Header (UX_REQUIREMENTS §1) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
              AI
            </span>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Universal Offline AI (UOAI)</h1>
              <p className="text-[11px] text-slate-500">v{snapshot.providerVersion}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="status">
            <Badge tone={readinessTone}>
              {snapshot.offlineReadiness.status === "offline_ready"
                ? "Offline Ready"
                : snapshot.offlineReadiness.status === "partially_ready"
                  ? "Partially Ready"
                  : "Setup Needed"}
            </Badge>
            <Badge tone={isOnline ? "neutral" : "success"}>
              {isOnline ? "Online" : "Offline — Local AI Active"}
            </Badge>
            <Badge tone={snapshot.runtime.state === "error" ? "danger" : "info"}>
              {runtimeLabel}
            </Badge>
            <Badge tone="success">Local-Only • 0 Prompts Sent to Cloud</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-5 md:grid-cols-[210px_1fr]">
        {/* Persistent Navigation Sidebar */}
        <nav aria-label="Main navigation" className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={activeScreen === item.id ? "page" : undefined}
              onClick={() => setScreen(item.id)}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                activeScreen === item.id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Active Screen */}
        <main className="min-w-0 space-y-4">
          {bannerError && (
            <ErrorAlert
              code={bannerError.code}
              message={bannerError.message}
              actionLabel="Dismiss"
              onAction={clearBannerError}
            />
          )}

          {activeScreen === "onboarding" && <OnboardingScreen />}
          {activeScreen === "workspace" && <WorkspaceScreen />}
          {activeScreen === "models" && <ModelLibraryScreen />}
          {activeScreen === "provider" && <ProviderDashboardScreen />}
          {activeScreen === "integrations" && <WebsiteIntegrationsScreen />}
          {activeScreen === "console" && <DeveloperConsoleScreen />}
          {activeScreen === "docs" && <IntegrationDocsScreen />}
          {activeScreen === "settings" && <SettingsPrivacyScreen />}
        </main>
      </div>
    </div>
  );
};

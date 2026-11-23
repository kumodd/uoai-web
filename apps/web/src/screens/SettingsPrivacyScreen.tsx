import React, { useState } from "react";
import { BUNDLED_LICENSES, formatBytes } from "@uoai/model-registry";
import { Badge, Button, Card, ModalDialog } from "@uoai/ui";
import { useDashboardStore } from "../store/useDashboardStore";

export const SettingsPrivacyScreen: React.FC = () => {
  const {
    snapshot,
    updateSettings,
    deleteAllConversations,
    resetAllData
  } = useDashboardStore();

  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [deleteHistoryOpen, setDeleteHistoryOpen] = useState(false);

  const { settings } = snapshot;
  const totalModelBytes = Object.values(snapshot.usedBytesByModel).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <Card
        title="Privacy & Local-Only Architecture Disclosure"
        subtitle="FR-122 & ADR-010 — Verifiable local execution with zero remote analytics endpoints in MVP."
      >
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <p>
            <strong>Inference:</strong> 100% local inside your Chromium browser via WebGPU in a
            dedicated Web Worker. Zero prompts or generated responses ever leave your device. No
            cloud inference fallback exists in MVP.
          </p>
          <p>
            <strong>Telemetry:</strong> Off and unimplemented (0 remote analytics endpoints per{" "}
            <code>OQ-12 = Option A</code>).
          </p>
          <p>
            <strong>Local Storage Locations:</strong> Model weights in extension-origin OPFS/Cache
            Storage; model metadata and workspace conversations in local IndexedDB; origin grants
            and settings in <code>chrome.storage.local</code>. Note that browsers may evict storage
            under severe disk pressure, and uninstalling the extension removes all locally stored
            models.
          </p>
          <p>
            <strong>Permitted Network Activity (BR-21):</strong> Only user-initiated model
            downloads, signed catalog refreshes, and hosted PWA asset updates.
          </p>
        </div>
      </Card>

      <Card
        title="Network Activity Transparency Log"
        subtitle="FR-124 & BR-21 — Displays every network operation initiated by UOAI (always 0 during inference)."
      >
        {snapshot.networkActivity.length === 0 ? (
          <p className="text-sm text-slate-500">0 network requests recorded in this session.</p>
        ) : (
          <div className="space-y-1.5 text-xs">
            {snapshot.networkActivity.slice(-20).reverse().map((n) => (
              <div
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800"
              >
                <div>
                  <span className="font-semibold">{n.purpose}</span> •{" "}
                  <span className="font-mono">{n.host}</span> • {formatBytes(n.bytesTransferred)}
                </div>
                <Badge tone={n.status === "completed" ? "success" : "info"}>{n.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Runtime, Security & Developer Policies" subtitle="FR-123 & BR-14..20">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Idle Model Auto-Unload (minutes, 0 = Never)</span>
            <input
              type="number"
              min={0}
              max={240}
              value={settings.idleUnloadMinutes}
              onChange={(e) =>
                void updateSettings({ idleUnloadMinutes: Math.max(0, Number(e.target.value) || 0) })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Website Default max_tokens Cap (BR-14)</span>
            <input
              type="number"
              min={64}
              max={8192}
              value={settings.websiteMaxTokens}
              onChange={(e) =>
                void updateSettings({
                  websiteMaxTokens: Math.min(8192, Math.max(64, Number(e.target.value) || 1024))
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Per-Origin Rate Limit (req/min, BR-15)</span>
            <input
              type="number"
              min={1}
              max={300}
              value={settings.rateLimitPerMin}
              onChange={(e) =>
                void updateSettings({
                  rateLimitPerMin: Math.min(300, Math.max(1, Number(e.target.value) || 30))
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <div className="flex flex-col justify-center gap-2 pt-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.ephemeralHistory}
                onChange={(e) => void updateSettings({ ephemeralHistory: e.target.checked })}
              />
              Ephemeral Mode — Do not save future Workspace chats (FR-036)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.allowWebsiteModelSwitch}
                onChange={(e) => void updateSettings({ allowWebsiteModelSwitch: e.target.checked })}
              />
              Allow authorized websites to switch the currently loaded model (OQ-13)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.developerMode}
                onChange={(e) => void updateSettings({ developerMode: e.target.checked })}
              />
              Developer Mode — Allow authorizing <code>http://localhost:&lt;port&gt;</code> origins (OQ-22)
            </label>
          </div>
        </div>
      </Card>

      <Card
        title="Data & Storage Controls (Danger Zone)"
        subtitle="FR-120 & FR-121 — Complete local data erasure."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDeleteHistoryOpen(true)}>
            Delete All Conversation History
          </Button>
          <Button variant="danger" onClick={() => setResetStep(1)}>
            Reset UOAI (Delete All Models, History &amp; Permissions)
          </Button>
        </div>
      </Card>

      <Card title="Open-Source & Model Licenses (Offline Copy)" subtitle="BO-08">
        <div className="space-y-3 text-xs">
          <p>
            <strong>UOAI Software License:</strong> Apache License, Version 2.0 (OQ-18).
          </p>
          {Object.entries(BUNDLED_LICENSES).map(([key, text]) => (
            <details key={key} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
              <summary className="cursor-pointer font-semibold">{key}</summary>
              <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">
                {text}
              </pre>
            </details>
          ))}
        </div>
      </Card>

      {/* Delete All Conversations Modal */}
      <ModalDialog
        open={deleteHistoryOpen}
        title="Delete All Conversation History?"
        role="alertdialog"
        onClose={() => setDeleteHistoryOpen(false)}
      >
        <p className="text-sm">
          This permanently deletes all local conversations from IndexedDB. This action cannot be
          undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteHistoryOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setDeleteHistoryOpen(false);
              await deleteAllConversations();
            }}
          >
            Delete All History
          </Button>
        </div>
      </ModalDialog>

      {/* Two-Step Reset UOAI Modal (FR-121) */}
      <ModalDialog
        open={resetStep > 0}
        title={resetStep === 1 ? "Reset All UOAI Local Data? (Step 1 of 2)" : "Final Confirmation — Reset UOAI (Step 2 of 2)"}
        role="alertdialog"
        onClose={() => setResetStep(0)}
      >
        {resetStep === 1 ? (
          <div className="space-y-4 text-sm">
            <p>
              This will permanently remove all downloaded models ({formatBytes(totalModelBytes)}),
              all conversations, all website permissions, license acceptances, diagnostics, and
              settings.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResetStep(0)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setResetStep(2)}>
                Continue to Final Confirmation
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="font-semibold text-rose-600">
              Are you sure? Every local model and permission grant will be erased immediately.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResetStep(0)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setResetStep(0);
                  await resetAllData();
                }}
              >
                Confirm Complete Reset
              </Button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};

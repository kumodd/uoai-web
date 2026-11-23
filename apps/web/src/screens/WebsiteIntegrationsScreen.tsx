import React, { useState } from "react";
import { validateOriginString } from "@uoai/api-protocol";
import { Badge, Button, Card, ModalDialog } from "@uoai/ui";
import { useDashboardStore } from "../store/useDashboardStore";

export const WebsiteIntegrationsScreen: React.FC = () => {
  const { snapshot, authorizeOrigin, revokeOrigin, revokeAllOrigins } = useDashboardStore();
  const [originInput, setOriginInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [consentOrigin, setConsentOrigin] = useState<string | null>(null);

  const allowed = snapshot.grants.filter((g) => g.status === "allowed");
  const denied = snapshot.grants.filter((g) => g.status === "denied");

  const handleOpenConsent = (e: React.FormEvent) => {
    e.preventDefault();
    const res = validateOriginString(originInput, {
      allowLocalhostHttp: snapshot.settings.developerMode
    });
    if (!res.valid) {
      setValidationError(res.reason);
      return;
    }
    setValidationError(null);
    setConsentOrigin(res.origin);
  };

  return (
    <div className="space-y-6">
      <Card
        title="Authorize a Website Origin"
        subtitle="FR-060 & FR-061 — Two-layer per-origin authorization (UOAI consent sheet + browser optional host permission). Top-level frames only."
      >
        <form onSubmit={handleOpenConsent} className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder={
              snapshot.settings.developerMode
                ? "https://app.example.com or http://localhost:5173"
                : "https://app.example.com"
            }
            value={originInput}
            onChange={(e) => setOriginInput(e.target.value)}
            aria-label="Website origin URL"
            className="min-w-[280px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <Button type="submit">Authorize Origin</Button>
        </form>
        {validationError && (
          <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
            {validationError}
          </p>
        )}
      </Card>

      <Card
        title="Built-In Trusted Origin"
        subtitle="BR-18 & OQ-14 Option A — Statically configured first-party PWA origin."
      >
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="font-mono">{snapshot.settings.trustedPwaOrigin}</p>
            <p className="text-xs text-slate-500">
              Official UOAI Dashboard / PWA origin configured via manifest externally_connectable.
            </p>
          </div>
          <Badge tone="info">Built-in</Badge>
        </div>
      </Card>

      <Card
        title={`Authorized Third-Party Websites (${allowed.length})`}
        subtitle="FR-063 & FR-064 — Revoking immediately disconnects active ports, cancels streams, and removes browser host permissions."
        actions={
          allowed.length > 0 && (
            <Button size="sm" variant="danger" onClick={() => void revokeAllOrigins()}>
              Revoke All
            </Button>
          )
        }
      >
        {allowed.length === 0 ? (
          <p className="text-sm text-slate-500">
            No external websites have access to your local AI. Websites can only connect after you
            explicitly approve them.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {allowed.map((g) => (
              <div key={g.origin} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-mono font-medium">{g.origin}</p>
                  <p className="text-xs text-slate-500">
                    Granted: {new Date(g.grantedAt).toLocaleString()} • Requests: {g.requestCount}
                    {g.lastUsedAt ? ` • Last used: ${new Date(g.lastUsedAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Revoke access for ${g.origin}`}
                  onClick={() => void revokeOrigin(g.origin)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {denied.length > 0 && (
        <Card title={`Denied Websites (${denied.length})`}>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {denied.map((g) => (
              <div key={g.origin} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono">{g.origin}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConsentOrigin(g.origin)}>
                    Allow
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void revokeOrigin(g.origin)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Two-Layer Consent Sheet Modal (FR-061, ADR-005) */}
      <ModalDialog
        open={Boolean(consentOrigin)}
        title="Allow Website to Use Local AI?"
        role="alertdialog"
        onClose={() => setConsentOrigin(null)}
      >
        {consentOrigin && (
          <div className="space-y-4 text-sm">
            <p>
              Origin: <strong className="font-mono">{consentOrigin}</strong>
            </p>
            <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-semibold">This website CAN:</p>
              <ul className="mt-1 space-y-0.5">
                <li>• List your installed Ready models</li>
                <li>• Send stateless prompts to your local model and receive streamed responses</li>
              </ul>
            </div>
            <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              <p className="font-semibold">This website CANNOT:</p>
              <ul className="mt-1 space-y-0.5">
                <li>• Read your AI Workspace conversation history (BR-23)</li>
                <li>• Access local files, other websites, or trigger model downloads (BR-07, BR-24)</li>
                <li>• Bypass rate limits or your revocation controls (BR-06)</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConsentOrigin(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const target = consentOrigin;
                  setConsentOrigin(null);
                  setOriginInput("");
                  await authorizeOrigin(target);
                }}
              >
                Allow &amp; Grant Host Permission
              </Button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};

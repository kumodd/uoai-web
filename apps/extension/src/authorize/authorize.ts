/**
 * Parameter-validated web_accessible_resources Consent Page (OQ-04 = Option B, FR-061).
 */
import { validateOriginString } from "@uoai/api-protocol";

async function initAuthorizePage() {
  const originEl = document.getElementById("target-origin")!;
  const errEl = document.getElementById("validation-error")!;
  const detailsEl = document.getElementById("consent-details")!;

  const params = new URLSearchParams(window.location.search);
  const rawOrigin = params.get("origin") ?? "";

  const snapResp = await chrome.runtime.sendMessage({
    channel: "uoai-admin-v1",
    action: "get_snapshot"
  });
  const developerMode = Boolean(snapResp?.data?.settings?.developerMode);

  const check = validateOriginString(rawOrigin, { allowLocalhostHttp: developerMode });
  if (!check.valid) {
    originEl.textContent = rawOrigin || "(missing origin)";
    errEl.textContent = check.reason;
    detailsEl.style.display = "none";
    return;
  }

  originEl.textContent = check.origin;

  document.getElementById("btn-deny")!.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      channel: "uoai-admin-v1",
      action: "deny_origin",
      origin: check.origin
    });
    window.close();
  });

  document.getElementById("btn-allow")!.addEventListener("click", async () => {
    const granted = await chrome.permissions.request({ origins: [`${check.origin}/*`] });
    if (!granted) {
      errEl.textContent = "Browser host permission was declined. Access was not granted.";
      return;
    }
    await chrome.runtime.sendMessage({
      channel: "uoai-admin-v1",
      action: "authorize_origin",
      origin: check.origin
    });
    window.close();
  });
}

void initAuthorizePage();

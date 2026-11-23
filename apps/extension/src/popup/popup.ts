import { validateOriginString } from "@uoai/api-protocol";

async function initPopup() {
  const statusEl = document.getElementById("runtime-status")!;
  const originEl = document.getElementById("site-origin")!;
  const actionsEl = document.getElementById("site-actions")!;

  const snapResp = await chrome.runtime.sendMessage({
    channel: "uoai-admin-v1",
    action: "get_snapshot"
  });
  const snap = snapResp?.data;

  if (snap) {
    statusEl.textContent = `Runtime: ${snap.runtime.state} • Model: ${snap.runtime.loadedModel ?? "None"}`;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = "";
  try {
    origin = activeTab?.url ? new URL(activeTab.url).origin : "";
  } catch {
    origin = "";
  }

  originEl.textContent = origin || "No web page active";

  const check = validateOriginString(origin, {
    allowLocalhostHttp: Boolean(snap?.settings?.developerMode)
  });

  if (!check.valid) {
    actionsEl.innerHTML = `<div class="meta">${check.reason}</div>`;
  } else {
    const grant = snap?.grants?.find((g: { origin: string }) => g.origin === check.origin);
    if (grant?.status === "allowed") {
      const btn = document.createElement("button");
      btn.className = "danger";
      btn.textContent = "Revoke Access for This Site";
      btn.onclick = async () => {
        await chrome.runtime.sendMessage({
          channel: "uoai-admin-v1",
          action: "revoke_origin",
          origin: check.origin
        });
        window.close();
      };
      actionsEl.appendChild(btn);
    } else {
      const btn = document.createElement("button");
      btn.className = "primary";
      btn.textContent = "Allow This Site to Use UOAI";
      btn.onclick = async () => {
        // Two-layer permission request triggered directly by user gesture in popup (FR-061)
        const granted = await chrome.permissions.request({ origins: [`${check.origin}/*`] });
        if (granted) {
          await chrome.runtime.sendMessage({
            channel: "uoai-admin-v1",
            action: "authorize_origin",
            origin: check.origin
          });
          window.close();
        }
      };
      actionsEl.appendChild(btn);
    }
  }

  document.getElementById("open-dashboard")!.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
    window.close();
  });

  document.getElementById("open-sidepanel")!.addEventListener("click", async () => {
    if (activeTab?.windowId !== undefined && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: activeTab.windowId });
    }
    window.close();
  });
}

void initPopup();

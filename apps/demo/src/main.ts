import { UOAI, UOAIError, type UOAIClient } from "@uoai/sdk";

let client: UOAIClient | null = null;
let activeAbort: AbortController | null = null;
let selectedModel = "uoai-local-smoke-v1";

const statusEl = document.getElementById("status")!;
const modelsOut = document.getElementById("models-out")!;
const streamOut = document.getElementById("stream-out")!;
const promptEl = document.getElementById("prompt") as HTMLTextAreaElement;
const btnConnect = document.getElementById("btn-connect") as HTMLButtonElement;
const btnList = document.getElementById("btn-list") as HTMLButtonElement;
const btnStream = document.getElementById("btn-stream") as HTMLButtonElement;
const btnCancel = document.getElementById("btn-cancel") as HTMLButtonElement;

// Expose helper on window for Playwright E2E assertions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__UOAI_DEMO__ = {
  UOAI,
  getClient: () => client
};

btnConnect.addEventListener("click", async () => {
  statusEl.textContent = "Connecting…";
  try {
    client = await UOAI.connect({ timeoutMs: 2500 });
    statusEl.textContent = `Connected (protocol v${client.protocolVersion})`;
    btnList.disabled = false;
    btnStream.disabled = false;
    client.on("permission_revoked", () => {
      statusEl.textContent = "Revoked (permission_revoked)";
      btnList.disabled = true;
      btnStream.disabled = true;
      client = null;
    });
  } catch (err) {
    const code = err instanceof UOAIError ? err.code : "unknown";
    statusEl.textContent = `Error: ${code}`;
    modelsOut.textContent = err instanceof Error ? err.message : String(err);
  }
});

btnList.addEventListener("click", async () => {
  if (!client) return;
  try {
    const list = await client.models.list();
    if (list.data[0]) selectedModel = list.data[0].id;
    modelsOut.textContent = JSON.stringify(list, null, 2);
  } catch (err) {
    modelsOut.textContent = err instanceof UOAIError ? `Error (${err.code}): ${err.message}` : String(err);
  }
});

btnStream.addEventListener("click", async () => {
  if (!client) return;
  streamOut.textContent = "";
  activeAbort = new AbortController();
  btnCancel.disabled = false;
  btnStream.disabled = true;
  try {
    const stream = await client.chat.completions.create(
      {
        model: selectedModel,
        messages: [{ role: "user", content: promptEl.value }],
        stream: true
      },
      { signal: activeAbort.signal }
    );
    for await (const chunk of stream) {
      streamOut.textContent += chunk.choices[0]?.delta?.content ?? "";
    }
  } catch (err) {
    const code = err instanceof UOAIError ? err.code : "error";
    streamOut.textContent += `\n[${code}] ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    btnCancel.disabled = true;
    btnStream.disabled = false;
    activeAbort = null;
  }
});

btnCancel.addEventListener("click", () => {
  activeAbort?.abort("generation_cancelled");
});

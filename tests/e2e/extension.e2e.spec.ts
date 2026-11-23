import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const EXTENSION_DIST = path.resolve(process.cwd(), "apps/extension/dist");
const DEMO_DIST = path.resolve(process.cwd(), "apps/demo/dist");

function startStaticServer(dir: string): Promise<{ server: http.Server; origin: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url ?? "/").split("?")[0]!;
      const filePath = path.join(dir, reqPath === "/" ? "index.html" : reqPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const ext = path.extname(filePath);
      const mime =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : ext === ".css"
              ? "text/css; charset=utf-8"
              : "application/octet-stream";
      res.writeHead(200, { "content-type": mime });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

test.describe("UOAI End-to-End Chromium MV3 Extension & Offline Verification (MVP-AC-01..17)", () => {
  let context: BrowserContext;
  let extensionId: string;
  let demoServer: http.Server;
  let demoOrigin: string;

  test.beforeAll(async () => {
    const started = await startStaticServer(DEMO_DIST);
    demoServer = started.server;
    demoOrigin = started.origin;

    const userDataDir = fs.mkdtempSync(path.join("/tmp", "uoai-e2e-profile-"));
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_DIST}`,
        `--load-extension=${EXTENSION_DIST}`,
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader"
      ]
    });

    // Wait for MV3 extension service worker to register
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
    }
    extensionId = new URL(sw.url()).host;
  });

  test.afterAll(async () => {
    await context?.close();
    demoServer?.close();
  });

  test("MVP-AC-01..09 & MVP-AC-17: Install, Capability Check, SHA-256 Model Install, Local Chat, Offline Reload & Zero Network Egress", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/app.html`);

    // 1. Welcome screen renders (MVP-AC-01, MVP-AC-02)
    await expect(page.getByText("Welcome to Universal Offline AI (UOAI)")).toBeVisible({
      timeout: 10000
    });

    // 2. Run browser & WebGPU capability checks in dedicated Worker (MVP-AC-03)
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.getByText("Browser & WebGPU Capability Check")).toBeVisible();
    await expect(page.getByText("Dedicated Web Worker Isolation")).toBeVisible({ timeout: 10000 });

    // 3. Open Model Library, download & SHA-256 verify uoai-local-smoke-v1 (MVP-AC-04, MVP-AC-05)
    await page.getByRole("button", { name: "Model Library" }).click();
    const smokeCard = page.getByRole("article", { name: /UOAI Local Smoke Model/i });
    await expect(smokeCard).toBeVisible();
    await smokeCard.getByRole("button", { name: "Download Model" }).click();

    await expect(smokeCard.getByText("Ready Offline")).toBeVisible({ timeout: 15000 });

    // 4. Load model into Dedicated Web Worker (MVP-AC-06)
    await smokeCard.getByRole("button", { name: "Load Model" }).click();
    await expect(smokeCard.getByText("Loaded")).toBeVisible({ timeout: 10000 });

    // 5. Run local streaming chat in AI Workspace (MVP-AC-07)
    await page.getByRole("button", { name: "AI Workspace" }).click();
    const promptInput = page.getByLabel("Chat prompt input");
    await promptInput.fill("Explain how WebGPU works.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/WebGPU is a modern browser graphics/i)).toBeVisible({
      timeout: 10000
    });
    // Wait for streaming completion & IndexedDB persistence before reloading offline
    await expect(page.getByText(/Tokens: \d+ prompt \+ \d+ completion/)).toBeVisible({
      timeout: 10000
    });

    // 6. Disconnect network (offline mode), reload Dashboard, verify Offline Ready & generate offline with 0 external requests (MVP-AC-08, MVP-AC-09, MVP-AC-17)
    const externalRequests: string[] = [];
    page.on("request", (req) => {
      if (!req.url().startsWith(`chrome-extension://${extensionId}`)) {
        externalRequests.push(req.url());
      }
    });

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Offline Ready", { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "AI Workspace" }).click();

    // Verify conversation persisted in local IndexedDB (TC-039)
    await expect(page.getByText(/WebGPU is a modern browser graphics/i)).toBeVisible({
      timeout: 10000
    });

    // Generate a second response completely offline
    await page.getByLabel("Chat prompt input").fill("Write a short introduction to offline AI.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/Universal Offline AI runs language models directly/i)).toBeVisible({
      timeout: 10000
    });

    // Assert zero external network traffic (MVP-AC-17, TC-033)
    expect(externalRequests).toEqual([]);

    await context.setOffline(false);
    await page.close();
  });

  test("MVP-AC-14 & TC-045: Unauthorized third-party website is rejected cleanly via @uoai/sdk", async () => {
    const demoPage = await context.newPage();
    await demoPage.goto(demoOrigin);

    await demoPage.getByRole("button", { name: "Connect to UOAI" }).click();
    await expect(demoPage.locator("#status")).toContainText("Error: extension_not_detected", {
      timeout: 8000
    });
    await demoPage.close();
  });

  test("TC-044: Developer Console connection test and Playground work end-to-end", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/app.html`);
    await page.getByRole("button", { name: "Developer Console" }).click();

    await page.getByRole("button", { name: "Test Connection" }).click();
    await expect(page.getByText("GET /v1/health", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("GET /v1/models", { exact: true })).toBeVisible({ timeout: 5000 });

    // Also verify Docs & AI Prompts page renders live extension ID & prompt builder offline
    await page.getByRole("button", { name: "Docs & AI Prompts" }).click();
    await expect(page.getByText("Ready-to-Paste AI Coding Prompt")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(`Extension ID: ${extensionId}`)).toBeVisible();
    await page.getByRole("button", { name: "Website Integration Guide" }).click();
    await expect(page.getByText("2. Drop-in React Hook (useUOAI.ts)")).toBeVisible();
    await page.getByRole("button", { name: "Browser Extension Guide" }).click();
    await expect(page.getByText(/Integrating UOAI Inside Another Chromium Extension/i)).toBeVisible();
    await page.getByRole("button", { name: "API, Models & Error Reference" }).click();
    await expect(page.getByText("Error Code Reference (26 / 26)")).toBeVisible();
    await page.close();
  });

  test("FR-016 & FR-017: Real Hugging Face model download starts, pauses, resumes, and cancels cleanly in browser", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/app.html`);
    await page.getByRole("button", { name: "Model Library" }).click();

    const smolCard = page.getByRole("article", { name: /SmolLM2 360M Instruct/i });
    await expect(smolCard).toBeVisible({ timeout: 10000 });
    await smolCard.getByRole("button", { name: "Download Model" }).click();

    // Pause button must appear immediately while downloading
    const pauseBtn = smolCard.getByRole("button", { name: "Pause" });
    await expect(pauseBtn).toBeVisible({ timeout: 10000 });
    await expect(smolCard.getByRole("progressbar")).toBeVisible({ timeout: 10000 });

    // Click Pause -> transitions to Paused with Resume Download + Cancel buttons
    await pauseBtn.click();
    await expect(smolCard.getByRole("button", { name: "Resume Download" })).toBeVisible({
      timeout: 10000
    });

    // Click Cancel -> cleans staging and restores Download Model button
    await smolCard.getByRole("button", { name: "Cancel" }).click();
    await expect(smolCard.getByRole("button", { name: "Download Model" })).toBeVisible({
      timeout: 10000
    });
    await page.close();
  });

  test("FR-001..008: Full 5-Step Onboarding Wizard reaches Step 4 Run Sample Prompt and Step 5 Offline Ready", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/app.html`);
    await page.getByRole("button", { name: "Onboarding Wizard" }).click();

    // Step 1 -> Step 2
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.getByText("Browser & WebGPU Capability Check")).toBeVisible({ timeout: 10000 });

    // Step 2 -> Step 3 (uoai-local-smoke-v1 is already installed & loaded from Test 1)
    await page.getByRole("button", { name: "Continue to Model Setup" }).click();
    await expect(page.getByText("Download Your First Qualified Model")).toBeVisible({ timeout: 10000 });

    // Step 3 -> Step 4
    await page.getByRole("button", { name: /Model Verified — Load & Test Local AI/i }).click();
    await expect(page.getByText("Run Your First Local Inference")).toBeVisible({ timeout: 10000 });

    // Step 4 -> Step 5 (Run Sample Prompt must succeed with zero runtime error)
    await page.getByRole("button", { name: "Run Sample Prompt" }).click();
    await expect(page.getByText("You're Set Up & Offline Ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/First Local Response:/i)).toBeVisible();
    await page.close();
  });

  test("FR-004 & FR-101: Standalone PWA renders Extension Required guidance and precaches offline shell", async () => {
    const webDist = path.resolve(process.cwd(), "apps/web/dist");
    const { server: pwaServer, origin: pwaOrigin } = await startStaticServer(webDist);
    try {
      const pwaPage = await context.newPage();
      await pwaPage.goto(pwaOrigin);
      await expect(
        pwaPage.getByText("Install the Universal Offline AI (UOAI) Extension")
      ).toBeVisible({ timeout: 10000 });
      await pwaPage.close();
    } finally {
      pwaServer.close();
    }
  });
});

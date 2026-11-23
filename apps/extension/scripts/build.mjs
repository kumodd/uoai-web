import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const extRoot = process.cwd();
const distDir = path.join(extRoot, "dist");
const webDistDir = path.resolve(extRoot, "../web/dist");

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

// 1. Copy built Dashboard/PWA assets into extension dist as app.html (OQ-03 = Option A dual target)
if (!fs.existsSync(webDistDir)) {
  throw new Error("apps/web/dist not found. Build @uoai/web before @uoai/extension.");
}
fs.cpSync(webDistDir, distDir, { recursive: true });
const indexHtmlPath = path.join(distDir, "index.html");
const appHtmlPath = path.join(distDir, "app.html");
let appHtml = fs.readFileSync(indexHtmlPath, "utf-8");
// Inject visible Runtime Host script (OQ-02 = Option B) so app.html / Side Panel hosts the dedicated Inference Web Worker
appHtml = appHtml.replace(
  "</body>",
  '    <script type="module" src="./runtime-host.js"></script>\n  </body>'
);
fs.writeFileSync(appHtmlPath, appHtml, "utf-8");
fs.rmSync(indexHtmlPath, { force: true });
fs.rmSync(path.join(distDir, "sw.js"), { force: true }); // Extension serves files directly offline

// 2. Copy popup.html and authorize.html
fs.copyFileSync(path.join(extRoot, "src/popup/popup.html"), path.join(distDir, "popup.html"));
fs.copyFileSync(
  path.join(extRoot, "src/authorize/authorize.html"),
  path.join(distDir, "authorize.html")
);

// 3. Copy local ONNX Runtime Web WASM binaries into dist/wasm/ (ADR-011, NFR-016 — zero CDN)
const transformersDist = path.resolve(extRoot, "../../node_modules/@huggingface/transformers/dist");
const wasmOutDir = path.join(distDir, "wasm");
fs.mkdirSync(wasmOutDir, { recursive: true });
for (const wasmFile of [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm"
]) {
  const src = path.join(transformersDist, wasmFile);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(wasmOutDir, wasmFile));
  }
}

// 4. Bundle all MV3 JS entrypoints self-contained (zero remote code, NFR-016, ADR-011)
const common = {
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: true
};

const workerAlias = {
  "@huggingface/transformers": path.join(transformersDist, "transformers.web.min.js")
};

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(extRoot, "src/background/service-worker.ts")],
    outfile: path.join(distDir, "service-worker.js")
  }),
  build({
    ...common,
    alias: workerAlias,
    entryPoints: [path.join(extRoot, "src/runtime-host/inference.worker.ts")],
    outfile: path.join(distDir, "inference.worker.js")
  }),
  build({
    ...common,
    entryPoints: [path.join(extRoot, "src/runtime-host/runtimeHostClient.ts")],
    outfile: path.join(distDir, "runtime-host.js")
  }),
  build({
    ...common,
    format: "iife", // Content script runs cleanly in isolated world
    entryPoints: [path.join(extRoot, "src/content/bridge.ts")],
    outfile: path.join(distDir, "content-bridge.js")
  }),
  build({
    ...common,
    entryPoints: [path.join(extRoot, "src/popup/popup.ts")],
    outfile: path.join(distDir, "popup.js")
  }),
  build({
    ...common,
    entryPoints: [path.join(extRoot, "src/authorize/authorize.ts")],
    outfile: path.join(distDir, "authorize.js")
  })
]);

// Strip any unused upstream jsDelivr fallback string inside bundled inference.worker.js so all WASM loads strictly from local ./wasm/ (NFR-016)
const workerOutPath = path.join(distDir, "inference.worker.js");
let workerJs = fs.readFileSync(workerOutPath, "utf-8");
workerJs = workerJs.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@[^`"']+/g, "./wasm/");
fs.writeFileSync(workerOutPath, workerJs, "utf-8");

// 4. Write Manifest V3 manifest.json (NFR-017, NFR-018, ADR-002, ADR-004, ADR-005)
const manifest = {
  manifest_version: 3,
  name: "Universal Offline AI (UOAI)",
  version: "0.1.0",
  description:
    "Privacy-first, offline-capable local AI provider running directly in your browser with WebGPU.",
  permissions: ["storage", "unlimitedStorage", "scripting", "sidePanel"],
  host_permissions: ["https://huggingface.co/*", "https://*.hf.co/*"],
  optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
  background: {
    service_worker: "service-worker.js",
    type: "module"
  },
  action: {
    default_title: "Universal Offline AI (UOAI)",
    default_popup: "popup.html"
  },
  side_panel: {
    default_path: "app.html"
  },
  externally_connectable: {
    matches: ["https://app.uoai.local/*"]
  },
  web_accessible_resources: [
    {
      resources: ["authorize.html", "authorize.js"],
      matches: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"]
    }
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
};

fs.writeFileSync(path.join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
console.log("Built @uoai/extension MV3 bundle into apps/extension/dist");

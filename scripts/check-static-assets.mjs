#!/usr/bin/env node
/**
 * TC-016 / NFR-016 / FR-101 — Static Build Asset Audit
 * Ensures built extension and PWA assets contain zero external script/font/WASM CDN URLs,
 * zero cloud AI provider SDKs, and restrictive MV3 CSP.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  path.join(root, "apps/extension/dist"),
  path.join(root, "apps/web/dist")
];

const forbiddenPatterns = [
  { name: "Google Fonts CDN", regex: /https?:\/\/fonts\.(googleapis|gstatic)\.com/i },
  { name: "jsDelivr / unpkg CDN script", regex: /https?:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/i },
  { name: "Cloud AI inference endpoint", regex: /https?:\/\/api\.(openai|anthropic|groq|cohere)\.com/i },
  { name: "Google Analytics / telemetry", regex: /https?:\/\/(www\.)?(google-analytics|googletagmanager|segment|mixpanel|posthog)\.(com|io)/i }
];

const violations = [];
let filesScanned = 0;

for (const dir of targets) {
  if (!fs.existsSync(dir)) {
    violations.push(`Missing build directory: ${path.relative(root, dir)}`);
    continue;
  }
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|js|mjs|css|json)$/.test(entry.name)) {
        filesScanned++;
        const content = fs.readFileSync(full, "utf-8");
        for (const p of forbiddenPatterns) {
          if (p.regex.test(content)) {
            violations.push(`${path.relative(root, full)} matched forbidden pattern: ${p.name}`);
          }
        }
      }
    }
  };
  walk(dir);
}

// Verify extension manifest CSP & least privilege (NFR-017, NFR-018)
const manifestPath = path.join(root, "apps/extension/dist/manifest.json");
if (!fs.existsSync(manifestPath)) {
  violations.push("Missing apps/extension/dist/manifest.json");
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (manifest.manifest_version !== 3) {
    violations.push("Extension manifest_version must be 3");
  }
  const csp = manifest.content_security_policy?.extension_pages ?? "";
  if (!csp.includes("script-src 'self' 'wasm-unsafe-eval'") || csp.includes("unsafe-eval' ") || csp.includes("'unsafe-eval'")) {
    violations.push(`Restrictive MV3 CSP check failed: "${csp}"`);
  }
  const reqHosts = manifest.host_permissions ?? [];
  if (reqHosts.some((h) => h === "<all_urls>" || h === "*://*/*" || h === "https://*/*")) {
    violations.push(`Broad required host_permissions forbidden (NFR-018): ${JSON.stringify(reqHosts)}`);
  }
}

if (violations.length > 0) {
  console.error("Static asset audit FAILED:\n" + violations.map((v) => `  - ${v}`).join("\n"));
  process.exit(1);
}
console.log(`Static asset audit PASSED (${filesScanned} built files scanned, MV3 CSP & least-privilege verified).`);

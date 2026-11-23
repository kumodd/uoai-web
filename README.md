# Universal Offline AI (UOAI)

A privacy-first, offline-capable, local AI provider for Chromium-based browsers.

- **Local-only inference by default:** Prompts, conversations, and outputs stay on your device (zero cloud fallback, zero remote telemetry).
- **Offline after setup:** Download qualified models once, verify SHA-256 integrity, and run offline inside a dedicated Web Worker with WebGPU.
- **Permissioned website integration:** External websites connect via `@uoai/sdk` using an OpenAI-inspired logical API over secure extension messaging—only after explicit two-layer per-origin user authorization.
- **No native server required:** Runs entirely as a Manifest V3 Chromium extension + Dashboard/PWA (no Docker, Python, Node.js, or permanent `http://localhost` server).

## Documentation

Start at the master BRD: [docs/business/BRD.md](docs/business/BRD.md).

## Commands

```bash
npm install
npm run build
npm run typecheck
npm run lint:boundaries
npm run lint:static-assets
npm test
npm run test:e2e
```

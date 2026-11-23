# UOAI — Architecture Decision Records (ADRs)

| Field | Value |
|---|---|
| Document | Architecture Decision Records |
| Version | 0.2 (All Decisions Approved) |
| Status | **Accepted — Baseline Locked (2026-11-24)** |
| Parent | [BRD.md](../business/BRD.md) |
| Related | [ARCHITECTURE_CONSTRAINTS.md](../architecture/ARCHITECTURE_CONSTRAINTS.md), [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md), [SECURITY_AND_PRIVACY_REQUIREMENTS.md](../architecture/SECURITY_AND_PRIVACY_REQUIREMENTS.md) |

---

## 1. ADR Index

Following stakeholder approval of [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) (`OQ-01` – `OQ-22`), all 12 Architecture Decision Records are **Accepted** for the MVP baseline:

| ADR ID | Title | Status | Linked Constraints & Approved Decisions |
|---|---|---|---|
| **ADR-001** | Browser-Extension-Only Local AI Provider Without Native Companion | **Accepted** | PC-01, PC-02, X-01, X-02 |
| **ADR-002** | Dedicated Web Worker Hosted in a Visible Extension Page / Side Panel Runtime Host | **Accepted** | PC-03, PC-06, KL-06, **OQ-02 (Option B)** |
| **ADR-003** | OpenAI-Inspired Logical API via SDK Rather Than Localhost HTTP Server | **Accepted** | PC-07, PC-08, KL-05, X-03 |
| **ADR-004** | Dual-Target UI & Dual-Path Extension Messaging (`externally_connectable` + Dynamic Content-Script Bridge) | **Accepted** | PC-09, **OQ-03 (Option A)**, **OQ-04 (Option A + B)** |
| **ADR-005** | Two-Layer Per-Origin Permission Model (Top-Level Frames Only) | **Accepted** | PC-09, BR-03, BR-04, BR-06, **OQ-04 (Option A + B)**, **OQ-14 (Option A)**, **OQ-15 (Option A)**, **OQ-22 (Option A)** |
| **ADR-006** | Single Shared Model Storage in Extension Origin (`chrome-extension://`) with OPFS Staging | **Accepted** | TA-03, BD-06, **OQ-03 (Option A)**, **OQ-05 (Option C)**, **OQ-09 (Option A)** |
| **ADR-007** | Curated Model Registry, WebCrypto Signature Verification, and Streaming SHA-256 Checks | **Accepted** | BR-08, BR-11, **OQ-01 (Option B)**, **OQ-06 (Option B)**, **OQ-08 (Option A)**, **OQ-17 (Option A)** |
| **ADR-008** | Single Active Generation and Priority-FIFO Bounded Request Queue | **Accepted** | BR-09, BR-10, BR-12, **OQ-10 (Option B)**, **OQ-11 (Option A)**, **OQ-13 (Option A)** |
| **ADR-009** | Versioned Zod Protocol Schemas as Single Source of Truth | **Accepted** | FR-066, FR-080, FR-116, NFR-032 |
| **ADR-010** | Strict WebGPU-Only, Zero-Cloud-Fallback, and Zero-Telemetry Architecture | **Accepted** | PC-04, PC-05, BR-01, BR-02, BR-05, **OQ-07 (Option A)**, **OQ-12 (Option A)** |
| **ADR-011** | Self-Contained Offline Packaging of All Runtime Code, WASM, and UI Assets | **Accepted** | PC-04, TA-04, NFR-016, NFR-017 |
| **ADR-012** | Modular TypeScript Monorepo with Enforced Package Boundaries | **Accepted** | NFR-030 – NFR-032, **OQ-18 (Option A)** |

---

## 2. Decision Records

### ADR-001 — Browser-Extension-Only Local AI Provider Without Native Companion
- **Status:** Accepted (`PC-01`, `PC-02`)
- **Context:** Existing local AI tools require users to install OS-specific executables or command-line servers. Non-technical users and ordinary website visitors rarely install native software.
- **Decision:** Deliver the UOAI MVP exclusively as a **Chromium Manifest V3 browser extension** paired with a browser-based Dashboard/PWA. Require zero native desktop software, Docker, Python, Node.js, or OS-level servers.
- **Consequences:**
  - *Positive:* One-click browser store installation; cross-platform across Windows, macOS, and ChromeOS; automatic sandboxing inside the browser security model.
  - *Negative / Constraints:* Bound by browser WebGPU buffer limits, browser storage quotas/eviction policies (`KL-02`), and extension execution lifecycle constraints (`KL-04`).

---

### ADR-002 — Dedicated Web Worker Hosted in a Visible Extension Page / Side Panel Runtime Host
- **Status:** Accepted (`PC-06`, `OQ-02 = Option B`)
- **Context:** Manifest V3 Service Workers terminate after ~30 seconds of idle time and must not be used as an inference server (`PC-06`). While MV3 Offscreen Documents provide a hidden context, they restrict available extension APIs and vary across Chromium derivatives. Hosting the dedicated Web Worker inside a visible extension page/tab or extension side panel (`chrome.sidePanel`) provides full extension and Web API access (`OPFS`, `Cache Storage`, `IndexedDB`, `WebGPU`), eliminates `chrome.offscreen` compatibility quirks, and makes active local AI execution transparent to the user.
- **Decision:**
  1. Use the MV3 Service Worker strictly for message routing, origin & permission checks, queue coordination, and lifecycle recovery.
  2. Host the **Dedicated Inference Web Worker** inside a **visible extension page/tab (`chrome-extension://<id>/app.html`) or extension Side Panel (`chrome.sidePanel`)** acting as the Runtime Host (`OQ-02 = Option B`).
  3. When an authorized website requests inference and no Runtime Host page/side panel is open, the extension opens or activates the Runtime Host context (or returns `model_not_loaded` if auto-load is disabled). Closing the active Runtime Host page/panel or the browser stops active inference (`KL-06`).
- **Consequences:**
  - *Positive:* Full WebGPU and OPFS support in the dedicated Worker without `chrome.offscreen` restrictions; UI thread remains 100% responsive because inference runs in the dedicated Web Worker (`NFR-003`); user always has visible transparency when local GPU inference is running.
  - *Negative / Constraints:* Requires the UOAI extension tab or side panel to remain open while serving inference requests (`KL-06`).

---

### ADR-003 — OpenAI-Inspired Logical API via SDK Rather Than Localhost HTTP Server
- **Status:** Accepted (`PC-07`, `PC-08`, `KL-05`)
- **Context:** Developers are familiar with the OpenAI Chat Completions API, but a browser extension cannot bind a TCP listening socket to expose `http://localhost:PORT/v1`.
- **Decision:** Expose an **OpenAI-inspired logical API** (`GET /v1/models`, `POST /v1/chat/completions`, `GET /v1/health`, `GET /v1/runtime`) through the `@uoai/sdk` TypeScript package over browser extension messaging transport. Never promise a localhost HTTP endpoint.
- **Consequences:**
  - *Positive:* Preserves familiar OpenAI request/response/streaming semantics and TypeScript ergonomics (`BO-04`) without any native daemon.
  - *Negative / Constraints:* Web applications integrate via `@uoai/sdk` rather than raw REST HTTP calls.

---

### ADR-004 — Dual-Target UI & Dual-Path Extension Messaging (`externally_connectable` + Dynamic Content-Script Bridge)
- **Status:** Accepted (`OQ-03 = Option A`, `OQ-04 = Option A + Option B`)
- **Context:** The Dashboard UI must work 100% offline immediately after extension install while also supporting a trusted-origin PWA (`Section 2.4`), and third-party websites must connect without requiring `<all_urls>` host permissions.
- **Decision:**
  1. **Dual-Target UI Build (`OQ-03 = Option A`):** Build `apps/web` once and deploy it **both** inside the extension package (`chrome-extension://<id>/app.html`, primary offline dashboard and Runtime Host) **and** as an installable hosted PWA at the trusted origin (`https://app.uoai.example`), which connects via `externally_connectable` (`BR-18`).
  2. **Authorized Third-Party Websites:** Use an isolated-world **Content-Script Bridge** (`packages/browser-bridge`) dynamically registered via `chrome.scripting.registerContentScripts` **only** for origins the user has explicitly authorized (`FR-062`, `FR-067`).
- **Consequences:**
  - *Positive:* Zero content-script injection on unauthorized websites (`NFR-018`); immediate offline Dashboard availability inside the extension plus seamless web PWA entry point.

---

### ADR-005 — Two-Layer Per-Origin Permission Model (Top-Level Frames Only)
- **Status:** Accepted (`PC-09`, `BR-03`, `BR-04`, `BR-06`, `OQ-04 = Option A + B`, `OQ-14 = Option A`, `OQ-15 = Option A`, `OQ-22 = Option A`)
- **Context:** Users must have explicit, revocable, per-origin control over which websites can access their local AI.
- **Decision:**
  1. **Two-Layer Grant (`FR-061`):** An origin (`scheme://host:port`) is authorized only when both (a) UOAI's consent sheet approval in `chrome.storage.local` and (b) the browser's optional host permission (`chrome.permissions.request`) are active.
  2. **Two Authorization Trigger Paths (`OQ-04 = Option A + B`):** Users can authorize a site either (A) from the extension toolbar popup / Website Integrations screen, or (B) via a parameter-validated `web_accessible_resources` extension consent page (`chrome-extension://<id>/authorize.html?origin=...`) opened on explicit user click via `@uoai/sdk`.
  3. **Top-Level Frames Only (`OQ-15 = Option A`):** Only top-level frames (`sender.frameId === 0`) may connect; all embedded iframes/subframes are rejected (`TC-028`).
  4. **Localhost Dev Policy (`OQ-22 = Option A`):** Remote origins must use `https://`. `http://localhost:<port>` and `http://127.0.0.1:<port>` are permitted (with per-port two-layer user consent) when **Developer Mode** is enabled in Settings.
  5. **Built-In First-Party Origin (`OQ-14 = Option A`):** The build-time configured first-party PWA origin is built-in and non-revocable in MVP.
- **Consequences:**
  - *Positive:* Prevents prompt spam (`T-01`), iframe clickjacking/hijacking (`T-03`), and broad `<all_urls>` permission requests (`R-10`).

---

### ADR-006 — Single Shared Model Storage in Extension Origin (`chrome-extension://`) with OPFS Staging
- **Status:** Accepted (`OQ-03 = Option A`, `OQ-05 = Option C`, `OQ-09 = Option A`)
- **Context:** Browser storage is partitioned by origin. Models must be downloaded once and shared across the Workspace and all authorized websites, with reliable pause/resume and integrity verification.
- **Decision:**
  1. Store all model artifacts inside the **extension origin** (`chrome-extension://<id>/`) backed by `unlimitedStorage` and `navigator.storage.persist()` (`FR-106`).
  2. **OPFS Staging & Chunked Resume (`OQ-05 = Option C`, `OQ-09 = Option A`):** Persist 8 MB – 16 MB download chunks in OPFS with `ETag`/`Last-Modified` metadata (`Range` + `If-Range` on resume) and run streaming SHA-256 verification (`FR-018`) in OPFS before committing to final storage (OPFS or Cache Storage selected by Phase 0 peak memory benchmark).
- **Consequences:**
  - *Positive:* Zero duplicate storage across websites (`NFR-039`); low memory overhead during multi-GB downloads and hashing.

---

### ADR-007 — Curated Model Registry, WebCrypto Signature Verification, and Streaming SHA-256 Checks
- **Status:** Accepted (`BR-08`, `BR-11`, `OQ-01 = Option B`, `OQ-06 = Option B`, `OQ-08 = Option A`, `OQ-17 = Option A`)
- **Context:** Models must be verified for WebGPU compatibility, licensing, and file integrity before execution.
- **Decision:**
  1. **Dual-Tier MVP Catalog (`OQ-01 = Option B`):** Qualify **Gemma 4 E2B Instruct** as the primary candidate alongside **one lightweight (< 1 GB) Apache-2.0/MIT fallback model** for 8 GB integrated-GPU laptops (with Option C contingency if Gemma 4 E2B fails Phase 0 checks).
  2. **Per-Artifact Hosting URLs (`OQ-06 = Option B`):** Registry manifests support per-artifact URLs (UOAI CDN mirror for redistributable licenses; commit-pinned direct upstream URLs where required).
  3. **Signed Remote Registry Updates (`OQ-08 = Option A`):** Bundle the verified registry in the extension and verify any remote catalog updates using WebCrypto (`crypto.subtle.verify`) against a pinned public key.
  4. **Two-Speed Integrity Verification (`OQ-17 = Option A`):** Full streaming SHA-256 verification on download/install (`FR-018`); fast file existence + exact byte-size + verification-record check on normal loads; full SHA-256 re-hash on demand or after load failure.
- **Consequences:**
  - *Positive:* Strong supply-chain protection (`T-08`) without adding multi-second hashing latency to every cold model load.

---

### ADR-008 — Single Active Generation and Priority-FIFO Bounded Request Queue
- **Status:** Accepted (`BR-09`, `BR-10`, `BR-12`, `OQ-10 = Option B`, `OQ-11 = Option A`, `OQ-13 = Option A`)
- **Context:** Consumer GPUs have strict VRAM limits, and background website tabs must not starve the user's own Workspace or thrash loaded models.
- **Decision:**
  1. **Single Loaded Model & Single Active Generation (`BR-09`, `BR-12`):** At most one model is loaded and at most one generation runs at a time.
  2. **Priority-FIFO Bounded Queue (`OQ-10 = Option B`):** Maintain a bounded queue (max 5 pending globally, max 2 pending per origin — `BR-10`). First-party AI Workspace requests are prioritized ahead of pending third-party website requests in the queue (without preempting an actively running generation unless cancelled).
  3. **Immediate Cancel on User Model Switch (`OQ-11 = Option A`):** User-initiated model switching immediately cancels active/queued requests targeting the old model with `model_unloaded` (`retryable: true`), with a confirmation prompt if a Workspace generation is active.
  4. **Website Auto-Load When Idle (`OQ-13 = Option A`):** If an authorized website requests an installed `Ready` model while the runtime is `idle` (no model loaded), auto-load it; if a *different* model is already loaded, return `model_not_loaded` unless cross-model switching by websites is enabled in Settings.
- **Consequences:**
  - *Positive:* Responsive first-party Workspace UX, zero background VRAM thrashing, and seamless website wake-from-idle.

---

### ADR-009 — Versioned Zod Protocol Schemas as Single Source of Truth
- **Status:** Accepted (`FR-066`, `FR-080`, `FR-116`, `NFR-032`)
- **Context:** Messages cross multiple trust boundaries (Web Page SDK ↔ Content Script ↔ Service Worker ↔ Runtime Host ↔ Inference Worker).
- **Decision:** Define all wire envelopes, logical API payloads, streaming chunks, and error objects as versioned **Zod schemas** in `packages/api-protocol`. Infer `@uoai/sdk` TypeScript types directly from those schemas, and enforce runtime Zod validation at both the Service Worker and Runtime Host boundaries (`FR-116`).
- **Consequences:**
  - *Positive:* Compile-time and runtime schema parity; passes 10,000-case fuzzing (`TC-031`).

---

### ADR-010 — Strict WebGPU-Only, Zero-Cloud-Fallback, and Zero-Telemetry Architecture
- **Status:** Accepted (`PC-03`, `PC-04`, `PC-05`, `BR-01`, `BR-02`, `BR-05`, `OQ-07 = Option A`, `OQ-12 = Option A`)
- **Context:** Privacy-conscious users require verifiable proof that no prompts or telemetry leave their device and that unsupported hardware fails honestly rather than falling back to the cloud.
- **Decision:**
  1. **Strict WebGPU-Only in MVP (`OQ-07 = Option A`):** Require WebGPU for all MVP models and surface clear hardware troubleshooting when unavailable (`UC-11`).
  2. **Zero Cloud Fallback (`BR-02`):** Ship zero remote inference code paths in MVP (`allowRemoteModels = false`).
  3. **Zero Remote Telemetry (`OQ-12 = Option A`):** Ship zero remote analytics/telemetry endpoints in MVP and enforce content-free local diagnostic schemas (`FR-114`, `NFR-046`).
- **Consequences:**
  - *Positive:* 100% verifiable zero-egress privacy architecture (`MVP-AC-17`, `TC-033` – `TC-035`).

---

### ADR-011 — Self-Contained Offline Packaging of All Runtime Code, WASM, and UI Assets
- **Status:** Accepted (`PC-04`, `TA-04`, `NFR-016`, `NFR-017`)
- **Context:** External CDN fetches break offline startup and violate Manifest V3 remote-code policies.
- **Decision:** Package all JavaScript, WebAssembly (`.wasm`) runtime binaries, CSS, fonts, icons, and the baseline model registry inside the extension bundle (and PWA precache). Enforce `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` (`NFR-017`).
- **Consequences:**
  - *Positive:* Reliable offline startup (`MVP-AC-09`) and full Chrome Web Store / Edge Add-ons MV3 compliance (`OQ-21 = Option A`).

---

### ADR-012 — Modular TypeScript Monorepo with Enforced Package Boundaries
- **Status:** Accepted (`NFR-030` – `NFR-032`, `OQ-18 = Option A`)
- **Context:** Contributors need clean boundaries between the lightweight public SDK, the bridge, the extension, the inference worker, and the React UI.
- **Decision:** Organize the repository as the 2-app, 9-package TypeScript monorepo under a permissive open-source license (**Apache-2.0 / MIT**, `OQ-18 = Option A`) with CI-enforced dependency boundary rules (`NFR-030`).
- **Consequences:**
  - *Positive:* `@uoai/sdk` remains lightweight with zero ML/UI dependencies; clear contribution path for open-source contributors (`P5`).

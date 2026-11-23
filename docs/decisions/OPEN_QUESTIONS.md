# UOAI — Open Questions and Decisions Log (Resolved)

| Field | Value |
|---|---|
| Document | Open Questions and Decisions Log |
| Version | 0.2 (Decisions Approved) |
| Status | **Resolved — Decisions Approved by Stakeholder Review (2026-11-24)** |
| Parent | [BRD.md](../business/BRD.md) |
| Related | [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md), [SCOPE_AND_ASSUMPTIONS.md](../business/SCOPE_AND_ASSUMPTIONS.md), [PRODUCT_ROADMAP.md](../product/PRODUCT_ROADMAP.md) |

---

## 1. Executive Summary of Approved Decisions

All 22 product, architectural, legal, and operational decisions (`OQ-01` – `OQ-22`) have been formally selected and locked for the MVP baseline:

| ID | Topic | Selected Option | Summary of Approved Decision |
|---|---|---|---|
| **OQ-01** | Primary MVP Model Qualification | **Option B** | Qualify **Gemma 4 E2B Instruct** (`q4f16`/`q4`) alongside a **smaller fallback model (< 1 GB)** for 8 GB integrated-GPU laptops (with Option C contingency if Gemma 4 E2B fails Phase 0 validation). |
| **OQ-02** | Extension Runtime Host Context | **Option B** | Run the dedicated Inference Web Worker inside a **visible extension page/tab or extension side panel (`chrome.sidePanel`)** rather than a hidden offscreen document. |
| **OQ-03** | Dashboard / PWA Deployment Topology | **Option A** | **Dual-target build** from `apps/web`: packaged inside the extension (`chrome-extension://<id>/app.html`) **and** deployed as an installable hosted PWA at the trusted origin (`externally_connectable`), with all model storage in the extension origin. |
| **OQ-04** | Third-Party Website Authorization Trigger UX | **Option A + Option B** | Never request `<all_urls>`. Support **extension toolbar popup** authorization (Option A) plus a parameter-validated **`web_accessible_resources` extension consent page** (`chrome-extension://<id>/authorize.html?origin=...`, Option B) opened on user click. |
| **OQ-05** | Large Model Artifact Storage Backend | **Option C** | **Stage and verify downloads in OPFS** (chunked HTTP Range resume + streaming SHA-256), then commit to OPFS or Cache Storage based on Phase 0 peak memory benchmarks with ONNX Runtime Web. |
| **OQ-06** | Model Hosting & Redistribution Rights | **Option B** | Support **per-artifact URLs** in `packages/model-registry`: use UOAI-managed CDN mirrors for licenses permitting redistribution, and direct immutable commit-pinned upstream URLs where required. |
| **OQ-07** | Fallback When WebGPU Is Unavailable | **Option A** | **Strict WebGPU-only in MVP.** Require WebGPU for all MVP models and show actionable hardware/browser troubleshooting when unavailable (`UC-11`). |
| **OQ-08** | Remote Model Registry Updates | **Option A** | **Bundled registry** in extension + optional remote registry updates verified via **WebCrypto (`crypto.subtle.verify`)** against a pinned public key. |
| **OQ-09** | Resumable Download Granularity | **Option A** | Persist **8 MB – 16 MB chunks to OPFS** with `ETag`/`Last-Modified`; resume with `Range` + `If-Range`; restart current file if `ETag` changed or host returns `200 OK`, preserving verified sibling files. |
| **OQ-10** | Request Queue Priority | **Option B** | **Priority FIFO:** First-party AI Workspace requests are placed ahead of pending third-party website requests in the queue (without preempting an actively running generation unless cancelled). |
| **OQ-11** | Model Switching Queue Policy | **Option A** | User-initiated model switch in Dashboard **immediately cancels active/queued requests** for the old model with `model_unloaded` (`retryable: true`), after a confirmation prompt if a Workspace generation is active. |
| **OQ-12** | Product Analytics Policy in MVP | **Option A** | **Zero remote telemetry/analytics endpoints in MVP.** Measure KPIs via test lab, usability studies, store stats, npm downloads, and user-exported content-free diagnostics. |
| **OQ-13** | Website Automatic Model Loading | **Option A** | **Auto-load when runtime is `idle`** if the requested model is installed (`Ready`); if a *different* model is already loaded, return `model_not_loaded` unless cross-model switching by websites is enabled in Settings. |
| **OQ-14** | First-Party Trusted PWA Revocation | **Option A** | First-party trusted PWA origin is **built-in (non-revocable in MVP)**, with an optional advanced disable toggle as Could Have. |
| **OQ-15** | Embedded Iframe Authorization Policy | **Option A** | **Top-level frames only (`sender.frameId === 0`)** for third-party website connections in MVP; all subframes/iframes are rejected unconditionally. |
| **OQ-16** | Reference Hardware SKUs (`RC-1` – `RC-5`) | **Recommended** | QA Lead to lock and publish exact CPU, GPU, RAM, OS build, and driver versions for `RC-1` – `RC-5` during Phase 0. |
| **OQ-17** | Post-Install Integrity Re-Verification Depth | **Option A** | Full streaming SHA-256 at install (`FR-018`); **fast existence + exact byte-size + verification-record check on load**; full SHA-256 re-hash on demand or after load error. |
| **OQ-18** | Repository License & Free MVP Confirmation | **Option A** | Permissive **Apache-2.0 (or MIT) open-source license** across the monorepo and `@uoai/sdk`; **100% free MVP** (`BA-04` confirmed). |
| **OQ-19** | Named Stakeholder Roster (RACI) | **Recommended** | Named individuals to be populated in [BRD.md](../business/BRD.md) §22 at final pre-Phase 0 sign-off. |
| **OQ-20** | npm Scope & Domain Reservation | **Recommended** | Reserve `@uoai/sdk` on npm and primary project domain prior to Phase 3 / Phase 5. |
| **OQ-21** | Browser Store Targets for MVP Launch | **Option A** | **Chrome Web Store** primary launch + **Microsoft Edge Add-ons** secondary submission in Phase 6. |
| **OQ-22** | Localhost Development Origin Policy | **Option A** | Require `https://` for remote origins; allow `http://localhost:<port>` and `http://127.0.0.1:<port>` (with explicit per-port two-layer user consent) when **Developer Mode** is enabled in Settings. |

---

## 2. Detailed Decision Records (OQ-01 – OQ-22)

### OQ-01 — Primary MVP Model Qualification (Gemma 4 E2B Instruct + Lightweight Fallback)
| Field | Detail |
|---|---|
| **Status** | **Approved — Option B selected** |
| **Question** | Does the initial model candidate (**Gemma 4 E2B Instruct**) have validated browser-compatible ONNX / Transformers.js WebGPU artifacts that pass operator, memory, quality, and license checks on RC-1 – RC-3, or must a fallback open-weights candidate be used for MVP? |
| **Why It Matters** | The onboarding and inference experience depends on having at least one license-cleared model that runs reliably inside Chromium WebGPU buffer limits across both 16 GB and 8 GB devices (`BA-05`, `R-08`). |
| **Available Options** | - **Option A:** Qualify Gemma 4 E2B Instruct (`q4f16` / `q4`) as the sole MVP model.<br>- **Option B:** Qualify Gemma 4 E2B Instruct alongside a smaller fallback model (< 1 GB download) for 8 GB integrated-GPU laptops.<br>- **Option C:** Substitute an alternative open-weights model if Gemma 4 E2B Instruct fails Phase 0 WebGPU operator or license validation. |
| **Approved Decision** | **Option B (with Option C contingency):** Validate **Gemma 4 E2B Instruct** in Phase 0 as the primary MVP model while also qualifying **one lightweight (< 1 GB) Apache-2.0/MIT fallback model** for constrained 8 GB integrated-GPU laptops. |
| **Decision Owner** | Product Owner & Architecture Lead |
| **Execution Gate** | Phase 0 Exit Gate |

---

### OQ-02 — Extension Runtime Host Execution Context
| Field | Detail |
|---|---|
| **Status** | **Approved — Option B selected** |
| **Question** | Which extension-owned execution context should host the dedicated Inference Web Worker: an MV3 Offscreen Document or a visible extension page/tab (or side panel)? |
| **Why It Matters** | MV3 Service Workers cannot host long-running inference (`PC-06`). Offscreen documents expose limited APIs and vary across Chromium derivatives (`BD-03`, `R-07`), whereas a visible extension page/tab or side panel (`chrome.sidePanel`) provides full extension API access, full OPFS/IndexedDB/WebGPU access in its dedicated Web Worker, transparent visibility to the user that local AI is running, and natural lifecycle management. |
| **Available Options** | - **Option A:** MV3 Offscreen Document (`reason: "WORKERS"`).<br>- **Option B:** Visible extension page/tab (or side panel) hosting the dedicated Inference Web Worker.<br>- **Option C:** Offscreen Document primary with extension page fallback. |
| **Approved Decision** | **Option B:** Host the dedicated Inference Web Worker inside a **visible extension page/tab or extension side panel (`chrome.sidePanel`)**. This eliminates `chrome.offscreen` API limitations, ensures consistent behavior across Chromium browsers, and makes active GPU runtime execution transparent to the user. |
| **Decision Owner** | Architecture Lead |
| **Execution Gate** | Phase 0 / Phase 1 |

---

### OQ-03 — Dashboard / PWA Deployment Topology
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | Should the UOAI user interface (Dashboard / Workspace) be deployed as (a) both extension-bundled pages and a hosted trusted-origin PWA, (b) hosted PWA only, or (c) extension-bundled pages only? |
| **Why It Matters** | Packaging `apps/web` inside the extension guarantees instant 100% offline availability after extension install and serves as the visible Runtime Host (`OQ-02`), while deploying the same build as a trusted-origin PWA satisfies Section 2.4 (`externally_connectable`) and web onboarding (`FR-004`). |
| **Available Options** | - **Option A:** Dual-target build from `apps/web` (packaged in `chrome-extension://<id>/app.html` **and** deployed as an installable PWA at the trusted origin via `externally_connectable`), with all model storage in the extension origin.<br>- **Option B:** Hosted PWA only.<br>- **Option C:** Extension-bundled pages only. |
| **Approved Decision** | **Option A:** Dual-target build from `apps/web` (extension-packaged pages + trusted-origin PWA via `externally_connectable`), with all model weights stored once in the extension origin (`ADR-006`). |
| **Decision Owner** | Product Owner & Architecture Lead |
| **Execution Gate** | Phase 0 Exit Gate |

---

### OQ-04 — Third-Party Website Authorization Discovery and Trigger UX
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A + Option B selected** |
| **Question** | How should an unauthorized third-party website initiate authorization when the extension does not hold `<all_urls>` host permissions? |
| **Why It Matters** | `chrome.permissions.request()` requires a user gesture inside an extension context, and avoiding `<all_urls>` prevents store rejection and privacy risk (`R-10`, `NFR-018`). |
| **Available Options** | - **Option A:** User-initiated via the extension toolbar popup ("Allow this site to use UOAI") or manual entry in Website Integrations.<br>- **Option B:** Parameter-validated `web_accessible_resources` extension consent page (`chrome-extension://<id>/authorize.html?origin=...`) opened via user click in the SDK so the user's click inside the extension window provides the required gesture for both UOAI consent and `chrome.permissions.request()`.<br>- **Option C:** Inject discovery content script on `<all_urls>` (Rejected). |
| **Approved Decision** | **Option A + Option B:** Never request `<all_urls>`. Support both (A) toolbar popup / Dashboard manual authorization and (B) a parameter-validated `web_accessible_resources` consent page (`authorize.html`) that `@uoai/sdk` can open in a popup window on explicit user action. |
| **Decision Owner** | Security Lead & Product Owner |
| **Execution Gate** | Phase 0 / Phase 3 |

---

### OQ-05 — Large Model Artifact Storage Backend (OPFS vs. Cache Storage)
| Field | Detail |
|---|---|
| **Status** | **Approved — Option C selected** |
| **Question** | Should multi-gigabyte model weights in the extension origin be stored in OPFS, Cache Storage, or a hybrid? |
| **Why It Matters** | OPFS supports in-place chunked appending for HTTP Range resume (`FR-017`) and streaming SHA-256 verification (`FR-018`), while ONNX Runtime Web / Transformers.js read paths must minimize peak RAM usage (`TA-03`). |
| **Available Options** | - **Option A:** OPFS exclusively.<br>- **Option B:** Cache Storage exclusively.<br>- **Option C:** Stage, resume, and SHA-256-verify in OPFS, then commit to OPFS or Cache Storage based on which yields lower peak memory in ONNX Runtime Web during Phase 0 benchmarks. |
| **Approved Decision** | **Option C:** Use OPFS for download staging, HTTP Range resume, and streaming SHA-256 verification, and select the committed read store (OPFS vs. Cache Storage) based on Phase 0 peak memory benchmarks. |
| **Decision Owner** | Architecture Lead |
| **Execution Gate** | Phase 0 Exit Gate |

---

### OQ-06 — Model Hosting, Redistribution Rights, and Legal Clearance
| Field | Detail |
|---|---|
| **Status** | **Approved — Option B selected** |
| **Question** | Will UOAI download model artifacts from upstream repositories or a UOAI CDN mirror? |
| **Why It Matters** | Model licenses differ on whether weights may be re-hosted on a third-party mirror vs. fetched directly from the publisher (`ED-02`, `R-08`). |
| **Available Options** | - **Option A:** Direct upstream commit-pinned URLs only.<br>- **Option B:** Support per-artifact URLs in `packages/model-registry`: use UOAI-managed CDN mirrors for licenses permitting redistribution, and direct commit-pinned upstream URLs for licenses requiring direct download.<br>- **Option C:** UOAI CDN mirror only. |
| **Approved Decision** | **Option B.** |
| **Decision Owner** | Legal Counsel & Product Owner |
| **Execution Gate** | Phase 2 / Phase 6 |

---

### OQ-07 — Fallback Behavior When WebGPU Is Unavailable
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | On devices without WebGPU, should MVP strictly refuse model downloads with an explanation or offer a WASM CPU fallback? |
| **Why It Matters** | Keeps MVP scope focused on hardware-accelerated WebGPU inference (`PC-03`) and avoids poor multi-minute CPU latency. |
| **Available Options** | - **Option A:** Strict WebGPU-only in MVP with clear troubleshooting guidance (`UC-11`).<br>- **Option B:** Experimental WASM CPU fallback. |
| **Approved Decision** | **Option A:** Strict WebGPU-only in MVP. |
| **Decision Owner** | Product Owner |
| **Execution Gate** | Locked for MVP |

---

### OQ-08 — Remote Model Registry Update and Signature Verification
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | How should model catalog updates be delivered and verified? |
| **Why It Matters** | Allows adding newly qualified models without waiting for extension store review while preventing supply-chain tampering (`T-08`, `R-13`). |
| **Available Options** | - **Option A:** Bundle baseline registry in extension + verify remote registry updates via WebCrypto (`crypto.subtle.verify`, ECDSA P-256 / Ed25519) against a pinned public key.<br>- **Option B:** Bundled registry only. |
| **Approved Decision** | **Option A.** |
| **Decision Owner** | Security Lead & Architecture Lead |
| **Execution Gate** | Phase 2 |

---

### OQ-09 — Resumable Download Granularity and Non-Range Fallback
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | What chunk size and fallback rule should govern HTTP Range resumable downloads (`FR-017`)? |
| **Why It Matters** | Balances disk I/O with resume fidelity and prevents silent corruption if an upstream file changes (`ETag` mismatch). |
| **Available Options** | - **Option A:** Persist 8 MB – 16 MB chunks to OPFS with `ETag`/`Last-Modified`; use `Range` + `If-Range`; restart current file from byte 0 if `ETag` changed or host returns `200 OK`, preserving already-verified sibling files.<br>- **Option B:** Per-file resume only. |
| **Approved Decision** | **Option A.** |
| **Decision Owner** | Engineering Lead |
| **Execution Gate** | Phase 2 |

---

### OQ-10 — Request Queue Priority (First-Party Workspace vs. Third-Party Websites)
| Field | Detail |
|---|---|
| **Status** | **Approved — Option B selected** |
| **Question** | Should the user's own first-party AI Workspace take queue priority over background third-party website requests? |
| **Why It Matters** | Prevents background website tabs from starving the user when chatting in the UOAI AI Workspace (`R-15`). |
| **Available Options** | - **Option A:** Strict FIFO across all clients.<br>- **Option B:** Priority FIFO where first-party AI Workspace requests are placed ahead of pending third-party website requests in the queue (without preempting an already-executing generation unless the user clicks cancel). |
| **Approved Decision** | **Option B:** Priority FIFO favoring first-party Workspace requests over pending third-party website requests. |
| **Decision Owner** | Product Owner |
| **Execution Gate** | Phase 3 |

---

### OQ-11 — Model Switching Policy When Requests Are Queued
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | When a user switches models (`UC-15`, `BR-12`), should queued requests for the old model be drained or immediately cancelled? |
| **Why It Matters** | Ensures immediate UI responsiveness when the user explicitly switches models. |
| **Available Options** | - **Option A:** Immediately cancel active and queued requests for the old model with `model_unloaded` (`retryable: true`), after a confirmation prompt if a Workspace generation is active.<br>- **Option B:** Drain active generation first. |
| **Approved Decision** | **Option A.** |
| **Decision Owner** | Product Owner & Architecture Lead |
| **Execution Gate** | Phase 1 / Phase 3 |

---

### OQ-12 — Product Analytics Policy for MVP
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | Should MVP ship with zero remote analytics endpoints or include an opt-in telemetry toggle? |
| **Why It Matters** | Shipping zero remote analytics endpoints makes UOAI's zero-egress privacy guarantee trivial to audit (`BO-01`). |
| **Available Options** | - **Option A:** Strictly zero remote telemetry/analytics endpoints in MVP.<br>- **Option B:** Default-off opt-in aggregate telemetry. |
| **Approved Decision** | **Option A:** Zero remote analytics endpoints in MVP. |
| **Decision Owner** | Product Owner & Security Lead |
| **Execution Gate** | Locked for MVP |

---

### OQ-13 — Third-Party Website Automatic Model Loading Policy
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | When an authorized website requests an installed (`Ready`) model that is not currently loaded in GPU memory, should the provider auto-load it? |
| **Why It Matters** | Seamless developer experience after idle auto-unload (`BR-20`) while preventing background tabs from thrashing VRAM across different models. |
| **Available Options** | - **Option A:** Auto-load the requested installed model when the runtime is `idle` (no model loaded); if a *different* model is currently loaded, return `model_not_loaded` unless the user enables "Allow websites to switch active model" in Settings.<br>- **Option B:** Always auto-switch.<br>- **Option C:** Never auto-load. |
| **Approved Decision** | **Option A.** |
| **Decision Owner** | Product Owner & Architecture Lead |
| **Execution Gate** | Phase 3 |

---

### OQ-14 — First-Party Trusted PWA Origin Revocation Policy
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | Is the built-in first-party trusted PWA origin non-revocable in MVP? |
| **Why It Matters** | Prevents users from accidentally breaking the hosted first-party Dashboard (`BR-18`). |
| **Available Options** | - **Option A:** Built-in trusted origin is non-revocable in MVP (with an advanced disable toggle as Could Have).<br>- **Option B:** Revocable in main list. |
| **Approved Decision** | **Option A.** |
| **Decision Owner** | Security Lead |
| **Execution Gate** | Phase 3 |

---

### OQ-15 — Embedded Iframe Authorization Policy
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Question** | Should third-party website API calls be restricted strictly to top-level frames (`sender.frameId === 0`)? |
| **Why It Matters** | Eliminates hidden-iframe compute hijacking and cross-origin framing attacks (`T-03`, `FR-065`). |
| **Available Options** | - **Option A:** Top-level frames only (`sender.frameId === 0`) in MVP; all subframes/iframes are rejected unconditionally.<br>- **Option B:** Top-level + same-origin subframes. |
| **Approved Decision** | **Option A:** Top-level frames (`sender.frameId === 0`) only. |
| **Decision Owner** | Security Lead |
| **Execution Gate** | Phase 3 |

---

### OQ-16 — Exact Reference Configuration (`RC-1` – `RC-5`) Hardware SKUs
| Field | Detail |
|---|---|
| **Status** | **Approved — Recommended option selected** |
| **Approved Decision** | QA Lead will provision and publish exact CPU, GPU, RAM, OS build, and driver versions for `RC-1` – `RC-5` during Phase 0. |
| **Decision Owner** | QA Lead |
| **Execution Gate** | Phase 0 Exit Gate |

---

### OQ-17 — Post-Installation Model Integrity Re-Verification Depth
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Approved Decision** | Perform full streaming SHA-256 verification at download/install time (`FR-018`); perform fast file existence + exact byte-size + IndexedDB verification-record check on normal loads (< 20 ms); run full streaming SHA-256 re-verification on demand ("Verify Model Integrity" action) or after an unexpected model load failure. |
| **Decision Owner** | Security Lead & Architecture Lead |
| **Execution Gate** | Phase 2 |

---

### OQ-18 — Open-Source Repository License and Free MVP Confirmation
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Approved Decision** | Publish the UOAI monorepo and `@uoai/sdk` under a permissive open-source license (**Apache-2.0** or **MIT**), and confirm `BA-04` (100% free MVP with no billing or account gates). |
| **Decision Owner** | Business Sponsors & Product Owner |
| **Execution Gate** | Phase 5 / Public Repo Launch |

---

### OQ-19 — Named Stakeholder Assignments (RACI Roster)
| Field | Detail |
|---|---|
| **Status** | **Approved — Recommended option selected** |
| **Approved Decision** | Populate named individuals for Product Owner, Business Sponsor, Architecture Lead, Security Lead, QA Lead, and Legal Counsel in [BRD.md](../business/BRD.md) §22 at final pre-Phase 0 sign-off. |
| **Decision Owner** | Business Sponsors |
| **Execution Gate** | Pre-Phase 0 Sign-Off |

---

### OQ-20 — npm Scope and Domain Reservation (`@uoai/sdk`)
| Field | Detail |
|---|---|
| **Status** | **Approved — Recommended option selected** |
| **Approved Decision** | Reserve the `@uoai` scope (`@uoai/sdk`) on npm and the primary project domain prior to Phase 3 / Phase 5. |
| **Decision Owner** | Product Owner |
| **Execution Gate** | Before Phase 3 / Phase 5 |

---

### OQ-21 — Browser Web Store Publication Target List for MVP
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Approved Decision** | Target **Chrome Web Store** (primary) and **Microsoft Edge Add-ons** (secondary) in Phase 6 using the unified Chromium MV3 bundle. |
| **Decision Owner** | Product Owner |
| **Execution Gate** | Phase 6 |

---

### OQ-22 — Localhost Development Origin Policy (`http://localhost`)
| Field | Detail |
|---|---|
| **Status** | **Approved — Option A selected** |
| **Approved Decision** | Require `https://` for all remote origins; allow `http://localhost:<port>` and `http://127.0.0.1:<port>` (loopback only, still requiring explicit per-port two-layer user consent `FR-061`) when the **Developer Mode** toggle is enabled in Settings. |
| **Decision Owner** | Security Lead |
| **Execution Gate** | Phase 3 |

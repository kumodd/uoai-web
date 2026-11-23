# UOAI — Scope, Assumptions, Dependencies and Constraints

| Field | Value |
|---|---|
| Document | Scope and Assumptions |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](BRD.md) |
| Related | [RISKS_AND_DEPENDENCIES.md](../product/RISKS_AND_DEPENDENCIES.md), [ARCHITECTURE_CONSTRAINTS.md](../architecture/ARCHITECTURE_CONSTRAINTS.md), [OPEN_QUESTIONS.md](../decisions/OPEN_QUESTIONS.md) |

---

## 1. In Scope — MVP

| # | Capability | Primary requirements |
|---|---|---|
| S-01 | Chromium browser extension (Manifest V3) acting as the local AI provider | FR-040 – FR-051, FR-060 – FR-068 |
| S-02 | Browser-based dashboard / PWA (onboarding, library, workspace, integrations, console, settings) | FR-001 – FR-008, FR-030 – FR-038, FR-090 – FR-097 |
| S-03 | Local model management (catalog, install, remove, load/unload, versions) | FR-010 – FR-023 |
| S-04 | Model downloads with integrity verification | FR-016 – FR-019, FR-119 |
| S-05 | WebGPU-based inference in a dedicated Web Worker | FR-040 – FR-046 |
| S-06 | Local chat workspace with streaming and stop | FR-030 – FR-038 |
| S-07 | Offline application operation after setup | FR-100 – FR-108 |
| S-08 | OpenAI-inspired TypeScript SDK | FR-070 – FR-081 |
| S-09 | Third-party website authorization (per origin) | FR-060 – FR-068, FR-111, FR-112 |
| S-10 | Streaming chat completions | FR-045, FR-075 |
| S-11 | Model status and runtime management | FR-047 – FR-051 |
| S-12 | Permission management (list, revoke) | FR-063, FR-064 |
| S-13 | Basic developer console | FR-090 – FR-097 |
| S-14 | Local conversation history | FR-036, FR-120 |
| S-15 | Error handling and capability detection | FR-002, FR-003, FR-037, FR-048, FR-079 |
| S-16 | Privacy controls and data deletion | FR-110 – FR-124 |

## 2. Out of Scope — MVP (with future opportunity)

| # | Excluded item | Reason for exclusion | Future opportunity |
|---|---|---|---|
| X-01 | Native desktop application | Contradicts "no native install" constraint; increases distribution cost. | Optional companion app for larger models / OS-wide access (post-MVP evaluation). |
| X-02 | Always-running OS-level AI server | Extensions cannot run persistent OS services. | Native companion via Native Messaging (future, opt-in). |
| X-03 | Guaranteed `http://localhost` HTTP endpoint | Extensions cannot open TCP listeners. | Only possible with a native companion (X-01/X-02). |
| X-04 | Cloud-based inference | Contradicts local-first value proposition. | Opt-in, explicitly consented "bring your own cloud" mode (requires separate BRD amendment). |
| X-05 | Mandatory user accounts | Not needed for local inference; privacy cost. | Optional accounts for sync (future). |
| X-06 | Cloud synchronization of conversations/settings | Privacy and scope. | End-to-end-encrypted optional sync. |
| X-07 | Multi-device model synchronization | Large artifacts; per-device storage. | LAN/peer transfer of verified artifacts. |
| X-08 | iOS and Safari support | Different extension model; WebGPU/extension constraints. | Safari Web Extension port once feasible. |
| X-09 | Arbitrary compatibility with every model format | Each model needs qualification (operators, tokenizer, template). | Expanding qualified catalog; community qualification pipeline. |
| X-10 | Guaranteed support for all GPUs and browsers | WebGPU availability and drivers vary. | Expanded compatibility matrix; WASM/CPU fallback for small models (see OQ-07). |
| X-11 | Enterprise managed policies (allowed origins/models) | Not needed to prove core value. | `chrome.storage.managed` policy schema (Could Have, Phase 6+). |
| X-12 | Firefox support | Non-Chromium extension APIs differ (offscreen documents, externally_connectable). | Port evaluation post-MVP. |
| X-13 | Multimodal inputs (images, audio), embeddings, tool/function calling | Increase runtime/API scope. | Future API versions (`/v1/embeddings`, tool calls). |
| X-14 | Concurrent multi-model inference | Memory constraints; single active generation policy (BR-09). | Revisit after performance baselining. |
| X-15 | Mobile Chromium (Android) | Chrome on Android does not support extensions. | — |

## 3. Business Assumptions

| ID | Assumption | Validation |
|---|---|---|
| BA-01 | A meaningful share of target users will accept a one-time multi-gigabyte model download in exchange for offline/private AI. | Usability study, download completion KPI-02. |
| BA-02 | Developers will adopt an SDK that depends on the user having the extension installed, provided graceful fallbacks exist. | Developer interviews, KPI-11. |
| BA-03 | Small/medium instruction models running in-browser deliver sufficient quality for drafting, summarization and Q&A use cases. | Phase 0 quality evaluation. |
| BA-04 | The product can be distributed free of charge for MVP; no monetization requirement constrains MVP scope. | Product Owner confirmation (OQ-18). |
| BA-05 | At least one model with suitable license terms and browser-compatible artifacts is available for MVP. | Phase 0 model qualification (OQ-01). |

## 4. Technical Assumptions

| ID | Assumption | Validation |
|---|---|---|
| TA-01 | An extension-owned **offscreen document** (reason `WORKERS`) or extension page can host a dedicated Web Worker with WebGPU access on target Chromium browsers. | Phase 0 spike (OQ-02). |
| TA-02 | Transformers.js and/or ONNX Runtime Web (WebGPU execution provider) can run the candidate model within available GPU memory on reference configurations. | Phase 0 spike. |
| TA-03 | Extension-origin storage (OPFS / Cache Storage / IndexedDB) can hold multi-gigabyte artifacts, and the `unlimitedStorage` permission materially reduces quota/eviction risk. | Phase 0 storage spike (OQ-05). |
| TA-04 | All inference JavaScript and WebAssembly can be bundled in the extension package (no remotely hosted code), with `wasm-unsafe-eval` permitted in the extension CSP. | Phase 0 build spike. |
| TA-05 | Websites can communicate with the extension through `externally_connectable` (trusted PWA origin) and through a dynamically registered content script bridge for user-authorized third-party origins. | Phase 0 messaging spike. |
| TA-06 | Model hosting servers (e.g., Hugging Face or a UOAI mirror) support HTTP Range requests, enabling resumable downloads. | Phase 0; fallback is restart-on-failure (OQ-09). |

## 5. External Dependencies

| ID | Dependency | Impact if unavailable |
|---|---|---|
| ED-01 | Model artifact hosting (Hugging Face Hub or UOAI-controlled mirror/CDN) | New downloads impossible; installed models unaffected. |
| ED-02 | Model publishers' license terms | Model may be unusable/undistributable. |
| ED-03 | Transformers.js / ONNX Runtime Web open-source projects | Runtime capability and operator coverage. |
| ED-04 | Chrome Web Store / Microsoft Edge Add-ons review | Distribution blocked or delayed. |
| ED-05 | npm registry for SDK distribution | Developer onboarding friction. |
| ED-06 | PWA hosting origin (static hosting + TLS) | Hosted PWA unavailable for first install; extension dashboard unaffected. |

## 6. Browser Platform Dependencies

| ID | Dependency | Notes |
|---|---|---|
| BD-01 | **WebGPU** availability | Varies by browser, version, OS, GPU, driver and enterprise policy. Some Chromium-based browsers or configurations disable it. |
| BD-02 | Manifest V3 **service worker lifecycle** | Service worker is terminated when idle; it must not hold inference state. |
| BD-03 | **Offscreen Documents API** (`chrome.offscreen`) | Chromium-specific; availability and allowed reasons vary across Chromium derivatives — must be validated per browser. |
| BD-04 | `externally_connectable`, `chrome.runtime` messaging/ports | Matching patterns cannot be wildcard-all; trusted origins must be enumerated. |
| BD-05 | Optional host permissions and `chrome.scripting.registerContentScripts` | Required for third-party bridge; permission prompts require a user gesture in an extension context. |
| BD-06 | Storage APIs (OPFS, Cache Storage, IndexedDB, `chrome.storage.local`, `navigator.storage.persist()`) | Quotas and eviction behaviour are browser-controlled. |
| BD-07 | Service Worker + Cache Storage for the hosted PWA | Required for PWA offline startup. |

## 7. Hardware Dependencies

| ID | Dependency | Notes |
|---|---|---|
| HD-01 | WebGPU-capable GPU with sufficient memory for the selected model | Required memory depends on model size, quantization, context length, and runtime overhead. |
| HD-02 | System RAM | Integrated GPUs share system memory; low-RAM devices may fail to load models. |
| HD-03 | Free disk space | Must exceed model size plus temporary download space (see FR-048). |
| HD-04 | Thermal/power state | Laptops on battery may throttle; throughput varies. |

## 8. Product Constraints (Confirmed)

These are **confirmed constraints** from the product brief and are non-negotiable for MVP:

1. **PC-01** Chromium-based browsers only; browser extension is the local AI provider.
2. **PC-02** No native desktop software, Docker, Python, Node.js or local server required of end users.
3. **PC-03** WebGPU is used for hardware-accelerated inference where supported.
4. **PC-04** After setup, the product works without internet access; inference is always local.
5. **PC-05** No cloud inference fallback without explicit user consent (MVP has no cloud inference at all).
6. **PC-06** The MV3 service worker is **not** an inference server; inference runs in an extension-owned context with a dedicated Web Worker.
7. **PC-07** No permanent localhost TCP/HTTP server is promised or provided.
8. **PC-08** The OpenAI-inspired API is a **logical** API exposed via SDK and extension messaging.
9. **PC-09** Third-party websites require explicit, per-origin, revocable user authorization.
10. **PC-10** Unsupported browser/hardware capabilities must be detected and explained.

## 9. Known Limitations (to be disclosed to users and developers)

| ID | Limitation |
|---|---|
| KL-01 | **WebGPU availability varies** across browsers, versions, operating systems, GPUs, drivers and policies. Some devices will not be able to run any catalog model. |
| KL-02 | **Browser storage may be evicted.** Even with persistent-storage requests and `unlimitedStorage`, the browser or user may clear data; models may need re-downloading. |
| KL-03 | **Model memory requirements depend on the model and device.** A model that runs on one device may fail on another. |
| KL-04 | **Extension execution contexts have lifecycle limitations.** The service worker may be terminated at any time; offscreen documents/extension pages may be closed by the browser. |
| KL-05 | **No permanent localhost HTTP server.** Existing tools expecting `http://localhost:PORT/v1` will not work without an adapter; integration is through the UOAI SDK. |
| KL-06 | **Closing the active inference runtime or the browser stops active inference.** In-flight generations are terminated and reported as errors/cancellations. |
| KL-07 | **Offline readiness depends on all required assets being downloaded and cached** (application shell, runtime code/WASM, tokenizer, configuration, weights). |
| KL-08 | Not all Chromium browsers expose identical API support (e.g., WebGPU, offscreen documents, side panel). Support is defined per browser in the compatibility matrix (NFR-037). |
| KL-09 | In-browser model quality and speed are lower than large cloud models; output quality is model-dependent. |
| KL-10 | Third-party website access depends on the extension being installed and enabled in the same browser profile. |

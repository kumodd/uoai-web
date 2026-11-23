# UOAI — Functional Requirements

| Field | Value |
|---|---|
| Document | Functional Requirements Specification |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](../business/BRD.md) |
| Related | [NON_FUNCTIONAL_REQUIREMENTS.md](NON_FUNCTIONAL_REQUIREMENTS.md), [USE_CASES.md](USE_CASES.md), [API_REQUIREMENTS.md](../architecture/API_REQUIREMENTS.md), [BUSINESS_RULES.md](../business/BUSINESS_RULES.md), [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md) |

---

## 0. Conventions

- **IDs** are numbered in blocks of ten per module (FR-001 – FR-008, FR-010 – FR-023, …). Gaps are intentional and leave room for additions without renumbering.
- **Priority** uses MoSCoW: **Must Have**, **Should Have**, **Could Have**, **Won't Have (MVP)**.
- **User roles:** *End User* (P1/P3), *Developer* (P2), *Website* (a third-party web origin acting through the SDK), *Administrator* (P4, or the end user acting as the extension's administrator), *System* (UOAI components acting automatically).
- **Components** referenced: *Dashboard* (extension pages and/or trusted PWA — see OQ-03), *Service Worker (SW)*, *Runtime Host* (offscreen document or extension page — see OQ-02), *Inference Worker*, *Bridge* (content script), *SDK*.
- Acceptance criteria are written to be directly testable; test-case IDs are mapped in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) and [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md).

---

## 7.1 Onboarding and Setup

### FR-001 — Welcome screen
| Field | Detail |
|---|---|
| Description | On first launch (no completed onboarding flag), the Dashboard shows a welcome screen explaining what UOAI does, what runs locally, what requires internet (setup only), and the steps ahead. |
| Business rationale | Sets accurate expectations for non-technical users (BO-03) and builds trust (BO-01). |
| User role | End User |
| Priority | Must Have |
| Preconditions | Extension installed; onboarding not completed. |
| Expected behavior | Welcome screen opens automatically after installation (extension `onInstalled` opens the Dashboard) and whenever onboarding is incomplete. It provides "Get started" and "Learn about privacy" actions. |
| Acceptance criteria | 1. After a fresh install, the Dashboard opens to the welcome screen within 3 s of the install completing.<br>2. Screen states in plain language: inference is local; internet is needed only for setup/downloads; prompts are not sent to UOAI servers.<br>3. "Get started" advances to the compatibility check (FR-002).<br>4. Once onboarding is completed, the welcome screen no longer shows on subsequent launches. |
| Dependencies | FR-002, FR-122 |

### FR-002 — Browser compatibility check
| Field | Detail |
|---|---|
| Description | The system checks browser family, version, and required APIs (extension messaging, offscreen documents or equivalent, Web Workers, OPFS/Cache Storage, IndexedDB, Storage Manager, service worker support) and reports each result. |
| Business rationale | Honest capability communication (BO-06, BR-13). Chromium derivatives differ in API support (KL-08). |
| User role | End User, System |
| Priority | Must Have |
| Preconditions | Dashboard open. |
| Expected behavior | Runs automatically during onboarding and on demand from Settings / Provider Dashboard. Each check reports Pass / Warn / Fail with a plain-language explanation and, where possible, a remedy. |
| Acceptance criteria | 1. Every check in the compatibility matrix (NFR-037) produces a Pass/Warn/Fail result.<br>2. For a browser outside the support matrix, a message names the limitation and suggests a supported browser.<br>3. Results are stored locally and timestamped; the user can re-run checks.<br>4. Checks complete within 5 s on RC-1 – RC-3 (excluding WebGPU adapter request time, which is reported separately). |
| Dependencies | FR-003, NFR-037 |

### FR-003 — WebGPU capability detection
| Field | Detail |
|---|---|
| Description | In the Runtime Host/Inference Worker context (not only the page context), the system requests a WebGPU adapter and device, records adapter info (where exposed), limits (e.g., `maxBufferSize`, `maxStorageBufferBindingSize`), and supported features (e.g., `shader-f16`). |
| Business rationale | WebGPU availability varies by browser, OS, GPU, driver, and policy (KL-01). Model compatibility depends on these limits. |
| User role | System |
| Priority | Must Have |
| Preconditions | Runtime Host can be created (FR-040). |
| Expected behavior | Results are classified as: *Supported*, *Supported with limitations* (e.g., no `shader-f16`, low buffer limits), or *Unsupported* (no `navigator.gpu`, adapter null, device creation failed). Unsupported states show reasons and options (update browser/driver, enable hardware acceleration, try a different browser/device). |
| Acceptance criteria | 1. With WebGPU disabled (e.g., via browser flag or policy), detection reports *Unsupported* with a specific reason in 100% of test runs.<br>2. Detection runs in the same context type that will perform inference.<br>3. Captured limits/features are available to model compatibility assessment (FR-012).<br>4. No model download is offered as "Compatible" when detection is *Unsupported* (BR-13). |
| Dependencies | FR-040, FR-012, UC-11 |

### FR-004 — Extension installation guidance
| Field | Detail |
|---|---|
| Description | When the trusted PWA (or the SDK on a third-party site) is opened without the extension installed or enabled, it detects this and guides the user to install or enable the extension from the official store listing. |
| Business rationale | The extension is the provider. Without it, no inference is possible (PC-01). |
| User role | End User |
| Priority | Must Have |
| Preconditions | PWA or SDK loaded in a page. |
| Expected behavior | The PWA attempts `chrome.runtime.connect` to the configured extension ID. On failure, it shows installation guidance with a store link and steps. After installation it re-detects automatically (polling with back-off, or on user "I've installed it"). |
| Acceptance criteria | 1. With no extension installed, the PWA shows "Extension required" guidance within 2 s.<br>2. After installation and a page re-check, the PWA detects the extension without a full reinstall of the PWA.<br>3. A disabled extension produces a distinct message ("UOAI extension is disabled") where distinguishable; otherwise a combined "not installed or disabled" message. |
| Dependencies | FR-071, FR-079 |

### FR-005 — Offline readiness check
| Field | Detail |
|---|---|
| Description | The onboarding flow ends with a readiness check confirming all assets needed for offline use are present: app shell, runtime JS/WASM, tokenizer, configuration, model weights, and a passed integrity check. |
| Business rationale | Offline operation depends on all required assets being cached (KL-07, BO-02). |
| User role | End User, System |
| Priority | Must Have |
| Preconditions | At least one model installed. |
| Expected behavior | Shows a checklist with each asset group and status. Overall status is *Offline Ready* only when every item passes. Uses the same logic as FR-100. |
| Acceptance criteria | 1. If any required asset is missing, status is *Not Offline Ready* and the missing item is named.<br>2. With all assets present, status is *Offline Ready*, and an offline launch test (TC-017) succeeds.<br>3. The check makes no network requests. |
| Dependencies | FR-100, FR-103 |

### FR-006 — First model download (guided)
| Field | Detail |
|---|---|
| Description | Onboarding recommends a compatible model from the catalog based on capability results, shows its size, license, and requirements, and starts the download on confirmation. |
| Business rationale | Reduces decision burden for non-technical users (BO-03). |
| User role | End User |
| Priority | Must Have |
| Preconditions | FR-002 and FR-003 completed; at least one catalog model assessed *Compatible* or *Compatible with limitations*. |
| Expected behavior | Displays one recommended model (plus an option to browse the library), available disk space, estimated size, and license summary. Requires license acceptance where applicable (FR-015). The download continues if the user navigates elsewhere in the Dashboard. |
| Acceptance criteria | 1. The recommended model is never one assessed *Incompatible*.<br>2. Size, license name, and minimum requirements are visible before confirmation.<br>3. If no compatible model exists, onboarding explains why and does not offer a download (links to UC-11 / UC-12 guidance).<br>4. If free space is less than model size plus a safety margin (proposed 10%), a warning blocks the download. |
| Dependencies | FR-010, FR-012, FR-015, FR-016, FR-048 |

### FR-007 — Initial model loading
| Field | Detail |
|---|---|
| Description | After verification, onboarding loads the model into the Inference Worker and shows staged progress (preparing runtime, loading weights, compiling shaders/warm-up). |
| Business rationale | First load can take significant time; visible progress prevents abandonment (BO-03). |
| User role | End User, System |
| Priority | Must Have |
| Preconditions | Model status *Ready* (verified). |
| Expected behavior | Load progress stages are shown. On success, status becomes *Loaded*. On failure, a categorized error (e.g., insufficient GPU memory, unsupported operator, WebGPU device lost) is shown with recovery options. |
| Acceptance criteria | 1. Progress stage text updates at least at every stage transition.<br>2. On success, the Provider Dashboard status shows the model as *Loaded*.<br>3. On induced failure (e.g., simulated OOM), a user-readable error and a "Try again" / "Choose smaller model" action appear. |
| Dependencies | FR-041, FR-021, FR-037 |

### FR-008 — First successful inference
| Field | Detail |
|---|---|
| Description | Onboarding offers a sample prompt and runs a first local generation, confirming the setup works end to end, and then marks onboarding complete. |
| Business rationale | Proves value immediately; measures activation (KPI-03). |
| User role | End User |
| Priority | Must Have |
| Preconditions | Model *Loaded*. |
| Expected behavior | User sends a pre-filled or custom prompt. The response streams. On completion, onboarding shows "You're set up" with offline-ready status and links to the Workspace and Integrations. |
| Acceptance criteria | 1. A streamed response is displayed from the local runtime with no network request containing prompt content (verified by network audit, TC-033).<br>2. Onboarding completion flag is set only after at least one successful generation.<br>3. If generation fails, onboarding remains incomplete and shows the error with retry. |
| Dependencies | FR-044, FR-045, FR-005 |

---

## 7.2 Model Library

### FR-010 — Model discovery (catalog)
| Field | Detail |
|---|---|
| Description | The Model Library lists models from the UOAI model registry: a curated manifest of **qualified** models only (BR-11). A copy of the registry is bundled with the extension; an updated registry may be fetched when online and must be signature- or hash-verified (OQ-08). |
| Business rationale | Prevents users from downloading untested models (BO-06, BO-08). |
| User role | End User, Administrator |
| Priority | Must Have |
| Preconditions | Extension installed. |
| Expected behavior | Shows model cards (name, publisher, size, quantization, context length, license, compatibility badge, install status). Filters: Installed, Compatible, All. Works offline using the bundled/last verified registry. |
| Acceptance criteria | 1. Only models present in the verified registry are displayed.<br>2. Offline, the library displays the last verified registry and installed models.<br>3. A registry update that fails verification is rejected and the previous registry is kept. |
| Dependencies | MODEL_COMPATIBILITY_REQUIREMENTS, FR-012 |

### FR-011 — Model details view
| Field | Detail |
|---|---|
| Description | Selecting a model shows full details: description, intended uses, limitations, publisher, version, artifact list with sizes, quantization, context length, license, hardware/memory requirements, qualification date, and tested configurations. |
| Business rationale | Informed choice and license transparency (BO-08). |
| User role | End User, Developer, Administrator |
| Priority | Must Have |
| Preconditions | Model in registry. |
| Expected behavior | Details are rendered from the registry manifest. Install/Remove/Load actions are available per status. |
| Acceptance criteria | 1. All manifest fields listed in MODEL_COMPATIBILITY_REQUIREMENTS §4 are visible.<br>2. Model identifier (as used in the API) is shown and copyable. |
| Dependencies | FR-010 |

### FR-012 — Model compatibility assessment
| Field | Detail |
|---|---|
| Description | For each model, the system compares declared requirements (WebGPU features, buffer limits, estimated memory, disk) with detected capabilities and assigns *Compatible*, *Compatible with limitations*, *Incompatible*, or *Unknown*. |
| Business rationale | Prevents failed multi-GB downloads (BO-06, BR-13). |
| User role | System |
| Priority | Must Have |
| Preconditions | FR-003 results available. |
| Expected behavior | Badges are shown with reasons. *Incompatible* models cannot be downloaded unless an "Advanced: download anyway" override is enabled in Settings (Could Have, default off, with a warning). *Unknown* (e.g., device memory not exposed) shows a caution. |
| Acceptance criteria | 1. A model requiring `shader-f16` is *Incompatible* on a device lacking it (verified with mocked capabilities).<br>2. Each non-*Compatible* badge displays at least one human-readable reason.<br>3. Assessment is recomputed when capabilities are re-checked. |
| Dependencies | FR-003, FR-048 |

### FR-013 — Model size and quantization information
| Field | Detail |
|---|---|
| Description | Displays download size, estimated on-disk size, quantization scheme (e.g., q4, q4f16, fp16), and estimated runtime memory. |
| Business rationale | Size drives download feasibility and memory fit. |
| User role | End User, Developer |
| Priority | Must Have |
| Preconditions | Registry manifest contains size/quantization. |
| Expected behavior | Sizes in human-readable units (MB/GB, base-10 labelled). Runtime memory shown as an estimate with an explanation. |
| Acceptance criteria | 1. Displayed download size equals the sum of artifact sizes in the manifest (±1 display-rounding unit).<br>2. Quantization label is shown on card and details. |
| Dependencies | FR-010 |

### FR-014 — Context length information
| Field | Detail |
|---|---|
| Description | Displays the model's maximum supported context length and the context length UOAI configures by default (which may be lower to fit memory). |
| Business rationale | Developers need limits to size prompts; users understand conversation limits. |
| User role | Developer, End User |
| Priority | Must Have |
| Preconditions | Manifest contains context metadata. |
| Expected behavior | Shows "Max context: N tokens; UOAI default: M tokens". The same values are exposed through `models.list` (FR-073). |
| Acceptance criteria | 1. Values shown in UI equal the values returned by `models.list` for the same model. |
| Dependencies | FR-073 |

### FR-015 — License information and acceptance
| Field | Detail |
|---|---|
| Description | Displays license name, link/text (bundled copy for offline viewing), key usage restrictions summary, and attribution. If the license requires acceptance, the user must accept before download (BR-19). |
| Business rationale | Model license obligations (BO-08). |
| User role | End User, Administrator |
| Priority | Must Have |
| Preconditions | Manifest contains license metadata. |
| Expected behavior | Acceptance is recorded locally with model ID, license version, and timestamp. |
| Acceptance criteria | 1. Download cannot start for an acceptance-required model until acceptance is given (TC-006).<br>2. Full license text is viewable offline for installed models.<br>3. Acceptance record is deleted when the user performs "Delete all data". |
| Dependencies | FR-010, FR-121 |

### FR-016 — Download progress
| Field | Detail |
|---|---|
| Description | Shows per-model and per-file progress: bytes downloaded / total, percentage, current rate, estimated time remaining, and state (Queued, Downloading, Paused, Verifying, Installing, Failed, Completed). |
| Business rationale | Multi-GB downloads need transparency (BO-03). |
| User role | End User |
| Priority | Must Have |
| Preconditions | Download started. |
| Expected behavior | Progress updates at least once per second while downloading. The download continues while Dashboard pages are closed if the extension context hosting the download remains alive; otherwise it is resumable (FR-108). |
| Acceptance criteria | 1. Progress values are monotonic non-decreasing within a download attempt.<br>2. State transitions are displayed within 1 s of occurring.<br>3. Failure shows the cause category (network, storage quota, integrity, server error). |
| Dependencies | FR-019, FR-108 |

### FR-017 — Download pause/resume (where feasible)
| Field | Detail |
|---|---|
| Description | Users can pause and resume downloads. Resume uses HTTP Range requests when the host supports them; otherwise the current file restarts (completed files are kept). |
| Business rationale | Large downloads on unreliable networks (BO-03). |
| User role | End User |
| Priority | Should Have |
| Preconditions | Download in progress; host Range support determines granularity (TA-06). |
| Expected behavior | Pause stops network activity within 2 s. Resume continues from the last persisted byte offset (Range) or the start of the current file. The UI states which mode applies. |
| Acceptance criteria | 1. After pause, no further bytes are received (verified by network log) within 2 s.<br>2. With a Range-capable host, resume does not re-download completed bytes of the current file (±1 chunk).<br>3. With a non-Range host, completed files are not re-downloaded. |
| Dependencies | FR-108, OQ-09 |

### FR-018 — Download integrity verification
| Field | Detail |
|---|---|
| Description | Every downloaded artifact is verified against the SHA-256 hash (and size) declared in the verified registry manifest before the model can become *Ready* (BR-08). |
| Business rationale | Prevents tampered or corrupted artifacts from running (T-08). |
| User role | System |
| Priority | Must Have |
| Preconditions | All artifact files downloaded. |
| Expected behavior | Verification uses streaming hashing to avoid loading whole files into memory. Mismatch → file discarded, model marked *Failed — integrity*, user offered re-download. |
| Acceptance criteria | 1. A single flipped byte in any artifact causes verification failure (TC-008).<br>2. A model with any unverified file is never *Ready* or loadable.<br>3. Verification state survives Dashboard reload. |
| Dependencies | FR-119, FR-010 |

### FR-019 — Model installation
| Field | Detail |
|---|---|
| Description | After verification, artifacts are committed to persistent extension-origin storage and the model's metadata record is written atomically with status *Ready*. |
| Business rationale | Consistent model state across restarts (BO-02). |
| User role | System |
| Priority | Must Have |
| Preconditions | FR-018 passed. |
| Expected behavior | Temporary files are moved/renamed into final storage; metadata in IndexedDB records model ID, version, files, hashes, sizes, install time. Partial installs are rolled back. |
| Acceptance criteria | 1. Killing the browser during installation never leaves a model shown as *Ready* with missing files (TC-013).<br>2. After installation, the model appears under Installed and is available offline. |
| Dependencies | FR-018, FR-108 |

### FR-020 — Model removal
| Field | Detail |
|---|---|
| Description | Users can remove an installed model, freeing its storage. |
| Business rationale | Storage control (BO-06). |
| User role | End User, Administrator |
| Priority | Must Have |
| Preconditions | Model installed. |
| Expected behavior | Confirmation dialog states the space to be freed and that re-download requires internet. If the model is loaded, it is unloaded first (in-flight requests fail with `model_unloaded`). |
| Acceptance criteria | 1. After removal, storage usage decreases by approximately the model size (±5%).<br>2. The model no longer appears in `models.list`.<br>3. Removing a loaded model unloads it and reports affected requests with `model_unloaded`. |
| Dependencies | FR-050, FR-023 |

### FR-021 — Model loading and unloading (user-initiated)
| Field | Detail |
|---|---|
| Description | Users can load a *Ready* model into the runtime or unload it from the Library or Provider Dashboard. |
| Business rationale | Resource control; model switching (BR-12). |
| User role | End User |
| Priority | Must Have |
| Preconditions | Model *Ready*; runtime available. |
| Expected behavior | Loading a different model triggers safe replacement (FR-050, UC-15). Status reflects *Loading*, *Loaded*, *Unloading*, *Error*. |
| Acceptance criteria | 1. Only one model is loaded at a time in MVP.<br>2. Unload releases runtime resources (NFR-041).<br>3. Load/unload actions are disabled while a conflicting transition is in progress. |
| Dependencies | FR-041, FR-050 |

### FR-022 — Model version management
| Field | Detail |
|---|---|
| Description | The registry may publish a newer version of an installed model. The user is notified and can update. The old version remains usable until the new one is verified; then the user chooses to replace it. |
| Business rationale | Safe updates without breaking offline use. |
| User role | End User |
| Priority | Should Have |
| Preconditions | Online registry refresh found a newer version. |
| Expected behavior | "Update available" badge. Updating downloads in parallel storage; on verification the user confirms replacement; the old version is deleted unless "keep both" is chosen (Could Have). API identifiers support version pinning (see API_REQUIREMENTS §6). |
| Acceptance criteria | 1. An interrupted update never removes the working old version.<br>2. After update, `models.list` reports the new version. |
| Dependencies | FR-010, FR-018, FR-019 |

### FR-023 — Storage usage information
| Field | Detail |
|---|---|
| Description | Shows total UOAI storage usage, usage per model, conversation data size, browser-reported quota/usage estimate, and persistence status. |
| Business rationale | Large artifacts; eviction risk transparency (KL-02). |
| User role | End User, Administrator |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Uses `navigator.storage.estimate()` plus UOAI's own accounting. Labels estimates as estimates. |
| Acceptance criteria | 1. Per-model usage is within ±5% of actual artifact sizes.<br>2. Persistence status (persisted / not persisted / unknown) is displayed. |
| Dependencies | FR-106, FR-107 |

---

## 7.3 Local AI Workspace

### FR-030 — Chat interface
| Field | Detail |
|---|---|
| Description | A chat workspace with message list, multi-line composer, send button, model indicator, and runtime status chip. |
| Business rationale | Core end-user value (BO-01, BO-03). |
| User role | End User |
| Priority | Must Have |
| Preconditions | Dashboard open. |
| Expected behavior | Enter sends; Shift+Enter inserts a newline; send is disabled when there is no loaded/loadable model or while generating (unless queueing is enabled). Assistant output is rendered as sanitized Markdown (no script execution, no remote image loading by default). |
| Acceptance criteria | 1. Keyboard-only users can compose, send, and stop (NFR-027).<br>2. Markdown rendering never executes scripts or loads remote resources (TC-029 variant).<br>3. Messages display role, timestamp, and model ID. |
| Dependencies | FR-031, FR-033, FR-034 |

### FR-031 — Model selection in workspace
| Field | Detail |
|---|---|
| Description | Users can choose which installed model a conversation uses. |
| Business rationale | Flexibility; model switching (UC-15). |
| User role | End User |
| Priority | Must Have |
| Preconditions | ≥ 1 model *Ready*. |
| Expected behavior | Selector lists *Ready* models with a loaded indicator. Choosing an unloaded model prompts to load (replacing the current model). |
| Acceptance criteria | 1. Only *Ready* models are selectable.<br>2. The selected model is persisted per conversation. |
| Dependencies | FR-021, FR-050 |

### FR-032 — Conversation management
| Field | Detail |
|---|---|
| Description | Create, rename, list, search by title, and delete conversations. |
| Business rationale | Usability for repeated use. |
| User role | End User |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Sidebar list ordered by last activity. Titles default to a truncated first message or "New conversation" (title generation by the model is Could Have and must be local). |
| Acceptance criteria | 1. Create/rename/delete persist across Dashboard reload and browser restart.<br>2. Deletion requires confirmation and removes all messages of that conversation from IndexedDB. |
| Dependencies | FR-036 |

### FR-033 — Streaming output display
| Field | Detail |
|---|---|
| Description | Assistant responses render incrementally as tokens arrive. |
| Business rationale | Perceived responsiveness. |
| User role | End User |
| Priority | Must Have |
| Preconditions | Generation in progress. |
| Expected behavior | Text appends progressively; auto-scroll unless the user has scrolled up; screen-reader announcements are throttled (NFR-028). |
| Acceptance criteria | 1. First visible text appears within 250 ms of the first token event reaching the Dashboard.<br>2. UI remains responsive (no main-thread long task > 200 ms attributable to rendering) during streaming on RC-1 – RC-3. |
| Dependencies | FR-045, NFR-003 |

### FR-034 — Stop generation
| Field | Detail |
|---|---|
| Description | A Stop control cancels the current generation. |
| Business rationale | User control; resource saving. |
| User role | End User |
| Priority | Must Have |
| Preconditions | Generation in progress. |
| Expected behavior | Stop sends cancellation (FR-046). Partial output is kept and marked "Stopped". |
| Acceptance criteria | 1. Token display stops within 500 ms of pressing Stop on RC-1 – RC-3 (NFR-004).<br>2. The message is labelled as stopped; the runtime returns to *Idle* or processes the next queued request. |
| Dependencies | FR-046 |

### FR-035 — Clear conversation
| Field | Detail |
|---|---|
| Description | Clears all messages in the current conversation while keeping the conversation entry. |
| Business rationale | Quick context reset. |
| User role | End User |
| Priority | Should Have |
| Preconditions | Conversation has messages; not generating. |
| Expected behavior | Confirmation, then messages are deleted from storage. |
| Acceptance criteria | 1. After clearing, the conversation shows zero messages after reload. |
| Dependencies | FR-036 |

### FR-036 — Local conversation history
| Field | Detail |
|---|---|
| Description | Conversations and messages are stored only in local IndexedDB in the Dashboard's origin (extension origin or PWA origin per OQ-03), retained until the user deletes them (BR-22). |
| Business rationale | Privacy (BO-01) with continuity. |
| User role | End User |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | History persists across restarts; never transmitted. A setting allows disabling history ("ephemeral mode", Should Have). |
| Acceptance criteria | 1. History is available after browser restart offline (TC-039).<br>2. Network audit shows no conversation data leaving the device (TC-033).<br>3. With history disabled, no messages are written to storage. |
| Dependencies | FR-120 |

### FR-037 — Error and loading states
| Field | Detail |
|---|---|
| Description | The workspace displays clear states: no model installed, model loading (with stage), generating, queued (position), error (category + action), runtime unavailable, WebGPU unsupported. |
| Business rationale | Honest communication (BO-06). |
| User role | End User |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Each error maps from an API error code (API_REQUIREMENTS §7) to a plain-language message and at least one recovery action. |
| Acceptance criteria | 1. Every error code in the API error catalogue has a UI message (verified by unit test over the catalogue).<br>2. No raw stack traces are displayed by default (available in diagnostics). |
| Dependencies | FR-079, FR-097 |

### FR-038 — Offline workspace operation
| Field | Detail |
|---|---|
| Description | The workspace is fully functional offline for installed models: chat, history, model switching between installed models. |
| Business rationale | BO-02. |
| User role | End User |
| Priority | Must Have |
| Preconditions | Offline Ready (FR-100). |
| Expected behavior | An offline indicator is shown. Features needing network (registry refresh, downloads) are disabled with an explanation. |
| Acceptance criteria | 1. With the network disabled at OS level, a user can open the workspace and complete a generation (TC-018).<br>2. Network-dependent actions show "Requires internet" rather than failing silently. |
| Dependencies | FR-100, FR-104, FR-105 |

---

## 7.4 Inference Runtime

### FR-040 — WebGPU initialization
| Field | Detail |
|---|---|
| Description | The Runtime Host creates a dedicated Inference Worker, which requests a WebGPU adapter and device with the limits/features required by the target model. |
| Business rationale | Hardware acceleration (PC-03). The service worker must not host inference (PC-06). |
| User role | System |
| Priority | Must Have |
| Preconditions | Runtime Host exists (offscreen document or extension page, per OQ-02). |
| Expected behavior | Device-lost events are handled: status becomes *Error — device lost*, and recovery (FR-049) is attempted. If WebGPU is unavailable, the runtime reports `webgpu_unavailable`. (A WASM/CPU fallback is not in MVP unless OQ-07 decides otherwise.) |
| Acceptance criteria | 1. Inference never executes in the extension service worker (verified by architecture test / code review).<br>2. A simulated `device.lost` produces status *Error* and triggers recovery within 2 s.<br>3. Without WebGPU, the runtime returns `webgpu_unavailable` to all callers. |
| Dependencies | FR-003, FR-049, ADR-002 |

### FR-041 — Model initialization
| Field | Detail |
|---|---|
| Description | Loads verified artifacts from local storage into the inference engine (Transformers.js / ONNX Runtime Web through `packages/model-adapters`), configures the context length, and performs a warm-up. |
| Business rationale | Prepares local inference (BO-01). |
| User role | System |
| Priority | Must Have |
| Preconditions | Model *Ready*; WebGPU device available. |
| Expected behavior | Loads only from local storage (never fetches weights from network during load). Reports progress stages. Errors are categorized (`insufficient_resources`, `unsupported_model`, `model_corrupted`, `internal_error`). |
| Acceptance criteria | 1. With the network disabled, loading an installed model succeeds (TC-018).<br>2. Network log shows zero requests during model load.<br>3. Load failure leaves the runtime in a clean *Idle/Error* state where another load can be attempted. |
| Dependencies | FR-019, FR-040, FR-048 |

### FR-042 — Tokenization
| Field | Detail |
|---|---|
| Description | Uses the model's qualified tokenizer (bundled with the model artifacts) to encode inputs and decode outputs, and to count tokens for limits and `usage` reporting. |
| Business rationale | Correct model behaviour and limit enforcement. |
| User role | System |
| Priority | Must Have |
| Preconditions | Model loaded. |
| Expected behavior | Token counts are returned in `usage` (prompt, completion, total). Decoding handles multi-byte characters across token boundaries without emitting broken characters in streams. |
| Acceptance criteria | 1. For the qualification test set, token counts match the reference tokenizer implementation exactly.<br>2. Streaming non-ASCII text (e.g., emoji, Devanagari, CJK) never emits replacement characters caused by split sequences. |
| Dependencies | MODEL_COMPATIBILITY_REQUIREMENTS |

### FR-043 — Prompt processing (chat template)
| Field | Detail |
|---|---|
| Description | Converts the `messages` array (`system`, `user`, `assistant` roles) into the model's prompt format using the qualified chat template, and enforces the context window. |
| Business rationale | Correct, consistent outputs across clients. |
| User role | System |
| Priority | Must Have |
| Preconditions | Model loaded; request validated. |
| Expected behavior | If the model lacks native system-role support, the template adapter applies the documented fallback (e.g., prepend to first user turn). If prompt tokens + `max_tokens` exceed the context, the request fails with `context_length_exceeded` (no silent truncation in API requests). The Workspace may apply a documented truncation strategy for long conversations (Should Have). |
| Acceptance criteria | 1. Rendered prompts match golden-file outputs for the qualification test set.<br>2. Over-length API requests return `context_length_exceeded` with prompt token count and limit. |
| Dependencies | FR-042, FR-066 |

### FR-044 — Token generation
| Field | Detail |
|---|---|
| Description | Generates tokens with supported sampling parameters: `temperature`, `top_p`, `max_tokens`, `stop` (up to 4 sequences), and `seed` (best-effort determinism). |
| Business rationale | OpenAI-inspired controls (BO-04). |
| User role | System |
| Priority | Must Have |
| Preconditions | Prompt processed. |
| Expected behavior | Ends on EOS, stop sequence, `max_tokens`, or cancellation. `finish_reason` is one of `stop`, `length`, `cancelled`, `error`. Unsupported OpenAI parameters are rejected or ignored per API_REQUIREMENTS §5.3. |
| Acceptance criteria | 1. `max_tokens: N` never yields more than N completion tokens.<br>2. A stop sequence present in output terminates generation, and the stop sequence is not included in the content.<br>3. `finish_reason` is correct for each termination cause in tests. |
| Dependencies | FR-043, FR-045, FR-046 |

### FR-045 — Streaming
| Field | Detail |
|---|---|
| Description | Emits incremental token deltas from the Inference Worker through the Runtime Host and SW to the requesting client (Dashboard or website port) as stream chunk messages. |
| Business rationale | Responsiveness (BO-04). |
| User role | System |
| Priority | Must Have |
| Preconditions | Generation started with `stream: true` (API) or Workspace request. |
| Expected behavior | Chunks are ordered and sequence-numbered; the final chunk contains `finish_reason` and optional `usage`. Delivery is only to the originating client port (no broadcast). Chunks may be coalesced (e.g., every ≤ 50 ms) to limit messaging overhead. |
| Acceptance criteria | 1. Concatenated deltas equal the non-streamed output for the same seed/params (deterministic test model).<br>2. No chunk is delivered to any port other than the originating port (TC-029).<br>3. Every stream terminates with exactly one terminal event (done or error). |
| Dependencies | FR-067, FR-075 |

### FR-046 — Cancellation
| Field | Detail |
|---|---|
| Description | Active or queued requests can be cancelled by the originating client (SDK `AbortSignal`, Workspace Stop), by revocation, by port disconnect, or by model unload. |
| Business rationale | User control; resource management. |
| User role | System, End User, Website |
| Priority | Must Have |
| Preconditions | Request exists. |
| Expected behavior | Queued requests are removed. The active request stops generation at the next token boundary. The client receives a terminal `generation_cancelled` (or `permission_revoked` / `model_unloaded` with cause). A client can only cancel its own requests. |
| Acceptance criteria | 1. Token emission stops within 500 ms of cancellation on RC-1 – RC-3 (NFR-004).<br>2. Port disconnect (tab closed) cancels that port's requests within 1 s.<br>3. Attempting to cancel another origin's request ID has no effect and returns `request_not_found`. |
| Dependencies | FR-051, FR-076 |

### FR-047 — Runtime status
| Field | Detail |
|---|---|
| Description | Maintains and publishes runtime state: `not_started`, `starting`, `idle`, `loading_model`, `ready`, `generating`, `unloading`, `error`, `recovering`, plus loaded model ID, queue length, WebGPU status, and last error code. |
| Business rationale | Transparency (PB-06) and integration (FR-078). |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | The SW can answer status queries even if the Runtime Host is not running (reports `not_started`). Status changes are pushed to subscribed Dashboard views. Websites receive a reduced view (no other origins' info). |
| Acceptance criteria | 1. Status in Provider Dashboard updates within 1 s of a state change.<br>2. The website-facing status contains no information about other origins or conversation content. |
| Dependencies | FR-078, FR-097 |

### FR-048 — Resource checks
| Field | Detail |
|---|---|
| Description | Before download and load, checks free storage (`navigator.storage.estimate`), WebGPU limits against model requirements, and available device memory hints (`navigator.deviceMemory` where available, noting it is coarse). |
| Business rationale | Prevents predictable failures (BO-06, UC-12). |
| User role | System |
| Priority | Must Have |
| Preconditions | Model requirements known. |
| Expected behavior | Produces Pass/Warn/Fail with reasons. Fail blocks the action (unless an advanced override is enabled); Warn allows it with a caution. |
| Acceptance criteria | 1. With a mocked quota below model size, download is blocked with `insufficient_storage` and a message stating space required vs available.<br>2. With mocked WebGPU limits below requirement, load is blocked with `insufficient_resources`. |
| Dependencies | FR-003, FR-012 |

### FR-049 — Runtime recovery
| Field | Detail |
|---|---|
| Description | Detects Inference Worker crash, Runtime Host closure, WebGPU device loss, or SW restart, and restores a consistent state. |
| Business rationale | Reliability despite extension lifecycle limits (KL-04, BO-06). |
| User role | System |
| Priority | Must Have |
| Preconditions | Runtime previously started. |
| Expected behavior | In-flight requests fail with `runtime_restarted` (retryable). The runtime host/worker is recreated on next demand (or immediately if a model was loaded and auto-reload is enabled). Retry is bounded: after 3 consecutive failures within 5 minutes, it stops and shows an error requiring user action. |
| Acceptance criteria | 1. After an induced worker termination, the next request succeeds without user action in ≥ 95% of trials (TC-036).<br>2. After an SW termination, the next website request reconnects and succeeds (TC-041).<br>3. The retry limit prevents crash loops (verified with a persistently failing mock). |
| Dependencies | FR-047, NFR-044, NFR-045 |

### FR-050 — Model unloading (runtime)
| Field | Detail |
|---|---|
| Description | Unloads the active model, releasing GPU buffers and worker memory, on user request, model switch, removal, idle timeout (BR-20), or memory pressure. |
| Business rationale | Resource management; BR-12. |
| User role | System |
| Priority | Must Have |
| Preconditions | Model loaded. |
| Expected behavior | Active generation is cancelled (`model_unloaded`); queued requests for that model fail with `model_unloaded`, unless a model switch is replacing it and the policy is "drain first" (OQ-11). The worker may be terminated to guarantee memory release. |
| Acceptance criteria | 1. After unload, status is `idle` with no loaded model.<br>2. Repeated load/unload cycles (10×) do not increase retained memory beyond a defined tolerance (NFR-041). |
| Dependencies | FR-021, FR-046, NFR-041 |

### FR-051 — Queue management
| Field | Detail |
|---|---|
| Description | A Priority-FIFO queue serializes requests: one active generation (BR-09), at most 5 pending globally and 2 per origin (BR-10). First-party AI Workspace requests are prioritized ahead of pending third-party website requests in the queue without preempting an active generation (`OQ-10 = Option B`). |
| Business rationale | Predictable resource use, fairness, and responsive first-party Workspace UX. |
| User role | System |
| Priority | Must Have |
| Preconditions | Runtime running. |
| Expected behavior | Requests beyond limits are rejected immediately with `queue_full` (retryable). Queue position is available to the requesting client. First-party Workspace requests are placed ahead of pending third-party website requests (`OQ-10 = Option B`). |
| Acceptance criteria | 1. Never more than one generation runs concurrently (TC-024).<br>2. The 6th pending request is rejected with `queue_full` (TC-025).<br>3. A 3rd pending request from the same origin is rejected with `queue_full` while other origins can still enqueue.<br>4. A first-party Workspace request enqueued while third-party requests are pending executes before the pending third-party requests. |
| Dependencies | FR-117, BR-09, BR-10, ADR-008 |

---

## 7.5 Universal Website Integration

### FR-060 — Website authorization initiation
| Field | Detail |
|---|---|
| Description | A third-party website can be authorized through (`OQ-04 = Option A + Option B`): (a) **user-initiated authorization** from the extension's toolbar popup while on that site ("Allow this site to use UOAI") or manual entry in Website Integrations, or (b) a parameter-validated **`web_accessible_resources` extension consent page** (`chrome-extension://<id>/authorize.html?origin=...`) opened in a popup window on explicit user click via `@uoai/sdk`. Broad `<all_urls>` host permissions are **never** requested. |
| Business rationale | Websites can only reach the extension through a content-script bridge injected after the user grants host permission. Supporting both the toolbar popup (Option A) and an extension consent popup page (Option B) gives users and developers a smooth user-gesture authorization path without `<all_urls>` (R-10). |
| User role | End User |
| Priority | Must Have |
| Preconditions | Extension installed; site served over HTTPS (or `http://localhost:<port>` / `http://127.0.0.1:<port>` for local development when the Developer Mode toggle is enabled in Settings per `OQ-22 = Option A`). |
| Expected behavior | From the toolbar popup or the `authorize.html` consent window, the extension displays the exact origin and an "Allow" action that triggers the two-layer permission request (FR-061). The SDK on an unauthorized site returns `permission_required` with a helper to open the consent flow on user click. |
| Acceptance criteria | 1. Authorization is possible from the toolbar popup or SDK-triggered `authorize.html` consent window in ≤ 3 user actions.<br>2. Manual entry and `authorize.html` validate origin format (scheme, host, optional port) and reject paths, wildcards, and non-HTTPS origins (except dev-mode localhost).<br>3. Without authorization, the extension injects no bridge into the site. |
| Dependencies | FR-061, FR-067, OQ-04, ADR-005 |

### FR-061 — Per-origin permission request
| Field | Detail |
|---|---|
| Description | Authorization requests both (1) the browser-level optional host permission for that exact origin (`chrome.permissions.request`, user gesture required) and (2) a UOAI-level grant recorded in `chrome.storage.local`. |
| Business rationale | Two-layer consent: the browser-mediated prompt plus UOAI's explicit explanation (BR-03; ADR-005). |
| User role | End User |
| Priority | Must Have |
| Preconditions | FR-060 initiated with a user gesture in an extension UI. |
| Expected behavior | UOAI shows its own consent sheet (origin, what the site can do — "send prompts to your local model and receive responses"; what it cannot do — "read your conversations, files, or other sites") before the browser prompt. Both must succeed for the grant to be active. |
| Acceptance criteria | 1. A grant is active only if both browser permission and UOAI grant exist (TC-027).<br>2. The consent sheet displays the exact origin, including scheme and port.<br>3. Cancelling either prompt leaves no grant and no registered content script. |
| Dependencies | FR-062, FR-065, ADR-005 |

### FR-062 — Access approval and denial
| Field | Detail |
|---|---|
| Description | The user can Allow or Deny. Denial is recorded so the site cannot repeatedly trigger prompts. |
| Business rationale | User control; prevents prompt-spam (T-01). |
| User role | End User |
| Priority | Must Have |
| Preconditions | Consent sheet shown. |
| Expected behavior | Allow → content script registered for that origin; existing tabs of that origin get the bridge injected (or after reload, per implementation); site notified via SDK event `permission_granted`. Deny → origin stored as denied; SDK receives `permission_denied`. Denied origins can be un-denied from Website Integrations. Since prompts are only user-initiated from extension UI in MVP, a website cannot itself trigger the prompt. |
| Acceptance criteria | 1. After Allow, an SDK `connect()` on that origin succeeds without page reinstall (page reload acceptable, documented).<br>2. After Deny, SDK calls return `permission_denied`.<br>3. A website cannot open a UOAI or browser permission prompt programmatically. |
| Dependencies | FR-061, FR-067 |

### FR-063 — Authorized website list
| Field | Detail |
|---|---|
| Description | Website Integrations lists every authorized and denied origin with grant date, last-used time, request count (local only), and status. |
| Business rationale | Permission transparency (PB-06, BO-05). |
| User role | End User, Administrator |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Shows "No websites have access" when empty. Includes the trusted first-party PWA origin as a non-revocable "built-in" entry with explanation (BR-18; revocation of the PWA is handled by OQ-14). |
| Acceptance criteria | 1. Every active grant appears in the list (TC-030 setup).<br>2. The list is consistent with `chrome.permissions.getAll()` origins (reconciled at startup; orphaned entries are removed or flagged). |
| Dependencies | FR-064, FR-123 |

### FR-064 — Permission revocation
| Field | Detail |
|---|---|
| Description | The user can revoke any third-party origin. Revocation removes the UOAI grant, removes the browser host permission (`chrome.permissions.remove`), unregisters the content script, disconnects open ports, and cancels in-flight requests (BR-06). |
| Business rationale | BO-05. |
| User role | End User, Administrator |
| Priority | Must Have |
| Preconditions | Origin authorized. |
| Expected behavior | Effective immediately. Subsequent requests from already-open pages fail with `permission_revoked`/`permission_required`. Also triggered if the user removes the host permission via browser UI (detected through `chrome.permissions.onRemoved`). |
| Acceptance criteria | 1. 100% of requests after revocation are rejected (TC-030, KPI-09).<br>2. An in-flight stream from the revoked origin terminates with `permission_revoked` within 1 s.<br>3. Removing the site permission from browser settings also revokes the UOAI grant. |
| Dependencies | FR-112, FR-063 |

### FR-065 — Origin validation
| Field | Detail |
|---|---|
| Description | Every incoming connection/message is associated with an origin derived from browser-provided sender information (`sender.origin` / `sender.url` / `sender.tab`), never from the message payload. |
| Business rationale | Prevents origin spoofing (T-02, T-03; BR-04). |
| User role | System |
| Priority | Must Have |
| Preconditions | Message received by SW. |
| Expected behavior | For `externally_connectable` ports: origin must equal the configured trusted PWA origin. For bridge ports: sender must be UOAI's own content script (`sender.id` equals the extension ID), and the tab's origin (from browser-provided frame info) must hold an active grant. Messages from frames are evaluated by the frame's own origin; iframes do not inherit the top-level grant (OQ-15). |
| Acceptance criteria | 1. A message claiming `origin: "https://allowed.example"` in its payload from an unauthorized origin is rejected (TC-028).<br>2. Scheme, host, and port must all match (BR-04).<br>3. Unauthorized iframes embedded in an authorized page are rejected. |
| Dependencies | FR-115, BR-04, BR-18 |

### FR-066 — Request validation
| Field | Detail |
|---|---|
| Description | All requests are validated against versioned Zod schemas in `packages/api-protocol` before routing: operation type, protocol version, field types, sizes (BR-16), allowed parameters, model availability (BR-24). |
| Business rationale | Defends against malformed and malicious input (T-05). |
| User role | System |
| Priority | Must Have |
| Preconditions | Origin validated. |
| Expected behavior | Invalid requests are rejected with `invalid_request` and the offending `param`. Unknown operations → `unsupported_operation`. Only the published operations are routable (BR-07). |
| Acceptance criteria | 1. Fuzzed malformed payloads (≥ 10,000 cases) never crash the SW or runtime and always yield a structured error (TC-031).<br>2. Payloads > 256 KB are rejected with `payload_too_large`. |
| Dependencies | FR-116, BR-16 |

### FR-067 — Website-to-extension messaging bridge
| Field | Detail |
|---|---|
| Description | For authorized third-party origins, a content script (isolated world) relays messages between the page (`window.postMessage` with a UOAI-specific envelope and channel nonce) and the SW (long-lived `chrome.runtime.Port`). The trusted PWA connects directly through `externally_connectable`. |
| Business rationale | The only supported way for pages to reach the extension (ADR-004). There is no localhost server (PC-07). |
| User role | System, Website |
| Priority | Must Have |
| Preconditions | Grant active (third-party) or trusted origin (PWA). |
| Expected behavior | The bridge accepts only messages where `event.source === window` and `event.origin` equals the page origin, with the UOAI envelope. It never exposes extension APIs to the page. Responses are posted only to the page's own origin (`targetOrigin` = page origin, never `*`). |
| Acceptance criteria | 1. Messages from other windows/frames are ignored by the bridge.<br>2. Responses are never posted with `targetOrigin: "*"` (code review + test).<br>3. Port disconnect (navigation) cleans up request state. |
| Dependencies | FR-065, FR-118, ADR-004 |

### FR-068 — Unauthorized request error reporting
| Field | Detail |
|---|---|
| Description | Requests that cannot be authorized receive structured, non-revealing errors: `extension_not_detected` (SDK-side), `permission_required`, `permission_denied`, `permission_revoked`, `origin_not_allowed`. |
| Business rationale | Developer clarity without leaking user configuration (BO-04, T-12). |
| User role | Website, Developer |
| Priority | Must Have |
| Preconditions | Unauthorized request. |
| Expected behavior | Errors do not reveal installed models, other authorized origins, or runtime details to unauthorized origins. Unauthorized attempts are counted locally per origin (visible to the user, rate-limited logging). |
| Acceptance criteria | 1. Unauthorized responses contain only error type/code/message (no model list, no status) (TC-027).<br>2. Unauthorized attempts are visible in the user's diagnostics view without prompt content. |
| Dependencies | FR-079, FR-097 |

---

## 7.6 Developer SDK and API

### FR-070 — SDK installation and distribution
| Field | Detail |
|---|---|
| Description | `@uoai/sdk` is published to npm as ESM with TypeScript declarations. A self-hostable single-file ESM bundle is also provided (no third-party CDN requirement). |
| Business rationale | Developer adoption (BO-04). |
| User role | Developer |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Zero runtime dependencies on cloud services. Tree-shakeable. Works in modern Chromium; in other browsers it loads and reports `extension_not_detected` / `browser_unsupported` gracefully. |
| Acceptance criteria | 1. `npm install @uoai/sdk` + quick-start compiles in a fresh Vite TypeScript project without extra configuration.<br>2. Importing the SDK in Firefox/Safari does not throw; `UOAI.isAvailable()` resolves `false`. |
| Dependencies | FR-080, FR-081 |

### FR-071 — SDK initialization (`UOAI.connect`)
| Field | Detail |
|---|---|
| Description | `UOAI.connect(options?)` detects the extension (bridge handshake or `externally_connectable` for the trusted origin), negotiates the protocol version, and returns a client once authorized. |
| Business rationale | Single entry point. |
| User role | Developer, Website |
| Priority | Must Have |
| Preconditions | Page loaded. |
| Expected behavior | Options: `timeoutMs` (default 3000), `signal`, `extensionId` (trusted PWA only). Rejects with `extension_not_detected`, `permission_required`, `permission_denied`, or `protocol_version_unsupported`. `UOAI.isAvailable()` provides a non-throwing check. |
| Acceptance criteria | 1. On an authorized origin with a running extension, `connect()` resolves within 1 s on RC-1 (excluding runtime start).<br>2. With no extension, `connect()` rejects with `extension_not_detected` within `timeoutMs` + 100 ms (TC-045).<br>3. Version mismatch yields `protocol_version_unsupported` with supported versions listed. |
| Dependencies | FR-067, FR-072 |

### FR-072 — Connection management
| Field | Detail |
|---|---|
| Description | The SDK maintains the connection, exposes connection events (`connected`, `disconnected`, `permission_revoked`, `runtime_status`), and transparently reconnects after SW restarts. |
| Business rationale | MV3 SW lifecycle (KL-04). |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Connected client. |
| Expected behavior | Reconnects with exponential back-off (max 5 attempts) on port disconnect not caused by revocation. In-flight requests at disconnect fail with `connection_lost` (retryable). `client.close()` releases resources. |
| Acceptance criteria | 1. After forced SW termination, the next SDK call succeeds without page reload (TC-041).<br>2. After revocation, the SDK emits `permission_revoked` and does not auto-reconnect. |
| Dependencies | FR-049, FR-064 |

### FR-073 — Model listing (`models.list` ↔ `GET /v1/models`)
| Field | Detail |
|---|---|
| Description | Returns installed, *Ready* models in an OpenAI-like list format with UOAI extensions (context length, loaded flag, quantization). |
| Business rationale | Model selection (BO-04). |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Authorized. |
| Expected behavior | Response `{ object: "list", data: [{ id, object: "model", created, owned_by, uoai: { … } }] }` (API_REQUIREMENTS §5.1). Not-installed catalog models are not listed. |
| Acceptance criteria | 1. Result matches installed *Ready* models exactly (TC-021).<br>2. Unauthorized origins cannot list models (TC-027). |
| Dependencies | FR-066 |

### FR-074 — Chat completion (`chat.completions.create` ↔ `POST /v1/chat/completions`)
| Field | Detail |
|---|---|
| Description | Non-streaming completion returning an OpenAI-like `chat.completion` object. |
| Business rationale | Familiar developer experience (BO-04). |
| User role | Developer, Website |
| Priority | Must Have |
| Preconditions | Authorized; model *Ready* (loaded automatically if not loaded and policy permits — OQ-13). |
| Expected behavior | Request/response shapes per API_REQUIREMENTS §5.2. If the requested model is not loaded, the provider loads it (replacing the current model) only if auto-load for websites is enabled; otherwise returns `model_not_loaded`. |
| Acceptance criteria | 1. The SDK example in API_REQUIREMENTS §9.1 returns `choices[0].message.content` as a non-empty string (TC-022).<br>2. `usage` token counts are present and consistent with FR-042. |
| Dependencies | FR-043, FR-044, OQ-13 |

### FR-075 — Streaming completion
| Field | Detail |
|---|---|
| Description | With `stream: true`, `create()` returns an async iterable of `chat.completion.chunk` objects. |
| Business rationale | Responsiveness (BO-04). |
| User role | Developer, Website |
| Priority | Must Have |
| Preconditions | As FR-074. |
| Expected behavior | Each chunk has `choices[0].delta.content`; the first chunk carries `delta.role: "assistant"`; the final chunk carries `finish_reason`; optional usage via `stream_options.include_usage`. The iterable supports `break` (which cancels). |
| Acceptance criteria | 1. The streaming example in API_REQUIREMENTS §9.2 prints incremental text (TC-023).<br>2. Breaking out of `for await` cancels the request within 500 ms (TC-040). |
| Dependencies | FR-045, FR-076 |

### FR-076 — Request cancellation
| Field | Detail |
|---|---|
| Description | Requests accept an `AbortSignal` (`{ signal }` option) and streams expose `stream.controller.abort()`. |
| Business rationale | Control and resource release. |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Request in flight or queued. |
| Expected behavior | Aborting rejects the promise / ends the iterator with `AbortError`-compatible `generation_cancelled`. Cancellation propagates to the runtime (FR-046). |
| Acceptance criteria | 1. Abort after first chunk: no further chunks delivered; runtime returns to idle within 500 ms on RC-1 – RC-3 (TC-040). |
| Dependencies | FR-046 |

### FR-077 — Health check (`health.check` ↔ `GET /v1/health`)
| Field | Detail |
|---|---|
| Description | Returns provider liveness: extension version, protocol version(s), and coarse status `ok` / `degraded` / `unavailable`. |
| Business rationale | Integration diagnostics. |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Authorized (or trusted origin). |
| Expected behavior | Answered by the SW without starting the Runtime Host. |
| Acceptance criteria | 1. Responds within 200 ms on RC-1 when the SW is awake; within 1 s from a cold SW. |
| Dependencies | FR-047 |

### FR-078 — Runtime status (`runtime.get` ↔ `GET /v1/runtime`)
| Field | Detail |
|---|---|
| Description | Returns runtime state, loaded model ID, WebGPU availability, queue length, and this origin's pending requests. |
| Business rationale | Developers adapt UX (e.g., "model loading"). |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Authorized. |
| Expected behavior | Reduced view; no other origin data (FR-047). Optional subscription to status events via `client.on("runtime_status")`. |
| Acceptance criteria | 1. Status reflects transitions within 1 s.<br>2. Contains no data about other origins (TC-029). |
| Dependencies | FR-047 |

### FR-079 — Error responses
| Field | Detail |
|---|---|
| Description | All failures use the standard error object `{ error: { type, code, message, param?, retryable, request_id? } }` and SDK `UOAIError` class with the same fields. |
| Business rationale | Predictable handling (BO-04). |
| User role | Developer |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Codes from the catalogue in API_REQUIREMENTS §7 only. Messages are human-readable English (localization Could Have). |
| Acceptance criteria | 1. Every error path in the conformance suite yields a catalogued code.<br>2. `retryable` is true only for transient codes listed in the catalogue. |
| Dependencies | API_REQUIREMENTS §7 |

### FR-080 — TypeScript types
| Field | Detail |
|---|---|
| Description | Full TypeScript types for requests, responses, chunks, errors, events, and model metadata, generated from or aligned with the Zod schemas in `packages/api-protocol`. |
| Business rationale | Developer productivity; type safety. |
| User role | Developer |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | `create()` overloads return `ChatCompletion` for `stream: false | undefined` and `AsyncIterable<ChatCompletionChunk>` for `stream: true`. |
| Acceptance criteria | 1. The examples in API_REQUIREMENTS §9 type-check under `strict: true`.<br>2. Type tests (e.g., `tsd`/`expectTypeOf`) cover the overloads. |
| Dependencies | FR-070, NFR-032 |

### FR-081 — Documentation and code examples
| Field | Detail |
|---|---|
| Description | Markdown developer docs: quick start, concepts (provider, permissions, logical API vs HTTP), API reference, error catalogue, streaming/cancellation guides, graceful-degradation patterns (no extension / unsupported device / denied), versioning policy, and an example integration site. |
| Business rationale | BO-04, KPI-08. |
| User role | Developer |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Docs explicitly state that there is **no localhost HTTP endpoint** and that existing OpenAI HTTP clients cannot be pointed at UOAI by base URL (KL-05). |
| Acceptance criteria | 1. All code samples are compiled and executed in CI against a mock provider.<br>2. Docs contain a "What UOAI is not" section covering localhost, cloud fallback, and model availability. |
| Dependencies | FR-070 – FR-080 |

---

## 7.7 Developer Console

The Developer Console is a Dashboard screen that helps developers (and curious users) understand and test the provider. It runs as a **first-party client** and is subject to the same API and validation rules as websites, except that it may display provider-wide diagnostics to the device owner.

### FR-090 — API usage examples
| Field | Detail |
|---|---|
| Description | Displays copyable SDK snippets (connect, list models, completion, streaming, cancellation, error handling) pre-filled with the user's installed model IDs. |
| Business rationale | Faster integration (BO-04). |
| User role | Developer |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Snippets match the published SDK version; copy-to-clipboard action. |
| Acceptance criteria | 1. Each snippet compiles against the current SDK (CI check shared with FR-081).<br>2. Snippets use an installed model ID when one exists, otherwise a placeholder with a note. |
| Dependencies | FR-081 |

### FR-091 — Connection testing
| Field | Detail |
|---|---|
| Description | A "Test connection" action performs handshake, health, and runtime calls and reports each step's result and latency. |
| Business rationale | Fast troubleshooting. |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Extension installed. |
| Expected behavior | Step list: extension detected → protocol negotiated → health → runtime status; failures show error code and suggested fix. |
| Acceptance criteria | 1. Each step shows pass/fail and latency in ms (TC-044).<br>2. A stopped runtime is reported as `not_started`, not as a failure. |
| Dependencies | FR-071, FR-077, FR-078 |

### FR-092 — Available model listing
| Field | Detail |
|---|---|
| Description | Displays the `models.list` response, both rendered as a table and as raw JSON. |
| Business rationale | Shows exactly what websites will see. |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Connected. |
| Expected behavior | Refresh action; copy model ID. |
| Acceptance criteria | 1. The rendered list equals the raw JSON `data` array. |
| Dependencies | FR-073 |

### FR-093 — Request testing (playground)
| Field | Detail |
|---|---|
| Description | A form/JSON editor to compose `chat.completions.create` requests (model, messages, temperature, top_p, max_tokens, stop, stream) and view the raw response. |
| Business rationale | Experimentation without writing code. |
| User role | Developer |
| Priority | Must Have |
| Preconditions | Model *Ready*. |
| Expected behavior | Client-side validation with the same Zod schema; invalid input highlights the field. Playground prompts are not saved to conversation history unless the user chooses "Save". |
| Acceptance criteria | 1. Invalid JSON or schema violations are shown inline before sending.<br>2. Response JSON matches the documented format (TC-022 variant). |
| Dependencies | FR-066, FR-074 |

### FR-094 — Streaming demonstration
| Field | Detail |
|---|---|
| Description | Shows streamed chunks live as both rendered text and a chunk log (sequence, delta, timing), with a Cancel button. |
| Business rationale | Teaches the streaming format. |
| User role | Developer |
| Priority | Should Have |
| Preconditions | Model *Ready*. |
| Expected behavior | Displays time-to-first-token and tokens/second for the run (local-only measurement). |
| Acceptance criteria | 1. Chunk log count equals chunks received; final chunk shows `finish_reason`.<br>2. Cancel ends the stream with `finish_reason: "cancelled"` or `generation_cancelled` error. |
| Dependencies | FR-075, FR-076 |

### FR-095 — Error inspection
| Field | Detail |
|---|---|
| Description | Shows recent errors (local, last 100) with code, type, message, operation, origin (for the device owner), and timestamp; and lets the developer trigger sample errors (e.g., invalid request) to see formats. |
| Business rationale | Debugging. |
| User role | Developer |
| Priority | Should Have |
| Preconditions | None. |
| Expected behavior | Error records contain no prompt or response content (BR-05). |
| Acceptance criteria | 1. Error records contain no message content (verified by inspecting stored records, TC-035). |
| Dependencies | FR-079, NFR-046 |

### FR-096 — Permission status
| Field | Detail |
|---|---|
| Description | Shows whether a specified origin (input field) is authorized, denied, or unknown, and links to Website Integrations. |
| Business rationale | Diagnoses `permission_*` errors. |
| User role | Developer |
| Priority | Should Have |
| Preconditions | None. |
| Expected behavior | Read-only; changes are made in Website Integrations. |
| Acceptance criteria | 1. Status matches the authorized list for every tested origin. |
| Dependencies | FR-063 |

### FR-097 — Runtime diagnostics
| Field | Detail |
|---|---|
| Description | Shows runtime state, WebGPU adapter info/limits/features, loaded model, memory estimates, queue contents (IDs, origins, states — no content), last N runtime events, and an "Export diagnostics" action (JSON, user-initiated, content-free). |
| Business rationale | Supportability without telemetry (NFR-046). |
| User role | Developer, Administrator |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Export is saved locally; never uploaded automatically. |
| Acceptance criteria | 1. Exported file contains no prompts, messages or responses (TC-035).<br>2. Diagnostics display within 1 s. |
| Dependencies | FR-047, NFR-046 |

---

## 7.8 Offline Management

### FR-100 — Offline readiness status
| Field | Detail |
|---|---|
| Description | A persistent indicator (header + Provider Dashboard) shows *Offline Ready*, *Partially Ready* (some models not ready), or *Not Offline Ready*, with details. |
| Business rationale | BO-02, KL-07. |
| User role | End User |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Calculated from FR-101 – FR-103 checks. Re-evaluated at startup, after downloads/removals, and on demand. |
| Acceptance criteria | 1. Indicator accuracy is 100% across offline test scenarios (TC-015).<br>2. Evaluation makes no network requests. |
| Dependencies | FR-101, FR-102, FR-103 |

### FR-101 — Cached application assets
| Field | Detail |
|---|---|
| Description | All Dashboard assets (HTML, JS, CSS, fonts, icons, runtime JS/WASM) are available offline: packaged in the extension, and precached by the PWA service worker for the hosted PWA. |
| Business rationale | Offline startup (BO-02). |
| User role | System |
| Priority | Must Have |
| Preconditions | Extension installed; PWA visited once online (for PWA). |
| Expected behavior | No runtime fetch of external fonts, CDNs, or analytics scripts. PWA precache manifest is versioned; updates are applied on next launch after user notice. |
| Acceptance criteria | 1. With network blocked, every Dashboard route renders (TC-017).<br>2. A static scan of built assets finds no external URLs other than the documented registry/model hosts. |
| Dependencies | NFR-016, ADR-011 |

### FR-102 — Model availability offline
| Field | Detail |
|---|---|
| Description | Installed models (weights, tokenizer, config, chat template) are loadable from local storage without network. |
| Business rationale | BO-02. |
| User role | System |
| Priority | Must Have |
| Preconditions | Model *Ready*. |
| Expected behavior | Model availability checks confirm all files exist with expected sizes (full hash re-check on demand or after suspected corruption). |
| Acceptance criteria | 1. An installed model loads offline (TC-018).<br>2. A deleted artifact file (simulated eviction) changes model status to *Missing files* and offline readiness to not ready. |
| Dependencies | FR-019, FR-103 |

### FR-103 — Missing dependency detection
| Field | Detail |
|---|---|
| Description | Detects missing or evicted assets (model files, runtime WASM, precache entries, registry copy) and names them. |
| Business rationale | KL-02, KL-07. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Runs at startup (lightweight existence/size check) and before load. Missing items show a "Re-download when online" action. |
| Acceptance criteria | 1. Each simulated missing item category is detected and named (TC-015 variants). |
| Dependencies | FR-102, FR-108 |

### FR-104 — Offline startup
| Field | Detail |
|---|---|
| Description | The Dashboard and provider start with no network connection. |
| Business rationale | BO-02. |
| User role | End User |
| Priority | Must Have |
| Preconditions | Offline Ready. |
| Expected behavior | Startup does not block on network calls (registry refresh, update checks are skipped or time out non-blockingly within 0 ms when `navigator.onLine` is false, ≤ 3 s otherwise). |
| Acceptance criteria | 1. After browser restart with network disabled, Dashboard is interactive within 3 s on RC-1 – RC-3 (NFR-006, TC-017). |
| Dependencies | FR-101 |

### FR-105 — Network-independent inference
| Field | Detail |
|---|---|
| Description | Inference (load, tokenize, generate, stream) makes zero network requests. |
| Business rationale | BO-01, BO-02, BR-01. |
| User role | System |
| Priority | Must Have |
| Preconditions | Model *Ready*. |
| Expected behavior | Runtime libraries are configured to disable remote model fetching (e.g., Transformers.js `allowRemoteModels = false` at inference time) and to load WASM from packaged paths. |
| Acceptance criteria | 1. Network audit during generation records zero requests from any UOAI context (TC-033, TC-034). |
| Dependencies | FR-041, ADR-011 |

### FR-106 — Persistent storage request
| Field | Detail |
|---|---|
| Description | Requests persistent storage (`navigator.storage.persist()`) in the origin(s) that store models and history, and declares `unlimitedStorage` in the extension manifest (subject to OQ-05). |
| Business rationale | Reduces eviction risk (KL-02, R-04). |
| User role | System, End User |
| Priority | Must Have |
| Preconditions | Before or during first model download. |
| Expected behavior | Result shown in storage view. If not granted, the user is told models may be evicted under storage pressure. |
| Acceptance criteria | 1. Persistence state is displayed accurately (TC-015 variant).<br>2. The UI never states storage is "guaranteed" or "permanent". |
| Dependencies | FR-023, OQ-05 |

### FR-107 — Storage usage monitoring
| Field | Detail |
|---|---|
| Description | Monitors available quota and warns when free space is below thresholds (proposed: < 2 GB or < 10% of quota). |
| Business rationale | Prevents storage exhaustion (T-09). |
| User role | System |
| Priority | Should Have |
| Preconditions | None. |
| Expected behavior | Warning banner with "Manage storage" action. Downloads are blocked when free space < remaining download size + margin. |
| Acceptance criteria | 1. With mocked low quota, warning is displayed and downloads are blocked. |
| Dependencies | FR-023, FR-048 |

### FR-108 — Interrupted download recovery
| Field | Detail |
|---|---|
| Description | After network loss, browser close, or extension restart during download, the download state is restored as *Paused/Interrupted* with "Resume" when online. |
| Business rationale | Large downloads (R-03). |
| User role | System, End User |
| Priority | Must Have |
| Preconditions | Download previously started. |
| Expected behavior | Partial data is stored in a temporary area, never used for inference. On resume, it continues (FR-017) or restarts the file. Orphaned temporary data older than 7 days (proposed) is cleaned up with user notice. |
| Acceptance criteria | 1. After killing the browser mid-download and restarting online, the download can resume, and the completed model passes verification (TC-013).<br>2. Partial files are never loaded. |
| Dependencies | FR-017, FR-018, FR-019 |

---

## 7.9 Privacy and Security

### FR-110 — Local-only inference by default
| Field | Detail |
|---|---|
| Description | All inference is performed by the local runtime. MVP contains no remote inference code path. |
| Business rationale | BR-01, BO-01. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Code review and dependency audit confirm no remote inference client is bundled. |
| Acceptance criteria | 1. Network audit (online) during generation shows no request carrying prompt content (TC-034).<br>2. No cloud AI SDK appears in the dependency tree (automated check). |
| Dependencies | FR-105 |

### FR-111 — Explicit website permissions (enforcement)
| Field | Detail |
|---|---|
| Description | The SW rejects all operations from origins without an active grant, before any processing. |
| Business rationale | BR-03. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Grant check precedes schema validation of operation-specific payloads (envelope still validated) and precedes runtime start. |
| Acceptance criteria | 1. Requests from an unauthorized origin never start the Runtime Host (TC-027). |
| Dependencies | FR-061, FR-065 |

### FR-112 — Permission revocation enforcement
| Field | Detail |
|---|---|
| Description | Grant checks occur on every message (not only on connect). Revocation closes ports and cancels in-flight work. |
| Business rationale | BR-06. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Grant state is read from an in-memory cache invalidated synchronously on revocation and re-hydrated from `chrome.storage.local` on SW start. |
| Acceptance criteria | 1. A message sent 1 ms after revocation completes is rejected (TC-030). |
| Dependencies | FR-064 |

### FR-113 — No silent cloud fallback
| Field | Detail |
|---|---|
| Description | When local inference fails, UOAI returns an error. It never routes to a remote service. |
| Business rationale | BR-02. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Error codes only. Any future cloud feature needs a BRD amendment and explicit per-action consent. |
| Acceptance criteria | 1. With WebGPU disabled or model failing, network audit shows no inference-related requests (TC-034). |
| Dependencies | FR-110 |

### FR-114 — No prompt telemetry
| Field | Detail |
|---|---|
| Description | No prompts, messages, responses, or model inputs are collected, logged off-device, or included in crash reports or exports by default. |
| Business rationale | BR-05. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Local logs exclude content fields by construction (typed log events without content fields). Opt-in analytics (if adopted, OQ-12) are content-free. |
| Acceptance criteria | 1. Canary-string test: a unique string in prompts never appears in logs, diagnostics exports, analytics payloads, or network traffic (TC-035). |
| Dependencies | NFR-021, NFR-046 |

### FR-115 — Origin validation enforcement (sender verification)
| Field | Detail |
|---|---|
| Description | Implements FR-065 checks as a mandatory middleware in the SW router; no handler is reachable without it. |
| Business rationale | T-02, T-03. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Router registration API requires an authorization policy for every operation (compile-time enforced). |
| Acceptance criteria | 1. Unit test enumerates all registered operations and asserts each has an authorization policy. |
| Dependencies | FR-065 |

### FR-116 — Request schema validation enforcement
| Field | Detail |
|---|---|
| Description | Implements FR-066 at both the SW boundary and the Runtime Host boundary (defence in depth). |
| Business rationale | T-05. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Invalid messages are dropped with structured errors; repeated invalid messages from an origin count toward rate limits. |
| Acceptance criteria | 1. Fuzz suite (TC-031) passes at both boundaries. |
| Dependencies | FR-066 |

### FR-117 — Rate and token limits
| Field | Detail |
|---|---|
| Description | Enforces per-origin request rate (BR-15), per-request `max_tokens` cap (BR-14), per-origin pending limit and global queue (BR-10), and max message count per request (proposed 200). |
| Business rationale | Resource exhaustion (T-06, T-07). |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Limits are configurable in Settings (within safe bounds); exceeding returns `rate_limited` (with `retry_after_ms`) or `invalid_request`. |
| Acceptance criteria | 1. The 31st request within 60 s from one origin returns `rate_limited` (TC-026).<br>2. `max_tokens` above cap is rejected or clamped per API_REQUIREMENTS §5.3 (consistent, documented). |
| Dependencies | FR-051 |

### FR-118 — Secure extension messaging
| Field | Detail |
|---|---|
| Description | Messaging uses typed envelopes with protocol version, request IDs generated by the provider (unguessable), and strict per-port request ownership. No `eval`, dynamic code, or remote code anywhere in the extension. |
| Business rationale | T-02, T-10. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Extension CSP disallows remote scripts; allows `wasm-unsafe-eval` only as required for WASM. Content scripts never hold privileged data beyond the current request. |
| Acceptance criteria | 1. CSP audit passes (NFR-017).<br>2. A request ID from port A used on port B returns `request_not_found`. |
| Dependencies | NFR-016, NFR-017 |

### FR-119 — Model artifact integrity enforcement
| Field | Detail |
|---|---|
| Description | The runtime refuses to load any model whose verification record is missing, failed, or older than its files' last-modified state. Registry manifests are verified (signature or pinned hash per OQ-08). |
| Business rationale | BR-08, T-08. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Load attempts on unverified models return `model_not_verified`. |
| Acceptance criteria | 1. Tampering with a stored artifact after installation is detected before or during the next load (on-demand re-hash or size/version check, with full re-hash policy per OQ-17) (TC-008). |
| Dependencies | FR-018 |

---

## 7.10 Settings and Data Controls

### FR-120 — Delete conversation data
| Field | Detail |
|---|---|
| Description | Users can delete individual conversations or all conversation history. |
| Business rationale | User deletion control (privacy). |
| User role | End User |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Confirmation dialog; deletion is irreversible and immediate in IndexedDB. |
| Acceptance criteria | 1. After "Delete all history", IndexedDB contains no message records (TC-039). |
| Dependencies | FR-036 |

### FR-121 — Delete all local data (reset)
| Field | Detail |
|---|---|
| Description | A "Reset UOAI" action deletes models, history, permissions (including browser host permissions), settings, license acceptances, diagnostics, and caches. |
| Business rationale | Complete user control. |
| User role | End User, Administrator |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Two-step confirmation; shows space to be freed. After reset, onboarding restarts. |
| Acceptance criteria | 1. After reset, storage inspection shows no UOAI data in OPFS, Cache Storage, IndexedDB, or `chrome.storage.local` (except a reset marker if needed), and `chrome.permissions.getAll()` shows no optional host permissions (TC-043). |
| Dependencies | FR-020, FR-064, FR-120 |

### FR-122 — Privacy disclosure
| Field | Detail |
|---|---|
| Description | A Privacy screen and onboarding summary disclose what data is stored, where, for how long, what network requests occur (BR-21), and the no-telemetry default. |
| Business rationale | Transparency; store policy (SH-06). |
| User role | End User |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Content is consistent with SECURITY_AND_PRIVACY_REQUIREMENTS §3 and the store privacy disclosures. Available offline. |
| Acceptance criteria | 1. Privacy screen lists every storage location in SECURITY_AND_PRIVACY_REQUIREMENTS §3.2.<br>2. Reviewed by Legal before release (no compliance claims). |
| Dependencies | SECURITY_AND_PRIVACY_REQUIREMENTS |

### FR-123 — Settings persistence
| Field | Detail |
|---|---|
| Description | Extension settings (limits, idle unload, history toggle, developer mode, grants) persist in `chrome.storage.local`; UI preferences persist in the Dashboard origin. |
| Business rationale | Consistency across restarts. |
| User role | System |
| Priority | Must Have |
| Preconditions | None. |
| Expected behavior | Settings are validated by schema on read; invalid values revert to defaults with a notice. |
| Acceptance criteria | 1. Settings survive browser restart.<br>2. Corrupted settings do not crash the extension (fallback to defaults). |
| Dependencies | — |

### FR-124 — Network activity transparency
| Field | Detail |
|---|---|
| Description | A network activity indicator shows when UOAI is using the network and why (registry refresh, model download, PWA update). |
| Business rationale | BR-21; verifiable privacy for P3. |
| User role | End User |
| Priority | Should Have |
| Preconditions | None. |
| Expected behavior | Indicator is idle during inference. A log of recent network activities (host, purpose, bytes; no content) is viewable. |
| Acceptance criteria | 1. Each network request initiated by UOAI corresponds to an entry in the activity log (TC-033). |
| Dependencies | FR-016 |

---

## 8. Priority Summary

Total functional requirements: **96**.

| Priority | Count | IDs |
|---|---|---|
| Must Have | 88 | All FRs not listed below |
| Should Have | 8 | FR-017, FR-022, FR-035, FR-094, FR-095, FR-096, FR-107, FR-124 |
| Could Have (sub-features inside other FRs) | — | "Download anyway" override (FR-012); "keep both versions" (FR-022); local title generation (FR-032); localized error messages (FR-079) |
| Should Have (sub-features inside Must Have FRs) | — | Ephemeral/no-history mode (FR-036); Workspace long-conversation truncation (FR-043) |
| Won't Have (MVP) | — | Automatic website discovery (FR-060, OQ-04); cloud fallback (FR-113); WASM/CPU fallback (pending OQ-07); enterprise managed policies (X-11); concurrent generations (BR-09) |

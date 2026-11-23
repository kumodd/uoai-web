# UOAI — Business Rules

| Field | Value |
|---|---|
| Document | Business Rules |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](BRD.md) |
| Related | [SECURITY_AND_PRIVACY_REQUIREMENTS.md](../architecture/SECURITY_AND_PRIVACY_REQUIREMENTS.md), [FUNCTIONAL_REQUIREMENTS.md](../requirements/FUNCTIONAL_REQUIREMENTS.md) |

---

## 1. Rule Classification

| Type | Code | Meaning | Change control |
|---|---|---|---|
| **Non-negotiable security / privacy requirement** | **NN** | Must hold in every release. Cannot be disabled by settings, websites or developers. | Change requires BRD amendment approved by Product Owner **and** Security. |
| **Configurable product policy** | **CP** | A default chosen by the product. Values may be tuned by the product team or, where stated, by the user. | Change via product decision record; default values documented here. |
| **Operational rule** | **OP** | Lifecycle/consistency rule that keeps the system correct. | Change via architecture decision record. |

## 2. Rules

| ID | Type | Rule | Enforced by | Verified by |
|---|---|---|---|---|
| **BR-01** | NN | Inference must remain **local** by default. Prompts, messages and generated output are processed only on the user's device. | FR-110, FR-105 | TC-033, TC-034 |
| **BR-02** | NN | **No cloud fallback** occurs without explicit, informed, per-action user consent. MVP contains no cloud inference capability. | FR-113 | TC-034 |
| **BR-03** | NN | No external website receives access to the provider without **explicit user authorization**. | FR-061, FR-062, FR-111 | TC-027 |
| **BR-04** | NN | Permissions are **origin-specific** (scheme + host + port). Authorization of `https://a.example.com` does not authorize `https://b.example.com`, `http://a.example.com` or `https://a.example.com:8443`. | FR-065, FR-115 | TC-028 |
| **BR-05** | NN | **No prompt telemetry.** Prompts, messages, generated responses and model inputs are never collected by analytics, logs transmitted off-device, or crash reports. | FR-114, NFR-021 | TC-035 |
| **BR-06** | NN | **Revoking** a permission immediately prevents future requests from that origin and terminates its open connections; any in-flight generation for that origin is cancelled. | FR-064, FR-112 | TC-030 |
| **BR-07** | NN | A website **cannot** choose arbitrary local files, read storage, access other origins' data, change settings, install/remove models, or execute code through the provider. It can only call the published logical API operations. | FR-066, FR-116, FR-118 | TC-029, TC-031 |
| **BR-08** | NN | A model must pass **integrity verification** (hash match for every required file) before it is marked **Ready**. | FR-018, FR-119 | TC-007, TC-008 |
| **BR-09** | CP | **Only one active generation** at a time across all clients (initial policy). | FR-051 | TC-024 |
| **BR-10** | CP | A **bounded Priority-FIFO request queue** holds at most **5 pending requests** globally and **2 per origin** (approved default). First-party AI Workspace requests are placed ahead of pending third-party website requests without preempting an active generation (`OQ-10 = Option B`). Additional requests are rejected with `queue_full`. | FR-051, FR-117 | TC-025 |
| **BR-11** | NN | A model must pass the **qualification process** and appear in the signed/curated registry before it is offered for download (`OQ-08 = Option A`). | FR-010, FR-012 | Registry audit |
| **BR-12** | OP | **Model switching** requires unloading the active model first; an explicit user model switch in the Dashboard immediately cancels active/queued requests targeting the old model with `model_unloaded` (`retryable: true`, `OQ-11 = Option A`). | FR-021, FR-050 | TC-037 |
| **BR-13** | NN | Browser or device **limitations must be communicated honestly**; the product must never claim a model is supported on a device that failed capability checks. | FR-002, FR-003, FR-012, FR-048 | TC-019, TC-020 |
| **BR-14** | CP | Default per-request `max_tokens` cap for website requests: **1,024**; hard cap: model's context length minus prompt tokens. User may raise the default in Settings. | FR-117 | TC-026 |
| **BR-15** | CP | Default per-origin rate limit: **30 requests per minute** (proposed). | FR-117 | TC-026 |
| **BR-16** | CP | Maximum incoming request payload: **256 KB** serialized (proposed). | FR-116 | TC-031 |
| **BR-17** | NN | Permission grants are stored only on the device and are never synced or shared. | FR-063, FR-123 | Code review |
| **BR-18** | NN | The trusted first-party PWA origin is **explicitly configured** at build time in the extension manifest; it is not user-editable and not wildcarded. | FR-065 | TC-028 |
| **BR-19** | NN | Model license terms that require acceptance must be displayed and accepted **before** download begins. | FR-015 | TC-006 |
| **BR-20** | CP | Idle model auto-unload after **15 minutes** without requests (proposed default; user-configurable, including "never"). | FR-050, NFR-042 | TC-038 |
| **BR-21** | NN | Network access by UOAI is limited to: catalog refresh, model/artifact downloads, and (for the hosted PWA) application updates. Each is user-visible in the network activity indicator. | FR-124 | TC-033 |
| **BR-22** | CP | Conversation history is stored locally and retained **until the user deletes it** (no automatic expiry by default). | FR-036, FR-120 | TC-039 |
| **BR-23** | NN | Requests from third-party websites must not be able to read the user's workspace conversations; each request is stateless and contains only the messages the website sends. | FR-066, FR-118 | TC-029 |
| **BR-24** | CP | A website request may target only models that are installed and Ready; it cannot trigger downloads. If the runtime is `idle` (no model loaded), requesting an installed Ready model auto-loads it; if a *different* model is already loaded, the request returns `model_not_loaded` unless cross-model switching by websites is enabled in Settings (`OQ-13 = Option A`). | FR-066, FR-074 | TC-029 |
| **BR-25** | NN | Third-party website connections are permitted **only from top-level frames (`sender.frameId === 0`)** over `https://` (or `http://localhost:<port>` / `http://127.0.0.1:<port>` when Developer Mode is enabled in Settings); all embedded iframes/subframes are rejected (`OQ-15 = Option A`, `OQ-22 = Option A`). | FR-060, FR-065 | TC-028 |

## 3. Rule Interaction Notes

- **BR-09 + BR-10**: the queue size of 5 is a provisional policy pending performance baselining in Phase 0 (OQ-10).
- **BR-06 + BR-12**: revocation and model switching both cancel or fail in-flight work with explicit error codes (`permission_revoked`, `model_unloaded`) so integrators can react.
- **BR-02**: introducing any cloud capability in the future requires a BRD amendment and new consent UX; it is not a configurable policy.

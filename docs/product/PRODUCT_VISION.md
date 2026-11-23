# UOAI — Product Vision and Strategy

| Field | Value |
|---|---|
| Document | Product Vision and Strategy |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](../business/BRD.md) |
| Related | [BUSINESS_OBJECTIVES.md](../business/BUSINESS_OBJECTIVES.md), [STAKEHOLDERS_AND_PERSONAS.md](../business/STAKEHOLDERS_AND_PERSONAS.md), [SCOPE_AND_ASSUMPTIONS.md](../business/SCOPE_AND_ASSUMPTIONS.md) |

---

## 1. Product Vision Statement

> **Vision:** *Turn every capable Chromium browser into a private, user-controlled AI provider—so users download an AI model once, run it offline forever, and allow any website to use their local AI with explicit permission.*

## 2. Product Mission

> **Mission:** *Make local, offline, private AI accessible to everyday users and web developers through a zero-server browser extension, a minimal workspace dashboard, and an OpenAI-inspired TypeScript SDK—eliminating mandatory cloud inference costs, API keys, and prompt data sharing.*

---

## 3. Core Value Proposition

| Audience | Value Delivered |
|---|---|
| **Everyday & Privacy-Conscious Users** (P1, P3) | - **Download Once, Use Offline:** After setup and model download, chat works on flights, trains, and disconnected networks.<br>- **Zero Data Egress:** Prompts, conversations, and generated outputs never leave the device.<br>- **No Native Install or CLI:** Installs like a standard browser extension—no Python, Docker, Node.js, or command-line setup.<br>- **No Subscriptions or Accounts:** Free local execution on the user's own hardware. |
| **Web Developers & Application Builders** (P2) | - **Zero Inference Cost & Zero API Keys:** Offload inference to the visitor's browser GPU; no backend proxy or per-token billing.<br>- **OpenAI-Compatible Logical API:** Familiar `ai.models.list()` and `ai.chat.completions.create()` with streaming and `AbortSignal` cancellation via `@uoai/sdk`.<br>- **Shared Model Cache Across Sites:** Once a user downloads a model in UOAI, any authorized website can use it without re-downloading gigabytes per origin. |
| **Organizations & Contributors** (P4, P5) | - **Strict Per-Origin Governance:** Two-layer permission model with immediate revocation and origin isolation.<br>- **Curated, Integrity-Verified Model Ecosystem:** Every catalog model passes operator, tokenizer, license, and SHA-256 verification checks. |

---

## 4. Strategic Positioning and Differentiators

### 4.1 Why Existing Approaches Fall Short

1. **Cloud AI APIs (OpenAI, Anthropic, Gemini Cloud):** Require constant internet connectivity, incur recurring per-token costs, mandate API key management, and transmit user prompts to third-party servers.
2. **Native Local AI Servers (Ollama, LM Studio, llama.cpp server):** Require downloading and running an OS-level executable, configuring CORS/localhost ports, and managing system processes—creating an adoption barrier that >95% of non-technical web users will not cross.
3. **Per-Site In-Page WebGPU Models (embedding Transformers.js directly in each website):** Force the user to download 1.5 GB – 4 GB of model weights separately into every website's isolated origin storage, wasting disk space and bandwidth, with no unified permission or model management UI.
4. **Experimental Browser-Vendor Built-in AI APIs (e.g., `window.ai` / Prompt API):** Coupled to a single browser vendor's built-in model choice, often behind experimental flags, and lacking an open, multi-model catalog or OpenAI-compatible SDK surface.

### 4.2 UOAI Positioning Matrix

| Capability | Cloud AI APIs | Native Local Servers (Ollama / LM Studio) | Per-Site In-Browser WebGPU | **Universal Offline AI (UOAI)** |
|---|---|---|---|---|
| **Runs 100% locally on device** | No | Yes | Yes | **Yes** |
| **Works offline after initial setup** | No | Yes | Only for that single site | **Yes (Workspace + any cached site)** |
| **Requires native desktop app / CLI** | No | Yes (Mandatory) | No | **No (Browser extension only)** |
| **Model downloaded once & shared across websites** | N/A | Yes | No (duplicated per origin) | **Yes (Extension-origin storage)** |
| **Per-origin user permission & revocation UI** | No | No (CORS is all-or-nothing) | N/A | **Yes (Two-layer per-origin grants)** |
| **OpenAI-inspired TypeScript SDK** | Yes | Yes (via localhost HTTP) | Custom per library | **Yes (`@uoai/sdk` over extension bridge)** |
| **Honest hardware capability detection** | N/A | Manual | Ad-hoc | **Built-in pre-download & pre-load checks** |

---

## 5. Product Principles (Non-Negotiable Design Tenets)

1. **Privacy by Architecture, Not Just Policy:** MVP contains zero cloud inference code paths and zero prompt telemetry (BR-01, BR-02, BR-05).
2. **Honesty Over Magic:** Never pretend an extension is a permanent `http://localhost` TCP server (PC-07), never claim browser storage is immune to eviction (KL-02), and never offer a model download on hardware that cannot run it (BR-13).
3. **User Sovereignty:** The user owns the runtime. Any website's access can be inspected and revoked in one click with immediate effect (BR-06).
4. **Progressive Complexity:** Non-technical users see a clean guided setup and chat workspace; developers get a dedicated Developer Console, raw JSON inspector, and typed SDK.

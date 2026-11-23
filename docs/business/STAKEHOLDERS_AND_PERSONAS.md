# UOAI — Stakeholders and Personas

| Field | Value |
|---|---|
| Document | Stakeholders and Personas |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](BRD.md) |
| Related | [USER_JOURNEYS.md](../requirements/USER_JOURNEYS.md), [USE_CASES.md](../requirements/USE_CASES.md) |

---

## 1. Stakeholder Register

| ID | Stakeholder | Interests | Responsibilities | Expectations | Influence |
|---|---|---|---|---|---|
| SH-01 | **Product Owner** | Product–market fit, scope control, coherent vision. | Owns the BRD, prioritizes backlog, approves scope changes, resolves open decisions they own. | Requirements are traceable, testable and realistic. | High |
| SH-02 | **Business stakeholders / sponsors** | Adoption, reputation, low operating cost, legal safety. | Fund delivery, approve roadmap phases, accept residual risks. | Clear phase exit criteria and risk visibility. | High |
| SH-03 | **General users** | Private, offline AI that "just works". | Install extension, download models, grant/revoke website access. | Plain-language guidance; honest limitations; no hidden data sharing. | Medium (collective: High) |
| SH-04 | **Web developers (integrators)** | Easy integration, familiar API, predictable errors, no API keys. | Integrate SDK, handle permission/unsupported states gracefully. | Stable versioned SDK, TypeScript types, examples, a developer console. | Medium |
| SH-05 | **Extension administrators** (users or IT admins managing the extension) | Control of permissions, storage, models. | Configure settings, manage authorized origins, manage storage. | Transparent dashboards; reliable revocation; (future) managed policies. | Medium |
| SH-06 | **Browser platform stakeholders** (Chrome Web Store, Edge Add-ons, browser vendors) | Policy compliance, user safety, minimal permissions. | Review and approve extension listings; evolve platform APIs. | Single purpose, justified permissions, no remotely hosted code, accurate privacy disclosures. | High (gatekeeper) |
| SH-07 | **QA team** | Testable requirements and reproducible configurations. | Define and run test plans, compatibility matrix, performance baselines. | Measurable acceptance criteria and reference configurations. | Medium |
| SH-08 | **Security & privacy team** | Threat mitigation, data minimization. | Threat modelling, security reviews, penetration testing, privacy review. | Enforceable permission model, schema validation, no prompt egress. | High (release gate) |
| SH-09 | **Open-source contributors** | Clear architecture, contribution path, model qualification process. | Contribute code, adapters, qualified models, docs. | Modular repository, contribution guidelines, documented qualification criteria. | Medium |
| SH-10 | **Enterprise customers** | Data residency on-device, governance, deployability. | Evaluate, pilot, deploy via managed browser policies (future). | Security documentation, permission governance, (future) policy controls. | Medium (future: High) |
| SH-11 | **Model publishers / licensors** | License compliance and attribution. | Publish model artifacts and terms. | License terms displayed and honoured; attribution preserved. | Medium |
| SH-12 | **Legal counsel** (to be engaged) | Licensing, privacy disclosures, store policy. | Perform legal assessment (not yet performed). | No compliance claims made without assessment. | High (release gate) |

### 1.1 RACI for key decisions

| Activity | Product Owner | Sponsors | Architecture lead | Security | QA | Legal |
|---|---|---|---|---|---|---|
| BRD approval | A | C | R | C | C | C |
| MVP scope change | A/R | C | C | C | I | I |
| Model added to catalog | A | I | R | C | R | C (license) |
| Permission model design | C | I | R | A | C | I |
| Store submission | A | I | R | C | C | C |
| Phase exit | A | C | R | R | R | C |

R = Responsible, A = Accountable, C = Consulted, I = Informed. Named individuals are **not yet assigned** (see OQ-19 in [OPEN_QUESTIONS.md](../decisions/OPEN_QUESTIONS.md)).

## 2. User Personas

### P1 — Maya, Non-technical Individual User

| Attribute | Detail |
|---|---|
| Profile | 34, teacher, uses a mid-range Windows laptop with Chrome. Comfortable with apps, not with terminals. |
| Goals | Draft lesson notes and emails with AI; use it on trains/rural areas with poor connectivity; avoid subscriptions. |
| Pain points | Cloud AI needs constant internet; worries about student data in prompts; confused by "API keys", Python or Docker instructions. |
| Expectations | One-click install, clear progress for large downloads, a simple chat screen, plain explanations if her laptop can't run a model. |
| Key use cases | UC-01, UC-02, UC-03, UC-04, UC-11, UC-12 |
| Success looks like | Chats offline on a train two days after setup without thinking about it. |

### P2 — Arjun, Web Developer

| Attribute | Detail |
|---|---|
| Profile | 28, front-end developer building a note-taking web app (React, TypeScript). |
| Goals | Add summarization/chat to his app without paying per token or handling user API keys. |
| Pain points | Cloud API costs scale with users; key management; privacy objections from customers; local servers (Ollama etc.) require installs his users won't do. |
| Expectations | `npm install`, OpenAI-like calls, TypeScript types, streaming, cancellation, clear error codes for "extension missing", "permission required", "device unsupported". |
| Key use cases | UC-05, UC-06, UC-07, UC-08, UC-09 |
| Success looks like | Ships an "AI assist (runs on your device)" feature in an afternoon with graceful fallbacks. |

### P3 — Dr. Lena, Privacy-conscious Professional

| Attribute | Detail |
|---|---|
| Profile | 45, clinical psychologist; handles sensitive notes; uses a MacBook (Apple Silicon). |
| Goals | Summarize and rephrase notes without any data leaving her laptop. |
| Pain points | Cannot verify cloud vendors' retention; distrusts "free" tools. |
| Expectations | Verifiable local-only operation, clear list of which sites can access the AI, instant revocation, easy deletion of all history, no telemetry by default. |
| Key use cases | UC-03, UC-06, UC-10 |
| Success looks like | Confirms in Settings that no website has access and that history can be wiped, then uses the workspace daily. |

### P4 — Ravi, Enterprise / Organization Administrator

| Attribute | Detail |
|---|---|
| Profile | 40, IT administrator at a 2,000-person firm on managed Chrome/Edge. |
| Goals | Offer approved on-device AI to staff; restrict which internal web apps may use it; prevent unapproved models. |
| Pain points | Shadow-IT cloud AI usage; data-loss-prevention concerns; heterogeneous hardware. |
| Expectations | Security documentation, permission transparency, predictable storage use; (future) managed policy for allowed origins and allowed models. |
| Key use cases | UC-05, UC-10, UC-11, UJ-07 |
| MVP note | Enterprise policy management is **out of MVP scope** (Could Have / future), see [SCOPE_AND_ASSUMPTIONS.md](SCOPE_AND_ASSUMPTIONS.md). |

### P5 — Sam, Open-source Contributor

| Attribute | Detail |
|---|---|
| Profile | 31, ML engineer contributing in spare time. |
| Goals | Add a new model or improve an adapter; fix bugs in the runtime. |
| Pain points | Unclear criteria for model acceptance; monolithic codebases. |
| Expectations | Modular monorepo, documented qualification checklist, reproducible test harness, clear license policy. |
| Key use cases | UJ-08 (model qualification), contributions to `packages/model-adapters` and `packages/model-registry`. |
| Success looks like | Submits a model qualification PR with artifacts, hashes, license metadata and benchmark results that passes review. |

## 3. Persona-to-Module Relevance

| Module | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|
| Onboarding | ●●● | ● | ●● | ●● | ● |
| Model Library | ●● | ● | ●● | ●●● | ●●● |
| AI Workspace | ●●● | ● | ●●● | ● | ● |
| Website Integrations | ● | ●●● | ●●● | ●●● | ● |
| Developer SDK / Console | — | ●●● | — | ● | ●● |
| Settings & Privacy | ●● | ● | ●●● | ●●● | ● |

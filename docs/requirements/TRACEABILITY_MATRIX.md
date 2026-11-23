# UOAI — Requirements Traceability Matrix (RTM)

| Field | Value |
|---|---|
| Document | Requirements Traceability Matrix |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](../business/BRD.md) |
| Related | [BUSINESS_OBJECTIVES.md](../business/BUSINESS_OBJECTIVES.md), [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md), [NON_FUNCTIONAL_REQUIREMENTS.md](NON_FUNCTIONAL_REQUIREMENTS.md), [USE_CASES.md](USE_CASES.md), [USER_JOURNEYS.md](USER_JOURNEYS.md), [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md), [PRODUCT_ROADMAP.md](../product/PRODUCT_ROADMAP.md) |

---

## 1. Purpose

This matrix provides end-to-end forward and backward traceability across:
1. **Business Objectives** (`BO-01` – `BO-08`)
2. **Functional Requirements** (`FR-001` – `FR-124`, 96 requirements across 10 modules)
3. **Non-Functional Requirements** (`NFR-001` – `NFR-048`)
4. **Use Cases & User Journeys** (`UC-01` – `UC-15`, `UJ-01` – `UJ-08`)
5. **MVP Acceptance Criteria** (`MVP-AC-01` – `MVP-AC-17`)
6. **Verification Test Cases** (`TC-001` – `TC-045`)
7. **Delivery Phases** (`Phase 0` – `Phase 6`)

---

## 2. High-Level Traceability: Business Objectives to Implementation and Validation

| Business Objective | Functional Requirements (FR) | Non-Functional Requirements (NFR) | Business Rules (BR) | Use Cases & Journeys | MVP Acceptance Criteria | Test Cases (TC) | Delivery Phases |
|---|---|---|---|---|---|---|---|
| **BO-01:** Run all AI inference on the user's device by default (Privacy) | FR-030, FR-036, FR-040 – FR-045, FR-105, FR-110, FR-113, FR-114, FR-120 – FR-122, FR-124 | NFR-012, NFR-016, NFR-017, NFR-020 – NFR-022, NFR-046 | BR-01, BR-02, BR-05, BR-21, BR-22 | UC-03, UC-07, UC-08; UJ-01, UJ-03, UJ-07 | MVP-AC-06, MVP-AC-07, MVP-AC-11, MVP-AC-17 | TC-009, TC-010, TC-033, TC-034, TC-035, TC-039, TC-043 | Phase 0, Phase 1, Phase 4, Phase 6 |
| **BO-02:** Offline operation after initial setup | FR-005, FR-016 – FR-019, FR-038, FR-100 – FR-108 | NFR-006, NFR-009, NFR-010, NFR-012, NFR-013, NFR-039, NFR-040 | BR-08, BR-21 | UC-02, UC-03, UC-04, UC-13; UJ-01, UJ-04, UJ-06 | MVP-AC-04, MVP-AC-05, MVP-AC-08, MVP-AC-09 | TC-004, TC-005, TC-007, TC-013, TC-015 – TC-018 | Phase 0, Phase 2, Phase 4 |
| **BO-03:** Accessible to non-technical users | FR-001, FR-004, FR-006 – FR-008, FR-013, FR-016, FR-017, FR-020, FR-023, FR-030 – FR-037 | NFR-001 – NFR-005, NFR-023 – NFR-029, NFR-036, NFR-048 | BR-13, BR-22 | UC-01, UC-02, UC-03, UC-09, UC-15; UJ-01, UJ-04 | MVP-AC-01, MVP-AC-02, MVP-AC-04, MVP-AC-07, MVP-AC-13 | TC-001, TC-003, TC-005, TC-010, TC-011, TC-012, TC-039, TC-042 | Phase 2, Phase 4, Phase 6 |
| **BO-04:** OpenAI-compatible developer experience & SDK | FR-014, FR-042 – FR-046, FR-067, FR-070 – FR-081, FR-090 – FR-097 | NFR-004, NFR-011, NFR-030 – NFR-034, NFR-038 | BR-09, BR-10, BR-14, BR-15, BR-16, BR-24 | UC-05, UC-07, UC-08, UC-09; UJ-02 | MVP-AC-10, MVP-AC-11, MVP-AC-12, MVP-AC-13 | TC-021 – TC-026, TC-032, TC-040, TC-041, TC-044, TC-045 | Phase 1, Phase 3, Phase 5 |
| **BO-05:** Explicit, per-origin, revocable website permissions | FR-060 – FR-068, FR-096, FR-111, FR-112, FR-115 – FR-118, FR-123 | NFR-014, NFR-015, NFR-018, NFR-034 | BR-03, BR-04, BR-06, BR-07, BR-14 – BR-18, BR-23, BR-24 | UC-05, UC-06, UC-10; UJ-02, UJ-03, UJ-07 | MVP-AC-10, MVP-AC-14, MVP-AC-15 | TC-021, TC-026 – TC-031 | Phase 0, Phase 3, Phase 4, Phase 6 |
| **BO-06:** Honest capability detection, resource management & recovery | FR-002, FR-003, FR-012, FR-021, FR-037, FR-040, FR-047 – FR-051, FR-077 – FR-079, FR-097, FR-103, FR-107, FR-108 | NFR-007 – NFR-009, NFR-011, NFR-024, NFR-037, NFR-041 – NFR-046 | BR-09, BR-10, BR-12, BR-13, BR-20 | UC-01, UC-11, UC-12, UC-13, UC-14, UC-15; UJ-04, UJ-05, UJ-06 | MVP-AC-03, MVP-AC-06, MVP-AC-16 | TC-002, TC-008, TC-013, TC-019, TC-020, TC-036 – TC-038, TC-041 | Phase 0, Phase 1, Phase 2, Phase 3, Phase 6 |
| **BO-07:** Eliminate mandatory cloud APIs, subscriptions & API keys | FR-001, FR-041, FR-061, FR-071, FR-105, FR-110, FR-113 | NFR-010, NFR-012, NFR-020 | BR-01, BR-02, BR-03 | UC-01, UC-03, UC-05, UC-07; UJ-01, UJ-02 | MVP-AC-01, MVP-AC-07, MVP-AC-09, MVP-AC-10, MVP-AC-17 | TC-001, TC-010, TC-018, TC-021, TC-033, TC-034 | Phase 1, Phase 3, Phase 5 |
| **BO-08:** License-compliant, integrity-verified model ecosystem | FR-010, FR-011, FR-015, FR-018, FR-019, FR-022, FR-119 | NFR-008, NFR-019, NFR-030 – NFR-033, NFR-035 | BR-08, BR-11, BR-19 | UC-02, UC-13; UJ-04, UJ-08 | MVP-AC-04, MVP-AC-05 | TC-003, TC-006, TC-007, TC-008, TC-014 | Phase 0, Phase 2, Phase 6 |

---

## 3. Detailed Functional Requirements Traceability (FR-001 – FR-124)

### 3.1 Module 7.1 — Onboarding and Setup

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-001 | Welcome screen | Must | BO-03, BO-07 | NFR-023, NFR-026 | UC-01, UJ-01 | MVP-AC-01, MVP-AC-02 | TC-001 | Phase 4 |
| FR-002 | Browser compatibility check | Must | BO-06 | NFR-024, NFR-037 | UC-01, UC-11, UJ-01, UJ-05 | MVP-AC-03 | TC-002, TC-019 | Phase 0, Phase 4 |
| FR-003 | WebGPU capability detection | Must | BO-06 | NFR-024, NFR-037 | UC-01, UC-11, UJ-01, UJ-05 | MVP-AC-03, MVP-AC-16 | TC-002, TC-019 | Phase 0, Phase 1 |
| FR-004 | Extension installation guidance | Must | BO-03 | NFR-023 | UC-01, UJ-01 | MVP-AC-02 | TC-045 | Phase 4, Phase 5 |
| FR-005 | Offline readiness check | Must | BO-02 | NFR-013 | UC-01, UC-02, UJ-01 | MVP-AC-08 | TC-015 | Phase 4 |
| FR-006 | First model download (guided) | Must | BO-03 | NFR-023, NFR-025 | UC-01, UC-02, UJ-01 | MVP-AC-04 | TC-005 | Phase 2, Phase 4 |
| FR-007 | Initial model loading | Must | BO-03, BO-06 | NFR-005, NFR-023 | UC-01, UC-02, UJ-01 | MVP-AC-06 | TC-009 | Phase 1, Phase 4 |
| FR-008 | First successful inference | Must | BO-03 | NFR-001, NFR-025 | UC-01, UJ-01 | MVP-AC-07 | TC-010 | Phase 1, Phase 4 |

### 3.2 Module 7.2 — Model Library

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-010 | Model discovery (catalog) | Must | BO-08 | NFR-035 | UC-02, UJ-04, UJ-08 | MVP-AC-04 | TC-003 | Phase 2 |
| FR-011 | Model details view | Must | BO-08 | NFR-026 | UC-02, UJ-04 | MVP-AC-04 | TC-003 | Phase 2, Phase 4 |
| FR-012 | Model compatibility assessment | Must | BO-06 | NFR-024, NFR-037 | UC-01, UC-11, UC-12, UJ-05 | MVP-AC-03, MVP-AC-04 | TC-003, TC-019 | Phase 2 |
| FR-013 | Model size and quantization info | Must | BO-03 | NFR-039 | UC-02, UJ-01, UJ-04 | MVP-AC-04 | TC-003 | Phase 2 |
| FR-014 | Context length information | Must | BO-04 | NFR-032 | UC-02, UJ-02, UJ-04 | MVP-AC-04 | TC-003 | Phase 2 |
| FR-015 | License information and acceptance | Must | BO-08 | NFR-022 | UC-02, UJ-01, UJ-08 | MVP-AC-04 | TC-006 | Phase 2 |
| FR-016 | Download progress | Must | BO-02, BO-03 | NFR-003 | UC-02, UJ-01 | MVP-AC-04 | TC-005 | Phase 2 |
| FR-017 | Download pause/resume | Should | BO-02, BO-03 | NFR-040 | UC-02, UC-13, UJ-06 | MVP-AC-04 | TC-005 | Phase 2 |
| FR-018 | Download integrity verification | Must | BO-02, BO-08 | NFR-008 | UC-02, UC-13, UJ-01, UJ-06 | MVP-AC-05 | TC-007, TC-008 | Phase 2 |
| FR-019 | Model installation | Must | BO-02, BO-08 | NFR-009, NFR-039 | UC-02, UC-13, UJ-01 | MVP-AC-05 | TC-007, TC-013 | Phase 2 |
| FR-020 | Model removal | Must | BO-03, BO-06 | NFR-039 | UC-12, UJ-04 | MVP-AC-06 | TC-012 | Phase 2 |
| FR-021 | Model loading and unloading (UI) | Must | BO-06 | NFR-005, NFR-041 | UC-15, UJ-04 | MVP-AC-06 | TC-009, TC-037 | Phase 1, Phase 2 |
| FR-022 | Model version management | Should | BO-08 | NFR-009, NFR-039 | UJ-04 | MVP-AC-05 | TC-014 | Phase 2 |
| FR-023 | Storage usage information | Must | BO-03, BO-06 | NFR-039 | UC-12, UJ-04 | MVP-AC-04 | TC-004, TC-012 | Phase 2, Phase 4 |

### 3.3 Module 7.3 — Local AI Workspace

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-030 | Chat interface | Must | BO-01, BO-03 | NFR-026, NFR-027 | UC-03, UJ-01 | MVP-AC-07 | TC-010, TC-042 | Phase 4 |
| FR-031 | Model selection in workspace | Must | BO-03 | NFR-027 | UC-15, UJ-04 | MVP-AC-07 | TC-037 | Phase 4 |
| FR-032 | Conversation management | Must | BO-03 | NFR-036 | UC-03, UC-04, UJ-01 | MVP-AC-07 | TC-039 | Phase 4 |
| FR-033 | Streaming output display | Must | BO-03 | NFR-003, NFR-028 | UC-03, UJ-01 | MVP-AC-07 | TC-010, TC-042 | Phase 4 |
| FR-034 | Stop generation | Must | BO-03 | NFR-004 | UC-09, UJ-01 | MVP-AC-13 | TC-011 | Phase 1, Phase 4 |
| FR-035 | Clear conversation | Should | BO-03 | NFR-022 | UJ-03 | MVP-AC-07 | TC-039 | Phase 4 |
| FR-036 | Local conversation history | Must | BO-01, BO-03 | NFR-020, NFR-022, NFR-036 | UC-03, UC-04, UJ-01, UJ-03 | MVP-AC-07, MVP-AC-09 | TC-039 | Phase 4 |
| FR-037 | Error and loading states | Must | BO-03, BO-06 | NFR-024 | UC-11, UC-12, UC-14, UJ-05, UJ-06 | MVP-AC-16 | TC-020, TC-036 | Phase 4 |
| FR-038 | Offline workspace operation | Must | BO-02 | NFR-010, NFR-012 | UC-03, UC-04, UJ-01 | MVP-AC-08, MVP-AC-09 | TC-018 | Phase 4 |

### 3.4 Module 7.4 — Inference Runtime

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-040 | WebGPU initialization | Must | BO-01, BO-06 | NFR-037, NFR-044 | UC-01, UC-11, UC-14, UJ-05, UJ-06 | MVP-AC-06, MVP-AC-16 | TC-009, TC-019, TC-036 | Phase 0, Phase 1 |
| FR-041 | Model initialization | Must | BO-01, BO-07 | NFR-005, NFR-012 | UC-03, UC-15, UJ-01, UJ-04 | MVP-AC-06, MVP-AC-09 | TC-009, TC-018 | Phase 0, Phase 1 |
| FR-042 | Tokenization | Must | BO-01, BO-04 | NFR-007 | UC-03, UC-07, UC-08 | MVP-AC-07, MVP-AC-11 | TC-010, TC-022 | Phase 1 |
| FR-043 | Prompt processing (chat template) | Must | BO-01, BO-04 | NFR-007 | UC-03, UC-07, UJ-02 | MVP-AC-07, MVP-AC-11, MVP-AC-16 | TC-010, TC-032 | Phase 1 |
| FR-044 | Token generation | Must | BO-01, BO-04 | NFR-001, NFR-002, NFR-007 | UC-03, UC-07, UJ-01, UJ-02 | MVP-AC-07, MVP-AC-11 | TC-010, TC-022 | Phase 0, Phase 1 |
| FR-045 | Streaming | Must | BO-01, BO-04 | NFR-002, NFR-003 | UC-03, UC-08, UJ-01, UJ-02 | MVP-AC-07, MVP-AC-12 | TC-010, TC-023, TC-029 | Phase 1, Phase 3 |
| FR-046 | Cancellation | Must | BO-04, BO-06 | NFR-004 | UC-09, UC-10, UJ-01, UJ-02 | MVP-AC-13 | TC-011, TC-040 | Phase 1, Phase 3 |
| FR-047 | Runtime status | Must | BO-06 | NFR-046 | UC-14, UC-15, UJ-02 | MVP-AC-06, MVP-AC-16 | TC-009, TC-044 | Phase 1, Phase 3 |
| FR-048 | Resource checks | Must | BO-06 | NFR-024 | UC-01, UC-12, UJ-05 | MVP-AC-04, MVP-AC-16 | TC-004, TC-020 | Phase 1, Phase 2 |
| FR-049 | Runtime recovery | Must | BO-06 | NFR-011, NFR-044, NFR-045 | UC-14, UJ-06 | MVP-AC-16 | TC-036, TC-041 | Phase 1, Phase 3 |
| FR-050 | Model unloading (runtime) | Must | BO-06 | NFR-041, NFR-042 | UC-12, UC-15, UJ-04 | MVP-AC-06 | TC-037, TC-038 | Phase 1 |
| FR-051 | Queue management | Must | BO-04, BO-06 | NFR-034, NFR-043 | UC-07, UC-09, UJ-02 | MVP-AC-11 | TC-024, TC-025 | Phase 1, Phase 3 |

### 3.5 Module 7.5 — Universal Website Integration

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-060 | Website authorization initiation | Must | BO-05 | NFR-018 | UC-06, UJ-02 | MVP-AC-10 | TC-021 | Phase 3 |
| FR-061 | Per-origin permission request | Must | BO-05, BO-07 | NFR-014, NFR-018 | UC-06, UJ-02, UJ-03 | MVP-AC-10 | TC-021, TC-027 | Phase 3 |
| FR-062 | Access approval and denial | Must | BO-05 | NFR-014 | UC-06, UJ-02 | MVP-AC-10, MVP-AC-14 | TC-021, TC-027 | Phase 3 |
| FR-063 | Authorized website list | Must | BO-05 | NFR-026 | UC-06, UC-10, UJ-03 | MVP-AC-10, MVP-AC-15 | TC-021, TC-030 | Phase 3, Phase 4 |
| FR-064 | Permission revocation | Must | BO-05 | NFR-014 | UC-10, UJ-03 | MVP-AC-15 | TC-030 | Phase 3, Phase 4 |
| FR-065 | Origin validation | Must | BO-05 | NFR-014 | UC-05, UC-07, UJ-07 | MVP-AC-10, MVP-AC-14 | TC-028 | Phase 3 |
| FR-066 | Request validation | Must | BO-05 | NFR-015, NFR-032 | UC-07, UJ-07 | MVP-AC-11, MVP-AC-14 | TC-029, TC-031 | Phase 3 |
| FR-067 | Website-to-extension bridge | Must | BO-04, BO-05 | NFR-014, NFR-034 | UC-05, UC-07, UC-08, UJ-02 | MVP-AC-10, MVP-AC-11 | TC-021, TC-023 | Phase 0, Phase 3 |
| FR-068 | Unauthorized request error reporting | Must | BO-05 | NFR-014, NFR-046 | UC-05, UJ-02, UJ-07 | MVP-AC-14 | TC-027 | Phase 3 |

### 3.6 Module 7.6 — Developer SDK and API

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-070 | SDK installation and distribution | Must | BO-04 | NFR-030, NFR-031 | UC-05, UJ-02 | MVP-AC-10 | TC-045 | Phase 5 |
| FR-071 | SDK initialization (`UOAI.connect`) | Must | BO-04, BO-07 | NFR-038 | UC-05, UJ-02 | MVP-AC-10 | TC-021, TC-045 | Phase 5 |
| FR-072 | Connection management | Must | BO-04 | NFR-011, NFR-045 | UC-05, UC-10, UC-14, UJ-02 | MVP-AC-10, MVP-AC-16 | TC-041 | Phase 5 |
| FR-073 | Model listing (`models.list`) | Must | BO-04 | NFR-032 | UC-05, UJ-02 | MVP-AC-10 | TC-021 | Phase 3, Phase 5 |
| FR-074 | Chat completion (`create`) | Must | BO-04 | NFR-001, NFR-007, NFR-032 | UC-07, UJ-02 | MVP-AC-11 | TC-022 | Phase 3, Phase 5 |
| FR-075 | Streaming completion | Must | BO-04 | NFR-002, NFR-032 | UC-08, UJ-02 | MVP-AC-12 | TC-023, TC-040 | Phase 3, Phase 5 |
| FR-076 | Request cancellation | Must | BO-04 | NFR-004 | UC-09, UJ-02 | MVP-AC-13 | TC-040 | Phase 3, Phase 5 |
| FR-077 | Health check (`health.check`) | Must | BO-04, BO-06 | NFR-011 | UC-05, UJ-02 | MVP-AC-10 | TC-044 | Phase 3, Phase 5 |
| FR-078 | Runtime status (`runtime.get`) | Must | BO-04, BO-06 | NFR-032 | UC-05, UJ-02 | MVP-AC-10 | TC-029, TC-044 | Phase 3, Phase 5 |
| FR-079 | Error responses | Must | BO-04, BO-06 | NFR-024, NFR-032 | UC-05, UC-11, UC-14, UJ-02 | MVP-AC-14, MVP-AC-16 | TC-019, TC-027, TC-036 | Phase 3, Phase 5 |
| FR-080 | TypeScript types | Must | BO-04 | NFR-032 | UJ-02 | MVP-AC-10 | TC-021, TC-022 | Phase 5 |
| FR-081 | Documentation and code examples | Must | BO-04 | NFR-033 | UJ-02 | MVP-AC-10 | TC-044 | Phase 5, Phase 6 |

### 3.7 Module 7.7 — Developer Console

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-090 | API usage examples | Must | BO-04 | NFR-033 | UJ-02 | MVP-AC-10 | TC-044 | Phase 5 |
| FR-091 | Connection testing | Must | BO-04 | NFR-011 | UJ-02 | MVP-AC-10 | TC-044 | Phase 5 |
| FR-092 | Available model listing | Must | BO-04 | NFR-032 | UJ-02 | MVP-AC-10 | TC-044 | Phase 5 |
| FR-093 | Request testing (playground) | Must | BO-04 | NFR-032 | UJ-02 | MVP-AC-11 | TC-044 | Phase 5 |
| FR-094 | Streaming demonstration | Should | BO-04 | NFR-002 | UJ-02 | MVP-AC-12 | TC-044 | Phase 5 |
| FR-095 | Error inspection | Should | BO-04, BO-06 | NFR-021, NFR-046 | UJ-02 | MVP-AC-16, MVP-AC-17 | TC-035, TC-044 | Phase 5 |
| FR-096 | Permission status | Should | BO-04, BO-05 | NFR-014 | UJ-02 | MVP-AC-10 | TC-044 | Phase 5 |
| FR-097 | Runtime diagnostics | Must | BO-04, BO-06 | NFR-021, NFR-046 | UJ-02, UJ-07 | MVP-AC-16, MVP-AC-17 | TC-035, TC-044 | Phase 5 |

### 3.8 Module 7.8 — Offline Management

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-100 | Offline readiness status | Must | BO-02 | NFR-013 | UC-02, UC-03, UJ-01 | MVP-AC-08 | TC-015 | Phase 2, Phase 4 |
| FR-101 | Cached application assets | Must | BO-02 | NFR-010, NFR-016 | UC-04, UJ-01 | MVP-AC-08, MVP-AC-09 | TC-016, TC-017 | Phase 0, Phase 4 |
| FR-102 | Model availability offline | Must | BO-02 | NFR-012 | UC-03, UC-04, UJ-01 | MVP-AC-08, MVP-AC-09 | TC-018 | Phase 2 |
| FR-103 | Missing dependency detection | Must | BO-02, BO-06 | NFR-013 | UC-03, UC-13, UJ-06 | MVP-AC-08 | TC-015 | Phase 2, Phase 4 |
| FR-104 | Offline startup | Must | BO-02 | NFR-006, NFR-010 | UC-04, UJ-01 | MVP-AC-09 | TC-017 | Phase 4 |
| FR-105 | Network-independent inference | Must | BO-01, BO-02, BO-07 | NFR-012, NFR-020 | UC-03, UJ-01, UJ-07 | MVP-AC-09, MVP-AC-17 | TC-018, TC-033 | Phase 0, Phase 1 |
| FR-106 | Persistent storage request | Must | BO-02 | NFR-039 | UC-02, UJ-01 | MVP-AC-04 | TC-004 | Phase 0, Phase 2 |
| FR-107 | Storage usage monitoring | Should | BO-02, BO-06 | NFR-039 | UC-12, UJ-05 | MVP-AC-04, MVP-AC-16 | TC-020 | Phase 2 |
| FR-108 | Interrupted download recovery | Must | BO-02, BO-06 | NFR-009, NFR-040 | UC-02, UC-13, UJ-06 | MVP-AC-04, MVP-AC-05 | TC-013 | Phase 2 |

### 3.9 Module 7.9 — Privacy and Security

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-110 | Local-only inference by default | Must | BO-01, BO-07 | NFR-012, NFR-020 | UC-03, UC-07, UJ-03, UJ-07 | MVP-AC-17 | TC-033, TC-034 | Phase 1, Phase 6 |
| FR-111 | Explicit website permissions | Must | BO-05 | NFR-014 | UC-05, UC-06, UJ-02 | MVP-AC-14 | TC-027 | Phase 3, Phase 6 |
| FR-112 | Permission revocation enforcement | Must | BO-05 | NFR-014 | UC-10, UJ-03 | MVP-AC-15 | TC-030 | Phase 3, Phase 6 |
| FR-113 | No silent cloud fallback | Must | BO-01, BO-07 | NFR-012, NFR-020 | UC-11, UC-14, UJ-05 | MVP-AC-17 | TC-034 | Phase 1, Phase 6 |
| FR-114 | No prompt telemetry | Must | BO-01 | NFR-021, NFR-046 | UJ-03, UJ-07 | MVP-AC-17 | TC-035 | Phase 1, Phase 6 |
| FR-115 | Origin validation enforcement | Must | BO-05 | NFR-014 | UC-05, UC-07, UJ-07 | MVP-AC-14 | TC-028 | Phase 3, Phase 6 |
| FR-116 | Request schema validation | Must | BO-05 | NFR-015, NFR-032 | UC-07, UJ-07 | MVP-AC-11, MVP-AC-14 | TC-031 | Phase 3, Phase 6 |
| FR-117 | Rate and token limits | Must | BO-05 | NFR-043 | UC-07, UJ-07 | MVP-AC-11 | TC-026 | Phase 3, Phase 6 |
| FR-118 | Secure extension messaging | Must | BO-05 | NFR-016, NFR-017 | UC-05, UC-09, UJ-07 | MVP-AC-13, MVP-AC-14 | TC-029, TC-040 | Phase 3, Phase 6 |
| FR-119 | Model artifact integrity enforcement | Must | BO-08 | NFR-008 | UC-02, UC-13, UJ-06 | MVP-AC-05 | TC-008 | Phase 2, Phase 6 |

### 3.10 Module 7.10 — Settings and Data Controls

| FR ID | Requirement Name | Priority | Business Obj. | Related NFRs | Use Cases / Journeys | MVP-AC | Test Cases | Phase |
|---|---|---|---|---|---|---|---|---|
| FR-120 | Delete conversation data | Must | BO-01 | NFR-022 | UJ-03 | MVP-AC-07 | TC-039 | Phase 4 |
| FR-121 | Delete all local data (reset) | Must | BO-01 | NFR-022 | UJ-03 | MVP-AC-15 | TC-043 | Phase 4, Phase 6 |
| FR-122 | Privacy disclosure | Must | BO-01 | NFR-024 | UC-01, UJ-03 | MVP-AC-01 | TC-001 | Phase 4, Phase 6 |
| FR-123 | Settings persistence | Must | BO-05 | NFR-009 | UC-04, UJ-01 | MVP-AC-01 | TC-001 | Phase 3, Phase 4 |
| FR-124 | Network activity transparency | Should | BO-01, BO-02 | NFR-020, NFR-046 | UJ-03, UJ-07 | MVP-AC-17 | TC-033 | Phase 4, Phase 6 |

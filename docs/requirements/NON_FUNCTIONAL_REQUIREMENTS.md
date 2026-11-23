# UOAI — Non-Functional Requirements

| Field | Value |
|---|---|
| Document | Non-Functional Requirements |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](../business/BRD.md) |
| Related | [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md), [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md), [ARCHITECTURE_CONSTRAINTS.md](../architecture/ARCHITECTURE_CONSTRAINTS.md) |

---

## 1. Measurement Methodology

In-browser inference performance depends heavily on GPU, driver, memory, browser version, model, quantization, prompt length, and thermal state. UOAI therefore makes **no universal performance guarantee**. Performance NFRs are defined as:

1. **Measured** on named **reference configurations (RC)**.
2. Using a **standard benchmark protocol** (below).
3. With **provisional targets** that must be re-baselined at the end of Phase 0 (marked **[P]**). After baselining, targets become regression thresholds (no more than 10% degradation release-over-release).

### 1.1 Reference configurations

Exact hardware SKUs are to be confirmed by QA (OQ-16). Proposed classes:

| ID | Class | Proposed example | Purpose |
|---|---|---|---|
| RC-1 | Windows, discrete GPU | Windows 11, Chrome Stable, NVIDIA RTX-class GPU with ≥ 8 GB VRAM, 16 GB RAM | High-end desktop baseline |
| RC-2 | macOS, Apple Silicon | macOS current, Chrome Stable, Apple M-series, 16 GB unified memory | Mainstream premium laptop |
| RC-3 | Windows, integrated GPU | Windows 11, Chrome Stable, Intel Iris Xe-class or AMD Radeon integrated, 16 GB RAM | Mainstream laptop |
| RC-4 | Low-end / minimum | ChromeOS or Windows, integrated GPU, 8 GB RAM | Graceful-degradation & "unsupported" messaging |
| RC-5 | Secondary Chromium | Microsoft Edge Stable on RC-1 or RC-3 hardware | Cross-browser compatibility |

### 1.2 Benchmark protocol

- **Model:** the qualified MVP model at its default quantization; a smaller qualified "test model" for CI.
- **Prompts:** fixed benchmark set — short (≈ 50 prompt tokens), medium (≈ 500), long (≈ 2,000, or ≤ 50% of the default context).
- **Generation:** `max_tokens` = 256, `temperature` = 0, fixed seed.
- **Runs:** 1 warm-up + 10 measured runs per prompt class; report median and p90.
- **State:** "cold load" = first load after browser start; "warm" = model already loaded.
- **Environment:** AC power, browser freshly started, no other heavy tabs, recorded browser version and GPU driver version.
- **Metrics:** time to first token (TTFT), decode tokens/second, model load time, peak JS heap and (where observable) GPU memory, UI long tasks.

---

## 2. Requirements

### 2.1 Performance

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-001 | Performance | Time to first token (warm model) is measured and reported per RC. | Benchmark protocol §1.2, short prompt | **[P]** median ≤ 3 s on RC-1/RC-2; ≤ 6 s on RC-3 | Must |
| NFR-002 | Performance | Decode throughput is measured and reported per RC. | Benchmark protocol, tokens/s over 256 tokens | **[P]** median ≥ 15 tok/s RC-1/RC-2; ≥ 5 tok/s RC-3; RC-4 recorded only | Must |
| NFR-003 | Performance | Inference must not block the Dashboard UI thread. | Chrome DevTools Performance / Long Tasks API during streaming | 0 long tasks > 200 ms attributable to UOAI UI on RC-1 – RC-3; p95 input latency < 100 ms during generation | Must |
| NFR-004 | Performance | Cancellation latency. | Time from cancel call to last token delivered (instrumented) | ≤ 500 ms p95 on RC-1 – RC-3 | Must |
| NFR-005 | Performance | Model load time is measured and displayed with progress. | Benchmark protocol cold/warm load | **[P]** cold load ≤ 60 s RC-1/RC-2, ≤ 120 s RC-3 for MVP model; progress update at least every 2 s | Should |
| NFR-006 | Performance | Offline Dashboard startup. | Time from navigation to interactive (Lighthouse TTI / custom mark) with network disabled | ≤ 3 s on RC-1 – RC-3 | Must |

### 2.2 Reliability

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-007 | Reliability | Generation success on supported configurations. | 500-request soak test per RC (mixed prompts, streaming and non-streaming) | ≥ 99% complete without error on RC-1 – RC-3 | Must |
| NFR-008 | Reliability | Integrity verification detects corruption. | Fault-injection: byte flips, truncation, extra bytes in each artifact | 100% detection | Must |
| NFR-009 | Reliability | No inconsistent model state after interruption. | Kill browser/extension at 20 random points during download/install | 0 cases of *Ready* model with missing/unverified files | Must |

### 2.3 Availability

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-010 | Availability | Dashboard availability offline after setup. | Offline launch test matrix | 100% of routes render offline on RC-1 – RC-5 | Must |
| NFR-011 | Availability | Provider responds to SDK after SW idle termination. | Force SW stop (chrome://serviceworker-internals or test hook), then SDK call | ≥ 99% success on first call after termination (with auto-reconnect) | Must |

### 2.4 Offline functionality

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-012 | Offline | Zero network requests during inference. | Playwright network interception + OS-level packet capture during generation | 0 requests from UOAI contexts | Must |
| NFR-013 | Offline | Offline readiness indicator accuracy. | Scenario matrix (all assets present; each asset missing; storage evicted) | 100% correct classification | Must |

### 2.5 Security

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-014 | Security | Unauthorized origins rejected. | Automated suite: unauthorized origins, spoofed payload origins, iframes, scheme/port variants | 100% rejected | Must |
| NFR-015 | Security | Robustness to malformed input. | Schema-aware fuzzing ≥ 10,000 cases per boundary | 0 crashes/hangs; 100% structured errors | Must |
| NFR-016 | Security | No remotely hosted code. | Build-artifact scan; manifest/CSP review | 0 remote script/WASM loads | Must |
| NFR-017 | Security | Restrictive extension CSP. | Manifest review | `script-src 'self' 'wasm-unsafe-eval'`; no `unsafe-eval`, no remote origins | Must |
| NFR-018 | Security | Least-privilege permissions. | Manifest review vs permission justification table | No `<all_urls>` or broad host permissions in required permissions; every permission justified | Must |
| NFR-019 | Security | Dependency vulnerability management. | Automated dependency audit in CI | 0 known critical/high vulnerabilities at release | Must |

### 2.6 Privacy

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-020 | Privacy | No prompt/response egress. | Canary-string network audit online and offline | 0 occurrences off-device | Must |
| NFR-021 | Privacy | No content in logs/diagnostics/analytics. | Canary-string scan of all local logs, exports, analytics payloads | 0 occurrences | Must |
| NFR-022 | Privacy | Deletion completeness. | Storage inspection after deletion/reset | 0 residual records of deleted data | Must |

### 2.7 Usability

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-023 | Usability | Unassisted onboarding. | Moderated usability study, ≥ 8 non-technical participants | ≥ 80% complete setup to first inference unaided | Must |
| NFR-024 | Usability | Plain-language errors. | Content review of error catalogue messages; readability score | Every user-facing error has cause + action; Flesch reading ease ≥ 60 (English) | Should |
| NFR-025 | Usability | Time to first inference (excluding download). | Usability study timing | Median ≤ 5 min | Should |

### 2.8 Accessibility

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-026 | Accessibility | Conformance to WCAG 2.2 Level AA (target, not a certification claim). | Automated (axe-core) + manual audit | 0 critical/serious axe violations; manual audit pass on all 7 screens | Must |
| NFR-027 | Accessibility | Full keyboard operability. | Manual keyboard-only test scripts | All primary tasks completable; visible focus indicators | Must |
| NFR-028 | Accessibility | Screen-reader support for streaming output. | NVDA (Windows) and VoiceOver (macOS) testing | Streaming announced via polite live region, throttled (≤ 1 announcement / 2 s or by sentence); completion announced | Must |
| NFR-029 | Accessibility | Respect user preferences. | Test with `prefers-reduced-motion`, `prefers-color-scheme`, 200% zoom | Animations reduced; dark/light themes; no loss of content at 200% zoom | Should |

### 2.9 Maintainability

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-030 | Maintainability | Modular package boundaries. | Dependency-graph lint (e.g., dependency-cruiser) | 0 forbidden imports (e.g., `ui` → `inference-core`, `sdk` → extension internals) | Must |
| NFR-031 | Maintainability | Automated test coverage. | Vitest coverage | ≥ 80% line coverage for `api-protocol`, `browser-bridge`, `model-registry`, `model-storage`, `inference-core` (excluding vendor runtime) | Should |
| NFR-032 | Maintainability | Single source of truth for protocol types. | Code review; build check | All message/request/response types derived from `packages/api-protocol` schemas | Must |
| NFR-033 | Maintainability | Documentation currency. | CI compiles doc samples; doc review in PR template | 100% of doc code samples compile; API changes require doc updates | Should |

### 2.10 Scalability

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-034 | Scalability | Many connected origins. | Test with 10 authorized origins in 20 tabs simultaneously connected | SW remains responsive (health ≤ 500 ms); queue limits enforced | Should |
| NFR-035 | Scalability | Catalog size. | Library with 50 synthetic entries | Library renders/filter ≤ 500 ms on RC-3 | Could |
| NFR-036 | Scalability | Conversation history volume. | 1,000 conversations / 50,000 messages synthetic | Conversation list loads ≤ 1 s; opening a conversation ≤ 500 ms on RC-3 | Should |

### 2.11 Compatibility

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-037 | Compatibility | Published browser support matrix. | Compatibility test runs per release | Supported (MVP): Google Chrome Stable (current and previous major) on Windows 10/11, macOS, ChromeOS; Microsoft Edge Stable (Should). "Best effort": other Chromium browsers (Brave, Opera, Vivaldi), Linux (WebGPU support varies). Each listed cell has a documented result. | Must |
| NFR-038 | Compatibility | Protocol backward compatibility. | SDK N-1 vs extension N tests and vice versa | Extension supports protocol major N and N-1 (once N-1 exists); SDK negotiates highest common version | Must |

### 2.12 Storage efficiency

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-039 | Storage | No duplicate model storage. | Storage accounting after install and update | Installed model storage ≤ 1.05 × artifact sum (excluding during update) | Must |
| NFR-040 | Storage | Temporary data cleanup. | Inspect temp area after completed/aborted downloads | Temp data removed ≤ 1 min after completion; orphaned data cleaned per FR-108 | Should |

### 2.13 Resource management

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-041 | Resources | Memory released on unload. | 10 load/unload cycles; measure JS heap & GPU memory (where observable) or process memory via Task Manager | Post-unload memory returns within 10% of pre-load baseline | Must |
| NFR-042 | Resources | Idle unload. | Timer test with BR-20 default | Model unloaded within 1 min after the configured idle period | Should |
| NFR-043 | Resources | Bounded queue and request sizes. | Load tests | Never > 1 active generation, > 5 pending, > 256 KB payload | Must |

### 2.14 Recovery

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-044 | Recovery | Runtime crash recovery. | Fault-injection: terminate worker, close Runtime Host, simulate device loss (50 trials) | ≥ 95% automatic recovery; recovered and ready (model reloaded) ≤ cold-load time + 5 s | Must |
| NFR-045 | Recovery | Service worker restart recovery. | Kill SW during idle and during generation | In-flight requests fail with retryable error within 2 s; subsequent requests succeed | Must |

### 2.15 Observability (privacy-preserving)

| ID | Category | Requirement | Measurement method | Target / threshold | Priority |
|---|---|---|---|---|---|
| NFR-046 | Observability | Local structured diagnostics log without content. | Schema review of log event types; canary test | Ring buffer (proposed 1,000 events) of typed events (state changes, errors, timings, origins) with no content fields; user-exportable only | Must |
| NFR-047 | Observability | Optional opt-in aggregate metrics (if OQ-12 approves). | Payload schema review | Default off; content-free; no stable identifiers; documented in privacy disclosure | Could |
| NFR-048 | Usability / i18n | UI strings externalized for future localization. | Lint for hard-coded strings in UI components | 100% user-facing strings in message catalogues | Should |

## 3. NFR Summary

| Category | IDs |
|---|---|
| Performance | NFR-001 – NFR-006 |
| Reliability | NFR-007 – NFR-009 |
| Availability | NFR-010 – NFR-011 |
| Offline | NFR-012 – NFR-013 |
| Security | NFR-014 – NFR-019 |
| Privacy | NFR-020 – NFR-022 |
| Usability | NFR-023 – NFR-025, NFR-048 |
| Accessibility | NFR-026 – NFR-029 |
| Maintainability | NFR-030 – NFR-033 |
| Scalability | NFR-034 – NFR-036 |
| Compatibility | NFR-037 – NFR-038 |
| Storage efficiency | NFR-039 – NFR-040 |
| Resource management | NFR-041 – NFR-043 |
| Recovery | NFR-044 – NFR-045 |
| Observability | NFR-046 – NFR-047 |

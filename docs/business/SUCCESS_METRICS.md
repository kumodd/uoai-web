# UOAI — Success Metrics and KPIs

| Field | Value |
|---|---|
| Document | Success Metrics |
| Version | 0.1 (Draft for review) |
| Parent | [BRD.md](BRD.md) |
| Related | [BUSINESS_OBJECTIVES.md](BUSINESS_OBJECTIVES.md), [SECURITY_AND_PRIVACY_REQUIREMENTS.md](../architecture/SECURITY_AND_PRIVACY_REQUIREMENTS.md) |

---

## 1. Measurement Principles

1. **No sensitive data.** Prompts, messages, generated responses, model inputs, file contents, conversation titles, and website page content are **never** collected as analytics (BR-05).
2. **Analytics are off by default.** Product analytics require explicit opt-in (decision OQ-12). Without opt-in, metrics are derived from the **test lab**, **usability studies**, **store statistics** (installs/uninstalls), **npm download counts**, and **voluntary feedback**.
3. **Aggregate, content-free events only.** If opted in, events are coarse (e.g., `model_load_succeeded`, `model_id`, `browser_major_version`, `gpu_vendor_class`, `duration_bucket`) with no stable cross-site identifiers.
4. **Local diagnostics stay local.** The diagnostics log (NFR-046) is viewable and exportable by the user only.

### 1.1 Data classification for metrics

| Class | Examples | Allowed in analytics? |
|---|---|---|
| Sensitive content | Prompts, responses, messages, system prompts | **Never** |
| Personal/identifying | IP address retention, user names, emails, full user-agent fingerprints | **Never stored** |
| Integration metadata | Website origins authorized | **No** by default (origins can reveal browsing); only counts |
| Technical aggregates | Success/failure counts, duration buckets, model ID, browser major version, OS family, GPU vendor class | Yes, opt-in only |

## 2. KPI Catalogue

| ID | Metric | Definition | MVP target | Source | Objective |
|---|---|---|---|---|---|
| KPI-01 | Installation completion rate | Users who open onboarding after install ÷ store installs | ≥ 70% (baseline in beta) | Store stats + opt-in event | BO-03 |
| KPI-02 | First model download completion rate | Completed + verified first downloads ÷ started first downloads | ≥ 75% | Opt-in events; test lab | BO-02, BO-03 |
| KPI-03 | First successful inference rate | Users with ≥ 1 successful generation ÷ users with a Ready model | ≥ 90% | Opt-in events | BO-03, BO-06 |
| KPI-04 | Offline inference success rate | Successful offline generations ÷ offline attempts in lab scenarios | ≥ 95% on RC-1–RC-3 | Test lab | BO-02 |
| KPI-05 | Model loading success rate | Successful loads ÷ load attempts on devices that passed compatibility checks | ≥ 95% | Opt-in events; test lab | BO-06 |
| KPI-06 | Runtime crash rate | Unrecoverable runtime errors ÷ runtime sessions | ≤ 2% (provisional) | Opt-in events; fault tests | BO-06 |
| KPI-07 | Website integration success rate | Successful first SDK request after authorization ÷ authorizations | ≥ 90% | Opt-in events; reference test site | BO-04, BO-05 |
| KPI-08 | SDK integration success rate | Developers completing quick-start to streaming response ÷ participants | ≥ 80% in developer study | Developer study | BO-04 |
| KPI-09 | Permission revocation success rate | Post-revocation requests rejected ÷ post-revocation requests attempted | **100%** | Automated security tests | BO-05 |
| KPI-10 | User activation & retention | Activation: first inference within 7 days of install. Retention: users generating in week 4 ÷ activated users | Activation ≥ 50%; W4 retention baseline in beta | Opt-in events | BO-03 |
| KPI-11 | Developer adoption | Weekly npm downloads of `@uoai/sdk`; count of public sites/repos integrating; GitHub stars/forks (indicative) | Baseline in first 90 days after launch | npm, GitHub | BO-04 |
| KPI-12 | Prompt egress incidents | Detected transmissions of prompt/response content off-device | **0** | Network audit tests, security review | BO-01 |
| KPI-13 | Unsupported-environment explanation coverage | Unsupported environments in matrix showing an explanatory message ÷ unsupported environments tested | **100%** | Compatibility matrix | BO-06 |
| KPI-14 | Time-to-first-inference (excluding download) | Median time from onboarding start to first token, excluding model download duration | ≤ 5 minutes in usability study | Usability study | BO-03 |
| KPI-15 | Catalog compliance | Catalog models with reviewed license metadata and hashes ÷ catalog models | **100%** | Registry audit | BO-08 |

## 3. Reporting

- **Release gate metrics** (must meet target before release): KPI-04, KPI-09, KPI-12, KPI-13, KPI-15.
- **Beta-baselined metrics** (targets re-set after beta): KPI-01, KPI-02, KPI-03, KPI-05, KPI-06, KPI-10.
- **Ecosystem metrics** (tracked, no gate): KPI-07, KPI-08, KPI-11, KPI-14.

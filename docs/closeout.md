# CyberGym Tier 3 Closeout Verification Report

## Provenance
- **Commit**: `9d2a01cbc5de20591782afbc33afe7be10b90653`
- **Dirty Working Tree**: `true`
- **Manifest Timestamp**: `2026-09-17T17:35:31.030Z`
- **Evidence Directory**: `docs/evidence/`
- **Manifest File**: `docs/evidence/manifest.json`

---

## 1. Verification Gates Summary

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context / Formula |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TypeScript Compiler (npx tsc -b --force) Exit Code | 0 | tsc.txt | measured | |
| gate_lint_exit | Oxlint Linter (npm run lint) Exit Code | 0 | lint.txt | measured | |
| gate_vitest_files | Vitest Passed Test Files | 42 | vitest.txt | measured | |
| gate_vitest_tests | Vitest Passed Unit Tests Count | 719 | vitest.txt | measured | |
| gate_bounds_count | Explicit Query Row Bounds Violations Count | 0 | check-query-bounds.txt | measured | |
| gate_cache_keys | Distinct React Query Cache Keys Count | 21 | check-cache-collisions.txt | measured | |
| gate_cache_collisions | Query Cache Collision Violations Count | 0 | check-cache-collisions.txt | measured | |
| gate_fidelity_serviced | Test Mock Query Fidelity Servicing Ratio | 47/47 | check-mock-fidelity.txt | measured | |
| gate_fidelity_percent | Test Mock Database Contract Fidelity Percentage | 100% | check-mock-fidelity.txt | measured | |
| gate_payload_status | Gate A Unannotated Heavy Projection Gate Status | PASS | check-payload-projections.txt | measured | |
| gate_csp_violations | Content Security Policy Header Violations Count | 0 | check-csp.txt | measured | |
| gate_query_indexes | Documented vs Live PostgreSQL Public Indexes Matched | 25 | check-query-plan-doc.txt | measured | |
| gate_perf_budget_exit | Performance Budget Verification Exit Code (DIR-D6 LOC limit) | 0 | verify-perf-budget.txt | measured | |
| gate_perf_artifact_exit | Route Performance Measurement Artifact Verification Exit Code | 0 | verify-perf-artifact.txt | measured | |
| gate_db_residue_status | Post-E2E Database Snapshot Row-Count Audit Status | ZERO RESIDUE | db-snapshot.txt | measured | |
| gate_e2e_passed | Playwright E2E Desktop Chrome Passing Tests Count | 25 | e2e-desktop-chrome.txt | measured | |
| gate_e2e_skipped | Playwright E2E Desktop Chrome Narrow Viewport Skips Count | 6 | e2e-desktop-chrome.txt | measured | |

> **Note on Performance Budget Gate (`gate_perf_budget_exit: 0`)**:
> `src/components/coach/CoachCockpit.tsx` measures 599 LOC conforming to the 600 LOC soft budget ceiling. <!-- figure-ok: component line count and budget ceiling -->

---

## 2. Route Payloads & Measured Database Transferred Bytes

Route measurements are sourced from the retained authoritative trace
`docs/evidence/perf-trace-results.json`. That artifact's identity is **not** restated
here as prose; it is bound below as checked claims, so a close-out describing an
artifact it was not generated from fails verification instead of reading plausibly.

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context / Formula |
| :--- | :--- | :--- | :--- | :--- | :--- |
| provenance_run_id | Measurement Run ID | 30cb47fc-0d3d-4823-9c0b-0e30335d3c2b | perf-trace-results.json | measured | _meta.runId |
| provenance_source_fingerprint | Source Manifest Fingerprint | 6c7ce52415fe4974fa217c79709672e3 | perf-trace-results.json | measured | _meta.sourceFingerprint |
| provenance_git_commit | Git Commit At Measurement | 9d2a01cbc5de20591782afbc33afe7be10b90653 | perf-trace-results.json | measured | _meta.gitCommit |
| provenance_seed_profile | Seed Profile | payload-stress | perf-trace-results.json | measured | _meta.seedProfile |
| provenance_ceiling_bytes | Per-Route Payload Ceiling | 153,600 B | perf-trace-results.json | measured | _meta.ceilingBytes |

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context / Formula |
| :--- | :--- | :--- | :--- | :--- | :--- |
| route_payload_workout_total | Route /workout Total Supabase Payload | 123,085 B | perf-trace-results.json | measured | route=/workout |
| route_payload_workout_query | Route /workout Workouts Query Payload | 95,311 B | perf-trace-results.json | measured | workouts |
| route_payload_workout_exercises | Route /workout Exercises Query Payload | 1,340 B | perf-trace-results.json | measured | exercises |
| route_payload_history | Route /history Total Supabase Payload | 26,560 B | perf-trace-results.json | measured | route=/history |
| route_payload_nutrition | Route /nutrition Total Supabase Payload | 2,269 B | perf-trace-results.json | measured | route=/nutrition |
| route_payload_coach_total | Route /coach Total Supabase Payload | 57,422 B | perf-trace-results.json | measured | route=/coach |
| route_payload_coach_query | Route /coach Workouts Query Payload | 682 B | perf-trace-results.json | measured | workouts |
| route_payload_coach_master | Route /coach Routine Templates Query Payload | 54,223 B | perf-trace-results.json | measured | routine_templates |
| route_payload_coach_exercises | Route /coach Exercises Query Payload | 1,340 B | perf-trace-results.json | measured | exercises |

---

## 3. Derived Metrics & Arithmetic Verification

Derived metrics calculated deterministically from verified raw measurements via declared formulas.

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context / Formula |
| :--- | :--- | :--- | :--- | :--- | :--- |
| route_payload_combined_workout_nutrition | Combined Workout and Nutrition Routes Payload | 125,354 B | perf-trace-results.json | derived | route_payload_workout_total + route_payload_nutrition |
| route_payload_sum_all_routes | Total Payload Across All Measured Routes | 209,336 B | perf-trace-results.json | derived | route_payload_workout_total + route_payload_history + route_payload_nutrition + route_payload_coach_total |

- `route_payload_combined_workout_nutrition`: `123,085 + 2,269 = 125,354 B`
- `route_payload_sum_all_routes`: `123,085 + 26,560 + 2,269 + 57,422 = 209,336 B`

---

## 4. Measurement stability — why these figures must be regenerated, never edited

The route byte totals above are **not** bit-stable across measurement runs, and the
variation is understood rather than mysterious.

`AuthContext` issues its user fetches from two paths (`resolveSession()` and
`onAuthStateChange`). `dedupeInFlight` collapses them only when they are genuinely
concurrent, because it clears its key in `.finally()`. Whether the duplicate lands is a
race, so a route total can differ between runs by the size of one duplicated auth
request.

<!-- figure-ok: diagnostic observation of the duplicated-auth-request quanta and the historical pair that exposed the drift; these are not claims bound to a metric id -->
Observed quanta: 18 B (the `?select=role` request) and 370 B (the full-profile `users` request). `/history` has been measured at both 26,560 B and 26,948 B on an otherwise unchanged tree.

Consequences, which matter more than the numbers:

- Every `measured` figure here is bound to **one specific artifact**, identified by the
  provenance table above. Against that fixed artifact the claims are exact and the
  checker is strict. They are not predictions about the next run.
- Whenever the evidence bundle is regenerated, these claims **must be regenerated from
  the new artifact**, mechanically. Hand-carrying a number from a previous bundle is
  precisely the decay defect this document exists to prevent, and it is how the two
  `/history` values above came to disagree in the first place.
- The jitter is orders of magnitude below the margin that matters. The tightest route's
  headroom against the ceiling is recorded above and dwarfs these quanta, so this is a
  documentation hazard, not a budget risk.

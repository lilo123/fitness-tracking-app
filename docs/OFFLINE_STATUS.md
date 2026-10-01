# Offline Logging Status & Architecture

## 1. Purpose & User Request
Provides robust offline logging for workouts (O1) and nutrition (O2) across web PWA and Capacitor Android, with deterministic queued sync and zero data loss.
> "I want to be able to log things offline:
> - for the workout I should be able to log everything offline and then it can sync once im online again
> - for the nutrition, the AI function might not be working, but I think offline there's like a text recognition or something if you paste the info with readily available nutrition/macro information right?"

## 2. Requirements & Implementation Map
| ID | Requirement Summary | Phase | Status | Implemented Paths |
|---|---|---|---|---|
| D-OFF-1 | Shared web offline layer: installable PWA + Capacitor Android | O1 | Done | `vite.config.ts`, `src/pwa/register.ts`, `public/manifest.webmanifest`, icons |
| D-OFF-2 | Workout offline logging (start, catalog, sets, ghost/PR, history) | O1 | Done | `src/lib/sets.ts`, `src/components/workout/*`, `src/components/history/*` |
| D-OFF-3 | Sequential replay, needs-attention resolution, no silent drop/duplication | O1 | Done | `src/offline/{outbox,flusher,replay,classify,compaction}.ts`, `src/components/sync/*` |
| D-OFF-4 | UX: "Offline · N pending", item marks, "Synced N changes" toast | O1 | Done | `src/components/common/Header.tsx`, `src/components/sync/*`, `tests/visual-density.test.ts` |
| D-OFF-5 | Nutrition offline scope (paste-to-fill, quick-log cached, manual form, queued AI) | O2 | Planned | Not started (`src/components/nutrition/*` placeholder) |
| D-OFF-6 | Strict paste-to-fill local parser (exact 4-macro block, "Parsed locally") | O2 | Planned | Not started |
| D-OFF-7 | Queued AI capture (original timestamp, "Pending review", photo cleanup) | O2 | Planned | Not started |
| D-OFF-8 | 7-day offline duration, session retention, user isolation on shared device | O1 | Done | `src/context/AuthContext.tsx`, `src/offline/{db,persister,persistController}.ts` |
| D-OFF-9 | Verified npm packages only (permissive license, perf budget compliant) | O1 | Done | `package.json` (`vite-plugin-pwa`, `idb`, `workbox-*`, `@tanstack/*`, `fake-indexeddb`) |
| D-OFF-10 | Background updates, "Update available · Reload", safety blockers | O1 | Done | `src/pwa/{useAppUpdate,UpdateBanner,updateSafety}.ts`, `src/offline/blocker.ts` |
| D-OFF-11 | Database changes: expand-first pre-approved migrations | O1/O2 | Done (O1) | None in O1 (`src/offline/replay.ts` uses client UUIDs + idempotent upsert) |

## 3. Architecture
- **App Shell & Updates**: `vite-plugin-pwa` precaches app bundles, svg, manifest, woff2 (`navigateFallback: '/index.html'`). SW registers in web production only (bypassed in dev and `Capacitor.isNativePlatform()`). Updates install in background; `UpdateBanner` shows `"Update available · Reload"`. Reload blocked by `updateSafety.ts` during active workouts, pending outbox ops, open dialogs (`[role=dialog]`), or dirty forms. Shows `"Finish your workout and sync first"` if blocked.
- **Per-User IndexedDB**: Database `cybergym-offline-<userId>` isolates users with stores:
  1. `rq`: Serialized TanStack Query cache (whitelist roots, 8-day gcTime/maxAge, buster `'rq-v1'`).
  2. `outbox`: KeyPath `'opId'`, index `'seq'`. Holds mutations across reloads.
  3. `idmap`: KeyPath `'clientWorkoutId'`. Maps local workout UUIDs to canonical server IDs.
  4. `meta`: Internal configuration and schema versions.
- **Outbox, Mutex & Op Kinds**: All workout writes route through `src/offline/outbox`. Ops: `workout.ensure`, `workout.rename`, `set.create`, `set.batchCreate` (single upsert array with `ignoreDuplicates`, preserving batch finish-review as 1 POST), `set.update`, `set.delete`. Monotonic sequencing is protected by an in-memory enqueue mutex (`runWithEnqueueMutex`). Replayed sequentially under `navigator.locks.request('cybergym-outbox-<userId>')` (in-tab fallback).
- **Cross-Tab Outbox Sync**: Changes broadcast via `BroadcastChannel('cybergym-outbox-<userId>')` and tracked in per-user localStorage (`cybergym_outbox_pending_<userId>`). Update safety blocker inspects localStorage pending count only for the active user.
- **TanStack Query Config**: QueryClient defaults `mutations: { networkMode: 'always' }` to prevent offline mutations from pausing; offline queries use `retry: false` and fall back to cached data via `offlineFallback` without error banners.
- **No Production Test Globals**: Removed `window.__*ForTesting` globals; density and E2E tests seed real IndexedDB data directly.
- **Replay & Compaction**: Compacted on enqueue (merging updates into un-sent creates, coalescing deletes, folding updates into batchCreate). Idempotent replay: `set.create`/`set.batchCreate` use `ON CONFLICT DO NOTHING`; `set.update` validates pre-images; `set.delete` is idempotent. Local ops are deleted only after server transaction commits.
- **Error Classification**: `TRANSIENT` (408/429/5xx/network) triggers exponential backoff (2s..5m) and auto-wakes on `'online'`; `AUTH` (401) triggers `refreshSession()`; `PERMANENT` (FK 23503, checks, conflicts) moves op to `attention` and blocks dependents.
- **Pure Overlay & Prefetch**: `usePendingOps` projects outbox ops over server data (`applyPendingToDaySets`, `pendingSetsBefore`, `applyPendingToHistory`) with `pending: true` marks. `useOfflinePrefetch` warms catalog, routines, templates (cap 60), and stats upon login/reconnect.
- **Auth & Shared Devices**: Network failure during session check keeps user authenticated. Logout clears `rq` cache but retains `outbox`/`idmap`. If pending ops exist, confirm warns: `"N unsynced changes stay on this device and sync the next time you sign in as <email>. Sign out?"`.

## 4. Decisions Log
| Decision | Description | Status |
|---|---|---|
| D-O0-1 | Local DB parity verified by schema objects (columns/RPCs) rather than migration row | Approved |
| D-O1-1 | Retain pending outbox on sign-out with user warning modal: keep outbox on device + confirm dialog | Approved by user 2026-10-01 (G3) |
| D-O1-2 | Read cache deleted on sign-out (`rq` store) for privacy over offline convenience | Approved |
| D-O1-3 | Capacitor offline proven by architecture (bundled assets + shared IDB layer) + unit tests; no device E2E in CI | Accepted by user 2026-10-01 (G4); user will check Android offline manually |
| D-O1-4 | History workout delete disabled offline to avoid tombstone sync conflicts | Approved |
| D-O1-5 | Client-generated capture time stored as set `created_at` timestamp (client clock) | Approved |
| D-O1-6 | Intermittent vitest teardown "Unhandled Errors" fixed in O1 (GATEFIX5b) rather than deferred: only exact closed-IndexedDB errors (`InvalidStateError` / exact idb close messages) are absorbed, in background read-cache paths only; outbox enqueue rejects on every error | Approved by user 2026-10-01 (G6, G9) |
| D-O1-7 | GATEFIX5b scope includes `src/offline-prefetch/useOfflinePrefetch.ts` and `src/setupTests.ts` (offline infra + test teardown) | Conductor, within G9 intent |
| D-O1-8 | Local gate CI-order contention failures on shared seeded users (mobile-viewport:152, workout-catalog-tail:62, p5a-history:150) are not O1 blockers; they must pass in GitHub CI (one project per job) | Accepted by user 2026-10-01 (G7, G10) |
| D-O1-9 | Per-test seeded-user isolation for those specs deferred to O2 (test-only, covered by the O2 gate) so O1 ships exactly the gated code | Conductor (G11 optional) |
| D-O2-1 | Paste-to-fill grammar definition and strict boundary rules: single nutrition block, all 4 macros required, 4*P + 4*C + 9*F calorie consistency check within max(60, 25%), strict rejection of multi-item, prose, non-g units, and digits in dish name | Approved |
| D-O2-2 | Queued AI offline photo retention and lifecycle: base64/mime in IndexedDB up to 4 MB (exceeding rejects with AiPhotoTooLargeError), auto-cleaned on completion in same transaction, original capture timestamp and civil date preserved across midnight and time zones | Approved |
| D-O2-3 | Nutrition offline logging via outbox: `nutrition.log` op with client UUID, idempotent replay, single upsert, `incrementDishId` increments `custom_dishes.use_count` once on replay, offline guards ("Available when online") on delete/edit/scale meal and custom dish CRUD | Approved |

## 5. Packages
| Package | Version | License | Purpose | Bundle Impact |
|---|---|---|---|---|
| `vite-plugin-pwa` | 1.3.0 | MIT | Service Worker generation and manifest compilation | Dev dependency (0 KB) |
| `workbox-build` | 7.4.1 | MIT | Build-time Workbox precache generator | Dev dependency (0 KB) |
| `workbox-window` | 7.4.1 | MIT | Window-side Service Worker lifecycle and registration | see PR (perf:budget) |
| `idb` | 8.0.3 | ISC | Lightweight IndexedDB Promise wrapper | see PR (perf:budget) |
| `@tanstack/react-query-persist-client` | 5.102.8 | MIT | QueryClient cache persister for IndexedDB | see PR (perf:budget) |
| `fake-indexeddb` | 6.2.5 | Apache-2.0 | In-memory IndexedDB test mock | Dev dependency (0 KB) |

## 6. Risks & Limitations
- **Capacitor Device Validation**: Android offline is validated by shared bundle architecture and E2E browser harness; real device verification is manual.
- **Client Clock Skew**: Offline `created_at` relies on device time; severe skew could misalign session ordering.
- **7-Day Cache Horizon**: IndexedDB cache and TanStack queries use 8-day gcTime; stale sessions older than 8 days require reconnect.
- **iOS Safari Storage Eviction**: WebKit may purge IndexedDB data after 7 days of inactivity under storage pressure.
- **Shared Device Outbox Retention**: Unsynced mutations remain in device IDB across sign-outs until synced by original user.
- **No Database Migrations in O1**: O1 leverages existing schema with client UUIDs; conflicts depend on application-level resolution.

## 7. Test Map (O1 Acceptance Criteria)
| Acceptance Target (RULES.md O1) | Test Files | Exact Test Names |
|---|---|---|
| 1. Cold-open & reload offline to last-used route (<=7d) | `tests/e2e-pwa/offline-shell.spec.ts`<br>`src/pwa/register.test.ts`<br>`src/pwa/lastRoute.test.ts`<br>`src/offline/__tests__/auth_guard.test.tsx` | - `signed-in user loads /workout, SW controls page, offline reload, deep link, last-used route, and clock shift`<br>- `registers with Workbox when PROD, web, and serviceWorker are present`<br>- `does not register in development mode (import.meta.env.PROD is false)`<br>- `does not register when running on native Capacitor platform`<br>- `records only valid tab routes for a user`<br>- `isolates last route per user`<br>- `offline resume retains user state and cached credentials when getSession fails` |
| 2. Offline workout logging, ghost/PR, history | `tests/e2e-pwa/offline-workout.spec.ts`<br>`src/lib/sets.test.ts`<br>`src/components/workout/useWorkoutMutations.test.ts`<br>`src/components/workout/useWorkoutQueries.test.ts`<br>`src/offline/__tests__/overlay.test.ts`<br>`src/offline-prefetch/useOfflinePrefetch.test.ts` | - `offline workout flow on pinned routine: log, edit, delete sets, PR update, history mark, and clean sync`<br>- `offline free workout: select Free Workout, pick cached exercise, log set, and sync`<br>- `offline -> exactly one set.create op with client id and zero supabase calls`<br>- `batch inserts sets routing as a single set.batchCreate through enqueueAndAwait`<br>- `Product Bug 1: with offline network and networkMode: "always", logSet mutation reaches enqueue`<br>- `overlays pending sets and updates PR benchmarks in weight and e1rm mode (c)`<br>- `overlays synthetic sets onto server sets for the target date`<br>- `prefetches catalog, routines, details, and stats when online` |
| 3. Pending marks, Header badge, sync toast | `tests/visual-density.test.ts`<br>`src/components/sync/PendingMark.test.tsx`<br>`src/components/sync/SyncToastBridge.test.tsx`<br>`src/components/sync/SyncStatusSheet.test.tsx` | - `W4 Density: Header connection status badge displays "Offline · 12 pending", fits 320px without clip or wrap, tap target >= 44x44px`<br>- `W4 Density: SetRow pending mark fits in index cell and preserves grid column alignment with header at 320px`<br>- `W4 Density: AttentionBanner and SyncStatusSheet fit 320px without overflow with >=44px tap targets`<br>- `renders with role="status" and accessible label "Not synced yet"`<br>- `fires toast "Synced N changes" when multiple items synced`<br>- `renders pending count and syncing status when changes are pending` |
| 4. Exactly-once: tab kill, flaky reconnect, replays | `tests/e2e-pwa/exactly-once.spec.ts`<br>`src/offline/__tests__/replay.test.ts`<br>`src/offline/__tests__/flusher.test.ts`<br>`src/offline/__tests__/outbox.test.ts`<br>`src/offline/__tests__/compaction.test.ts` | - `lost response after commit: tab closed mid-sync leaves server committed; replay prevents duplicates`<br>- `flaky reconnect: rapidly toggling connection flushes all pending ops exactly once`<br>- `multi-tab race with Web Locks: concurrent tabs transition online with 0 duplicate rows`<br>- `1. set.create is idempotent: upserts onConflict id ignoreDuplicates`<br>- `2. crash after server success before local delete is a no-op on re-run`<br>- `3. workout.ensure remaps clientWorkoutId to canonical id when server already has workout for that date`<br>- `9. set.batchCreate: single op for N sets, replay once = one upsert call with N rows, idempotent replay, and remap`<br>- `2. two concurrent flushers execute sequentially without duplicate replay`<br>- `10. concurrent enqueues preserve monotonic ordering and maintain in-memory cache coherence`<br>- `11. cross-tab cache coherence: pending counts in storage prevent stale 0 pending in other tabs` |
| 5. Needs-attention on conflict/failure | `tests/e2e-pwa/needs-attention.spec.ts`<br>`src/offline/__tests__/classify.test.ts`<br>`src/offline/__tests__/outbox.test.ts`<br>`src/components/sync/AttentionBanner.test.tsx`<br>`src/components/sync/SyncStatusSheet.test.tsx` | - `deleted custom exercise triggers 23503 error, attention badge, retry failure, and discard with confirmation`<br>- `classifies Postgres 23503 (FK violation e.g. exercise deleted) as PERMANENT`<br>- `classifies pre-image conflict "changed elsewhere" as PERMANENT`<br>- `4. dependent blocking: failed ensure blocks dependent sets, independent ops continue`<br>- `5. retryOp unblocks dependent operations`<br>- `6. discardOp removes op from outbox and unblocks dependents`<br>- `12. blockDependentOps: if set.batchCreate goes to attention, subsequent ops on its set ids are blocked`<br>- `renders banner with plural text when multiple changes need attention`<br>- `calls retry when Retry button is clicked on an attention item`<br>- `opens ConfirmDialog on Discard and removes op on confirm` |
| 6. Account switch / logout isolation | `tests/e2e-pwa/account-switch.spec.ts`<br>`src/offline/__tests__/outbox.test.ts`<br>`src/offline/__tests__/flusher.test.ts`<br>`src/offline/__tests__/auth_guard.test.tsx`<br>`src/offline/__tests__/persister.test.ts`<br>`src/offline/__tests__/blocker.test.ts` | - `user A offline pending sets -> sign out warning dialog -> user B isolated -> user A signs back in -> sync replay`<br>- `3. per-user isolation: User A and User B never cross-contaminate`<br>- `1. outbox owner check: flush does NOT execute if current session user does not match outbox user id`<br>- `7. outbox owner check: flush does NOT execute if supabase.auth.getSession() user does not match outbox user even if flusherSessionUserId matches`<br>- `signOut clears rq store while preserving outbox and idmap in IndexedDB`<br>- `sign-out deletes user rq read cache while KEEPING outbox and idmap stores intact`<br>- `pendingBeforeSignOut > returns sentinel 1 on IDB error to trigger sign-out confirmation safely` |
| 7. Update flow & safety blockers | `tests/e2e-pwa/update-flow.spec.ts`<br>`src/pwa/updateSafety.test.ts`<br>`src/offline/__tests__/blocker.test.ts`<br>`src/pwa/UpdateBanner.test.tsx` | - `update flow: banner appears, blocked by open dialog or active workout, never auto-reloads, and applies on tap when safe`<br>- `UpdateBanner at 320px fits without overflow, tap target >= 44px, and does not overlap header or pills`<br>- `blocks update when an active uncompleted workout session pointer exists`<br>- `blocks update when a role="dialog" aria-modal="true" element is in the document`<br>- `blocks update when a form is marked dirty and unblocks when cleaned`<br>- `blocks PWA update when outbox has pending ops`<br>- `blocks PWA update when active user has pending ops in localStorage from another tab`<br>- `allows PWA update when another user has pending ops in localStorage but active user has 0`<br>- `when blocked: shows reason inline and does not call applyUpdate`<br>- `when safe: calls applyUpdate exactly once` |
| 8. Out-of-scope actions disabled offline | `tests/e2e-pwa/out-of-scope.spec.ts`<br>`src/components/exercises/CreateExerciseSheet.test.tsx`<br>`src/components/exercises/ExercisePicker.test.tsx`<br>`src/components/settings/PrModeCard.test.tsx`<br>`src/components/history/useWorkoutHistory.test.ts` | - `custom exercise and template creation/editing are disabled offline with 0 network requests`<br>- `settings PR mode options are disabled offline with 0 network requests`<br>- `coach cockpit displays offline banner and disables coach actions with 0 network requests`<br>- `disables deletion when offline and does not call supabase (g)` |
| 9. Online behavior unchanged | `tests/e2e/p3b-session-flows.spec.ts`<br>`src/lib/sets.test.ts`<br>`tests/visual-density.test.ts` | - `(c) Finish with pending sets lists them in FinishReviewSheet, supports edit/remove, and inserts reviewed list or none` (verified single batch POST via `set.batchCreate`)<br>- `online -> enqueueAndAwait called, synced result returned`<br>- `batch inserts sets routing as a single set.batchCreate through enqueueAndAwait`<br>- `npm run test:tz` clean in LA and Tokyo<br>- `npm run perf:budget` verified under query bounds and bundle thresholds |

## 8. Change Log
- **2026-09-30 (Phase O1 — branch `offline-o1` (code @ e2e1c1b; ff-shipped to v2-rewrite with this doc))**:
  - Added PWA and persistence dependencies (`vite-plugin-pwa`, `workbox-build`, `workbox-window`, `idb`, `@tanstack/react-query-persist-client`, `fake-indexeddb`).
  - Implemented core offline engine in `src/offline/`: per-user IDB outbox, monotonic enqueue mutex, sequential replay under Web Locks, compaction, error classification, pure optimistic overlays, and query persister.
  - Implemented op kinds: `workout.ensure`, `workout.rename`, `set.create`, `set.batchCreate` (single upsert array), `set.update`, `set.delete`.
  - Added cross-tab outbox sync via BroadcastChannel and per-user localStorage pending counts.
  - Configured TanStack Query with `mutations: { networkMode: 'always' }` and offline `retry: false`.
  - Created PWA shell in `src/pwa/`: manifest, icons, service worker lifecycle, update safety blocker registry, and last-route restoration.
  - Converted workout writes in `src/lib/sets.ts` and workout hooks to route exclusively through the outbox.
  - Implemented catalog, routine, and history prefetch in `src/offline-prefetch/useOfflinePrefetch.ts`.
  - Added sync indicators and management UI in `src/components/sync/` and `src/components/common/Header.tsx`.
  - Implemented out-of-scope guards disabling exercise creation, template editing, settings mutation, and coach actions offline.
  - Removed production test globals; added production-build PWA Playwright E2E harness (`tests/e2e-pwa/`) and 320px visual density tests in `tests/visual-density.test.ts`.

## Paste grammar

### Local Nutrition Block Grammar (D-OFF-6 / N4)

Local parsing applies ONLY when the ENTIRE input is a single nutrition block.
False positives are worse than misses: when in doubt, reject.

1. **Lines & Structure**:
   - Optional **NAME** line: first non-empty line only, <=60 chars, NO digits,
     no conjunctions/list markers ('and', 'with', 'plus', '&', '+', ',', ';', '/').
   - Optional **SERVING** line: `Serving( size)?: <num> <unit>` or `Per <num> <unit>` / `Per serving`.
   - **HEADER NOISE**: `Nutrition Facts`, `Amount Per Serving`, `% Daily Value*`, etc. ignored.
   - **IGNORABLE SUB-ROWS**: Saturated/trans fat, cholesterol, sodium, sugars, added sugars, salt, vitamins.
   - **MACRO LINES**: Exactly one of each of the 4 macros (Calories, Protein, Carbs, Fat); optional Fiber.

2. **Macro Forms**:
   - Calories: `Calories[:]? <num>( kcal)?`, `Energy <num> kcal` (kJ alone rejected; if both, kcal wins).
   - Protein: `Protein[:]? <num>( g)?`, `P<num>`, `30g protein`.
   - Carbs: `(Total )?Carb(s|ohydrate(s)?)[:]? <num>( g)?`, `C<num>`, `40g carbs`.
   - Fat: `(Total )?Fat[:]? <num>( g)?` (not sat/trans fat), `F<num>`, `8g fat`.
   - Fiber (optional): `(Dietary )?Fib(er|re)[:]? <num>( g)?`.
   - Compact: `350 kcal | 30g protein | 40g carbs | 8g fat` or `P30 C40 F8 350kcal`.
   - Separators: `|`, `,`, `/`, `·`, `;`, or whitespace.

3. **Units & Numbers**:
   - Numbers: standard `.` or comma decimal `,` (e.g. `8,5 g`).
   - Bounds: `0 <= calories <= 5000`, `0 <= macro <= 500 g`.
   - Units: macros must be in `g` or unitless; `mg` or `oz` rejected.

4. **Consistency & Rejection**:
   - Consistency check: `|4*P + 4*C + 9*F - kcal| <= max(60, 25% * kcal)`.
   - Reject: missing any macro, second calories line, duplicate macro with different value,
     name with digits or multiple items/conjunctions, leftover words, prose, multiple foods.


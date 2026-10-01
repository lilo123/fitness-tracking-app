# Redesign status: single source of truth

> **Scope:** a phased redesign of Workout, Library, History, Coach, Settings and the shell, using the Nutrition tab as the reference.
> **Standards:** [DESIGN_STANDARDS.md](./DESIGN_STANDARDS.md) (Part 1: takeaways + `STD-*` rules).
> **Inputs:**
> - `WORKOUT_AUDIT_REPORT.md` (conv `2492f3fe`; W1–W50)
> - `LIBRARY_AUDIT_REPORT.md` (conv `21e6797c`; L1–L48)
> - `HISTORY_AUDIT_REPORT.md` (conv `c66e93e7`; H1–H53)
> - Nutrition decisions D1–D45 (conv `27f07f48`)
>
> **Baseline:** after P0 (2026-09-26, on top of `d2ddeb7`): vitest 98 files / 1349, `test:tz` 141 + 141, density 67, E2E trio 36/0/6, oxlint 0e/33w.
> **Execution rules:** §3a (production-DB hard rules, ship flow with migrations, anti-stall rules).
> **Owner of this file:** whoever runs the current phase. Update the phase table, the item table and the decision log in the same commit as the work.

## 1. Status summary
| Phase | Title | Status | Progress notes |
|---|---|---|---|
| P0 | Foundations and test guardrails | **done** 2026-09-26 | `6bc91c7` (+ `7e7b05b` E2E label fix for D46). Gates: tsc 0, oxlint 0e/33w, vitest 98/1349, test:tz LA 141 + Tokyo 141, check:mocks/payload, build, perf, density 67/67 ×2, E2E trio 36/0/6. No DOM change. |
| P1 | Safety hotfixes + exercises RLS v2 | **done** 2026-09-27 | `cc64455` (PR #7). W50 policy, L1, L2, L3, L5, L6, L7, L12 + M1 `20260927000000_exercises_rls_v2` applied to production 00:50Z via `scripts/prod-db.sh migrate` (backup `prod-20260927T005007Z.dump` verified; audit 0 before and after). Gates: tsc 0, oxlint 0e/33w, vitest 98/1359, test:tz 141+141, mocks/payload/build/perf, density 67/67, pgTAP 142/142, E2E trio + workout/coach/error-states 62 passed/6 skipped, CI green. Master routines stay editable by platform coaches (L1 = exercises only). |
| P2 | Workout data layer and cross-tab data contracts | **done** 2026-09-27 | `783b6cb` (PR #8). All 29 items. M2 `workouts_civil_date` + M3 `exercise_pr_benchmarks` applied to production 02:36Z (verified backups; per-day checksum identical before/after; audit 0). Gates: tsc 0, oxlint 0e/33w, vitest 107/1417 in UTC + LA + Tokyo (test:tz = full suite), mocks/payload/build/perf, pgTAP 168, density 67/67 ×2, E2E 64/0/6; the deployed frontend passed the same E2E set against the migrated DB. |
| P3a | Shared primitives, exercise card, set rows, EditSetSheet | **done** 2026-09-27 | `407f94b` (PR #9). UI-only (no migration). Primitives in `common/`, `EditSetSheet` replaces `EditSetModal` with deferred delete (`useDeferredDelete` + `UndoToast`), `ExerciseCard`/`SetRow` 44px hit areas, `check:design` ratchet. Gates: tsc 0, oxlint 0e/33w, vitest 123/1519 + tz, pgTAP 168, density 73/73 ×2, E2E 70/0/6 local, CI full suite green (3 projects). Deployed to `v2-rewrite` 14:53Z. |
| P3b | Workout session flows, header, rest day, routine picker | **done** 2026-09-27 | `7597545` (PR #10). UI-only (no migration). Exercise removal (0 logged -> UndoToast; logged -> `RemoveExerciseSheet` deferred delete), Clear/Reload ConfirmDialog, `FinishReviewSheet`, skeletons, empty-state CTAs, URL `?date=`/`?routine=` contracts, header/picker/pill 44px + STD-TYP (D-P3b-1). Gates: tsc 0, oxlint 0e/31w, vitest 131/1563 + tz, pgTAP 168, density 78/78 ×2, E2E 82/0/6 local (ran vs M4-applied DB = parity), CI green (18m47s). Deployed to `v2-rewrite` 17:21Z. |
| P4 | Exercise catalog + shared ExercisePicker | **done** 2026-09-27 | `03de69e` (PR #11). M4 `20260927030000_exercise_catalog` applied to production 19:44Z via `scripts/prod-db.sh migrate` (backup `prod-20260927T194454Z.dump` verified; pre/post checksum `785f564f9ae0142caeacadb59d3133f6` identical, post invariants 0). Shared `ExercisePicker` (catalog RPC, search normalizer, chips, multi-add, inline create with duplicate check), `RoutinePickerModal` on `get_routine_catalog` (D-P4-4 payload projection), Library/History DOM compat proof. Gates (79557ab): tsc 0, oxlint 0e/31w, vitest 135/1602 + tz, pgTAP 201, density 83/83 ×2, E2E 88/0/6; full E2E in CI order (`03de69e`) 141/0/12s; CI green (18m2s, attempt 2). Deployed to `v2-rewrite` 19:45Z. |
| P5a | History data, shell and session list | **done** 2026-09-27 | `8bb06cb` (PR #12). Items H3, H5, H6, H7, H8 (data RPC), H9, H12, H13, H14, H18, H20, H21 (sessions), H22, H26, H30, H31, H32 (adopt), H33, H34, H35 (session/shell), H38, H44, H45, H46 (part), H50. M5 `20260927040000_history_rpcs_v2` applied to production 22:37Z via `scripts/prod-db.sh migrate` (backup `prod-20260927T223706Z.dump` 244K verified; pre/post sets checksum `53ff934027825573baa4415b5a3a977f` identical, 33 workouts / 391 sets unchanged, funcs 1/1 SECURITY INVOKER). History keyset pagination (`get_history_sessions_v2`), `<Activity>` keep-alive in shell (D-P5a-6), session ⋯ menu (Edit in Workout / Delete confirm), measured virtualization DOM caps (D-P5a-8). Gates (`8bb06cb`): tsc 0, oxlint 0e/31w, vitest 139/1640 + test:tz LA+Tokyo, mocks/payload/design/build/perf OK, pgTAP 225, density 86/86 ×2, E2E set 102/0/6; full tests/e2e CI order retries 0 162/0/12s; CI green (15m37s, attempt 1). Deployed to `v2-rewrite` 22:41Z. |
| P5b | History exercise sheet, trends, calendar, nutrition timeline | **done** 2026-09-28 | `22f6b8b` (PR #13). Items H8, H11, H21 (exercise), H23, H24, H27, H29, H35 (rest), H36 (search), H37, H41, H42, H43, H46 (rest), H47 (UI), H49, H51. No migration (uses M5). Commits 77a53e1 (calendar sheet + session filter), dc32398 (nutrition day-window paging + meal deferred delete + timeline), efec619 (exercise history sheet + sparkline + stats list), 25ddac8 + 241c8e2 (HistoryView wiring, split into HistoryHeader/HistoryToolbar/useHistoryCalendarJump/useHistorySessionSets), 21d1c20 (E2E p5b-history + density), 04c0436 (red-team fixes), 22f6b8b (p3a-set-edit test race fix). Gates (04c0436 / 22f6b8b): tsc 0, oxlint 0e/31w, vitest 147 files/1702 + test:tz LA+Tokyo, mocks/payload/design/build/perf OK, pgTAP 10/225, density 89 x2, E2E set 118p/0f/6s; full tests/e2e CI order retries 0 184p/1f/12s (the 1 failure in Narrow Safari p3a-set-edit race fixed test-only in 22f6b8b and verified 27/27); CI green (run 36365773679, 22m28s, attempt 1). Deployed to `v2-rewrite` 2026-09-28T01:46Z. |
| P6 | kg/lb units across tabs | **done** 2026-09-28 | `856f4ae` (PR #14). Items W49, H48; Coach §8.2 unit strings, Settings unit toggle, export. M6 `20260928000000_users_weight_unit` (users.weight_unit text NOT NULL DEFAULT 'lb' CHECK IN ('lb','kg'); RLS unmodified: own-row update policy covers it) applied to production 04:57Z via `scripts/prod-db.sh migrate` (backup `prod-20260928T045705Z.dump` 248K verified, mode 600; counts preserved; post audit: column 1, users 3 all 'lb', 0 kg, 0 invalid; workouts 33, sets 397, checksum `fd23890ea604f04d3f367ed1605872f8` identical; check 28, latest 20260928000000; smoke of deployed frontend fdede85 vs migrated DB SMOKE_FAIL=0; ff-push; local rehearsal migrate/rollback/migrate OK 01:55Z; Rule 8 data-changing default backfill satisfied by audit + checksum). Commits: f7a0667 (M6 migration, rollback, pgTAP, audits), 00a75d4 (weight.ts units layer, useWeightUnit/useWeightUnitPreference, AuthContext select), 994fbb3 (Settings WeightUnitCard + data export weight_unit), 4a99aba (History + Coach timeline in viewer's unit, volume converted once), 4350c29 (Workout entry/EditSetSheet/FinishReview/commit paths/ghost sets in unit), ec92bb5 (red-team fixes: last 'lbs' literals, typed users update, weight_unit in supabase types), 51acf8c (E2E p6-weight-units + density + mobile-viewport), 0190691 + 856f4ae (pgTAP made seed-independent). Decisions D-P6-1..8. Gates (51acf8c / 856f4ae): tsc 0, oxlint 0e/31w, vitest 151 files/1749 + test:tz LA+Tokyo, mocks/payload/design/build/perf OK, pgTAP 11/237, density 95 ×2, E2E set 130p/0f/6s; full tests/e2e CI order retries 0 204p/0f/12s; CI green (run 36378178645, 23m23s, attempt 2; run 36377373957 failed at 9m13s on data-dependent pgTAP assertion, fixed test-only in 856f4ae). Deployed to `v2-rewrite` 2026-09-28T05:08Z. |
| P7a | Library exercises list | **done** 2026-09-28 | `8782215` (PR #15). No migration (UI-only, uses M4). Items L4, L8, L10, L11, L13, L14, L15, L18, L19, L20, L21, L23, L24, L25, L30, L32, L34, L35, L46, L47, L48. Commits: 629a639 (CI timeout 35m D-P7a-1), 1c214ec (W0 split ExercisesView into list/row/sheets/templates), cc93c39 (W1 list + W2 sheets + W3 templates), bc79ba1 (p5a/p5b-history WebKit de-flake), 1bd03ec (integration), 1eed592 (red-team fixes), 13bba0a (W4 library.spec + density), c5f4316 (skeleton/catalog refresh/contrast/fresh-seed fixes), 8782215 (CI unmount timer fix). Decisions D-P7a-1..6. Gates (c5f4316 / 8782215): tsc 0, oxlint 0e/31w, vitest 155 files/1797 + test:tz LA+Tokyo, mocks/payload/design/build/perf OK, pgTAP 11/237, density 98 ×2, E2E set 116p/0f/6s; full tests/e2e CI order retries 0 237p/0f/12s; CI green (run 36478499542, 26m52s, attempt 2; attempt 1 failed at 20:15Z on ExerciseListRow timer after unmount, fixed in 8782215). Deployed to `v2-rewrite` 2026-09-28T20:48Z. |
| P7b | Library template builder, coach builder, catalog content | **done** 2026-09-29 | `befe8db` (PR #16). Scope: L9, L13, L15, L16, L17, L27, L28, L29, L33, L35, L36, L37, L38, L40, L42, L43, L44, L48. Migrations M7 `20260929000000_exercise_name_guard` (01:17Z, backup `prod-20260929T011655Z.dump`), M8 `20260929010000_default_catalog_seed` (01:18Z, backup `prod-20260929T011805Z.dump`), and M9 `20260929020000_drop_body_part` (01:20Z, backup `prod-20260929T012001Z.dump`) applied to production via `scripts/prod-db.sh migrate` (audits identical to rehearsal; M8 backfilled 14 NULL-equipment masters, masters 23->208, exercises 25->210, 0 NULL-equipment masters; M9 dropped `body_part` column/trigger/fns after zero-reader verification). Deployed frontend parity: P7a vs M7+M8 0 class-B errors. `EditTemplateSheet` replaces `EditTemplateModal` (596 LOC; stepper clamp, aria-live reorder/add/remove, fetch-on-open, stale precondition PT409 -> StatusBanner + reload); `ExercisePickerSheet` + `CoachTemplateBuilder` retired; Coach adopts single `save_routine_template` RPC with `p_assigned_to` (no orphan; inline builder retained per D-P7b-6); Library routines via `get_routine_catalog` (L33); full codebase migration `body_part` -> `body_parts`. Commits: 7359a37 (DB M7/M8/M9), 73ffa06 (EditTemplateSheet), 8bdfb8c (body_parts readers), 8ea760c (coach RPC, get_routine_catalog), 13252f3 (library E2E proofs), f2eb7b9 (drop dead query), c54ef45 (pgTAP M9), 79cfae5 (red team fixes), befe8db (CI density weekday fix). Decisions D-P7b-1..6. Gates (79cfae5 / befe8db): tsc 0, oxlint 0e/29w, vitest 155 files / 1822 + test:tz LA+Tokyo, check:mocks/payload/design/build/perf OK, pgTAP 15/269 (M1-M9 applied), density 101 ×2, E2E set 134p/0f/6s, full tests/e2e CI order retries 0: 264p/0f/12s; CI green (run 36504646894, 29m46s, attempt 2; attempt 1 failed at 27m21s due to Tuesday density Lat Pull Down unseeded weight, fixed test-only in befe8db). Deployed to `v2-rewrite` 2026-09-29T01:18Z, Preview id=6723901453 SMOKE_FAIL=0, Production id=6724322094 SMOKE_FAIL=0, post-M9 smoke OK. |
| P8 | Shell, Coach, Settings + Nutrition standards sweep | **done** 2026-09-29 | `fc7b171` (PR #17). Scope: L41, H25, H39, W44, C1–C30, S1–S29, RD-7, RD-12, D-P8-1..9, production UUID catalog-tail bug fix. No migration. Shell: Header coach-dashboard link (L41, D-P8-1); BottomNav 12px AA labels fit at 320px (RD-12). Coach: C1–C30 sweep (10983ec), CoachCockpit inline template builder retired for EditTemplateSheet with assignToAthleteId (D-P8-2), ConfirmDialog for disconnect, StatusBanner errors, SegmentedTabs, skeletons, 44px/16px. Settings: S1–S29 sweep (cd89850), MyCoachCard ConfirmDialog disconnect, surfaced errors with Retry, skeletons, 16px inputs, 320 grid, 44px export. Nutrition: RD-7 deferred deletes + UndoToast for log/custom dish deletes (631a44d, 05a0f28), STD-CMP-10 skeletons, 44px hit areas without row growth (H25, H39). Zero grep gate: text-zinc-500, sub-12px, font-mono, font-black, window.confirm / alert across src non-test; check:design ratchet baseline all-zero (658cd9b). Prod incident fix: useWorkoutQueries exercises .limit(200) paged via shared fetchAllVisibleExercises + scoped lookup + inline card errors (170df36, 62ad136). Commits: 235d46f (audit docs), 955d3c1 (shell A), 631a44d (nutrition D), cd89850 (settings C), 10983ec (coach B), 658cd9b (tests/ratchet E), 05a0f28 (red team), c19ea84 (tap grid F), 170df36 (UUID fix G), 62ad136 (G2 paging), 62cd3c6 (late-load race + 320 overflow fix GFIX). Decisions D-P8-1..9. Gates (c19ea84 / 62cd3c6): Gate 1 failed (useMealEditor late-load race + CoachSettingsCard 320 overflow) -> fixed in 62cd3c6; Gate 2 @62cd3c6: tsc 0, oxlint 0e/25w, vitest 155 files / 1858 + test:tz LA+Tokyo, mocks/payload/design/build/perf OK, pgTAP 15/269, density 120 ×2, E2E set 148p/0f/6s, full tests/e2e CI order retries 0: 270p/0f/12s. |
| P8.1 | CI split, notification standard, PR mode, P8 follow-ups | **done** 2026-09-30 | `60d6f76` (PR #18). Item 0 CI split (5 jobs, max job 9m49s; PR #18 CI run `36662148207`), T0 tip CI race fix (NutritionEngine skeleton), N1 notification standardization (STD-FB-1, app-shell ToastHost, stray box eliminated, adhoc-success ratchet 0), N2 PR mode setting (users.pr_mode 'weight'|'e1rm', Epley formula, shared prComparator), F follow-ups (SetRow grid at 320, History paged reads, font-extrabold ratchet 0, backup includes schema private, M9 down lossiness documented, component LOC < 550). M10 `20260930000000_users_pr_mode` applied to production via `scripts/prod-db.sh migrate` (backup `prod-20260930T030751Z.dump`; pre/post users checksum `3687539908ad7f13a4e64fd7bbf39396` and sets checksum `354e25beece94a97878b794a6136aa10` identical; check 32, latest 20260930000000). Deployed frontend parity: 6951924 full E2E CI order retries 0 vs local M10 DB 270p/0f/12s. Gates @99bf0f2: GATE_STAGES_FAILED=none (vitest 160/1917, pgTAP 16/286, E2E CI order 282p/0f/12s retries 0, density 121x2); CI fixes: stale undo closure (9ad322b), weekday-dependent catalog-tail spec (99bf0f2), mobile-viewport WebKit dev-server race (60d6f76). Deployed: Preview id=`6750406493`, Production id=`6750556265`. |

Redesign status: **P0-P8.1 shipped** (60d6f76, PR #18).

---

## 2. Decision log
Newest first. Decisions dated 2026-09-26 in the audit reports are final and are not re-decided here. They are recorded so this file stands alone.

### 2.00 Nutrition deviations (user, 2026-09-26 21:34Z)
| ID | Decision | Reasoning |
|---|---|---|
| RD-21 (D46) | **Whole-meal "Scale" chip replaces the D44 ×0.5/×1/×1.5/×2 bar** and is added to the staged card: a "Scale" chip next to "+ Add" turns into an inline "× [1]" numpad box (STD-CMP-5 input rules; Escape cancels without closing the sheet). Relative to the meal as staged/opened, applied as a ratio so item edits survive; the factor is never persisted. Below 390px the multi-item header label shortens to "Items (n)". **STD-DAT-3 exception:** in the edit-nutrition modal the unit is a 12px caption under each box instead of inside the label (the label keeps it as sr-only text). Shipped on `v2-rewrite` (Nutrition decision log D46). | Food-prep portions (÷5) could not be expressed by the bar; the bar also cost a row, had no active state and discarded item edits. The caption keeps all five macro boxes aligned. Phase 8 (Nutrition sweep) should treat both as the standard, not as gaps. |

### 2.0 Open-question answers (user, 2026-09-26 19:59Z)
| ID | Decision | Reasoning |
|---|---|---|
| RD-14 (OQ-1) | **The test time zone is set in npm scripts only** (e.g. `TZ=America/Los_Angeles vitest run …`). `vitest.config.ts` and `playwright.config.ts` stay untouched. | Keeps the standing "no config edits" rule; same coverage; trivially reversible. |
| RD-15 (OQ-2) | **Duplicate workouts on one day: stop and report first.** Before W41's unique `(user_id, workout_date)` lands, P2 runs a read-only audit and reports the count of duplicate days (with examples) to the user. Merging (sets moved to the oldest row) happens **only after explicit user approval**; the migration does not auto-merge. | Merging rewrites real history; the count is likely 0, so asking is cheap. |
| RD-16 (OQ-3) | **Existing warm-up/drop sets stay hidden** (not converted to working). P2 reports how many exist per user. | Converting could inflate PRs and volume with sets never meant to count; hiding is reversible and deletes nothing. |
| RD-17 (OQ-4) | **Keep-alive (D5) applies to History only.** Other tabs are evaluated in the P8 audit. | History is the long scroll where losing your place hurts; limits stale-data risk elsewhere (e.g. an active workout). |
| RD-18 (OQ-5) | **BottomNav labels: measure first.** If five 12px sentence-case labels fit at 320px, use them. If not, **icon-only below 360px** (labels stay as `aria-label`), labels at 12px everywhere else. No 11px exemption. | Keeps the 12px floor with no exceptions; icon-only on very small phones is a common pattern. |
| RD-19 (OQ-6) | **No admin screen for default exercises.** Defaults change only through database migrations (like M8). | Defaults rarely change; an admin surface is a separate feature to build and secure. Can be revisited later. |
| RD-20 (K9 confirm) | **User confirmed the RD-9 reading:** warm-up and drop sets are hidden on every screen, excluded from PR, Last, set counts and volume; the set-type picker is removed from the set editor; no rows are deleted. | Confirmed 2026-09-26 19:59Z. |

### 2.1 Redesign plan decisions (user, 2026-09-26 19:44Z)
| ID | Decision | Reasoning |
|---|---|---|
| RD-1 (K1) | **kg/lb: canonical lb storage.** `sets.weight` keeps lb at full precision (`numeric`, no scale). Add `users.weight_unit ('lb','kg') default 'lb'` (there is no `profiles` table). One `src/utils/weight.ts` (`formatWeight`, `formatSet`, `parseWeightInput`) converts only at display and input. Display rounds to 0.5 of the display unit. A coach sees their own unit. | All existing data is lb (History D3 addendum). `numeric` loses nothing on 100 kg ↔ 220.462 lb. RPCs, PR, volume and trends stay unit-free. One conversion point. Supersedes Workout §1a's per-set `sets.weight_unit` proposal. |
| RD-2 (K2, 6b.4-1) | **The Workout phases own** `EditSetModal` (rebuilt as `src/components/sets/EditSetSheet.tsx` in the D44 style), `ghostSets.ts`, `useWorkoutQueries.ts`, `useWorkoutMutations.ts`, exercises RLS v2 and the shared primitives. **Primitives live in `src/components/common/`.** History's H1, H2, H10, H17 and H36 (RPE) are folded into those phases. | Workout goes first; one owner per shared file; `common/` already holds StatusBanner, AccessibleModal and OverflowMenu. |
| RD-3 (K3) | **The exercise catalog migration** (`get_exercise_catalog` final signature, `body_parts text[]`, `equipment`, empty `exercise_hides` + RLS, `get_routine_catalog`) **lands in P4** (the Workout picker phase), the first phase that needs it. Library later adds the Hide UI, the duplicate-name trigger and the default seed. | The RPC signature is set once; the picker isn't rewritten twice. |
| RD-4 (K4) | **One SQL definition of PR**, shared by `get_exercise_benchmarks` (Workout: PR + Last per date) and `get_exercise_stats` v2 (History: working sets only, ties to more reps then earliest date, returns `pr_date`, no 200 cap, names joined by id). Both ship in P2. | The two tabs can't disagree (Workout §8.3.2, H10). |
| RD-5 (K5) | **A workout's date is a civil date.** Add `workouts.workout_date date`, backfilled after a read-only audit (midnight-UTC rows take their UTC date; rows with a time are converted with `users.timezone`). Every tab groups, filters and displays by it. H4 becomes "show the civil date, drop the raw ISO", not a time-zone shift. | `workouts.date` is `timestamptz default now()`; some rows have times (History H4 example) while the app writes midnight UTC (W40). Converting midnight-UTC civil dates by time zone shows the previous day in the Americas. Mirrors Nutrition's `logged_date` (D29, STD-DAT-4). |
| RD-6 (K6) | **One shared `ExercisePicker`** (search, Recent/Frequent, body-part + equipment chips, multi-select, inline create), built in P4. The Library template builder adopts it in P7b; `ExercisePickerSheet` and `CoachTemplateBuilder` are retired. | Three pickers exist today (Workout §8.1). |
| RD-7 (K7, S4) | **Undo standard:** promote `QuickLogToast` to `common/UndoToast` (Nutrition keeps a thin wrapper). **6s**, paused on focus or hover. **Deletes are deferred** until the toast expires (flushed on navigation or `pagehide`); inserts and updates are undone with a reversing write. **ConfirmDialog only for bulk or other-people-affecting actions.** Nutrition's `window.confirm` deletes switch to undo. | One component, one behaviour. Resolves Workout P "new UndoToast" vs History D6 "promote QuickLogToast". |
| RD-8 (K8) | **Past workouts are edited in the Workout tab.** History session ⋯ → "Edit in Workout" (`/workout?date=YYYY-MM-DD`). Single-set fixes stay in History through the shared EditSetSheet. "Delete session" uses ConfirmDialog. No separate session editor in History. | Your Q5 rule: the Workout tab for a date = history for that date (STD-NAV-3). |
| RD-9 (K9) | **Warm-up and drop sets are hidden on every tab** and excluded from PR, Last, completion counts and volume. You said: "I don't even have a way to register Warm-up & Dropset now in Workout tab, just hide them all together". EditSetSheet has no set-type picker. Existing non-working rows are kept in the DB, not deleted. | There's no way to log them; hiding everywhere keeps the numbers consistent. |
| RD-10 (6b.4-3) | **Coaches cannot edit an athlete's custom exercises** (read-only). RLS v2 omits the `is_coach_of` UPDATE branch. | Matches Library Q3 (L24). |
| RD-11 (6b.4-4) | **Routines get a sibling `get_routine_catalog`** (same scope, hidden and cursor conventions), created in P4 and first used by the Workout routine picker (L33). | Ranking, ownership and assignment differ from exercises. |
| RD-12 (S1–S3) | **Standards where Nutrition and the audits disagreed:** hit area ≥44px everywhere (visual 32–40px allowed with invisible expansion); **12px text floor** wins over the audits' `text-3xs/2xs` 10/11px tokens (BottomNav labels go to 12px sentence case if 5 labels fit at 320px, otherwise icon-only below 360px per RD-18); **AA contrast** (`zinc-400`+) app-wide; Nutrition is brought into line in P8. | STD-INT-9, STD-TYP-1, STD-COL-2. |
| RD-13 (Q-seq) | **Library P0/P1 data-safety fixes L1, L2, L3, L12 go into P1** with exercises RLS v2. Also included, by the conductor because they're the same files and S effort: **L5, L6, L7**. | One-tap global data loss; they share the RLS migration (X3). |

### 2.2 Decisions made while planning (conductor, 2026-09-26; low risk, reversible)
| ID | Decision | Reasoning |
|---|---|---|
| RP-1 | The query-key registry `src/lib/queryKeys.ts` and invalidation helpers (`invalidateWorkoutDerived`, `invalidateExerciseDomain`) are created **complete** in P0, including keys for later phases. Later phases only import them; a new key requires a decision-log entry. | One owner per shared file (T4, C8). |
| RP-2 | Append-only shared test files (`tests/visual-density.test.ts`, `tests/e2e/mobile-viewport.spec.ts`) are the one exception to single ownership. Each phase **appends** its own named block and never edits another phase's block. | Every phase must add guards; blocks don't conflict when appended. |
| RP-3 | `body_part` → `body_parts text[]` is done with a compatibility trigger in P4 (writes to `body_part` keep `body_parts` in sync). The old column is dropped in P7b once every writer has moved. | Every phase ends with a consistent schema and no half-finished migration. |
| RP-4 | History phases come before Library (P5 before P7). | History has open P0s (H8, H9, H11). Library's P0s are fixed in P1. P5 and P7a have disjoint files and could run in parallel if needed. |
| RP-5 | Coach and Settings were not audited. P8 starts with a read-only audit of both before any change. | No evidence yet. |
| RP-6 | H40, H52 and H53 are obsolete. D44 removed EditMealModal and made the timeline row read-only. | Verified at `da67a71` (`EditMealModal.tsx` deleted; no revert UI in `MealLogRow.tsx`). |
| D-P3a-1 | **Exercise card title 16px/800 -> 14px/700** per STD-TYP. Card header title uses 14px semibold (font-bold/700) instead of 16px extra-bold (font-extrabold/800). | STD-TYP-1/2: card titles 14px max; 16px reserved for section headers. |
| D-P3a-2 | **CI job timeout-minutes 15 -> 25.** | P2 run was already 14m41s; full suite with 3 projects on one DB runs ~17m. |
| D-P3b-1 | **Rest timer display and RestDayView title 18-20px -> 14px (text-sm/bold)** per STD-TYP-1. `GlobalRestTimerPill` timer digits text-xl (20px) -> text-sm (14px font-bold tabular-nums); `RestDayView` title text-lg (18px) -> text-sm (14px font-bold). | STD-TYP-1 12/14/16 type scale. Fixed at source rather than filtered out in visual density checks. |
| D-P4-1 | **Compatibility trigger: writes specifying only body_parts set body_part = array_to_string(body_parts, ', ')**. | Ensures reverse compatibility for legacy readers while enabling new array-based writes (approved by user 15:47Z). |
| D-P4-2 | **get_exercise_catalog excludes archived rows unless p_scope='archived'**. | Archived exercises are hidden from active pickers and coach views unless explicitly browsing the archive (approved by user 15:47Z). |
| D-P4-3 | **Catalog pagination default limit 50 / max 200 keyset; exercise_hides apply to master exercises only**. | Custom exercises are archived rather than hidden; default limit 50 caps round-trip size while 200 allows deep search (approved by user 15:47Z). |
| D-P4-4 | **/workout routine list projects get_routine_catalog to pre-P4 columns via .rpc().select()**. | exercises jsonb per template blew the 51,200 B payload budget (62,323 B -> 21,298 B); exercise lists are fetched on-demand in template detail (conductor decision). |
| D-P5a-1 | **New RPC name `get_history_sessions_v2` (not function overload)**. v1 untouched. | PostgREST returns HTTP 300 Multiple Choices on ambiguous overloaded function names. |
| D-P5a-2 | **No index or table schema changes for M5 keyset pagination**. | Existing `UNIQUE(user_id, workout_date)` from M2 already serves the `(workout_date, id)` keyset order. |
| D-P5a-3 | **`get_history_sessions_v2` `set_count` and `volume` aggregate working sets only** per RD-9 and RD-20. v1 unchanged. | Non-working sets (warm-up/drop) are hidden and excluded from all stats app-wide. |
| D-P5a-4 | **`get_exercise_history` pages by session (default `p_limit` sessions, cap 50)**. | Paging by session keeps multi-set session records intact rather than truncating sets mid-workout. |
| D-P5a-5 | **Coach access via existing RLS + `SECURITY INVOKER` (read yes, write no)**. No new permissions. | Maintains principle of least privilege; coaches can inspect history without mutation privileges. |
| D-P5a-6 | **History lazily mounted on first `/history` visit, then preserved in `<Activity>`**; unmounted on sign-out / user switch, no `sessionStorage`. | Complies with RD-17 and D5 keep-alive contract without polluting local storage or risking cross-user leak. |
| D-P5a-7 | **Session cards keep classes `rounded-3xl p-5 shadow-2xl space-y-3`**. | Preserves DOM compatibility and selector stability for existing test suites (e.g. `p4-catalog`). |
| D-P5a-8 | **Overscan 5 (H30): virtualization DOM caps re-measured (661 -> cap 728; fallback 204 -> cap 225)**. | Accommodates 5-row overscan headroom in window virtualizer while still enforcing hard DOM node limits. |
| D-P5b-1 | **No migration (uses M5)**. H8 uses M5 `get_exercise_history` via `fetchExerciseHistoryPage` (`useWorkoutHistory.ts`); H47 uses `pr_date` from M3 `get_exercise_stats` v2; H11 uses `nutrition_logs.logged_date` + existing index. | Existing schema and RPCs already cover all required fields and performance characteristics. |
| D-P5b-2 | **H11 nutrition paging is a 14-civil-day window infinite query** (`logged_date` in `[cursorEnd-13, cursorEnd]`, stop when probe `select logged_date order desc limit 1 lt cursor` returns empty). Query key prefix `['nutrition_logs', uid]`. | Whole-day windows ensure complete daily totals without mid-day splits; preserving query key keeps nutrition-side invalidations functional. |
| D-P5b-3 | **H27 meal delete adopts RD-7 deferred delete (6 s, optimistic hide, `UndoToast`)**. No DELETE on Undo; exactly one DELETE on expiry/navigation/pagehide; cache removed only onSuccess; failure restores row + StatusBanner. | Mirrors P3a set deletion behavior; keeps existing nutrition toasts' DOM untouched. |
| D-P5b-4 | **Units untouched until P6**. Keep existing weight strings and labels. | P6 owns cross-tab unit abstraction and conversion (`users_weight_unit`). |
| D-P5b-5 | **Calendar (H29) marks days from loaded sessions + lightweight visible-month `workout_date` query** (`workouts.select('workout_date')`). Tapping day sets range 'all', loads pages until present (max 10 pages), and scrolls/focuses card. | Avoids fetching full workout payloads for off-screen months while providing accurate dot indicators across the calendar. |
| D-P5b-6 | **H43 search in By-Session filters loaded sessions client-side by session name and exercise names** in loaded set maps; shows "Showing N matches in M loaded sessions" + Clear filters. | Fast, responsive filtering without server schema changes or additional network requests. |
| D-P5b-7 | **Exercise history sheet pages 10 sessions per request (`p_limit 10`)**. | Balances payload size and initial render latency against scroll depth before "Load older". |
| D-P5b-8 | **History meal deferred delete flushes on route leave (`/history` inactive in keep-alive)**, in addition to expiry, unmount, and `pagehide`. | Because History stays mounted via `<Activity>`, navigating away must flush pending mutations so other tabs see fresh data. |
| D-P5b-9 | **Calendar highlight clears after 2.5 s**. | Provides clear visual orientation to the target card without leaving stale focus styling permanently. |
| D-P5b-10 | **Nutrition history window uses viewed user's time zone (coach inspection) and its query key includes the time zone**. | Guarantees coach and athlete observe identical civil day boundaries, and time zone changes invalidate cache cleanly. |
| D-P6-1 | **kg display rounds to 0.1 and drops trailing .0** (acceptance '225 lb -> 102.1 kg' supersedes RD-1's 0.5 rounding for kg; lb display keeps 0.5). | Matches user acceptance test and real-world gym equipment granularity for metric plates/dumbbells. |
| D-P6-2 | **Unit comes from the VIEWER's own profile** (coach sees own unit when inspecting). | Consistent inspection UX; avoids coach confusion when reviewing athletes in different locales. |
| D-P6-3 | **sets.weight stays canonical lb at full precision** (100 kg stores 220.46226218 lb). | Eliminates cumulative round-trip precision loss; RPCs, benchmarks, and DB volume aggregations remain unit-agnostic. |
| D-P6-4 | **An untouched prefilled value keeps the original lb exactly (`resolveWeightInput`)**. | Prevents drift on unedited fields when stepping through or editing other attributes of a set. |
| D-P6-5 | **Settings writes server-first, no optimistic flip, error keeps previous unit**. | Network or RLS failure leaves the UI state matching the actual persisted profile. |
| D-P6-6 | **Export keeps sets weight in lb with unmodified header and adds `weight_unit` to the profile section**. | Preserves backward compatibility of CSV/JSON data parsers while recording user preference. |
| D-P6-7 | **The 'lbs' literal lives only in `src/utils/weight.ts` (`weightUnitLabel`)**. | Enforces a single source of truth for unit strings across all tabs and components. |
| D-P6-8 | **M6 version `20260928000000`, data-changing (default backfill) -> rule 8 audit + checksum**. | Satisfies §3a execution rules for safe production database migrations. |
| D-P8-1 | **L41: Header coach-dashboard link; no 6th BottomNav tab, no tab replacement.** When a verified coach (`profile.role==='coach'`) is in coach mode and NOT on `/coach`, Header shows a 44x44 "Coach dashboard" link (`IconButton`/`Link`, `aria-label="Coach dashboard"`) navigating to `/coach`. Role pill behaviour unchanged. | Preserves 5-tab ergonomic layout at 320px while providing direct 1-tap navigation back to coach cockpit. |
| D-P8-2 | **CoachCockpit inline template builder retired in favor of `EditTemplateSheet` with `assignToAthleteId`** (D-P7b-6 follow-up). Single `save_routine_template` RPC; `EditTemplateSheet` stays <=600 LOC (594 LOC); `coach-athlete.spec` selectors updated to match shared sheet. | Eliminates duplicate builder maintenance; satisfies single-builder architecture without inflating sheet LOC. |
| D-P8-3 | **Grep gate: zero hits in `src/` non-test for `text-zinc-500`, sub-12px (`text-[9px|10px|11px]`), `font-mono`, `font-black`, and `confirm(`. No allow-list.** Replacements: `text-zinc-500` -> `text-zinc-400` (secondary) or remove (disabled: `opacity-50` / `disabled:opacity-50`, never `disabled:text-zinc-500`); sub-12px -> `text-xs`; `font-mono` -> `tabular-nums` (codes: `tracking-wider tabular-nums`); `font-black`/`extrabold` -> `font-bold`; UPPERCASE button copy -> written case (STD-TYP-4) where touched. | Enforces design standards ratchet with zero exemptions across entire source tree. |
| D-P8-4 | **BottomNav RD-12/RD-18: 12px sentence-case labels; measured at 320px.** 5 slots x 64px accommodate 12px labels without wrapping or clipping (`scrollWidth <= clientWidth`); icon-only below 360px fallback not needed. | Satisfies 12px typography floor while retaining clear navigation labels on smallest supported screens. |
| D-P8-5 | **Nutrition deletes (`NutritionEngine:409`, `CustomDishesModal:328,412`) adopt RD-7 deferred delete (`common/useDeferredDelete` + `UndoToast`, 6s).** Zero DELETE before expiry, Undo = zero writes, exactly one on expiry/flush, failure restores row + `StatusBanner`. CoachCockpit disconnect (C1) and MyCoachCard disconnect (S1) adopt `ConfirmDialog` naming the counterpart (STD-CPY-4). Coach C2 `alert` -> `StatusBanner`. | Aligns all destructive actions with RD-7 undo / ConfirmDialog standards; zero native dialogs remain. |
| D-P8-6 | **Swallowed errors in Settings (S2, S16) surfaced via `StatusBanner` + Retry.** Query catch blocks propagate error state; query semantics unchanged otherwise. | Eliminates silent failures and gives users actionable error recovery paths. |
| D-P8-7 | **Nutrition 44px hit areas without layout growth:** H25 `MealLogRow` retry, H39 `ComponentRow` confirms, `CustomDishesModal` row buttons use hit-area expansion (`min-h-[44px] min-w-[44px]` or negative margins/padding) keeping exact row heights (94/59/76 px). | Meets touch target standards without breaking visual density layout budgets or expanding card sizes. |
| D-P8-8 | **Test ownership isolation in P8:** only package E edits `tests/visual-density.test.ts`, `tests/e2e/mobile-viewport.spec.ts`, `scripts/check-design-ratchet.js`, `scripts/design-ratchet-baseline.json`. Implementation packages add unit tests only. | Prevents test merge conflicts across parallel execution workers. |
| D-P8-9 | **User decision: workout UUID bug fix ships inside P8 (one PR/CI/deploy).** Paging via `fetchAllVisibleExercises`, template/scoped id resolution, inline card set error surfacing. | Fixes production regression immediately in active release rather than requiring an emergency standalone hotfix. |
| D-P8.1-1 | **CI split into 5 parallel jobs:** `static-unit` (lint, tsc, build, perf:budget, audit, deno, test:tz, vitest, pgTAP), `e2e-desktop-chrome` (+perf:trace/verify), `e2e-mobile-safari`, `e2e-narrow-safari`, and `density`, with timeout-minutes 20 each; each job runs its own `supabase start` + `db reset` + `seed:stress`. Union proof verified via `scripts/ci-coverage-list.sh` old vs new (`P8_1_CI_PROOF.md`). | Reduces single CI job turnaround from 31m10s to ~10m25s, well under 35m ceiling. |
| D-P8.1-2 | **Density runs on its own fresh seeded DB.** Audit verified every density test owns its data or reads only `seed.sql` (`MAP_CI` §3). New density tests must own their data (`WORKER_RULES.md`). | Decouples density from E2E suite execution; enables full parallelization. |
| D-P8.1-3 | **gate_full.sh reordered and hardened:** density runs after full CI-order E2E; script exits 1 with `GATE_STAGES_FAILED=<list>` when any stage fails; `GATE_SELFTEST_FAIL` hook added. | Fixes intermediate stage exit suppression where script printed `GATE_EXIT=0` on stage failure. |
| D-P8.1-4 | **Tip CI red fix (push runs 36617946285/36618065605):** `NutritionEngine` renders empty state before auth resolves (`NutritionEngine.tsx:162` `Boolean(targetUserId) && ...`). Fix: render skeleton while `!targetUserId` (STD-CMP-10: empty only after query success) + test waits on deterministic state. Ships first (T0). | Prevents premature unauthenticated empty flash race under CI concurrency. |
| D-P8.1-5 | **N1 root cause resolved:** `useNutritionData.ts:222` `setStatus('Saved')` / `:244` `setStatus('Meal deleted')` never cleared; `NutritionEngine.tsx:336` renders `stagedMeal && status` `StatusBanner` above `StagedMealCard`; `NutritionAiInput.tsx:241` renders same status at bottom of AI box. | Stray status box between staged meal card and favorites eliminated; verified by 4/4 repro failure on 6951924. |
| D-P8.1-6 | **STD-FB-1 One transient feedback system:** ONE app-shell toast host (`common/ToastHost` + `useToast`), visual format of current `UndoToast`; one position (offsets: 74px base above BottomNav, 128px staged bar, 148px rest-timer bar); `role=status aria-live=polite`; success/info auto-dismiss 4000ms, undo = countdown (6000ms `useDeferredDelete`); max ONE visible (new toast replaces current; replaced undo toast commits pending action exactly like expiry); optional single action. Errors needing user action stay persistent inline `StatusBanner` (tone error) next to failing element, cleared on next attempt/success. No inline success/info text anywhere else. | Standardizes disappearing notifications; eliminates ad-hoc status boxes while preserving actionable error states. |
| D-P8.1-7 | **Ratchet additions in check:design:** `adhoc-success` rule (`StatusBanner` tone success/info carrying success copy, or literal success strings rendered outside toast host) baseline 0; `font-extrabold` rule baseline 0. | Automates enforcement of feedback and typography standards at zero-tolerance baseline. |
| D-P8.1-8 | **N2 user answers (19:48Z):** Epley formula `w*(1+r/30)`; weighted sets with reps > 12 excluded from e1RM ranking; viewer's setting applies in coach views; show 'e1RM <value> <unit>' in PR surfaces in e1rm mode; storage in `public.users.pr_mode` (migration pre-approved if audits match rehearsal). | User-directed configuration for PR calculation, coach display parity, and profile persistence. |
| D-P8.1-9 | **PR comparator parity (single rule, SQL + TS identical):** Mode 'weight': weight desc, reps desc, workout_date asc, created_at asc, id asc. Mode 'e1rm': eligible desc (eligible = weight <= 0 OR reps <= 12), then (e1rm if eligible else weight) desc, weight desc, reps desc, date asc, created_at asc, id asc. Bodyweight (0 lb) -> e1rm 0 -> reps decide. Ranking in stored unit (lb); display converted via `utils/weight.ts`. Exercise with only ineligible sets falls back to weight ranking by construction. | Single ranking rule prevents discrepancies between Workout trophy chips, History stats, and SQL RPCs. |
| D-P8.1-10 | **M10 `users_pr_mode` (expand-only):** `users.pr_mode text NOT NULL DEFAULT 'weight' CHECK in ('weight','e1rm')`; `get_exercise_benchmarks` and `get_exercise_stats` v2 DROP+CREATE with trailing `p_pr_mode text DEFAULT 'weight'` (no overload left -> PostgREST unambiguous; old frontend calls = weight mode = identical output); grants/security identical to current definitions. Down file restores previous definitions + drops column. Audits `m10_users_pr_mode_{pre,post}.sql`. | Zero downtime expand-first schema migration; backward-compatible with deployed frontend callers. |
| D-P8.1-11 | **Expand-first ship order for M10:** PR CI green -> deployed frontend (6951924) E2E vs local DB with M10 (compat) -> prod backup (new script incl. schema private) -> rehearsal on that dump (F4 proof: restore of the new dump has 1 benign error, was 29; nutrition tables live in public, schema private holds the 6 functions their RLS policies call, which is why #17 restores failed) -> pre audit -> migrate -> post audit identical -> merge + ff-push -> deploy smoke. | Enforces strict production safety protocol (§3a) with verified backup and rollback readiness. |
| D-P8.1-12 | **M9 down migration lossiness documented in rollback file header:** `supabase/rollbacks/20260929020000_drop_body_part.down.sql` header documents that rolling back M9 repopulates `body_part` from `body_parts[1]`, losing original unnormalized free-text formatting recoverable only from `prod-20260929T012001Z.dump`. | Applied migration files are immutable; documents data loss boundary in tracked rollback script. |
| D-P8.1-13 | **Nutrition session exclusions lifted for N1 only:** user confirmed parallel nutrition session ended (19:48Z). Other packages keep them. | Permits notification standardization across nutrition components while maintaining isolation elsewhere. |
| D-P7b-1 | **`routine_templates.updated_at` + `save_routine_template` optimistic lock bundled into M7**. Column `NOT NULL DEFAULT now()`, BEFORE UPDATE trigger, `save_routine_template` gains `p_expected_updated_at timestamptz DEFAULT NULL`. Old signature dropped in same migration so PostgREST named-arg calls from deployed P7a client still resolve to the single function. Precondition mismatch raises PT409 `stale_template` (surfaced as StatusBanner + reload, no overwrite); unseeable exercise id raises 42501. | Enforces L43 stale-edit protection without breaking deployed frontend callers; bundled into M7 to avoid an extra migration. |
| D-P7b-2 | **Name guard trigger + partial unique index in M7**. `normalize_exercise_name(text)` lowercases and trims internal whitespace. Partial unique index on `(coalesce(user_id, '00000000-0000-0000-0000-000000000000'), normalize_exercise_name(name), coalesce(equipment, '')) WHERE NOT is_archived`. Trigger `trg_exercise_name_guard` raises 23505 `duplicate_exercise_name` with DETAIL containing the existing id when normalized name matches with equal equipment or NULL equipment on either side (against own rows, and for custom against master rows). Client maps 23505/409 to `DuplicateExerciseError` with "View" CTA pointing to the existing row. | Prevents duplicate exercises across master and custom scopes (L35); satisfies acceptance with coded error and exact existing row resolution. |
| D-P7b-3 | **M8 default catalog seed from curated CSV (`supabase/catalog/default_exercises.csv`) with deterministic UUIDs and NULL-equipment backfill tracking**. Seed rows generated via `scripts/gen-catalog-seed.mjs` (asserted equal in vitest); deterministic ids `md5('m8:'||normalized_name)::uuid`; skips names matching any existing row. Master rows with `equipment IS NULL` updated to curated equipment; updated ids recorded in `catalog_seed_backfill` table for clean rollback. | Seeds 185 new master exercises (208 total master) without collisions; backfills 14 legacy NULL equipment rows with rollback audit trail (D-U2, D-U3). |
| D-P7b-4 | **M9 contract phase: drop `body_part` column, sync trigger, and helpers after zero-reader verification**. Recreates `get_exercise_catalog` and dependent views/functions without `body_part`. Rollback re-adds column and repopulates from `body_parts[1]`. | Completes expand-and-contract migration started in M4 once all clients and queries moved to `body_parts` (D-U4, RP-3). |
| D-P7b-5 | **Data export keeps legacy `body_part` header/field, derived from `body_parts.join(', ')`**. | Preserves backward compatibility of user data exports (CSV/JSON parsers) while adopting `body_parts` internally. |
| D-P7b-6 | **CoachCockpit keeps inline template creation form (single RPC `save_routine_template` with `p_assigned_to`); full inline builder removal deferred to P8**. Template editing uses shared `EditTemplateSheet`; `CoachTemplateBuilder` retired. | Preserves `coach-athlete.spec` selector compatibility while eliminating orphan templates and adopting single-RPC architecture (L9); defers UI layout restructuring to P8 Coach sweep. |
| D-P7a-1 | **CI job timeout-minutes 25 -> 35** (`.github/workflows/ci.yml`). | Job runs ~21–25 min; flaky WebKit retries pushed 856f4ae push run over 25 min (pre-approved). |
| D-P7a-2 | **RD-7 applies to both exercise archive and template delete in Library**: optimistic hide + `UndoToast` 6s, zero writes until expiry (flushed on nav/pagehide via `useDeferredDelete`), Undo = zero writes, failure restores row + StatusBanner. No ConfirmDialog for single-row own deletes; copy "Archive exercise" (STD-CPY-4). | Consistent RD-7 deletion model across app; avoids accidental destructive writes while keeping friction low. |
| D-P7a-3 | **Coach hide of a default = ConfirmDialog "Hide '<name>' for you and your N athlete(s)? It stays in History."**; athlete/self hide of a default = immediate write + `UndoToast` whose Undo deletes from `exercise_hides`. | Default hides affect multiple athletes when done by coach; athlete hide is personal and reversible via reversing write (RD-7). |
| D-P7a-4 | **Scope chips: All · Defaults · Mine · "{Athlete}'s" (coach) / "From coach" (athlete) + Archived + Hidden chips**. Single-select chip group = `role=radiogroup` + `radio` (L15). Owner pills: Default / You / <athlete first name> / From coach. | Clear ownership separation for shared vs custom exercises; accessible radiogroup semantics. |
| D-P7a-5 | **L11 "Archived" pill lives in the Library template card preview (`TemplateListTab`)**, not in `TemplateExerciseItem.tsx` (P7b-owned). Archive/restore call `invalidateExerciseDomain` (templates included). | Clean phase boundary with P7b while satisfying invalidation and visibility contract. |
| D-P7a-6 | **Keep `routine_templates` select query shape** (rfix-06 asserts it, payload budget 51,200 B untouched) and existing `data-testid` attributes. | Prevents payload inflation regressions and maintains backward compatibility for existing test selectors. |

### 2.3 Earlier decisions carried in (user, 2026-09-26; final)
- **Workout §1a:**
  - Q1: PR = heaviest working weight; ties go to more reps, then earliest date.
  - Q2: Last = the exact sets, no age cap.
  - Q3: warm-ups hidden (now everywhere, RD-9).
  - Q4: Finish review sheet.
  - Q5: the Workout tab for a date = history for that date (remove/unlog rules).
  - Q6: undo toast for set and exercise removal; ConfirmDialog only for Clear and Reload.
  - Q7: past days allowed.
  - Q8: kg/lb preference (storage per RD-1).
  - Q9: no equipment filter in the Workout picker. Superseded by Library Q6/L48 (equipment added); the picker shows equipment chips.
  - W50: RLS policy change approved.
- **Library §0:**
  - Q1: defaults read-only; hide per coach and their athletes (L47).
  - Q2: archive only, never hard-delete; Restore is P1.
  - Q3: the coach sees both scopes.
  - Q4: retroactive rename, so id-based resolution is mandatory.
  - Q5: block duplicate names.
  - Q6: equipment + a real default catalog (L48).
  - Q7: same exercise twice in a routine is deferred (L31).
  - Master routines follow the default-exercise rule.
  - Multi-coach hide rule accepted.
- **History §7:**
  - D1: PR = heaviest weight, ties by reps.
  - D2: hide the date chips in By-Exercise; the range moves into the exercise sheet.
  - D3: kg/lb in Settings; lb is canonical.
  - D4: unlogged exercises at the bottom, collapsed.
  - D5: keep History mounted (`<Activity>`), with 3 conditions.
  - D6: undo snackbar for destructive actions (6s).

---

## 3. Sequencing rules
1. Phases run in order: P0 → P1 → P2 → P3a → P3b → P4 → P5a → P5b → P6 → P7a → P7b → P8.
   - Optional parallel lane: P7a may run alongside P5a/P5b (disjoint files) once P4 is done.
2. **Each shared file and each migration has exactly one owning phase** (§5). Tab-local files may be touched by several phases *in sequence*, never at the same time.
3. **End-of-phase gate** (every phase):
   - `tsc -b` 0; oxlint 0 errors (warnings ≤ baseline); `vitest` green; `npm run build` 0; `npm run perf:budget` 0; density suite green ×2; E2E trio green.
   - `npm run test:db` green when the phase has a migration.
   - A smoke E2E per tab (Workout, Nutrition, History, Library, Coach, Settings) proves existing features still work.
   - Every migration ships with pgTAP tests + a rollback file + a pre-migration read-only audit where listed. No migration or UI change is left half-done (compat triggers count as done, RP-3).
   - The new tests fail on the phase's base commit. No skip/only/fixme/waitForTimeout/retries/loosened thresholds.
   - This file is updated: phase row, item rows, decision log.
4. **Deploy flow per phase:** branch → red team → gates → PR → fast-forward `v2-rewrite` (Vercel production) → D30 smoke.

## 3a. Execution rules (binding for every phase; added 2026-09-26)

### Ship flow for a phase with a migration
1. Worker(s) → red team → conductor test-diff audit → full gate (§3 item 3) on a worktree rebased on the current `origin/v2-rewrite`.
2. The migration is **expand-first**: the currently deployed frontend must keep working against the migrated schema.
3. Every migration has a down file at `supabase/rollbacks/<version>_<name>.down.sql`. Rehearse both on the local DB with the same helper: `PROD_DB_TARGET=local scripts/prod-db.sh rollback <down> <version>`, then `PROD_DB_TARGET=local scripts/prod-db.sh migrate <up>`, then `npm run test:db`.
4. Open the PR and wait for CI to pass.
5. `scripts/prod-db.sh audit <pre-migration audit>`. Any non-zero count that the plan says must be 0 means stop.
6. `scripts/prod-db.sh migrate supabase/migrations/<file>.sql`. This makes a verified backup, applies the migration and records it in `supabase_migrations.schema_migrations`, all in one transaction. On any failure: stop, do not push.
7. Fast-forward `origin/v2-rewrite`, check the Vercel preview and production smoke, then re-run the audit and `scripts/prod-db.sh check`.

### Production database: hard rules
The password lives in `~/.config/fitness-supabase/db_password` (mode 600). Backups go to `~/fitness-backups/` (mode 700).
1. **Conductor only.** Worker, scout and red-team subagents never read the password file, never run `scripts/prod-db.sh` against production, and never connect to the production DB. Their prompts must say so. They use the local DB (`127.0.0.1:58822`) only.
2. **Only through `scripts/prod-db.sh`.** No ad-hoc `psql`/`pg_dump` against production. The password is read inline and never printed, logged, pasted into a file or put in a prompt.
3. **No write without a verified backup from the same command.** `migrate` and `rollback` back up first and refuse to continue unless the backup's row counts equal the live counts (`BACKUP_VERIFIED`).
4. **Reads are read-only transactions** (`check`, `audit`). The helper wraps them in `BEGIN READ ONLY`.
5. **Writes are committed migration files only.** A write must be a tracked, unmodified file under `supabase/migrations/`, with no explicit BEGIN/COMMIT, not already recorded. It is applied in one transaction. There are no manual data fixes, no `db reset` and no deletes outside a reviewed migration.
6. **Any error means stop and report.** No retries against production, and no "fix-forward" edits on the live DB. Rollback happens only through the committed down file, via `scripts/prod-db.sh rollback`.
7. One production-DB operation runs at a time across all sessions (the helper holds `/tmp/fitness_prod_db.flock`).
8. **Data-changing migrations** (backfills, merges, seeds): before the local rehearsal, run a read-only production-shape audit that counts the rows each branch of the transform will hit, and compare a before/after checksum of the affected values in production (P2: all 32 workouts were midnight UTC, and a naive per-zone backfill would have moved every one of them a day).

### Anti-stall rules (P0 lost about 1.5 h to a stale lock)
1. **Browser lock = `scripts/with-browser-lock.sh <cmd>`** (flock on `/tmp/fitness_browser.flock`). The kernel releases it if the holder dies, so it can't go stale. It waits at most 30 min, then exits 75 and names the holder. The old `mkdir /tmp/nutrition_browser.lock` scheme is retired, and nobody creates it any more.
2. **Every long command gets a `timeout`**: browser/E2E 900 s, vitest 600 s, build 300 s. Exit 124 or 75 is reported as BLOCKED with the log tail, never waited on silently.
3. **Conductor liveness check:** while any subagent or background gate is running, the conductor keeps a 20-minute `schedule` timer (TimerCondition `any`). When it fires, check each running subagent's transcript modification time. No new step for 15 min means inspect its last tool call and background task (hung process? lock holder via `fuser`?), then unblock it, or kill it and re-dispatch with the finding.
4. **Worker wall-clock budget:** 90 min per dispatch. At the limit the worker reports `DONE_WITH_CONCERNS` or `BLOCKED` with what's left instead of continuing.
5. **2-strike circuit breaker:** the same failure twice means stop, log it in the conversation's `DEAD_ENDS.md`, and re-scope.

---

## 4. Phases

### P0: Foundations and test guardrails (no visible change)
- **Scope:**
  - H28 (the mock honours `.limit/.range`; fixtures fixed, never weakened)
  - H19 (TZ matrix via npm scripts `TZ=America/Los_Angeles` / `Asia/Tokyo`)
  - H13 (behaviour-test scaffolding)
  - W38 (density npm script + CI wiring)
  - L37 (limit-aware mock part)
  - plus the refactors needed by P1/P2 with re-exports (behaviour-neutral):
    - query-key registry and invalidation helpers (RP-1)
    - `isValidUUID` → `src/utils/uuid.ts`
    - `DEFAULT_EXERCISES_LIST` → `src/utils/exerciseCatalog.ts`
    - date helpers out of `ghostSets.ts` into `src/utils/date.ts`, re-exported from `ghostSets` for one release
- **Tabs touched:** none visibly (tests + utils).
- **Owns:**
  - `src/test/supabaseBuilderMock.ts`
  - `src/lib/queryKeys.ts` (new)
  - `src/lib/invalidate.ts` (new)
  - `src/utils/uuid.ts` (new)
  - `src/utils/exerciseCatalog.ts` (new)
  - `package.json` (scripts only)
  - `playwright.density.config.ts`
- **Migrations:** none.
- **Depends on:** nothing.
- **Acceptance:**
  - The full suite is green with the limit-aware mock; a seeded >200-row test proves the cap is observable.
  - The TZ scripts run the date suites in 2 zones.
  - Old import paths still compile (re-exports).
  - No DOM change: the density suite and E2E are unchanged.
  - The key registry has unit tests for every key and invalidation rule.

### P1: Safety hotfixes + exercises RLS v2
- **Scope:** W50 (policy), L1, L2, L3, L5, L6, L7, L12.
- **Tabs touched:** Library (ExercisesView, EditTemplateModal: minimal), Coach (reader verification only).
- **Owns:**
  - migration **M1 `exercises_rls_v2`**:
    - SELECT = master ∪ own ∪ `is_coach_of` ∪ `is_athlete_of` (drops `is_coach()`)
    - INSERT = own non-master
    - UPDATE = own non-master (no coach edit, RD-10); masters read-only for every client
    - no DELETE for `authenticated`
    - `template_exercises.exercise_id` FK `RESTRICT`
    - `CHECK (length(trim(name)) > 0)`
    - `save_routine_template` keeps `is_master` via `COALESCE`
  - rollback file
  - `supabase/tests/exercises_rls.test.sql`
  - new `supabase/tests/routine_template_rpc.test.sql`
- **Pre-migration read-only audit:**
  - W50 (a) sets that reference unlinked non-master exercises
  - W50 (b) templates that point at another coach's exercise
  - exercises with blank names (would violate the CHECK)
  - all must be 0 or resolved first
  - query: `supabase/audits/redesign_prechecks.sql` (rows 7–11). Production result 2026-09-26: **all 0**. Re-run 2026-09-27 00:49Z right before `migrate`: all 0; after: all 0.
- **Depends on:** P0.
- **Acceptance:**
  - Masters show no Edit/Trash.
  - A PostgREST update/delete on a master by a coach affects 0 rows, and the client reports the error.
  - A failed archive never sends a DELETE (L3).
  - A 0-row update surfaces an error.
  - Editing a master routine keeps `is_master=true` (L2).
  - A template save RPC error sends no fallback table writes (L5).
  - Create/delete-template errors show StatusBanner and keep input (L6).
  - A coach with 0 athletes creates a personal row (L7).
  - Whitespace names are blocked client- and server-side (L12).
  - pgTAP covers unlinked/linked/ended coach, athlete→coach, masters visible to all.
  - All 6 `from('exercises')` readers are re-verified.

### P2: Workout data layer and cross-tab data contracts
- **Scope:**
  - Workout: W1, W2, W4, W5, W6, W7 (util + ghostSets), W11, W16 (picker scoped to master/own/linked + `is_archived=false`), W19 (next `set_index`), W20, W24, W31, W35, W37 (pgTAP + ghostSets tests), W39, W40, W41, W42, W46, W50 (picker scoping)
  - History: H2, H4, H10, H15, H16, H47 (RPC field)
  - Library: L11 (no archived adds), L26, L39
- **Tabs touched:** Workout (data), History (PR source, civil date display, hidden set types), Coach timeline (civil-date grouping), Library (rename flow no longer rewrites session names).
- **Owns:**
  - migration **M2 `workouts_civil_date`** (RD-5):
    - `workout_date date not null`, backfill, trigger for legacy writers
    - unique `(user_id, workout_date)` (W41), after a read-only duplicate-day audit; counts reported to the user and any merge only with explicit approval (RD-15)
    - `get_ghost_sets` / `get_history_sessions` return `workout_date` (additive)
  - migration **M3 `exercise_pr_benchmarks`** (RD-4):
    - internal PR function (working sets only, RD-9)
    - `get_exercise_benchmarks(p_user_id, p_date, p_exercise_ids uuid[])`: PR + Last, no age cap, keyed by `exercise_id`
    - `get_exercise_stats` v2: no LIMIT 200, `pr_date`, names joined
  - `useWorkoutQueries.ts`, `useWorkoutMutations.ts` (writers resolve by id; `onSuccess` draft clearing; optimistic insert + rollback), new `src/lib/sets.ts` (all set writers)
  - `src/utils/ghostSets.ts` (`mergeBenchmarks`)
  - `src/utils/workoutSessionStore.ts` (id-keyed; `renameExercise` kept as a shim)
  - **`src/utils/weight.ts`** (complete API incl. kg math; UI passes `'lb'` until P6)
  - `src/utils/date.ts` (civil-date formatter)
  - Workout-local: `useWorkoutSession.ts` (W5, W24, W39, W46)
  - History-local: `WorkoutExerciseHistory.tsx` (PR source), `WorkoutSessionHistory.tsx` (date text), `useHistoryData.ts` (select `set_type` and filter)
  - `EditExerciseModal.tsx` (L26/L39 call sites)
  - `CoachAthleteTimeline.tsx` (grouping)
- **Depends on:** P1.
- **Acceptance:**
  - Workout §5 W1/W2/W4/W5/W6 acceptance verbatim (seeded 3-session PR test; date change refetches exactly once; rejected insert keeps drafts; typed weight keeps visible reps; warm-up 225×1 ignored).
  - History H10 acceptance: both tabs show PR 225×3 → 230×1 without reload.
  - H4 acceptance adapted to RD-5: civil date, no ISO text, same date for coach and athlete.
  - H2 cross-tab invalidation test.
  - W41: two concurrent `getOrCreateWorkout` calls yield one row.
  - Library rename then log a set: no UUID error (L39).
  - pgTAP: benchmarks (>90-day gap, same-day double session, custom vs master same name), civil-date backfill, unique day.

### P3a: Shared primitives, exercise card, set rows, EditSetSheet
- **Scope:**
  - Workout: W3, W7 (render sites), W13, W15, W17, W19 (label), W26, W28 (RPE), W32, W33 (card + rows), W36 (card comparator, stable handlers), W37 (component tests, profiler), W38 (Workout density + axe), W44 (ConfirmDialog; no `window.confirm` in EditSet), W47, W48
  - History: H1, H17, H36 (RPE)
  - Library: L40 (Stepper primitive), L42 (primitives)
  - Standards: STD-CMP-1..10, STD-TYP-1..4, STD-INT-2/3/9
- **Tabs touched:** Workout, History (switches to EditSetSheet), Nutrition (QuickLogToast becomes a wrapper; DOM byte-identical).
- **Owns:**
  - new `src/components/common/{Button,IconButton,Chip,Tag,Stepper,Card,Sheet,ConfirmDialog,Skeleton}.tsx`
  - `common/UndoToast.tsx` (promoted from `nutrition/QuickLogToast.tsx`)
  - `common/useDeferredDelete.ts`
  - new `src/components/sets/EditSetSheet.tsx` (replaces `workout/EditSetModal.tsx`; History mount updated; `onSaved`/`onDeleted` split from `onClose`)
  - `ExerciseCard.tsx`, `SetRow.tsx` (+ new tests)
  - lint/grep gate for `window.confirm` and sub-12px/mono/black (ratchet)
- **Depends on:** P2.
- **Acceptance:**
  - Workout §6 layout acceptance adapted to STD-INT-9: every card control has a hit area ≥44 (elementFromPoint at ±22px), chip row never shares a line with the control row, no overflow at 320/375/414/1280.
  - No single tap on a logged row sends a DELETE; delete in the sheet → UndoToast 6s → exactly one DELETE on expiry, none on Undo (W3, H17).
  - History H1 acceptance (Esc keeps 6 rows + focus returns; save shows 105 with no "No sets recorded" flash).
  - The D43 type walker covers Workout.
  - The Nutrition toast DOM is byte-identical (outerHTML diff).
  - Axe clean on card, row, sheet.

### P3b: Workout session flows, header, rest day, routine picker
- **Scope:**
  - Workout: W8, W9, W10, W18, W21, W23, W25, W28 (header), W29, W30, W33 (header/toolbar), W34, W36 (engine handlers), W38 (E2E blank/finish/edit/rest-day), W44 (`useWorkoutSession` remove/clear confirms → undo or ConfirmDialog)
  - URL entry contracts `/workout?date=` and `?routine=` (for RD-8, L25)
  - STD-TYP applied to `GlobalRestTimerPill`
- **Tabs touched:** Workout; the shell timer pill (all tabs).
- **Owns:** `WorkoutEngine.tsx`, `useWorkoutSession.ts` (remove/clear/reload/finish), `workoutEngineHelpers.ts`, `WorkoutHeader.tsx`, `RestDayView.tsx`, `RoutinePickerModal.tsx` (W10), **`common/GlobalRestTimerPill.tsx`**, new `FinishReviewSheet.tsx`.
- **Depends on:** P3a.
- **Acceptance:**
  - Remove-exercise rules per §1a Q5 (0 logged → undo; logged → sheet with "Remove & delete N logged sets" / "Keep sets, collapse card"); Clear → ConfirmDialog; reload persistence.
  - Finish review sheet lists every set to insert, each editable/removable, plus "Finish without them".
  - Skeleton chips while `!logsFetched`; empty state has "Choose routine" + "Add exercise".
  - Header controls all 44px with visible labels at 320.
  - Timer "Stop" icon + label; `motion-reduce`.
  - Focus moves to the next pending input after commit.
  - `/workout?date=2026-09-20` opens that date.
  - E2E flows green on the trio.

### P4: Exercise catalog + shared ExercisePicker
- **Scope:**
  - Workout: W12, W14, W16 (server search), W22, W27
  - Library: L8 (normalizer + chips), L22 (one `MUSCLE_GROUPS` + `EQUIPMENT`), L23 (RPC), L33 (routine picker cap via `get_routine_catalog`), L35 (client duplicate check in inline create), L44 (column + compat trigger), L47 (table + RLS + RPC honours hides), L48 (schema + equipment chips in the picker)
  - History: H32 (util)
- **Tabs touched:** Workout (Add exercise, routine picker); Library/History read the new columns via the compat trigger (no UI change).
- **Owns:**
  - migration **M4 `exercise_catalog`**:
    - `body_parts text[]` + GIN + backfill splitting `,` and `/`
    - `equipment` + name-inferred backfill
    - `exercise_hides` + RLS
    - `get_exercise_catalog(p_search, p_scope, p_equipment, p_include_hidden, p_limit, p_cursor)`
    - `get_routine_catalog(...)`
    - compat trigger (RP-3)
  - new `src/components/exercises/ExercisePicker.tsx`
  - `src/utils/normalizeSearch.ts`
  - `src/constants/muscleGroups.ts`
  - `src/lib/exercises.ts` (catalog hook + the single custom-exercise insert path)
  - `RoutinePickerModal.tsx` (catalog query)
- **Pre-migration read-only audit:**
  - `supabase/audits/m4_exercise_catalog_audit.sql`: 25 exercises (23 master, 2 custom), 24 single token, 1 slash ('Chest / Triceps'), 0 comma, 0 NULL; checksum `785f564f9ae0142caeacadb59d3133f6`. M4 applied to production 19:44Z via `scripts/prod-db.sh migrate` (backup `prod-20260927T194454Z.dump` verified; counts unchanged, checksum identical pre/post, invariants 0, master equipment dumbbell 1 / cable 7 / machine 1 / NULL 14).
- **Depends on:** P3b.
- **Acceptance:**
  - Workout §3 picker design:
    - search autofocus; "zer" → Zercher, "rdl" → Romanian Deadlift
    - Recent/Frequent/All sections; body-part + equipment chips
    - multi-select "Add N"; already-added rows show "In workout"
    - "Create '<query>'" with a duplicate message
    - focus goes to the first new card
  - With 350 seeded exercises, #201+ are reachable.
  - Templates #51+ can be started.
  - A coach sees no strangers' exercises.
  - A hidden default is absent for the coach and linked athletes (pgTAP).
  - Library and History views unchanged (DOM diff of the list at 390).

### P5a: History data, shell and session list
- **Scope:** H3, H5, H6, H7, H8 (data: `get_exercise_history` RPC in M5), H9, H12, H13, H14, H18, H20, H21 (sessions), H22, H26, H30, H31, H32 (adopt), H33, H34, H35 (session/shell), H38, H44 (D5 keep-alive, History only per RD-17), H45 (RD-8), H46 (part), H50.
- **Tabs touched:** History; the App shell (keep-alive).
- **Owns:**
  - migration **M5 `history_rpcs_v2`**:
    - `get_history_sessions` v2 (keyset `(workout_date, id)`, `p_since`, `total_count`)
    - `get_exercise_history(p_user_id, p_exercise_id, p_since, p_before, p_limit)` (D2)
  - new `src/components/history/useWorkoutHistory.ts` (workout queries moved out of `useHistoryData.ts`; nutrition half byte-identical)
  - `HistoryView.tsx`, `WorkoutSessionHistory.tsx`, `virtualizationConstants.ts`
  - **`src/App.tsx`** (`<Activity>` keep-alive outside `<Routes>`, scroll restore)
  - new **`common/SegmentedTabs.tsx`**
- **Pre-migration read-only audit:**
  - `supabase/audits/m5_history_rpcs_v2_audit.sql`: check (26, latest 20260927030000); pre audit funcs 0, workouts 33, sets 391, sets checksum `53ff934027825573baa4415b5a3a977f`. M5 applied to production 2026-09-27 22:37Z via `scripts/prod-db.sh migrate` (backup `prod-20260927T223706Z.dump` verified, 244K, mode 600; counts unchanged; post audit `supabase/audits/m5_history_rpcs_v2_post.sql`: funcs 1/1, SECURITY INVOKER, grants mirror v1, counts + checksum identical; check 27, latest 20260927040000; smoke of deployed frontend vs migrated DB SMOKE_FAIL=0; ff-push; local rehearsal migrate/rollback/migrate OK).
- **Depends on:** P4 (normalizeSearch, catalog labels).
- **Acceptance:**
  - H9 acceptance (800 sessions: 30d empty confirmed by the server, 90d count = SQL, All reaches the oldest, no duplicates on insert between pages, edit on page 4 keeps pages 1–4).
  - H3, H5 (By-Exercise shows "All-time stats", no chips), H6, H7, H14/D4, D5 acceptance (3 pages + expanded #120 survive a tab switch).
  - Session ⋯ "Edit in Workout" deep link; "Delete session" confirm.
  - Tabs/chips ARIA; no overflow at 320; D43 walker covers `/history`.

### P5b: History exercise sheet, trends, calendar, nutrition timeline
- **Scope:** H8, H11, H21 (exercise), H23, H24, H27, H29, H35 (rest), H36 (search), H37, H41, H42, H43, H46 (rest), H47 (UI), H49, H51.
- **Tabs touched:** History (Workouts + Nutrition domains).
- **Owns:**
  - new `ExerciseHistorySheet.tsx`, `WorkoutExerciseHistory.tsx`
  - new `HistoryCalendarSheet.tsx`
  - `NutritionHistoryTimeline.tsx`
  - `useHistoryData.ts` (nutrition section: `logged_date` window/infinite, deferred delete + undo via UndoToast)
  - inline SVG sparkline component
- **Depends on:** P5a.
- **Acceptance:**
  - H8 acceptance (24 sets in 9 groups after ≤1 "Load older"; PR row = badge; edit updates both; coach read-only).
  - Range selector in the sheet (D2).
  - H11: nutrition history reaches the oldest day, with full totals on every day shown.
  - H27 via RD-7: no DELETE on Undo; one DELETE on expiry or navigation; cache cleared only on success.
  - Human dates with weekday and year rule (STD-DAT-5).
  - Calendar jumps to a date.
  - Search filters sessions (H43).

### P6: kg/lb units across tabs
- **Scope:** W49, H48; the Coach timeline display strings (Workout §8.2).
- **Tabs touched:** Settings, Workout, History, Coach, data export.
- **Owns:**
  - migration **M6 `users_weight_unit`**
  - new `src/hooks/useWeightUnit.ts`
  - new `src/components/settings/WeightUnitCard.tsx`
  - `SettingsView.tsx`
  - `common/UnitChip.tsx` (promoted from Nutrition if used for the input suffix)
  - call-site wiring: SetRow/ExerciseCard/EditSetSheet/History/Coach → `useWeightUnit`
- **Pre-migration read-only audit:**
  - `supabase/audits/m6_users_weight_unit_audit.sql`: check (27, latest 20260927040000); pre audit column 0, users 3, workouts 33, sets 397, sets checksum `fd23890ea604f04d3f367ed1605872f8`. M6 applied to production 2026-09-28 04:57Z via `scripts/prod-db.sh migrate` (backup `prod-20260928T045705Z.dump` 248K verified, mode 600; counts preserved; post audit `supabase/audits/m6_users_weight_unit_post.sql`: column 1, users 3 all 'lb', 0 kg, 0 invalid; workouts 33, sets 397, checksum identical; check 28, latest 20260928000000; smoke of deployed frontend fdede85 vs migrated DB SMOKE_FAIL=0; ff-push; local rehearsal migrate/rollback/migrate OK 01:55Z; Rule 8 satisfied by audit + checksum).
- **Depends on:** P5b (History display sites final), P3a (EditSetSheet).
- **Acceptance:**
  - History D3 acceptance: 225 lb shows 102.1 kg everywhere; 100 kg saved stores 220.462… lb and re-displays 100 kg; the coach sees their own unit.
  - Volume totals are converted once.
  - Grep: no hard-coded "lbs" outside `weight.ts`.

### P7a: Library exercises list
- **Scope:** L4, L8 (list), L10, L11 (templates invalidation + "Archived" pill), L13 (list/modal), L14, L15, L18, L19, L20, L21, L23 (infinite list), L24, L25, L30, L32, L34, L35 (create form message), L46, L47 (Hide/Unhide/"Hidden" UI), L48 (equipment chips in create + list).
- **Tabs touched:** Library.
- **Owns:** `ExercisesView.tsx` (split into list/row/create-sheet files to stay under the LOC budget), `EditExerciseModal.tsx` → `EditExerciseSheet.tsx`, new `tests/e2e/library.spec.ts`.
- **Depends on:** P4 (catalog RPC, picker, constants); P3a (primitives).
- **Acceptance:**
  - Library §5 L4/L8/L10 acceptance (zero writes until the toast expires; Undo = zero writes; "zer"/"rdl" search; skeleton, then empty only on success).
  - Scope chips All · Defaults · Mine · {Athlete}'s (coach) / From coach (athlete) with owner pills.
  - Archived filter + Restore; Hidden filter + Unhide, coach hide = ConfirmDialog naming the athlete count (STD-CPY-4).
  - "Start routine" → `/workout?routine=`.
  - 320 overflow/tap/type guards.

### P7b: Library template builder, coach builder, catalog content
- **Scope:** L9, L13 (template modal), L15 (modal chips), L16, L17, L27, L28, L29, L33 (Library templates list), L35 (trigger), L36, L37 (Library tests), L38, L40 (adoption), L42 (adoption), L43, L44 (drop old column), L48 (seed).
- **Tabs touched:** Library (template builder), Coach (builder replaced).
- **Owns:**
  - `EditTemplateModal.tsx` → template sheet, `TemplateExerciseItem.tsx`
  - retires `ExercisePickerSheet.tsx` + `CoachTemplateBuilder.tsx`
  - `CoachCockpit.tsx` (template create via the shared builder with `assignToAthleteId`)
  - migration **M7 `exercise_name_guard`** (collision report reviewed first; trigger + partial unique index on owner + normalized name + equipment)
  - migration **M8 `default_catalog_seed`** (150–250 curated defaults)
  - migration **M9 `drop_body_part`** (after grep shows no readers)
- **Depends on:** P7a.
- **Acceptance:**
  - A single `save_routine_template` call from Coach; no orphan template on failure (L9).
  - Reorder announcements + tests (L17).
  - Clearing a stepper doesn't snap to 1 (L40).
  - Stale edit rejected by the `updated_at` precondition (L43).
  - A PostgREST insert of "BENCH PRESS" fails with the coded error (L35).
  - Seed present with body parts + equipment.
  - `body_part` column gone and every tab green.
- **Pre-migration read-only audit:**
  - `supabase/audits/m7_exercise_name_guard_audit.sql`: check (28, latest 20260928000000); pre audit checksums identical to rehearsal (`983ce740..` / `404ff98b..`). M7 applied to production 2026-09-29 01:17Z via `scripts/prod-db.sh migrate` (backup `prod-20260929T011655Z.dump` verified; post audit `supabase/audits/m7_exercise_name_guard_post.sql`: index, trigger, and `normalize_exercise_name` present; checksums identical; check 29, latest 20260929000000; post-M7 smoke of deployed frontend SMOKE_FAIL=0).
  - `supabase/audits/m8_default_catalog_seed_audit.sql`: pre audit master equipment NULL = 14 identical to rehearsal. M8 applied to production 2026-09-29 01:18Z via `scripts/prod-db.sh migrate` (backup `prod-20260929T011805Z.dump` verified; exercises 25->210, masters 23->208; post audit `supabase/audits/m8_default_catalog_seed_post.sql`: non-equipment checksum `a7560538..` and eq-untouchable checksum `62690e7c..` identical, 14 backfilled == 14 pre-NULL, 0 NULL-equipment masters; check 30, latest 20260929010000; D-U3 proof satisfied; deployed frontend parity 0 class-B errors; deploy smoke Preview id=6723901453 SMOKE_FAIL=0, Production id=6724322094 SMOKE_FAIL=0).
  - `supabase/audits/m9_drop_body_part_audit.sql`: pre audit checksum `58336fb6..` identical to rehearsal; zero-reader check verified (live SQL functions/trigger dropped/recreated by M9, src non-test export-only). M9 applied to production 2026-09-29 01:20Z via `scripts/prod-db.sh migrate` (backup `prod-20260929T012001Z.dump` verified; post audit `supabase/audits/m9_drop_body_part_post.sql`: `body_part` column, trigger, and sync functions dropped, checksum identical, 210 rows; check 31, latest 20260929020000; post-M9 smoke SMOKE_FAIL=0).

### P8: Shell, Coach, Settings + Nutrition standards sweep
- **Scope:**
  - L41 (coach nav entry), H25, H39, W44 (final no-`window.confirm` gate across `src/`)
  - **Production incident (resolved in P8):** P7b M8 grew per-user visible exercises to 208–210, exceeding `/workout` `.limit(200)` -> 10 alphabetically-last exercises unloggable ('cannot be resolved to a valid UUID') from M8 (2026-09-29 01:18Z) until P8 deploy; fixed by `fetchAllVisibleExercises` paging + scoped lookup + inline card errors; regression test `workout-catalog-tail.spec.ts` (proven failing on base `b35f41a`).
  - RD-12 application: BottomNav 12px labels (measure at 320px first; if they don't fit, icon-only below 360px, RD-18), Header mono tag, remaining `text-zinc-500`/sub-12px/mono/black in `src/` to zero
  - RD-7 application: Nutrition `window.confirm` deletes (`NutritionEngine.tsx:409`, `CustomDishesModal.tsx:328,412`) → UndoToast; CoachCockpit/MyCoachCard confirms → ConfirmDialog
  - STD-CMP-10 skeletons in Nutrition; Nutrition 40px hit areas → 44 (STD-INT-9)
  - **first:** a read-only Coach + Settings audit; its findings are added to this file as C#/S# items before any change
- **Tabs touched:** shell, Coach, Settings, Nutrition.
- **Owns:** `common/BottomNav.tsx`, `common/Header.tsx`, `coach/*` (except files owned earlier), `settings/*` (except P6 files), Nutrition files for the sweep, the final grep gate (ratchet to zero).
- **Depends on:** P7b.
- **Acceptance:**
  - Grep gate zero hits.
  - No `window.confirm` in `src/`.
  - D43 walker + tap grid run on every route.
  - Nutrition density suite still green with 44px hit areas and no layout growth beyond the documented px.

#### P8 Coach + Settings audit findings (read-only audit 2026-09-29 @befe8db; all owned by P8)
Severity P0-P3. Recorded before any P8 change, per the P8 scope rule. Line numbers are as of befe8db.

**Coach (C1-C30)**

| ID | Sev | Standard | File:Line | 1-Line Fix | Status |
|---|---|---|---|---|---|
| C1 | P1 | done | STD-CMP-7 | CoachCockpit.tsx:281 | Replace `window.confirm` with `ConfirmDialog` for athlete disconnect |
| C2 | P2 | done | STD-CMP-9 | CoachCockpit.tsx:290 | Replace `alert(message)` error call with inline `StatusBanner` / toast |
| C3 | P3 | done | STD-TYP-2 | CoachCockpit.tsx:307 | Change `font-black` to `font-bold` on Coach Dashboard header |
| C4 | P2 | done | STD-A11Y-1 | CoachCockpit.tsx:327-340 | Replace hand-rolled tab controls with `common/SegmentedTabs` (adds ARIA roles) |
| C5 | P2 | done | STD-INT-9 | CoachCockpit.tsx:378-382 | Increase "+ New Template" button `min-h-[36px]` to `min-h-[44px]` |
| C6 | P2 | done | STD-CMP-5 | CoachCockpit.tsx:393,414,455,470 | Remove `sm:text-xs` on inputs/select to prevent iOS auto-zoom (keep `text-base`) |
| C7 | P2 | done | STD-ICO-1 | CoachCockpit.tsx:480-485 | Add required `aria-label="Remove exercise"` to trash icon button |
| C8 | P3 | done | STD-TYP-4 | CoachCockpit.tsx:496 | Change "SAVE TEMPLATE" button uppercase to written case "Save template" |
| C9 | P2 | done | STD-CMP-10 | CoachCockpit.tsx:519-521 | Add `Skeleton` cards when `isTemplatesLoading` to eliminate empty flash |
| C10 | P3 | done | STD-TYP-2 | CoachCockpit.tsx:526 | Change `font-extrabold` to `font-bold` on template card title |
| C11 | P2 | done | STD-INT-9 | CoachCockpit.tsx:535 | Increase template Edit button `min-h-[36px]` to `min-h-[44px]` |
| C12 | P2 | done | STD-TYP-1 | CoachAthleteSwitcher.tsx:27 | Change `text-[10px]` to `text-xs` on "Active Athlete" label |
| C13 | P3 | done | STD-TYP-2 | CoachAthleteSwitcher.tsx:28 | Change `font-black` to `font-bold` on active athlete name |
| C14 | P2 | done | STD-A11Y-1 | CoachAthleteSwitcher.tsx:35-48 | Add `aria-label="Select athlete"` to athlete `<select>` dropdown |
| C15 | P2 | done | STD-CMP-5 | CoachAthleteSwitcher.tsx:39 | Remove `sm:text-xs` on athlete select, keeping `text-base` (16px) |
| C16 | P3 | done | STD-TYP-2,3 | CoachAthleteTimeline.tsx:210 | Remove `font-black` and `font-mono` on date text; use `font-bold` |
| C17 | P2 | done | STD-TYP-1,3 | CoachAthleteTimeline.tsx:214,243,275,294,344,361 | Replace 6x `text-[10px]` with `text-xs` and `font-mono` with `tabular-nums` |
| C18 | P3 | done | STD-TYP-2 | CoachAthleteTimeline.tsx:239,323 | Change `font-extrabold` to `font-bold` on session and nutrition headings |
| C19 | P2 | done | STD-TYP-1 | CoachAthleteTimeline.tsx:263,356 | Change `text-[11px]` to `text-xs` on exercise and nutrition rows |
| C20 | P2 | done | STD-COL-2 | CoachAthleteTimeline.tsx:296,430 | Replace `text-zinc-500` with `text-zinc-400` on Set label & fallback notice |
| C21 | P2 | done | STD-TYP-1 | CoachAthleteTimeline.tsx:329,333,337 | Change compliance target pill `text-[10px]` to `text-xs` |
| C22 | P3 | done | STD-TYP-2,3 | CoachAthleteTimeline.tsx:383,388 | Remove `font-black` on timeline title; remove `font-mono` on workout count |
| C23 | P2 | done | STD-CMP-10 | CoachAthleteTimeline.tsx:415-423 | Render `Skeleton` cards while athlete workouts query is fetching |
| C24 | P3 | done | STD-TYP-2 | CoachAthleteMacros.tsx:51 | Change `font-black` to `font-bold` on nutrition targets title |
| C25 | P2 | done | STD-TYP-1 | CoachAthleteMacros.tsx:55,66,69,93-95,112-114,131-133,150-152 | Replace 11 sub-12px classes (`text-[10px]`, `text-[11px]`) with `text-xs` |
| C26 | P3 | done | STD-TYP-2 | CoachAthleteMacros.tsx:66,81,93,112,131,150 | Change 6 `font-black` instances to `font-bold` |
| C27 | P3 | done | STD-TYP-3 | CoachAthleteMacros.tsx:81,84,94,104,113,123,132,142,151,161 | Remove 10 `font-mono` classes on labels/inputs; use `tabular-nums` |
| C28 | P2 | done | STD-CMP-5 | CoachAthleteMacros.tsx:104,123,142,161 | Remove `sm:text-xs` from all 4 macro inputs (keep `text-base`) |
| C29 | P3 | done | STD-TYP-4 | CoachAthleteMacros.tsx:171 | Change button uppercase to written case "Update athlete targets" |
| C30 | P2 | done | STD-LAY-3 | CoachAthleteMacros.tsx:89 | Add `min-w-0` to 2-col macro grid cells to prevent 320px truncation |

**Settings (S1-S29)**

| ID | Sev | Standard | File:Line | 1-Line Fix | Status |
|---|---|---|---|---|---|
| S1 | P1 | done | STD-CMP-7 | MyCoachCard.tsx:82 | Replace `window.confirm` with `ConfirmDialog` for coach disconnect |
| S2 | P2 | done | STD-CMP-9 | MyCoachCard.tsx:30-41 | Remove swallowed `catch { return null; }`; surface `StatusBanner` error |
| S3 | P3 | done | STD-TYP-2 | MyCoachCard.tsx:111,133,177 | Change `font-black` to `font-bold` on header, coach name, and submit button |
| S4 | P2 | done | STD-TYP-1 | MyCoachCard.tsx:116,130,136 | Replace sub-12px `text-[10px]` and `text-[11px]` with `text-xs` |
| S5 | P3 | done | STD-TYP-3 | MyCoachCard.tsx:116,123,136,170 | Remove `font-mono` from badge, status message, code, and input |
| S6 | P2 | done | STD-COL-2 | MyCoachCard.tsx:123,130,139 | Replace `text-zinc-500` (3 hits) with AA-compliant `text-zinc-400` |
| S7 | P2 | done | STD-CMP-10 | MyCoachCard.tsx:122-126 | Replace raw text "Loading coaching status..." with `Skeleton` card |
| S8 | P3 | done | STD-DAT-5 | MyCoachCard.tsx:140 | Replace `toLocaleDateString()` with `formatShortDate(coachLink.linked_at)` |
| S9 | P2 | done | STD-CMP-5 | MyCoachCard.tsx:170 | Remove `sm:text-xs` on coach code input (keep `text-base` 16px) |
| S10 | P3 | done | STD-TYP-4 | MyCoachCard.tsx:177 | Change button uppercase to written case "Link coach" |
| S11 | P3 | done | STD-TYP-2 | SettingsView.tsx:93,106,191 | Change `font-black` to `font-bold` on section headers |
| S12 | P2 | done | STD-TYP-1 | SettingsView.tsx:113,122,135,167,199 | Replace 5x sub-12px (`text-[10px]`, `text-[11px]`) with `text-xs` |
| S13 | P3 | done | STD-TYP-3 | SettingsView.tsx:116 | Remove `font-mono` from email address text |
| S14 | P2 | done | STD-CMP-5 | SettingsView.tsx:130 | Remove `sm:text-xs` on display name input (keep `text-base`) |
| S15 | P2 | done | STD-COL-2 | SettingsView.tsx:167 | Replace `text-zinc-500` with `text-zinc-400` on "(Managed by Coach)" |
| S16 | P2 | done | STD-CMP-9 | CoachSettingsCard.tsx:32-44 | Stop swallowing query catch block; propagate error to `StatusBanner` |
| S17 | P3 | done | STD-TYP-2 | CoachSettingsCard.tsx:93,140,159 | Change `font-black` to `font-bold` on headings and code display |
| S18 | P2 | done | STD-TYP-1 | CoachSettingsCard.tsx:145,155,180 | Replace `text-[10px]` with `text-xs` on badge and labels |
| S19 | P3 | done | STD-TYP-3 | CoachSettingsCard.tsx:108,145,159,191 | Remove `font-mono` from capacity badge, code display, and inputs |
| S20 | P2 | done | STD-COL-2 | CoachSettingsCard.tsx:155 | Replace `text-zinc-500` with `text-zinc-400` on "Your Coach Code" |
| S21 | P2 | done | STD-CMP-5 | CoachSettingsCard.tsx:108,191 | Remove `sm:text-xs` on vanity code inputs (keep `text-base`) |
| S22 | P3 | done | STD-TYP-2 | MacroGoalsCard.tsx:50,131 | Change `font-black` to `font-bold` on header and Save button |
| S23 | P2 | done | STD-TYP-1 | MacroGoalsCard.tsx:57,71,85,99,113 | Replace 5x `text-[10px]` macro labels with `text-xs` |
| S24 | P2 | done | STD-TYP-3,5 | MacroGoalsCard.tsx:66,80,94,108,122 | Remove `font-mono` and `sm:text-xs` from all 5 inputs (keep `text-base`) |
| S25 | P2 | done | STD-LAY-3 | MacroGoalsCard.tsx:55 | Rebalance 6-col grid to responsive 2-col to avoid 320px overflow |
| S26 | P3 | done | STD-TYP-2 | DataExportCard.tsx:170 | Change `font-black` to `font-bold` on "Data Extract" title |
| S27 | P2 | done | STD-TYP-1 | DataExportCard.tsx:203,226,263,270,299,305,322,353,369 | Replace 9x sub-12px (`text-[9px]`, `text-[10px]`, `text-[11px]`) with `text-xs` |
| S28 | P2 | done | STD-INT-9 | DataExportCard.tsx:230-256,325-346 | Expand format & preset button tap areas from `py-1.5` to `min-h-[44px]` |
| S29 | P2 | done | STD-CMP-5 | DataExportCard.tsx:363,379 | Increase custom date inputs from `text-xs` to `text-base` (iOS zoom) |

### P8.1: CI split, notification standard, PR mode, P8 follow-ups
- **Status:** SHIPPED (`60d6f76`, PR #18, CI run `36662148207`, Preview id=`6750406493`, Production id=`6750556265`)
- **Scope:**
  - **Item 0 (CI split):** Split `.github/workflows/ci.yml` into 5 parallel jobs (static-unit, e2e-desktop-chrome, e2e-mobile-safari, e2e-narrow-safari, density) with 20m timeouts; verify coverage union (`scripts/ci-coverage-list.sh`); density owns data/runs on fresh seeded DB; reorder `gate_full.sh` (density after CI-order E2E) and propagate stage failure exit codes.
  - **Item T0 (Tip CI red fix):** `NutritionEngine.tsx:162` renders empty state before auth resolves (`isLogsPending = Boolean(targetUserId) && ...`); fix to render skeleton while `!targetUserId` (STD-CMP-10) and wait on deterministic state in `NutritionEngine.test.tsx:4808-4817`.
  - **Item N1 (Notification standard, user request verbatim):** *"the notification box when you click the first custom dish for staged meal, there are random box appear between the staged meal box & the custom log. Sometimes it says 'saved', some times it says 'Meal deleted'. I think it's the legacy notification box that appear under the Food Log AI modal. All notification box should be standardized as disappearing with the same format right?"*
  - **Item N2 (PR mode setting, user request verbatim):** *"I want to have a toggle in setting to select between different mode of PR: (1) Weight max / if ties then reps (current) vs (2) estimated 1 rep max"*
  - **Item F (P8 follow-ups from RESUME_PROMPT items 2–7):**
    - F1: `SetRow.tsx:60,95` hint column truncation at 320 (`grid-cols-[24px_1fr_52px_48px_36px] gap-1.5`, inputs >= 44x44).
    - F2: History `.limit(1000)` exercise reads (`HistoryView.tsx:132`, `useHistoryData.ts:49`) adopt `fetchAllVisibleExercises`.
    - F3: `font-extrabold` in `ExerciseStatsList.tsx:263`, `HistoryView.tsx:333`, `WorkoutExerciseHistory.tsx:153` replaced with `font-bold`; ratchet rule at zero in `check-design-ratchet.js`.
    - F4: Prod backup script `scripts/prod-db.sh:51` adds `--schema=private` (rehearsal restore verified).
    - F5: M9 down-migration lossiness documented in `supabase/rollbacks/20260929020000_drop_body_part.down.sql` header.
    - F6/F7: Component LOC under 550 via extraction: `WorkoutEngine.tsx` (589 LOC), `NutritionEngine.tsx` (590 LOC), `EditTemplateSheet.tsx` (594 LOC).
- **Tabs touched:** Shell (`App.tsx`, `ToastHost.tsx`), Workout (`SetRow.tsx`, `WorkoutEngine.tsx`, `ExerciseCard.tsx`), Nutrition (`NutritionEngine.tsx`, `useNutritionData.ts`, `NutritionAiInput.tsx`, `QuickLogFavorites.tsx`, `CustomDishesModal.tsx`), History (`HistoryView.tsx`, `useHistoryData.ts`, `ExerciseStatsList.tsx`, `ExerciseHistorySheet.tsx`, `WorkoutExerciseHistory.tsx`), Settings (`SettingsView.tsx`, `PrModeCard.tsx`, `CoachSettingsCard.tsx`), Coach (`CoachCockpit.tsx`).
- **Owns:**
  - **Wave 0 packages:**
    - CI: `.github/workflows/ci.yml`, `scripts/ci-coverage-list.sh`, `H/scratch/gate_full.sh`
    - F1 small fixes: `src/components/nutrition/NutritionEngine.tsx` (:162 only), `src/components/NutritionEngine.test.tsx` (STD-CMP-10 test only), `src/components/workout/SetRow.tsx` (+ tests), `src/components/history/HistoryView.tsx` (:132 & :333), `src/components/history/useHistoryData.ts` (:49), history mock tests (`HistoryView.test.tsx`, `HistoryView.filters.test.tsx`, `useHistoryDataWindow.test.ts`), `scripts/check-mock-fidelity.js`, `src/components/history/ExerciseStatsList.tsx` (:263), `src/components/history/WorkoutExerciseHistory.tsx` (:153), `scripts/check-design-ratchet.js`, `scripts/design-ratchet-baseline.json`, `src/utils/check-design-ratchet.test.ts`, `scripts/prod-db.sh` (--schema=private), `supabase/rollbacks/20260929020000_drop_body_part.down.sql` (header comment).
    - F2 LOC: `src/components/exercises/EditTemplateSheet.tsx` (+ extracted files), `src/components/workout/WorkoutEngine.tsx` (+ extracted files).
    - DOCS audit: `docs/REDESIGN_STATUS.md`.
  - **Wave 1 packages:**
    - N1: `src/components/common/ToastHost.tsx` + `useToast.ts` (+ tests), `common/UndoToast.tsx`, `nutrition/QuickLogToast.tsx`, App shell mount (`App.tsx`), `src/components/nutrition/*` (`NutritionEngine.tsx`, `useNutritionData.ts`, `NutritionAiInput.tsx`, `QuickLogFavorites.tsx`, `CustomDishesModal.tsx`), `src/components/NutritionEngine.test.tsx`, `WorkoutEngine.tsx` + extracted workout files, `HistoryView.tsx`, `settings/SettingsView.tsx`, `settings/CoachSettingsCard.tsx` (+ tests), `scripts/check-design-ratchet.js` + baseline + test (`adhoc-success` rule), `tests/e2e/p8-1-notifications.spec.ts`, existing specs asserting old messages.
    - N2: `supabase/migrations/20260930000000_users_pr_mode.sql`, `supabase/rollbacks/20260930000000_users_pr_mode.down.sql`, `supabase/audits/m10_users_pr_mode_pre.sql`, `supabase/audits/m10_users_pr_mode_post.sql`, `supabase/tests/users_pr_mode.test.sql` (+ `exercise_benchmarks.test.sql`), `src/lib/prComparator.ts` (+ tests), `src/utils/ghostSets.ts` (+ tests), `src/components/workout/useWorkoutQueries.ts`, `src/components/workout/ExerciseCard.tsx` (+ tests), `src/components/history/ExerciseStatsList.tsx`, `ExerciseHistorySheet.tsx`, `WorkoutExerciseHistory.tsx` (+ tests), `src/context/AuthContext.tsx`, `src/hooks/usePrMode.ts` (+ tests), `src/components/settings/PrModeCard.tsx` (+ tests), `src/utils/dataExport.ts`, `tests/e2e/p8-1-pr-mode.spec.ts`.
- **Depends on:** P8.
- **Acceptance:**
  - CI: Every job < 20 min; union proof (`scripts/ci-coverage-list.sh` old vs new); `gate_full.sh` selftest exit 1.
  - N1: Repro spec `tests/e2e/p8-1-notifications.spec.ts` passes at 320 + 390 (failed 4/4 on base 6951924); `ToastHost` unit tests (auto-dismiss 4s, one-at-a-time replacement + pending undo commit, action); zero inline success text remaining (`adhoc-success` ratchet baseline 0).
  - N2: Comparator matrix unit tests (ties: equal weight more reps, equal e1RM, bodyweight 0 lb, >12 reps, kg/lb display); pgTAP covers both modes + default == weight; E2E toggle -> seeded history shows different PR in History and `/workout`, persists across reload, toggle back restores.
  - F: SetRow hint not truncated at 320 with inputs >= 44x44 (raw px measured in density/E2E); History reads paged via `fetchAllVisibleExercises`; ratchet `font-extrabold` 0; backup restore succeeds with schema private included (1 benign error vs 29; nutrition_logs=202, custom_dishes=13, private functions=6); LOC for `WorkoutEngine`, `NutritionEngine`, `EditTemplateSheet` all < 550.
  - Baselines never go down (`WORKER_RULES.md` P8.1 line).
- **Migration M10 (expand-only, D-P8.1-10/11):**
  - `20260930000000_users_pr_mode.sql`: `users.pr_mode text NOT NULL DEFAULT 'weight' CHECK in ('weight','e1rm')`; `get_exercise_benchmarks` and `get_exercise_stats` v2 dropped & recreated with trailing `p_pr_mode text DEFAULT 'weight'` (no overload left -> PostgREST unambiguous; old frontend calls = weight mode = identical output); grants/security identical.
  - Down file `supabase/rollbacks/20260930000000_users_pr_mode.down.sql` restores previous definitions + drops column.
  - Audits: `supabase/audits/m10_users_pr_mode_{pre,post}.sql`.
  - Expand-first ship order: PR CI green -> deployed frontend (6951924) E2E vs local DB with M10 (compat) -> prod backup (new script with `--schema=private`) -> rehearsal on dump (restore lists private tables) -> pre-audit -> migrate -> post-audit identical -> merge + ff-push -> deploy smoke.
  - **Production receipts:** Applied to production via `scripts/prod-db.sh migrate` after backup `prod-20260930T030751Z.dump` verified. Pre/post audit checksums: users `3687539908ad7f13a4e64fd7bbf39396` (identical pre/post), sets `354e25beece94a97878b794a6136aa10` (identical pre/post; production values filled later, rehearsal `354e25beece94a97878b794a6136aa10`). Counts preserved: users 3 (3 'weight', 0 'e1rm', 0 invalid), workouts 34, sets 407. Check 32, latest `20260930000000`. Deployed frontend (6951924) E2E vs local M10 DB: 270 passed, 0 failed, 12 skipped (21.0m).

#### P8.1 audit findings (read-only audit 2026-09-29 @6951924)

**CI steps/timings baseline (Run 36614078601: 31m 10s / 1870s, Limit: 35m) & proposed jobs (D-P8.1-1)**

| ID | Job / Step | ci.yml:Line | Baseline Duration | Proposed Job & Scope (Target <20m) |
|---|---|---|---|---|
| CI1 | `job-static-unit-tz` | 26-112, 117, 139 | ~9m 50s | Checkout, Node 22, Deno, npm ci, oxlint, tsc, build, perf:budget, Deno, Supabase start+reset, test:tz (LA+Tokyo), vitest, pgTAP (5s), npm audit |
| CI2 | `job-e2e-desktop-chrome` | 114-118, 131-137 | ~7m 45s | Checkout, Node 22, npm ci, Supabase start+reset+seed:stress, Playwright chromium, E2E Desktop Chrome (94 tests), perf:trace (4 tests), perf:verify |
| CI3 | `job-e2e-mobile-safari` | 114-118 | ~10m 25s | Checkout, Node 22, npm ci, Supabase start+reset+seed:stress, Playwright webkit, E2E Mobile Safari (94 tests) |
| CI4 | `job-e2e-narrow-safari` | 114-118 | ~7m 50s | Checkout, Node 22, npm ci, Supabase start+reset+seed:stress, Playwright webkit, E2E Narrow Safari (320px) (94 tests) |
| CI5 | `job-density` | 123-127 | ~5m 15s | Checkout, Node 22, npm ci, fonts-roboto, Supabase start+reset+seed:stress, Playwright chromium, visual density (120 tests; owns data per D-P8.1-2) |

**Notification surfaces (N1..N16, audited @6951924)**

| ID | File:Line | Kind | Text | Dismissal | Action |
|---|---|---|---|---|---|
| N1 | `src/components/nutrition/NutritionEngine.tsx:337` | info/success (BUG) | "Saved", "Meal deleted" | inline above staged card; never | done |
| N2 | `src/components/nutrition/NutritionAiInput.tsx:240` | info/success/error | "Saved", "Meal deleted", "Analyzed" | inline bottom of AI box; manual / never | done |
| N3 | `src/components/common/UndoToast.tsx:172` | undo/success | "Deleted: {subject}", "Set deleted" | fixed bottom 74/128/148px; auto 6000ms / manual Undo | done |
| N4 | `src/components/nutrition/QuickLogToast.tsx:54` | undo/success | "Logged: {name} · +{kcal} kcal" | fixed bottom; auto 6000ms / manual Undo | done |
| N5 | `src/components/nutrition/NutritionEngine.tsx:522` | undo/success | "Deleted {meal/dish}" | fixed bottom (UndoToast); auto 6000ms / manual Undo | done |
| N6 | `src/components/workout/WorkoutEngine.tsx:560,568` | undo/success | "Set deleted", "Removed {ex}" | fixed bottom (UndoToast); auto 6000ms / manual Undo | done |
| N7 | `src/components/history/HistoryView.tsx:475,482` | undo/success | "Set deleted", "Meal deleted" | fixed bottom (UndoToast); auto 6000ms / manual Undo | done |
| N8 | `src/components/settings/CoachSettingsCard.tsx:196` | success | "Copied!" | inline button text; auto 2000ms | done |
| N9 | `src/components/settings/CoachSettingsCard.tsx:155` | success/error | "Coach code updated successfully!" | inline below input; never (on re-save) | done |
| N10 | `src/components/settings/SettingsView.tsx:81` | success/error | "Settings saved", "Failed to save settings" | inline top of view; manual on re-edit | done |
| N11 | `src/components/nutrition/NutritionEngine.tsx:309` | error | "Failed to load custom dishes" | inline above staged card; manual retry | done |
| N12 | `src/components/nutrition/NutritionEngine.tsx:440` | error | "Failed to load nutrition logs" | inline top of timeline; manual retry | done |
| N13 | `src/components/nutrition/MealLogRow.tsx:206` | error | "Failed to load meal components" | inline inside row; manual retry | done |
| N14 | `src/components/nutrition/EditMealSheet.tsx:236` | error | "Failed to save meal: ..." | inline sheet bottom; manual on re-save | done |
| N15 | `src/components/workout/WorkoutEngine.tsx:323` | error | "Failed to load workout session" | inline below header; manual retry | done |
| N16 | `src/components/exercises/ExercisesView.tsx:78` | error | "Failed to load exercises..." | inline top of tabs; manual retry | done |

**PR surfaces (PR1..PR12, audited @6951924)**

| ID | File:Line | Computed Where | Current Rule | P8.1 Action |
|---|---|---|---|---|
| PR1 | `src/components/workout/ExerciseCard.tsx:216` | Trophy chip: SQL `get_exercise_benchmarks` + `ghostSets.ts:358` `mergeBenchmarks` | Max wt -> max reps -> earliest date; BW (0 lb) -> max reps | done |
| PR2 | `src/components/history/ExerciseStatsList.tsx:247` | By-Exercise PR line: SQL `get_exercise_stats` v2 (`20260927020000_exercise_pr_benchmarks.sql:183`) | Max wt -> max reps -> earliest date/time/id; BW -> "Bodyweight × reps" | done |
| PR3 | `src/components/history/ExerciseHistorySheet.tsx:235` | Sheet PR banner: props from `ExerciseStatsList.tsx:364` | `PR: ${wt > 0 ? formatWeight : 'Bodyweight'} × ${reps} · ${date}` | done |
| PR4 | `src/components/history/ExerciseHistorySheet.tsx:395` | Sheet row PR badge: client `prSetId` (`ExerciseHistorySheet.tsx:174`) | Match wt+reps+date; tie -> civilDate, setIndex, createdAt; ignores wt <= 0 | done |
| PR5 | `src/components/history/WorkoutExerciseHistory.tsx:137` | Legacy/virtualized list: prop `stat.maxWeight`, `stat.prReps` | `PR: ${wt > 0 ? formatWeight : 'Bodyweight'} × ${reps} · ${date}` | done |
| PR6 | `src/utils/ghostSets.ts:163` | `getExerciseBenchmarks` fallback: client loop `allTimeSets` | `wt > bestWt \|\| (wt === bestWt && reps > bestReps)`; no date tie-break | done |
| PR7 | `src/utils/ghostSets.ts:358` | `mergeBenchmarks` live session updater: client loop today's sets | `wt > curWt \|\| (wt === curWt && reps > curReps)`; keeps earlier PR | done |
| PR8 | `src/components/history/HistoryView.tsx:64` | Coach inspecting athlete: SQL `get_exercise_stats(selectedAthleteId)` | Formatted in coach's unit (`useWeightUnit`); no coach cockpit PR | done |
| PR9 | `src/utils/dataExport.ts:402` | Profile data export: SQL `public.users` select | Exports profile preferences; PRs not exported as standalone table | done |
| PR10 | `supabase/migrations/20260927020000_exercise_pr_benchmarks.sql:13` | SQL `get_exercise_benchmarks`: PostgreSQL window function | `ORDER BY ws.weight DESC, ws.reps DESC, ws.workout_date ASC, ws.created_at ASC, ws.id ASC` | done |
| PR11 | `supabase/migrations/20260927020000_exercise_pr_benchmarks.sql:145` | SQL `get_exercise_stats` v2: PostgreSQL window function | Same window ordering as benchmarks; returns `max_weight`, `pr_reps`, `pr_date` | done |
| PR12 | `supabase/migrations/20260927040000_history_rpcs_v2.sql:75` | SQL `get_exercise_history`: PostgreSQL keyset query | Raw session sets provider; does not compute PR (client does) | done |

**Follow-up items (F1..F7, audited @6951924)**

| ID | File:Line | Action |
|---|---|---|
| F1 | `src/components/nutrition/NutritionEngine.tsx:162`, `src/components/NutritionEngine.test.tsx:4808-4817` | done |
| F2 | `src/components/workout/SetRow.tsx:60,95` | done |
| F3 | `src/components/history/HistoryView.tsx:132`, `src/components/history/useHistoryData.ts:49` | done |
| F4 | `src/components/history/ExerciseStatsList.tsx:263`, `HistoryView.tsx:333`, `WorkoutExerciseHistory.tsx:153` | done |
| F5 | `scripts/prod-db.sh:51` | done |
| F6 | `supabase/rollbacks/20260929020000_drop_body_part.down.sql:1-3` | done |
| F7 | `src/components/workout/WorkoutEngine.tsx:1`, `src/components/nutrition/NutritionEngine.tsx:1`, `src/components/exercises/EditTemplateSheet.tsx:1` | done |

---

## 5. Ownership of shared files and migrations
| Shared file / migration | Owning phase | Used by |
|---|---|---|
| `src/test/supabaseBuilderMock.ts`, `package.json` scripts, `playwright.density.config.ts` | P0 | all |
| `src/lib/queryKeys.ts`, `src/lib/invalidate.ts` | P0 | Workout, History, Library, Coach |
| `src/utils/uuid.ts`, `src/utils/exerciseCatalog.ts` | P0 | Library, Coach, History |
| M1 `exercises_rls_v2` + `supabase/tests/exercises_rls.test.sql` | P1 | all exercise readers |
| M2 `workouts_civil_date`, M3 `exercise_pr_benchmarks` | P2 | Workout, History, Coach |
| `useWorkoutQueries.ts`, `useWorkoutMutations.ts`, `src/lib/sets.ts`, `ghostSets.ts`, `workoutSessionStore.ts`, `src/utils/weight.ts`, `src/utils/date.ts` | P2 | Workout, History, Coach, Library |
| `common/{Button,IconButton,Chip,Tag,Stepper,Card,Sheet,ConfirmDialog,Skeleton,UndoToast}.tsx`, `common/useDeferredDelete.ts`, `sets/EditSetSheet.tsx` | P3a | all |
| `common/GlobalRestTimerPill.tsx` | P3b | shell |
| M4 `exercise_catalog`, `ExercisePicker.tsx`, `normalizeSearch.ts`, `constants/muscleGroups.ts`, `src/lib/exercises.ts` | P4 | Workout, Library, History, Coach |
| M5 `history_rpcs_v2`, `src/App.tsx`, `common/SegmentedTabs.tsx` | P5a | History, Library, shell |
| M6 `users_weight_unit`, `useWeightUnit.ts`, `common/UnitChip.tsx` (promotion) | P6 | Workout, History, Coach, Settings |
| M7 `exercise_name_guard`, M8 `default_catalog_seed`, M9 `drop_body_part` | P7b | Library, Workout picker |
| `common/BottomNav.tsx`, `common/Header.tsx` | P8 | shell |
| M10 `users_pr_mode`, `common/ToastHost.tsx`, `src/lib/prComparator.ts` | P8.1 | Settings, Workout, History, Coach, shell |
| `tests/visual-density.test.ts`, `tests/e2e/mobile-viewport.spec.ts` | append-only (RP-2) | all |

Migration order: M1 (P1) → M2, M3 (P2) → M4 (P4) → M5 (P5a) → M6 (P6) → M7, M8, M9 (P7b) → M10 (P8.1).

---

## 6. Audit item assignment
Primary phase first; `+` = also touched later (a split noted in the phase scope). N/A = obsolete; Deferred = see reason.

### Workout (W1–W50)
| ID | Phase | ID | Phase | ID | Phase | ID | Phase | ID | Phase |
|---|---|---|---|---|---|---|---|---|---|
| W1 | P2 | W11 | P2 | W21 | P3b | W31 | P2 | W41 | P2 |
| W2 | P2 | W12 | P4 | W22 | P4 | W32 | P3a | W42 | P2 |
| W3 | P3a | W13 | P3a | W23 | P3b | W33 | P3a +P3b | W43 | Deferred |
| W4 | P2 | W14 | P4 | W24 | P2 | W34 | P3b | W44 | P3a +P3b +P8 (done) |
| W5 | P2 | W15 | P3a | W25 | P3b | W35 | P2 | W45 | Deferred |
| W6 | P2 | W16 | P2 +P4 | W26 | P3a | W36 | P3a +P3b | W46 | P2 |
| W7 | P2 +P3a | W17 | P3a | W27 | P4 | W37 | P2 +P3a | W47 | P3a |
| W8 | P3b | W18 | P3b | W28 | P3a +P3b | W38 | P0 +P3a +P3b | W48 | P3a |
| W9 | P3b | W19 | P2 +P3a | W29 | P3b | W39 | P2 | W49 | P6 |
| W10 | P3b | W20 | P2 | W30 | P3b | W40 | P2 | W50 | P1 +P2 |

### Library (L1–L48)
| ID | Phase | ID | Phase | ID | Phase | ID | Phase | ID | Phase |
|---|---|---|---|---|---|---|---|---|---|
| L1 | P1 | L11 | P7a +P2 | L21 | P7a | L31 | Deferred | L41 | P8 (done) |
| L2 | P1 | L12 | P1 | L22 | P4 | L32 | P7a | L42 | P3a +P7b |
| L3 | P1 | L13 | P7a +P7b | L23 | P4 +P7a | L33 | P4 +P7b | L43 | P7b |
| L4 | P7a | L14 | P7a | L24 | P7a | L34 | P7a | L44 | P4 +P7b |
| L5 | P1 | L15 | P7a +P7b | L25 | P7a +P3b | L35 | P7b +P4 +P7a | L45 | Deferred |
| L6 | P1 | L16 | P7b | L26 | P2 | L36 | P7b | L46 | P7a |
| L7 | P1 | L17 | P7b | L27 | P7b | L37 | P0 +P7b | L47 | P4 +P7a |
| L8 | P7a +P4 | L18 | P7a | L28 | P7b | L38 | P7b | L48 | P4 +P7a +P7b |
| L9 | P7b | L19 | P7a | L29 | P7b | L39 | P2 | | |
| L10 | P7a | L20 | P7a | L30 | P7a | L40 | P3a +P7b | | |

### History (H1–H53)
| ID | Phase | ID | Phase | ID | Phase | ID | Phase | ID | Phase |
|---|---|---|---|---|---|---|---|---|---|
| H1 | P3a | H12 | P5a | H23 | P5b | H34 | P5a | H45 | P5a |
| H2 | P2 | H13 | P0 +P5a | H24 | P5b | H35 | P5a +P5b | H46 | P5a +P5b |
| H3 | P5a | H14 | P5a | H25 | P8 (done) | H36 | P3a +P5b | H47 | P2 +P5b |
| H4 | P2 | H15 | P2 | H26 | P5a | H37 | P5b | H48 | P6 |
| H5 | P5a | H16 | P2 | H27 | P5b | H38 | P5a | H49 | P5b |
| H6 | P5a | H17 | P3a | H28 | P0 | H39 | P8 (done) | H50 | P5a |
| H7 | P5a | H18 | P5a | H29 | P5b | H40 | N/A (RP-6) | H51 | P5b |
| H8 | P5b +P5a | H19 | P0 | H30 | P5a | H41 | P5b | H52 | N/A (RP-6) |
| H9 | P5a | H20 | P5a | H31 | P5a | H42 | P5b | H53 | N/A (RP-6) |
| H10 | P2 | H21 | P5a +P5b | H32 | P4 +P5a | H43 | P5b | | |
| H11 | P5b | H22 | P5a | H33 | P5a | H44 | P5a | | |

### Deferred items and reasons
| ID | Reason | Revisit when |
|---|---|---|
| W43, L45 | Offline handling is L effort and needs a design choice (a retry queue for set inserts vs disabling writes). No offline standard exists yet in Nutrition. | After P8. A shared offline banner + write policy becomes its own decision. |
| W45 | Native rest-timer notifications need a new Capacitor plugin dependency and device testing. | When mobile builds are in scope. |
| L31 | Library decision Q7: deferred until the Workout engine uses per-instance ids (P2 moves to id keys; per-instance keys come later). | After P3b. |
| H40, H52, H53 | Obsolete: D44 removed EditMealModal and made the timeline row read-only (RP-6). | n/a |

Coverage: 50 W + 48 L + 53 H = **151 items**. Each is assigned to a phase, deferred or N/A. Checked by `python3 docs/redesign_coverage_check.py docs/REDESIGN_STATUS.md`: every ID appears exactly once in this section, and every phase listed here mentions the item in its §4 block (and the reverse). Re-run it after editing §4 or §6.

---

## 7. Open questions
None open. All six were answered on 2026-09-26 19:59Z and are recorded in §2.0:

| # | Question | Answer |
|---|---|---|
| OQ-1 | Pin the test time zone via npm scripts or config edits? | npm scripts only (RD-14). |
| OQ-2 | Duplicate workouts on one day: auto-merge or stop? | Stop, report counts, merge only after approval (RD-15). |
| OQ-3 | Existing warm-up/drop sets: hide or convert to working? | Keep hidden, report counts (RD-16). |
| OQ-4 | Keep-alive for all tabs or History only? | History only; others evaluated in P8 (RD-17). |
| OQ-5 | BottomNav if 12px labels don't fit at 320px? | Measure first; icon-only below 360px if needed (RD-18). |
| OQ-6 | Admin screen for default exercises? | No; migrations only (RD-19). |

Add new questions here as phases surface them (e.g. the P8 Coach/Settings audit, the RD-15/RD-16 counts).

**Pre-P1 data audit (production, read-only; run by the user in the Supabase SQL editor on 2026-09-26 with `p0_counts_one.sql`):**

| Check | Count | Consequence |
|---|---|---|
| RD-15 duplicate workout days (UTC date / user time zone) | 0 / 0 | W41's unique `(user_id, workout_date)` can land without any merge; no approval needed. |
| RD-16 warm-up / drop sets | 0 / 0 | Hiding non-working sets affects no existing data. |
| W50a sets on unlinked non-master exercises | 0 | RLS v2 hides nothing that existing sets reference. |
| W50b template rows using another user's non-master exercise (unlinked) | 0 (0) | Same, for templates. |
| Blank or whitespace exercise names | 0 | The `CHECK (length(trim(name)) > 0)` in M1 applies cleanly. |
| Context: workouts / sets / users | 32 / 387 / 3 | Small data set; backfills are trivial. |

All P1 pre-migration audit counts are 0. The remaining P1 prerequisite is a database backup (the Free plan has no automatic backups; use `pg_dump`).
The agent has no production DB credentials (anon key only); re-run the query before each migration phase.

---

## 8. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| The limit-aware mock (P0) breaks many existing suites | P0 slips | Fix fixtures, never weaken assertions (T12); run the full suite before merging. |
| RLS v2 hides rows that existing sets/templates reference (W50) | "Unknown exercise" labels | Pre-migration audit counts must be 0 or resolved; label resolution by id includes archived/hidden (C2). |
| Civil-date backfill (M2) mis-dates rows logged without a time zone | Workouts move a day | Audit first; users without `timezone` use the UTC date; pgTAP + a before/after count per day. |
| P2 and P3a are large and touch shared hooks used by History and Coach | Regressions outside Workout | Cross-tab tests (H2/H10) + History/Coach E2E in the phase gate; red team per phase. |
| `QuickLogToast` promotion changes Nutrition | Nutrition regression | Byte-identical DOM proof + Nutrition density/E2E in the P3a gate. |
| Keep-alive (`<Activity>`) + window virtualizer scroll restore | Scroll jumps | D5 conditions; E2E for pages + expanded row + scroll offset. |
| Catalog seed (M8) collides with users' custom names | Duplicate-name trigger fails | M7 collision report precedes M8; the seed skips names that collide. |
| LOC budget (600) on HistoryView/ExercisesView/CoachCockpit (543/543/587 today) | perf gate fails | Split files as part of each phase (listed under Owns). |
| Coach/Settings unaudited | Hidden defects reach P8 late | The P8 audit runs first; it may split P8. |
| ~~Full vitest suite is not time-zone clean~~ **Resolved in P2**: all 6 were tests assuming UTC; fixed, and `test:tz` now runs the full suite in LA and Tokyo. | — | — |
| The new client writes `workout_date` = the device's local date; the trigger uses `users.timezone` only for legacy rows with a time. A device in a different zone than the profile creates the device's day (found in P2) | A traveller's workout lands on the device's day | Decide device vs profile zone when P8 (Settings) owns the time-zone setting; same question as Nutrition's `logged_date`. |
| Local `npm run test:db` fails with the repo's Supabase CLI 2.31 (`config.toml` has newer keys: `oauth_server`, `pgdelta`, `local_smtp`); CI's CLI is fine | Local pgTAP looks broken | Copy `supabase/tests` to `/tmp/<dir>/supabase/` and run `npx supabase test db --workdir /tmp/<dir> --db-url postgresql://postgres:postgres@127.0.0.1:58822/postgres`. |
| `save_routine_template` (SECURITY DEFINER) does not check that each `exercise_id` is visible to the caller (found in P1 review; production audit W50b = 0) | A template could reference an exercise its owner can't see | Add the visibility check when P7b owns the template builder / RPC. |
| `ExercisesView.tsx` is at 599/600 LOC after P1 | perf gate fails on the next edit | P7a splits it before adding anything. |
| D44 edit-meal E2E flaked once in the History half (Save stayed disabled after a name change; 6/6 passes on repeat, on both base and P0) | CI noise | Watch; if it recurs, check the edit sheet's async draft reload overwriting typed input. |
| E2E specs must be self-sufficient on fresh seed.sql and not leave residue (CI runs 3 projects on one DB) | Cross-spec flakiness in CI when later projects (e.g. Narrow Safari) hit modified or missing seeded rows | New E2E specs create and clean up their own test data; run all 3 CI projects in order locally before pushing. |
| CI job duration ~17 min, limit 25 | CI job cancellation on timeout if suite grows further | Timeout bumped 15 -> 25 min (D-P3a-2); watch duration as P3b-P8 add specs; shard or parallelize projects if approaching 22 min. |
| `WorkoutEngine.tsx` (586 LOC) and `useWorkoutSession.ts` (585 LOC) near 600 LOC budget after P3b | perf gate fails on next edit | Next phase touching either must extract sub-components/hooks before adding code. |
| Local gate runs subset of E2E specs; rfix-06-payload was outside gate set and caught a real payload regression in CI | CI failure and delayed feedback loop | Local pre-PR gates must run the FULL tests/e2e in CI order (all 3 projects) before opening/updating PRs. |
| Library ExercisesView still has direct exercises table insert path instead of shared insertCustomExercise | Fragmented validation and duplicate-check logic | Adopt insertCustomExercise in Library during P7a/P7b. |
| useWorkoutQueries retains legacy REST fallback when get_routine_catalog errors (logged to console) | Obscures RPC issues and maintains dead code path | Remove REST fallback once M4 RPC is confirmed stable in production. |
| Master exercises equipment is NULL for 14/23 rows (inference unmatched) | Exercise picker equipment chips show fewer results | Curate remaining master equipment values in future migration/seed (e.g. M8). |
| ~~useWorkoutSession.test.ts Tokyo-midnight test:tz flake~~ **Fixed in P5a (72a15c3)**: root cause `vi.setSystemTime` without fake timers let real clock cross Sun->Mon JST, Monday routine preloaded. | — | — |
| nutrition-flow Mobile Safari `waitForSelector` 30s timeout flake (nutrition-owned) | Flaky CI runs on WebKit | Known flake owned by Nutrition; one re-run allowed in CI (remains known flake in P6). |
| History keyset `total_count` counter can read 'N of N+k' if sessions are inserted above cursor mid-pagination | Counter discrepancy during active paging | Short-page guard stops paging; manual/tab refresh corrects (low impact). |
| ~~P7b-owned leftovers `text-zinc-500` / sub-12px in `EditTemplateModal`, `ExercisePickerSheet`, `TemplateExerciseItem`~~ **Resolved in P7b**: retired and replaced by `EditTemplateSheet` and modern `TemplateExerciseItem`. | — | — |
| ~~CI job duration now 29m46s (run 36504646894, limit 35m per D-P7a-1)~~ **Mitigated in P8.1**: split into 5 parallel jobs (D-P8.1-1), max job 9m49s. | — | — |
| Prod-dump rehearsal restore misses nutrition tables (`pg_restore` 29 errors) | Nutrition tables (`nutrition_logs`, `custom_dishes`) absent from restored dev DB during rehearsal | Backup lacks schema `private`; include `private` schema in backup dump or pre-create it before restore (DEAD_ENDS #17). |
| M9 rollback down file repopulates `body_part` from `body_parts[1]` | Original free-text formatting in `body_part` is lost if rolled back | Original free-text values retained only in production backup `prod-20260929T012001Z.dump`. |
| ~~CoachCockpit retains duplicate inline template builder (D-P7b-6)~~ **Resolved in P8 (10983ec)**: inline builder retired, CoachCockpit reduced 593 -> 420 LOC, opens `EditTemplateSheet` with `assignToAthleteId`. | — | — |
| `EditTemplateSheet.tsx` at 596 LOC (near 600 LOC budget) | Perf gate failure on next edit | Extract sub-components (e.g. day picker, exercise list item wrappers) if extended in future phases. |
| pgTAP must never assert shared/seeded DB state or literal checksums (two failures in P6: 0190691, 856f4ae) | CI test failure on environment/seed differences | Invariant testing only: assert relative before/after invariants within the test transaction; never hardcode expected checksums from local DB (lesson from P6). |
| NutritionEngine.dateChange / QuickLogToast.integration unit tests time out at ~5.2 s under heavy local load | Low impact; pass alone, CI unaffected | Run tests in isolation if local machine is under heavy concurrency load. |
| ~~CI job duration 31m10s (P8 run 36614078601) against 35m limit~~ **Mitigated in P8.1**: split into 5 parallel jobs (static-unit, 3 E2E shards, density), max job 9m49s (PR #18 CI run 36623184926). | — | — |
| M10 expand-first ordering risk (`users.pr_mode` + RPC signatures) | Deployed client fails if migration applied out of order or if RPC signatures collide | Expand-first order (D-P8.1-11): trailing default parameters keep old client compatible; test deployed frontend (6951924) against M10 DB before production migration. |
| ToastHost replacing undo toasts (D-P8.1-6) | Rapid successive actions could drop pending deletes if replacement simply cancels timers | Strict flush-on-replace semantics: replacing an active undo toast immediately flushes/commits its pending deletion write, exactly matching timer expiry; never drops deletes. |
| SetRow "previous" hint column 58->38px at 320 after 44px reps input (fc7b171) | Low; long hints truncate at 320 | Explicit grid template (fixed set/commit widths) in a follow-up. |
| History `.limit(1000)` exercise reads (`HistoryView.tsx:132`, `useHistoryData.ts:49`) | History exercise catalog queries lack pagination; catalog growth beyond 1000 truncates | Adopt shared `fetchAllVisibleExercises` helper in History queries. |
| `font-extrabold` (800) remaining in history components (`ExerciseStatsList.tsx:263`, `HistoryView.tsx:333`, `WorkoutExerciseHistory.tsx:153`) | Outside grep gate (which checked `font-black`/900); typography inconsistency | Normalize remaining 800-weight tokens in history to `font-bold` (700) or add to ratchet rule. |
| Component LOC near 600 ceiling: `WorkoutEngine.tsx` (589 LOC), `NutritionEngine.tsx` (595 LOC), `EditTemplateSheet.tsx` (594 LOC) | Perf gate fails if future edits add code without extracting sub-components | Extract sub-components/hooks before modifying any of these three surfaces. |
| Production backups lack schema `private` | Dev rehearsal restore misses `nutrition_logs` and `custom_dishes` tables | Update `scripts/prod-db.sh` backup routines to include `--schema=public --schema=auth --schema=private` or full database dump. |

## 9. Change log of this file
| Date | Change |
|---|---|
| 2026-09-26 | Created: standards, decisions RD-1..13 and RP-1..6, phases P0–P8, full item assignment (151), open questions, risks. No implementation started. |
| 2026-09-26 | OQ-1..OQ-6 answered and the K9 reading confirmed (RD-14..RD-20); §7 closed; P2/P5a/P8 scope wording aligned. No implementation started. |
| 2026-09-26 | RD-21: D46 whole-meal Scale chip (replaces the D44 scale bar) and the edit-nutrition unit-caption STD-DAT-3 exception, both shipped on `v2-rewrite`. |
| 2026-09-26 | P0 done (`6bc91c7`); E2E label fix for D46 (`7e7b05b`); baseline updated; two new risks (TZ-unclean full suite, D44 E2E flake); pre-P1 audit partial (blank names = 0). |
| 2026-09-26 | P0 shipped to `v2-rewrite` at `7d907bc` (CI fixes: `test:tz` after Supabase start, Roboto for density, D23 screenshot path). Production audit recorded: every count is 0. |
| 2026-09-26 | §3a execution rules: production-DB hard rules (`scripts/prod-db.sh`: check/audit/backup/migrate/rollback + local rehearsal), flock browser lock (`scripts/with-browser-lock.sh`), anti-stall rules. First verified production backup taken (23:25Z). |
| 2026-09-27 | P1 done and shipped (`cc64455`, PR #7): M1 exercises RLS v2 applied to production with a verified backup; Library hotfixes; D44 density fixture date fixed (was hardcoded 2026-09-26). Three new risks (local test:db CLI, RPC exercise visibility, ExercisesView LOC). |
| 2026-09-27 | P2 done and shipped (`783b6cb`, PR #8): M2 civil dates (RD-5 midnight-UTC rule) + M3 benchmarks in production; data layer, History/Coach consumers; full suite time-zone clean. §3a rule 8 (production-shape audit + checksum for data-changing migrations). RD-15 audit uses the RD-5 rule. |
| 2026-09-27 | P3a done and shipped (`407f94b`, PR #9): shared primitives in `common/`, `EditSetSheet` (deferred delete + `UndoToast`), `ExerciseCard`/`SetRow` 44px hit areas, `check:design` ratchet; no migration. Decisions D-P3a-1 (card title 14px/700) and D-P3a-2 (CI timeout 25m). Two new risks (E2E fresh seed/residue, CI duration). |
| 2026-09-27 | P3b done and shipped (`7597545`, PR #10): session flows (`RemoveExerciseSheet`, Clear/Reload ConfirmDialog, `FinishReviewSheet`, skeletons, empty-state CTAs, URL contracts `?date=`/`?routine=`), header/picker/timer pill 44px + STD-TYP; no migration. Decision D-P3b-1 (timer digits and rest-day title 14px/bold). One new risk (WorkoutEngine / useWorkoutSession LOC near 600). |
| 2026-09-27 | P4 done and shipped (`03de69e`, PR #11): M4 `exercise_catalog` applied to production with verified backup and identical checksum; shared ExercisePicker, `get_routine_catalog` RPC with payload budget projection (D-P4-4), Library/History compat verified. Decisions D-P4-1..4; four new risks (CI-order E2E gate, Library insertCustomExercise, REST fallback removal, NULL master equipment). |
| 2026-09-27 | P5a done and shipped (`8bb06cb`, PR #12): M5 `history_rpcs_v2` applied to production with verified backup, identical sets checksum, and zero post invariants; History keyset pagination (`get_history_sessions_v2`), `<Activity>` keep-alive in shell (D-P5a-6), session ⋯ menu (Edit in Workout / Delete confirm), measured virtualization DOM caps (D-P5a-8). Decisions D-P5a-1..8; Tokyo-midnight tz flake resolved, new History keyset and nutrition-flow flake risks noted. |
| 2026-09-28 | P5b done and shipped (`22f6b8b`, PR #13, CI green run 36365773679 22m28s attempt 1): History exercise sheet (`ExerciseHistorySheet`, `ExerciseSparkline`, `ExerciseStatsList`), calendar jump (`HistoryCalendarSheet`), client-side session filter (`useHistorySessionFilter`), nutrition 14-day window infinite query + meal deferred delete (`useHistoryMealDeferredDelete` + `UndoToast`), HistoryView modularized (`HistoryHeader`, `HistoryToolbar`, `useHistoryCalendarJump`, `useHistorySessionSets`); no migration (uses M5); items H8, H11, H21, H23, H24, H27, H29, H35, H36, H37, H41, H42, H43, H46, H47, H49, H51; Decisions D-P5b-1..10; local gate 147 files / 1702 tests, E2E 118p/0f/6s, full CI-order E2E 184p/1f/12s with Narrow Safari p3a-set-edit race fixed test-only in `22f6b8b` (27/27); CI duration (22m28s) and NutritionEngine/QuickLogToast local timeout risks noted; next phase P6 (M6 `users_weight_unit`). |
| 2026-09-28 | P6 done and shipped (`856f4ae`, PR #14, CI green run 36378178645 23m23s attempt 2 after data-dependent pgTAP fix in `856f4ae`): M6 `users_weight_unit` applied to production with verified backup and identical sets checksum; cross-tab weight units (kg/lb) in Workout, History, Coach timeline, Settings (`WeightUnitCard`), data export; items W49, H48; Decisions D-P6-1..8; local gate 151 files / 1749 tests, pgTAP 11/237, density 95 ×2, E2E set 130p/0f/6s, full CI-order E2E 204p/0f/12s; CI duration (23m23s) and pgTAP seed-independence lesson noted; next phase P7a (Library). |
| 2026-09-28 | P7a done and shipped (`8782215`, PR #15, CI green run 36478499542 26m52s attempt 2 after unmount timer fix in `8782215`): Library exercises list; `ExercisesView` split into modular components (`ExerciseListTab`, `ExerciseListRow`, `CreateExerciseSheet`, `TemplateListTab`, `EditExerciseSheet`); RD-7 deferred archive and template delete with `UndoToast`; coach hide ConfirmDialog with athlete count; scope chips (All/Defaults/Mine/Athlete/From coach/Archived/Hidden) and owner pills; infinite catalog with "Showing N of M"; duplicate check on create/edit; "Start routine" deep link; WebKit history de-flake; items L4, L8, L10, L11, L13, L14, L15, L18, L19, L20, L21, L23, L24, L25, L30, L32, L34, L35, L46, L47, L48; Decisions D-P7a-1..6; local gate 155 files / 1797 tests, pgTAP 11/237, density 98 ×2, E2E set 116p/0f/6s, full CI-order E2E 237p/0f/12s; CI duration (~27 min vs 35m limit) and P7b leftovers noted; next phase P7b (Library template builder). |
| 2026-09-29 | P7b done and shipped (`befe8db`, PR #16, CI green run 36504646894 29m46s attempt 2 after density weekday Lat Pull Down fix in `befe8db`): M7 `exercise_name_guard`, M8 `default_catalog_seed`, and M9 `drop_body_part` applied to production with verified backups and identical checksums; M8 backfilled 14 NULL-equipment masters, masters 23->208, exercises 25->210; shared `EditTemplateSheet` (596 LOC), `TemplateExerciseItem` (44px hit areas, stepper clamp), single `save_routine_template` in Coach (no orphan), Library routines via `get_routine_catalog`, full codebase migration to `body_parts`; items L9, L13, L15, L16, L17, L27, L28, L29, L33, L35, L36, L37, L38, L40, L42, L43, L44, L48; Decisions D-P7b-1..6; local gate 155 files / 1822 tests, pgTAP 15/269 (M1-M9 applied), density 101 ×2, E2E set 134p/0f/6s, full CI-order E2E 264p/0f/12s; deployed-frontend parity 0 class-B; new risks noted; next phase P8 (Shell, Coach, Settings + Nutrition standards sweep). |
| 2026-09-29 | P8 done and shipped (`fc7b171`, PR #17): Shell (L41, RD-12 BottomNav 12px), Coach (C1–C30, inline builder retired), Settings (S1–S29), Nutrition standards sweep (RD-7 deferred delete, skeletons, 44px hit areas H25/H39), zero grep gate across src, production UUID catalog-tail bug fix (10 affected exercises post-M8); Decisions D-P8-1..9; local gate 155 files / 1858 tests, pgTAP 15/269, density 120 ×2, E2E set 148p/0f/6s, full CI-order E2E 270p/0f/12s; all redesign phases P0–P8 complete. |
| 2026-09-29 | P8.1 audit recorded: scope (0 CI split, T0 tip CI fix, N1 notification standard, N2 PR mode, F follow-ups), decisions D-P8.1-1..13, M10 expand-only migration planned, four audit finding tables (CI, N1..N16, PR1..PR12, F1..F7), §8 risks updated; implementation in progress. |
| 2026-09-30 | P8.1 done and shipped (`60d6f76`, PR #18): CI split into 5 parallel jobs (max job 9m49s, PR #18 CI run `36662148207`); T0 tip CI race fix; N1 notification standardization (STD-FB-1, app-shell ToastHost, stray box bug eliminated, adhoc-success ratchet 0); N2 PR mode setting (users.pr_mode 'weight'|'e1rm', Epley formula, shared prComparator); F follow-ups (SetRow grid at 320, History paged reads, font-extrabold ratchet 0, backup includes schema private, M9 rollback lossiness documented, component LOC < 550); M10 expand-only migration applied to production (backup `prod-20260930T030751Z.dump`, pre/post users checksum `3687539908ad7f13a4e64fd7bbf39396`, sets checksum `354e25beece94a97878b794a6136aa10`); Decisions D-P8.1-1..13; deployed frontend compat verified 270p/0f/12s; Deployed: Preview id=`6750406493`, Production id=`6750556265`. All phases P0–P8.1 shipped. |
| 2026-10-01 | Phase O1 (Offline foundation + workout) done and shipped (branch `offline-o1`, code @ `e2e1c1b`, ff-merged to v2-rewrite via its PR): shared web offline architecture for installable PWA and Capacitor Android (D-OFF-1); service worker app shell precache with background update safety blockers (`UpdateBanner`, `updateSafety`); durable per-user IndexedDB outbox (`cybergym-offline-<userId>`) with monotonic enqueue mutex, idempotent replay (`ON CONFLICT DO NOTHING`), and sequential flush under Web Locks (D-OFF-3); workout writes route via outbox (`workout.ensure`, `workout.rename`, `set.create`, `set.batchCreate`, `set.update`, `set.delete`) with client UUIDs; pure optimistic UI overlays (`applyPendingToDaySets`, `pendingSetsBefore`, `applyPendingToHistory`) for sets, ghost values, PR mode chips, and History (D-OFF-2); Header connection badges ("Offline · N pending", "Syncing · N", "N need attention"), pending marks on uncommitted sets, and "Synced N changes" toast (D-OFF-4); out-of-scope actions disabled offline ("Available when online"); cross-tab outbox sync via BroadcastChannel and per-user localStorage pending count; TanStack Query configured with `mutations: { networkMode: 'always' }` and offline `retry: false`; no production test globals; no database migrations (D-OFF-11); verified packages added (`vite-plugin-pwa`, `workbox-build`, `workbox-window`, `idb`, `@tanstack/react-query-persist-client`, `fake-indexeddb`); Decisions D-O0-1, D-O1-1..5 (D-O1-1 approved, D-O1-3 accepted by user); production PWA Playwright E2E harness (`tests/e2e-pwa/`) and 320px visual density tests added. GATEFIX5b (`e2e1c1b`) removes intermittent vitest teardown unhandled rejections by absorbing only exact closed-IndexedDB errors in background read-cache paths (outbox enqueue still surfaces every error, D-OFF-3); /workout first paint stays at base (263,039 B / 10 queries). Local gate CI-order contention failures (mobile-viewport:152, workout-catalog-tail:62, p5a-history:150; shared seeded users across parallel projects) accepted by user (G7/G10); GitHub CI runs one project per job. |
| 2026-10-01 | Phase O2 (Nutrition offline) done (branch `offline-o2`, code @ 684a42f, shipped 9c3bfce, PR #21): nutrition offline logging across web PWA and Capacitor Android (D-OFF-5); `nutrition.log` outbox op with client UUID, idempotent replay (`ON CONFLICT DO NOTHING`), explicit capture instant (`logged_at`) and civil date (`logged_date`) in user timezone, and single-increment `custom_dishes.use_count` on initial insert (D-O2-1); IndexedDB upgraded to `DB_VERSION = 2` adding `aiq` store while preserving existing stores; AI queue processor with lock `cybergym-aiq-<userId>`, >=5s spacing (<=12 RPM), 429 Retry-After handling without attempt burn, exponential backoff (30s..30min) on network/5xx, validation failure handling, and atomic photo deletion upon analysis completion (D-OFF-7); strict local nutrition block parser (`src/lib/nutrition/localParse.ts`) for paste-to-fill (D-OFF-6) rejecting multi-food, prose, and macro/kcal discrepancies (>max(60, 25%)), displaying "Parsed locally" badge and offering online "Analyze with AI instead"; conversational/mixed inputs route verbatim to AI online and queue offline; `PendingReviewList` on Nutrition tab for queued/ready/failed AI items, staging on review with original capture timestamps across timezones (LA and Tokyo), logging only on confirm (D-O2-2); TanStack Query persister whitelists `custom_dishes` and bounded `nutrition_logs` day keys [today-7, today+1] cap 10 plus `history_window`; pending meals overlaid in day timeline and History with `PendingMark`; offline guards on meal edit/delete/scale and custom dish CRUD ("Available when online"); no new npm packages; no database migrations (D-OFF-11); W10 test-only isolation (G11) gives `workout-catalog-tail`, `p5a-history`, and `mobile-viewport:152` dedicated seeded users; nutrition-flow:709/842 clears persisted dish cache before route mocks; test-detection branches removed from nutrition code; 7 new PWA E2E acceptance tests (`tests/e2e-pwa/nutrition-offline.spec.ts`), 320px density tests for Pending review and Parsed locally badge. |

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
> **Owner of this file:** whoever runs the current phase. Update the phase table, the item table and the decision log in the same commit as the work.

## 1. Status summary
| Phase | Title | Status | Progress notes |
|---|---|---|---|
| P0 | Foundations and test guardrails | **done** 2026-09-26 | `6bc91c7` (+ `7e7b05b` E2E label fix for D46). Gates: tsc 0, oxlint 0e/33w, vitest 98/1349, test:tz LA 141 + Tokyo 141, check:mocks/payload, build, perf, density 67/67 ×2, E2E trio 36/0/6. No DOM change. |
| P1 | Safety hotfixes + exercises RLS v2 | not started | |
| P2 | Workout data layer and cross-tab data contracts | not started | |
| P3a | Shared primitives, exercise card, set rows, EditSetSheet | not started | |
| P3b | Workout session flows, header, rest day, routine picker | not started | |
| P4 | Exercise catalog + shared ExercisePicker | not started | |
| P5a | History data, shell and session list | not started | |
| P5b | History exercise sheet, trends, calendar, nutrition timeline | not started | |
| P6 | kg/lb units across tabs | not started | |
| P7a | Library exercises list | not started | |
| P7b | Library template builder, coach builder, catalog content | not started | |
| P8 | Shell, Coach, Settings + Nutrition standards sweep | not started | |

Planning status: **plan drafted 2026-09-26; all open questions answered (RD-14..RD-20); no implementation started.**

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

### P8: Shell, Coach, Settings + Nutrition standards sweep
- **Scope:**
  - L41 (coach nav entry), H25, H39, W44 (final no-`window.confirm` gate across `src/`)
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
| `tests/visual-density.test.ts`, `tests/e2e/mobile-viewport.spec.ts` | append-only (RP-2) | all |

Migration order: M1 (P1) → M2, M3 (P2) → M4 (P4) → M5 (P5a) → M6 (P6) → M7, M8, M9 (P7b).

---

## 6. Audit item assignment
Primary phase first; `+` = also touched later (a split noted in the phase scope). N/A = obsolete; Deferred = see reason.

### Workout (W1–W50)
| ID | Phase | ID | Phase | ID | Phase | ID | Phase | ID | Phase |
|---|---|---|---|---|---|---|---|---|---|
| W1 | P2 | W11 | P2 | W21 | P3b | W31 | P2 | W41 | P2 |
| W2 | P2 | W12 | P4 | W22 | P4 | W32 | P3a | W42 | P2 |
| W3 | P3a | W13 | P3a | W23 | P3b | W33 | P3a +P3b | W43 | Deferred |
| W4 | P2 | W14 | P4 | W24 | P2 | W34 | P3b | W44 | P3a +P3b +P8 |
| W5 | P2 | W15 | P3a | W25 | P3b | W35 | P2 | W45 | Deferred |
| W6 | P2 | W16 | P2 +P4 | W26 | P3a | W36 | P3a +P3b | W46 | P2 |
| W7 | P2 +P3a | W17 | P3a | W27 | P4 | W37 | P2 +P3a | W47 | P3a |
| W8 | P3b | W18 | P3b | W28 | P3a +P3b | W38 | P0 +P3a +P3b | W48 | P3a |
| W9 | P3b | W19 | P2 +P3a | W29 | P3b | W39 | P2 | W49 | P6 |
| W10 | P3b | W20 | P2 | W30 | P3b | W40 | P2 | W50 | P1 +P2 |

### Library (L1–L48)
| ID | Phase | ID | Phase | ID | Phase | ID | Phase | ID | Phase |
|---|---|---|---|---|---|---|---|---|---|
| L1 | P1 | L11 | P7a +P2 | L21 | P7a | L31 | Deferred | L41 | P8 |
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
| H3 | P5a | H14 | P5a | H25 | P8 | H36 | P3a +P5b | H47 | P2 +P5b |
| H4 | P2 | H15 | P2 | H26 | P5a | H37 | P5b | H48 | P6 |
| H5 | P5a | H16 | P2 | H27 | P5b | H38 | P5a | H49 | P5b |
| H6 | P5a | H17 | P3a | H28 | P0 | H39 | P8 | H50 | P5a |
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

**Pre-P1 data audit (production, read-only, run by the user in the Supabase SQL editor, 2026-09-26):** blank/whitespace exercise names = **0**. The remaining counts (RD-15 duplicate days, RD-16 warm-up/drop sets, W50a/b) are pending: one-result query in the planning conversation `scratch/p0_counts_one.sql`. The agent has no production DB credentials (anon key only).

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
| Full vitest suite is not time-zone clean (found in P0): under `TZ=America/Los_Angeles` 1 test fails, under `Asia/Tokyo` 6 fail (NutritionEngine.test, HistoryView.test, useCustomDishActions.test). `test:tz` covers the 7 date suites, which pass. | Hidden day-boundary bugs, or tests that assume UTC | Triage in P2 (date contract): fix the test or the product per case, then widen `test:tz` to the full suite. |
| D44 edit-meal E2E flaked once in the History half (Save stayed disabled after a name change; 6/6 passes on repeat, on both base and P0) | CI noise | Watch; if it recurs, check the edit sheet's async draft reload overwriting typed input. |

## 9. Change log of this file
| Date | Change |
|---|---|
| 2026-09-26 | Created: standards, decisions RD-1..13 and RP-1..6, phases P0–P8, full item assignment (151), open questions, risks. No implementation started. |
| 2026-09-26 | OQ-1..OQ-6 answered and the K9 reading confirmed (RD-14..RD-20); §7 closed; P2/P5a/P8 scope wording aligned. No implementation started. |
| 2026-09-26 | RD-21: D46 whole-meal Scale chip (replaces the D44 scale bar) and the edit-nutrition unit-caption STD-DAT-3 exception, both shipped on `v2-rewrite`. |
| 2026-09-26 | P0 done (`6bc91c7`); E2E label fix for D46 (`7e7b05b`); baseline updated; two new risks (TZ-unclean full suite, D44 E2E flake); pre-P1 audit partial (blank names = 0). |

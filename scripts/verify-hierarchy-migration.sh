#!/usr/bin/env bash
# =============================================================================
# Nutrition hierarchy — migration verification protocol (plan §12, Phase 3)
# -----------------------------------------------------------------------------
# Restores the Phase 0 production snapshot into a scratch database on the LOCAL
# Postgres container, applies the migrations, and asserts every acceptance
# oracle in the plan. Nothing here touches the remote project, and nothing here
# touches the `postgres` database that the local Supabase stack serves.
#
# Usage:  scripts/verify-hierarchy-migration.sh [snapshot-timestamp]
# Default snapshot: the newest snapshots/*-pre-hierarchy.sql
#
# Exit code 0 means every oracle held.
# =============================================================================
set -euo pipefail

CONTAINER=supabase_db_fitness-tracking
SCRATCH=scratch_hier
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SNAP_DATA=$(ls -1 snapshots/*-pre-hierarchy.sql 2>/dev/null | sort | tail -1)
SNAP_SCHEMA=$(ls -1 snapshots/*-pre-hierarchy-schema.sql 2>/dev/null | sort | tail -1)
FULL_SCHEMA=${FULL_SCHEMA:-$(ls -1 snapshots/*-pre-hierarchy-fullschema.sql 2>/dev/null | sort | tail -1)}
ORACLE=$(ls -1 snapshots/*-integrity-oracle.txt 2>/dev/null | sort | tail -1)

if [[ -z "$SNAP_DATA" || -z "$ORACLE" ]]; then
  echo "FATAL: no Phase 0 snapshot found under snapshots/. Run the Phase 0 dump first." >&2
  exit 1
fi

PHASE2=supabase/migrations/20260913160000_nutrition_items_hierarchy.sql
PHASE5=supabase/migrations/20260913170000_nutrition_items_integrity.sql
DOWN2=supabase/rollback/20260913160000_down.sql
DOWN5=supabase/rollback/20260913170000_down.sql

fails=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fails=$((fails+1)); }
psql_scratch() { docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -v ON_ERROR_STOP=1 -q "$@"; }
q()            { docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -At -q -c "$1"; }

echo "snapshot data   : $SNAP_DATA"
echo "snapshot schema : ${SNAP_SCHEMA:-<none>}"
echo "integrity oracle: $ORACLE"
echo

# --- Step 1: restore the snapshot into a scratch database ---------------------
echo "[1] restore snapshot -> $SCRATCH"
docker exec -i "$CONTAINER" psql -U postgres -d postgres -q \
  -c "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE);" \
  -c "CREATE DATABASE $SCRATCH;" >/dev/null
# The pre-hierarchy structure. A full-cluster schema dump is used rather than a
# public-only one so that auth.users, the RLS helper functions and the FK
# targets all exist; the data dump sets session_replication_role = replica, so
# FK order does not matter.
docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -q < "$FULL_SCHEMA" >/dev/null 2>&1 || true
docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -q -v ON_ERROR_STOP=1 < "$SNAP_DATA" >/dev/null

counts_before=$(q "select count(*) from public.users; " )
u=$(q "select count(*) from public.users;")
d=$(q "select count(*) from public.custom_dishes;")
l=$(q "select count(*) from public.nutrition_logs;")
[[ "$u/$d/$l" == "3/7/98" ]] && pass "restored row counts 3/7/98" || fail "restored row counts $u/$d/$l (expected 3/7/98)"

# The snapshot must not already carry the feature, or we are verifying nothing.
pre_items=$(q "select count(*) from information_schema.columns where table_schema='public' and table_name in ('nutrition_logs','custom_dishes') and column_name='items';")
[[ "$pre_items" == "0" ]] && pass "scratch starts without an items column" || fail "scratch already has $pre_items items columns"

# --- Step 2: apply Phase 2 ----------------------------------------------------
echo "[2] apply Phase 2"
psql_scratch < "$PHASE2" >/dev/null
backfilled=$(q "select count(*) from public.custom_dishes where items is not null;")
[[ "$backfilled" == "6" ]] && pass "backfilled 6 of 7 dishes (Keto Bar has ingredients IS NULL)" \
                           || fail "backfilled $backfilled dishes, expected 6"

shape=$(q "select string_agg(name || '=' || coalesce(jsonb_array_length(items)::text,'NULL'), ', ' order by name) from public.custom_dishes;")
expected_shape='Beef Pho Broth with Protein=1, Berry Cherry Smoothie=7, Chicken Broth with White Meat Chicken=1, Dried Pho Noodles=1, Google Breakkie=8, Keto Bar=NULL, Poached Egg=1'
[[ "$shape" == "$expected_shape" ]] && pass "per-dish item counts 1/7/1/1/8/NULL/1" || fail "item counts: $shape"

nl_items=$(q "select count(*) from public.nutrition_logs where items is not null;")
[[ "$nl_items" == "0" ]] && pass "nutrition_logs got no backfill (all 98 rows are leaves)" \
                         || fail "$nl_items nutrition_logs rows have items"

# --- Step 3: the drift report is the acceptance oracle ------------------------
echo "[3] drift report"
drift=$(q "
  select name
       || ' | dcal '  || (coalesce(calories,0) - private.items_macro_sum(items,'calories'))
       || ' | dpro '  || (coalesce(protein,0)  - private.items_macro_sum(items,'protein'))
       || ' | dcar '  || (coalesce(carbs,0)    - private.items_macro_sum(items,'carbs'))
       || ' | dfat '  || (coalesce(fat,0)      - private.items_macro_sum(items,'fat'))
       || ' | dfib '  || (coalesce(fiber,0)    - private.items_macro_sum(items,'fiber'))
    from public.custom_dishes
   where items is not null
     and (coalesce(calories,0) <> private.items_macro_sum(items,'calories')
       or coalesce(protein,0)  <> private.items_macro_sum(items,'protein')
       or coalesce(carbs,0)    <> private.items_macro_sum(items,'carbs')
       or coalesce(fat,0)      <> private.items_macro_sum(items,'fat')
       or coalesce(fiber,0)    <> private.items_macro_sum(items,'fiber'))
   order by name;")
drift_rows=$(printf '%s' "$drift" | grep -c . || true)
echo "      $drift"
# The oracle: exactly one row, Berry Cherry Smoothie, fiber short by 0.5,
# every other macro bit-exact. Any other row is a bug.
expected_drift='Berry Cherry Smoothie | dcal 0 | dpro 0.0 | dcar 0.0 | dfat 0.0 | dfib -0.5'
if [[ "$drift_rows" == "1" && "$drift" == "$expected_drift" ]]; then
  pass "drift report returns exactly one row: Berry Cherry Smoothie, fiber -0.5"
else
  fail "drift report returned $drift_rows row(s): $drift"
fi

# --- Step 3b: SQL <-> TS converter parity ------------------------------------
echo "[3b] portion converter parity"
if parity=$(bash scripts/check-portion-parity.sh "$SCRATCH" 2>&1); then
  pass "${parity#PASS  }"
else
  fail "$parity"
fi

# --- Step 4: idempotence ------------------------------------------------------
echo "[4] re-apply Phase 2 (idempotence)"
sum_before=$(q "select md5(string_agg(id::text || coalesce(items::text,''), '|' order by id)) from public.custom_dishes;")
psql_scratch < "$PHASE2" >/dev/null
sum_after=$(q "select md5(string_agg(id::text || coalesce(items::text,''), '|' order by id)) from public.custom_dishes;")
[[ "$sum_before" == "$sum_after" ]] && pass "second pass changed 0 rows" || fail "second pass changed rows"

# --- Step 5: md5(ingredients) oracle -----------------------------------------
echo "[5] md5(ingredients) oracle"
actual_oracle=$(q "select name || '|' || coalesce(md5(ingredients),'NULL') from public.custom_dishes order by name;")
expected_oracle=$(grep -v '^\(users\|custom_dishes\|nutrition_logs\)|' "$ORACLE")
if [[ "$actual_oracle" == "$expected_oracle" ]]; then
  pass "md5(ingredients) byte-identical for all 7 dishes"
else
  fail "md5(ingredients) drifted"
  diff <(echo "$expected_oracle") <(echo "$actual_oracle") || true
fi

# --- Step 6: row counts unchanged --------------------------------------------
u=$(q "select count(*) from public.users;")
d=$(q "select count(*) from public.custom_dishes;")
l=$(q "select count(*) from public.nutrition_logs;")
[[ "$u/$d/$l" == "3/7/98" ]] && pass "row counts still 3/7/98" || fail "row counts $u/$d/$l"

# --- Step 12 (run before Phase 5 proper): VALIDATE dry-run --------------------
# Sigma constraint added WITHOUT the D-3 correction must fail on custom_dishes
# and succeed on nutrition_logs. If custom_dishes validates here, the backfill
# did not populate items and something is wrong.
echo "[12] Phase 5 VALIDATE dry-run (pre-D-3)"
nl_validate=$(docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -At -q <<'SQL' 2>&1 || true
BEGIN;
ALTER TABLE public.nutrition_logs ADD CONSTRAINT tmp_nl_sum CHECK (
  items IS NULL OR (jsonb_typeof(items) = 'array'
    AND abs(calories - private.items_macro_sum(items,'calories')) <= 0.05 * jsonb_array_length(items))
) NOT VALID;
ALTER TABLE public.nutrition_logs VALIDATE CONSTRAINT tmp_nl_sum;
SELECT 'NL_VALIDATE_OK';
ROLLBACK;
SQL
)
grep -q 'NL_VALIDATE_OK' <<<"$nl_validate" && pass "VALIDATE succeeds on nutrition_logs (trivially: all rows items IS NULL)" \
                                           || fail "VALIDATE on nutrition_logs failed: $nl_validate"

cd_validate=$(docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -At -q <<'SQL' 2>&1 || true
BEGIN;
ALTER TABLE public.custom_dishes ADD CONSTRAINT tmp_cd_sum CHECK (
  items IS NULL OR (jsonb_typeof(items) = 'array'
    AND abs(COALESCE(fiber,0) - private.items_macro_sum(items,'fiber')) <= 0.05 * jsonb_array_length(items))
) NOT VALID;
ALTER TABLE public.custom_dishes VALIDATE CONSTRAINT tmp_cd_sum;
SELECT 'CD_VALIDATE_OK';
ROLLBACK;
SQL
)
if grep -q 'is violated by some row' <<<"$cd_validate"; then
  pass "VALIDATE fails on custom_dishes before the D-3 correction (as required)"
else
  fail "VALIDATE on custom_dishes did NOT fail pre-D-3 — backfill suspect: $cd_validate"
fi

# --- Apply Phase 5 ------------------------------------------------------------
echo "[5p] apply Phase 5"
p5out=$(docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -v ON_ERROR_STOP=1 -q < "$PHASE5" 2>&1)
echo "$p5out" | grep -i 'D-3 reconcile' || true
berry=$(q "select fiber from public.custom_dishes where name = 'Berry Cherry Smoothie';")
[[ "$berry" == "12.4" ]] && pass "D-3 applied: Berry Cherry Smoothie fiber 11.9 -> 12.4" || fail "Berry fiber is $berry, expected 12.4"

validated=$(q "select count(*) from pg_constraint where conname in ('chk_nl_parent_equals_items_sum','chk_cd_parent_equals_items_sum') and convalidated;")
[[ "$validated" == "2" ]] && pass "both Sigma constraints exist and are convalidated" || fail "only $validated Sigma constraints validated"

nonneg=$(q "select count(*) from pg_constraint where conrelid='public.custom_dishes'::regclass and conname like 'chk_cd_%_non_negative';")
[[ "$nonneg" == "5" ]] && pass "five non-negative constraints on custom_dishes" || fail "$nonneg non-negative constraints"

# Phase 5 idempotence.
docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -v ON_ERROR_STOP=1 -q < "$PHASE5" >/dev/null
pass "Phase 5 re-applies cleanly"

# --- Behavioural probes on the constraints -----------------------------------
echo "[b] constraint behaviour"
probe() {  # probe <label> <sql> <expect: OK|REJECT>
  local label="$1" sql="$2" expect="$3" out
  out=$(docker exec -i "$CONTAINER" psql -U postgres -d "$SCRATCH" -At -q -c "BEGIN; $sql; ROLLBACK;" 2>&1 || true)
  if [[ "$expect" == OK ]]; then
    grep -qi 'ERROR' <<<"$out" && fail "$label (expected accept): $out" || pass "$label accepted"
  else
    if grep -qi 'violates check constraint' <<<"$out"; then pass "$label rejected cleanly"
    elif grep -qi 'ERROR' <<<"$out"; then fail "$label rejected with a NON-constraint error: $out"
    else fail "$label was ACCEPTED but should have been rejected"; fi
  fi
}
NLU="'2d444ce2-c0cf-483f-a82e-43c8fb9807b1'"
ins() { echo "INSERT INTO public.nutrition_logs (user_id, food_name, calories, protein, carbs, fat, fiber, logged_at, items) VALUES ($NLU, 'probe', $1, $2, $3, $4, $5, now(), $6)"; }

probe "items IS NULL (leaf log)"            "$(ins 100 1 1 1 1 NULL)" OK
probe "parent == SUM(items)"                "$(ins 30 0 0 0 0 "'[{\"calories\":10},{\"calories\":20}]'")" OK
probe "rounding dust inside epsilon"        "$(ins 30.08 0 0 0 0 "'[{\"calories\":10},{\"calories\":20}]'")" OK
probe "stale parent (the R-04 hazard)"      "$(ins 999 0 0 0 0 "'[{\"calories\":10},{\"calories\":20}]'")" REJECT
probe "1 item, 0.3 kcal drift"              "$(ins 10.3 0 0 0 0 "'[{\"calories\":10}]'")" REJECT
probe "empty array with zero parent"        "$(ins 0 0 0 0 0 "'[]'")" REJECT
probe "51 items (ceiling)"                  "$(ins 51 0 0 0 0 "(select jsonb_agg(jsonb_build_object('calories',1)) from generate_series(1,51))")" REJECT
probe "object instead of array"             "$(ins 0 0 0 0 0 "'{\"a\":1}'")" REJECT
probe "per-item negative macro"             "$(ins 0 0 0 0 0 "'[{\"calories\":-10},{\"calories\":10}]'")" REJECT
probe "non-numeric macro inside an item"    "$(ins 0 0 0 0 0 "'[{\"calories\":\"lots\"}]'")" OK
probe "item missing a macro key"            "$(ins 10 0 0 0 0 "'[{\"calories\":10}]'")" OK
probe "negative custom_dishes calories"     "INSERT INTO public.custom_dishes (user_id, name, calories) VALUES ($NLU, 'probe', -50)" REJECT

# The revoke trap: authenticated must still be able to write.
acl=$(q "select has_function_privilege('authenticated','private.items_macro_sum(jsonb,text)','EXECUTE');")
[[ "$acl" == "t" ]] && pass "authenticated still has EXECUTE on private.items_macro_sum (do not revoke)" \
                    || fail "authenticated lost EXECUTE — every write to these tables will fail"

# --- Step 7: rollback -> re-apply --------------------------------------------
echo "[7] rollback -> re-apply"
psql_scratch < "$DOWN5" >/dev/null
psql_scratch < "$DOWN2" >/dev/null
post_items=$(q "select count(*) from information_schema.columns where table_schema='public' and table_name in ('nutrition_logs','custom_dishes') and column_name='items';")
post_priv=$(q "select count(*) from information_schema.schemata where schema_name='private';")
post_cons=$(q "select count(*) from pg_constraint where conname like 'chk_%items%' or conname like 'chk_cd_%_non_negative';")
[[ "$post_items" == "0" && "$post_priv" == "0" && "$post_cons" == "0" ]] \
  && pass "rollback removed both columns, all constraints and the private schema" \
  || fail "rollback residue: items=$post_items private=$post_priv constraints=$post_cons"

md5_after_rollback=$(q "select md5(string_agg(name || coalesce(md5(ingredients),'NULL'), '|' order by name)) from public.custom_dishes;")
psql_scratch < "$PHASE2" >/dev/null
psql_scratch < "$PHASE5" >/dev/null
md5_after_reapply=$(q "select md5(string_agg(name || coalesce(md5(ingredients),'NULL'), '|' order by name)) from public.custom_dishes;")
[[ "$md5_after_rollback" == "$md5_after_reapply" ]] && pass "re-apply after rollback is identical" || fail "re-apply differed"

reapply_shape=$(q "select string_agg(name || '=' || coalesce(jsonb_array_length(items)::text,'NULL'), ', ' order by name) from public.custom_dishes;")
[[ "$reapply_shape" == "$expected_shape" ]] && pass "item counts identical after rollback + re-apply" || fail "re-apply shape: $reapply_shape"

echo
if [[ "$fails" == "0" ]]; then
  echo "ALL ORACLES HELD"
  exit 0
fi
echo "$fails FAILURE(S)"
exit 1

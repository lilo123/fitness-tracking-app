#!/usr/bin/env bash
# ==============================================================================
# CyberGym Tier 3: Evidence Collector (RFIX-24 / P3-2)
#
# Runs every verification gate, tees raw stdout and stderr to docs/evidence/<gate>.txt,
# captures exact exit codes, and writes docs/evidence/manifest.json.
#
# Crucial requirement: Must NOT abort on failing gates (e.g. verify-perf-budget).
# All exit codes are faithfully recorded.
# ==============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EVIDENCE_DIR="$REPO_ROOT/docs/evidence"
mkdir -p "$EVIDENCE_DIR"

export PATH="/usr/local/google/home/duynguyenn/.nvm/versions/node/v22.22.2/bin:$HOME/.deno/bin:$PATH"

if [[ -f .env.local ]]; then
  set -a
  source <(grep -v '^#' .env.local | sed -e 's/\r$//')
  set +a
fi

GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo 'UNKNOWN')"
GIT_DIRTY=false
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  GIT_DIRTY=true
fi

echo "=============================================================================="
echo "CyberGym Evidence Collector"
echo "Commit: $GIT_COMMIT (dirty: $GIT_DIRTY)"
echo "Output Directory: $EVIDENCE_DIR"
echo "=============================================================================="

RESULTS_JSON_TMP="$HOME/tmp/collector_results_$$.json"
mkdir -p "$HOME/tmp"
echo "[]" > "$RESULTS_JSON_TMP"

record_gate() {
  local gate_id="$1"
  local output_file="$2"
  local cmd="$3"
  local exit_code="$4"
  local target_path="$EVIDENCE_DIR/$output_file"

  local sha256=""
  if [[ -f "$target_path" ]]; then
    sha256="$(sha256sum "$target_path" | awk '{print $1}')"
  fi

  node -e '
    const fs = require("fs");
    const tmpFile = process.argv[1];
    const item = {
      gateId: process.argv[2],
      outputFile: process.argv[3],
      command: process.argv[4],
      exitCode: parseInt(process.argv[5], 10),
      sha256: process.argv[6],
      timestamp: new Date().toISOString()
    };
    const current = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    current.push(item);
    fs.writeFileSync(tmpFile, JSON.stringify(current, null, 2), "utf8");
  ' "$RESULTS_JSON_TMP" "$gate_id" "$output_file" "$cmd" "$exit_code" "$sha256"

  echo "  -> Saved $output_file (exit: $exit_code, sha256: ${sha256:0:12}...)"
}

# 1. TypeScript Check (tsc)
echo "[1/13] Running TypeScript Compiler (npx tsc -b --force)..."
CMD_TSC="npx tsc -b --force"
$CMD_TSC > "$EVIDENCE_DIR/tsc.txt" 2>&1
RC_TSC=$?
record_gate "tsc" "tsc.txt" "$CMD_TSC" "$RC_TSC"

# 2. Linter (oxlint)
echo "[2/13] Running Linter (npm run lint)..."
CMD_LINT="npm run lint"
$CMD_LINT > "$EVIDENCE_DIR/lint.txt" 2>&1
RC_LINT=$?
record_gate "lint" "lint.txt" "$CMD_LINT" "$RC_LINT"

# 3. Unit Tests (vitest)
echo "[3/13] Running Vitest (npx vitest run)..."
CMD_VITEST="npx vitest run"
$CMD_VITEST > "$EVIDENCE_DIR/vitest.txt" 2>&1
RC_VITEST=$?
record_gate "vitest" "vitest.txt" "$CMD_VITEST" "$RC_VITEST"

# 4. Check Query Bounds
echo "[4/13] Running Check Query Bounds..."
CMD_BOUNDS="node scripts/check-query-bounds.js"
$CMD_BOUNDS > "$EVIDENCE_DIR/check-query-bounds.txt" 2>&1
RC_BOUNDS=$?
record_gate "check-query-bounds" "check-query-bounds.txt" "$CMD_BOUNDS" "$RC_BOUNDS"

# 5. Check Cache Collisions
echo "[5/13] Running Check Cache Collisions..."
CMD_CACHE="node scripts/check-cache-collisions.js"
$CMD_CACHE > "$EVIDENCE_DIR/check-cache-collisions.txt" 2>&1
RC_CACHE=$?
record_gate "check-cache-collisions" "check-cache-collisions.txt" "$CMD_CACHE" "$RC_CACHE"

# 6. Check Mock Fidelity
echo "[6/13] Running Check Mock Fidelity..."
CMD_FIDELITY="node scripts/check-mock-fidelity.js"
$CMD_FIDELITY > "$EVIDENCE_DIR/check-mock-fidelity.txt" 2>&1
RC_FIDELITY=$?
record_gate "check-mock-fidelity" "check-mock-fidelity.txt" "$CMD_FIDELITY" "$RC_FIDELITY"

# 7. Check Payload Projections
echo "[7/13] Running Check Payload Projections..."
CMD_PROJECTIONS="node scripts/check-payload-projections.js"
$CMD_PROJECTIONS > "$EVIDENCE_DIR/check-payload-projections.txt" 2>&1
RC_PROJECTIONS=$?
record_gate "check-payload-projections" "check-payload-projections.txt" "$CMD_PROJECTIONS" "$RC_PROJECTIONS"

# 8. Check Content Security Policy (CSP)
echo "[8/13] Running Check CSP..."
CMD_CSP="node scripts/check-csp.js"
$CMD_CSP > "$EVIDENCE_DIR/check-csp.txt" 2>&1
RC_CSP=$?
record_gate "check-csp" "check-csp.txt" "$CMD_CSP" "$RC_CSP"

# 9. Check Query Plan Documentation
echo "[9/13] Running Check Query Plan Documentation..."
CMD_QUERY_PLAN="node scripts/check-query-plan-doc.js"
$CMD_QUERY_PLAN > "$EVIDENCE_DIR/check-query-plan-doc.txt" 2>&1
RC_QUERY_PLAN=$?
record_gate "check-query-plan-doc" "check-query-plan-doc.txt" "$CMD_QUERY_PLAN" "$RC_QUERY_PLAN"

# 10. Verify Perf Budget (Expected exit 1 due to CoachCockpit.tsx LOC)
echo "[10/13] Running Verify Perf Budget..."
CMD_PERF_BUDGET="node scripts/verify-perf-budget.js"
$CMD_PERF_BUDGET > "$EVIDENCE_DIR/verify-perf-budget.txt" 2>&1
RC_PERF_BUDGET=$?
record_gate "verify-perf-budget" "verify-perf-budget.txt" "$CMD_PERF_BUDGET" "$RC_PERF_BUDGET"

# 11. Verify Perf Artifact
echo "[11/13] Running Verify Perf Artifact..."
CMD_PERF_ARTIFACT="node scripts/verify-perf-artifact.js"
$CMD_PERF_ARTIFACT > "$EVIDENCE_DIR/verify-perf-artifact.txt" 2>&1
RC_PERF_ARTIFACT=$?
record_gate "verify-perf-artifact" "verify-perf-artifact.txt" "$CMD_PERF_ARTIFACT" "$RC_PERF_ARTIFACT"

# Retained Route Measurement Artifact (docs/perf-trace-results.json)
echo "  -> Copying retained docs/perf-trace-results.json to docs/evidence/..."
cp "$REPO_ROOT/docs/perf-trace-results.json" "$EVIDENCE_DIR/perf-trace-results.json"
record_gate "perf-trace-results" "perf-trace-results.json" "cp docs/perf-trace-results.json docs/evidence/perf-trace-results.json" 0

# 12 & 13. DB reset to a known seed, baseline snapshot, Playwright E2E, post residue assertion
#
# The reset is NOT optional and must not be removed. Without it this gate runs against whatever the
# previous process left in the database. That is not hypothetical: on the first run of this script the
# database still held the `payload-stress` fixture from a P3-0 route measurement, so
# tests/e2e/history-pagination.spec.ts expected 151 reachable sessions, found 50, and a suite that passes
# on a correctly seeded database was recorded in the evidence bundle as a failure. An evidence collector
# whose most expensive gate depends on ambient state is collecting the ambient state, not the evidence.
echo "[12/13] Resetting database to the default seed before E2E (known precondition)..."
CMD_DB_RESET="npx supabase db reset"
$CMD_DB_RESET > "$EVIDENCE_DIR/db-reset.txt" 2>&1
RC_DB_RESET=$?
record_gate "db-reset" "db-reset.txt" "$CMD_DB_RESET" "$RC_DB_RESET"
# Ensure PostgREST is ready and restart Vite dev server fresh so stale connections
# from before the DB reset are cleared and dynamic routes are pre-warmed.
pkill -f "vite" 2>/dev/null || true
sleep 1
for i in {1..20}; do
  if curl -s http://127.0.0.1:58821/rest/v1/ > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
npm run dev > /dev/null 2>&1 &
for i in {1..30}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
curl -s http://localhost:5173/history > /dev/null 2>&1 || true

echo "[12/13] Capturing DB baseline before E2E..."
node scripts/db-snapshot.js before > /dev/null 2>&1 || true

echo "[13/13] Running Playwright E2E Desktop Chrome..."
CMD_E2E="npx playwright test tests/e2e --project=\"Desktop Chrome\" --workers=1"
npx playwright test tests/e2e --project="Desktop Chrome" --workers=1 > "$EVIDENCE_DIR/e2e-desktop-chrome.txt" 2>&1
RC_E2E=$?
record_gate "e2e-desktop-chrome" "e2e-desktop-chrome.txt" "$CMD_E2E" "$RC_E2E"

echo "[12/13] Running DB Residue Audit..."
CMD_DB_SNAPSHOT="node scripts/db-snapshot.js after --assert-equal"
$CMD_DB_SNAPSHOT > "$EVIDENCE_DIR/db-snapshot.txt" 2>&1
RC_DB_SNAPSHOT=$?
record_gate "db-snapshot" "db-snapshot.txt" "$CMD_DB_SNAPSHOT" "$RC_DB_SNAPSHOT"

# Write Manifest JSON
echo "Generating $EVIDENCE_DIR/manifest.json..."

node -e '
  const fs = require("fs");
  const path = require("path");
  const resultsTmp = process.argv[1];
  const manifestPath = process.argv[2];
  const gitCommit = process.argv[3];
  const gitDirty = process.argv[4] === "true";

  const gates = JSON.parse(fs.readFileSync(resultsTmp, "utf8"));
  const artifacts = {};

  for (const g of gates) {
    artifacts[g.outputFile] = {
      gateId: g.gateId,
      command: g.command,
      exitCode: g.exitCode,
      sha256: g.sha256,
      timestamp: g.timestamp
    };
  }

  const perfTracePath = path.join(path.dirname(manifestPath), "perf-trace-results.json");
  if (fs.existsSync(perfTracePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(perfTracePath, "utf8"));
      if (parsed._meta && artifacts["perf-trace-results.json"]) {
        artifacts["perf-trace-results.json"].runId = parsed._meta.runId;
        artifacts["perf-trace-results.json"].sourceFingerprint = parsed._meta.sourceFingerprint;
      }
    } catch {}
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    gitCommit,
    dirty: gitDirty,
    totalGates: gates.length,
    artifacts,
    gates
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
' "$RESULTS_JSON_TMP" "$EVIDENCE_DIR/manifest.json" "$GIT_COMMIT" "$GIT_DIRTY"

rm -f "$RESULTS_JSON_TMP"

echo "=============================================================================="
echo "Evidence Collection Complete!"
echo "Manifest: $EVIDENCE_DIR/manifest.json"
echo "=============================================================================="

#!/usr/bin/env bash
# Run a browser/Playwright command while holding the shared browser lock (docs/REDESIGN_STATUS.md §3a).
#   scripts/with-browser-lock.sh <command...>
# Uses flock: the kernel releases the lock when the process exits or crashes, so a lock can never go stale
# (P0 lost ~1.5h to a leftover mkdir-style lock). Waits at most LOCK_WAIT seconds (default 1800),
# then exits 75 and prints who holds it, so callers report BLOCKED instead of hanging.
set -uo pipefail
LOCK=/tmp/fitness_browser.flock
WAIT=${LOCK_WAIT:-1800}
exec 9>"$LOCK"
if ! flock -w "$WAIT" 9; then
  echo "BROWSER_LOCK_TIMEOUT after ${WAIT}s; holder(s):"
  fuser -v "$LOCK" 2>&1 | tail -n +2 || true
  exit 75
fi
"$@"

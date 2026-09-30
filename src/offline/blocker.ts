import { getOutboxOps, getSyncingStatus, getCachedOutboxSummary } from './outbox';
import { getActiveUserId } from './flusher';

/**
 * Registers an update safety blocker with W2's PWA update registry.
 * Prevents applying service worker updates if outbox has pending changes or is actively syncing.
 */
export function registerOutboxUpdateBlocker(
  register: (id: string, fn: () => string | null) => void
): void {
  register('outbox', () => {
    const isSyncing = getSyncingStatus();
    if (isSyncing) {
      return 'Syncing changes in progress';
    }
    const userId = getActiveUserId();
    if (userId) {
      const summary = getCachedOutboxSummary(userId);
      if (summary.pending > 0) {
        return 'Finish your workout and sync first';
      }
    }
    return null;
  });
}

/**
 * Checks how many unsynced/pending operations remain before sign out.
 */
export async function pendingBeforeSignOut(userId?: string): Promise<number> {
  const target = userId || getActiveUserId();
  if (!target) return 0;
  try {
    const ops = await getOutboxOps(target);
    return ops.filter((o) => o.state === 'pending' || o.state === 'inflight' || o.state === 'attention').length;
  } catch {
    return 0;
  }
}

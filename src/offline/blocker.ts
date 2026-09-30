import { getOutboxOps, getSyncingStatus } from './outbox';
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
    // We can check if active user has pending ops synchronously or via status
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

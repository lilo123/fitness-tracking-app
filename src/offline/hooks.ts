import { useSyncExternalStore, useEffect, useCallback, useRef } from 'react';
import {
  subscribeToOutbox,
  getOutboxOps,
  getCachedOpsForUser,
  getCachedOutboxSummary,
  hasCachedOpsForUser,
} from './outbox';
import { getActiveUserId } from './flusher';
import type { OutboxOp, OutboxSummary } from './types';

const EMPTY_OPS: OutboxOp[] = [];
const DEFAULT_SUMMARY: OutboxSummary = {
  pending: 0,
  attention: 0,
  syncing: false,
  authRequired: false,
  lastSyncedCount: 0,
  needsAttentionOps: [],
};

/**
 * Hook to track all outbox operations for a user via useSyncExternalStore.
 */
export function usePendingOps(userId?: string): OutboxOp[] {
  const target = userId || getActiveUserId() || '';
  const lastEmptyRef = useRef<OutboxOp[]>(EMPTY_OPS);

  // Trigger initial IDB fetch in background if not already in memory cache
  useEffect(() => {
    if (target && !hasCachedOpsForUser(target)) {
      getOutboxOps(target).catch((e) => {
        console.warn('[outbox] usePendingOps background prewarm failed', e);
      });
    }
  }, [target]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToOutbox(onStoreChange, target),
    [target]
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      if (!target) return EMPTY_OPS;
      const ops = getCachedOpsForUser(target);
      if (!ops || ops.length === 0) {
        return lastEmptyRef.current;
      }
      return ops;
    },
    () => EMPTY_OPS
  );
}

/**
 * Hook to track overall outbox summary (pending count, attention count, syncing state, authRequired).
 */
export function useOutboxSummary(userId?: string): OutboxSummary {
  const target = userId || getActiveUserId() || '';

  useEffect(() => {
    if (target && !hasCachedOpsForUser(target)) {
      getOutboxOps(target).catch((e) => {
        console.warn('[outbox] useOutboxSummary background prewarm failed', e);
      });
    }
  }, [target]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToOutbox(onStoreChange, target),
    [target]
  );

  return useSyncExternalStore(
    subscribe,
    () => (target ? getCachedOutboxSummary(target) : DEFAULT_SUMMARY),
    () => DEFAULT_SUMMARY
  );
}

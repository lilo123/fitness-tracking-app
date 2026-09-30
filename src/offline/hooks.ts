import { useSyncExternalStore, useEffect } from 'react';
import {
  subscribeToOutbox,
  getOutboxOps,
  getCachedOpsForUser,
  getCachedOutboxSummary,
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

  // Trigger initial IDB fetch in background to populate memory cache
  useEffect(() => {
    if (target) {
      getOutboxOps(target).catch(() => {});
    }
  }, [target]);

  return useSyncExternalStore(
    subscribeToOutbox,
    () => (target ? getCachedOpsForUser(target) : EMPTY_OPS),
    () => EMPTY_OPS
  );
}

/**
 * Hook to track overall outbox summary (pending count, attention count, syncing state, authRequired).
 */
export function useOutboxSummary(userId?: string): OutboxSummary {
  const target = userId || getActiveUserId() || '';

  useEffect(() => {
    if (target) {
      getOutboxOps(target).catch(() => {});
    }
  }, [target]);

  return useSyncExternalStore(
    subscribeToOutbox,
    () => (target ? getCachedOutboxSummary(target) : DEFAULT_SUMMARY),
    () => DEFAULT_SUMMARY
  );
}

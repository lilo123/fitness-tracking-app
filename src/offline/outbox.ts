import { getOfflineDb } from './db';
import type { OutboxOp, OpKind, OpPayloadMap, OutboxSummary } from './types';
import { compactIncomingOp } from './compaction';

// Subscription listeners for outbox state updates
const subscribers = new Set<() => void>();

export function subscribeToOutbox(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function notifyOutboxChanged(): void {
  for (const sub of subscribers) {
    try {
      sub();
    } catch (e) {
      console.error('[outbox] subscriber error:', e);
    }
  }
}

// In-memory syncing & authRequired status flags
let isSyncingGlobally = false;
let isAuthRequiredGlobally = false;
let globalLastSyncedCount = 0;

const userOpsCache = new Map<string, OutboxOp[]>();
const userSummaryCache = new Map<string, OutboxSummary>();

export function resetOutboxForTesting(): void {
  subscribers.clear();
  userOpsCache.clear();
  userSummaryCache.clear();
  isSyncingGlobally = false;
  isAuthRequiredGlobally = false;
  globalLastSyncedCount = 0;
}

export function getCachedOpsForUser(userId: string): OutboxOp[] {
  if (!userId) return [];
  return userOpsCache.get(userId) || [];
}

export function getCachedOutboxSummary(userId: string): OutboxSummary {
  if (!userId) {
    return {
      pending: 0,
      attention: 0,
      syncing: isSyncingGlobally,
      authRequired: isAuthRequiredGlobally,
      lastSyncedCount: globalLastSyncedCount,
      needsAttentionOps: [],
    };
  }
  const cached = userSummaryCache.get(userId);
  if (cached) {
    return {
      ...cached,
      syncing: isSyncingGlobally,
      authRequired: isAuthRequiredGlobally,
      lastSyncedCount: globalLastSyncedCount,
    };
  }
  return {
    pending: 0,
    attention: 0,
    syncing: isSyncingGlobally,
    authRequired: isAuthRequiredGlobally,
    lastSyncedCount: globalLastSyncedCount,
    needsAttentionOps: [],
  };
}

export function updateUserCache(userId: string, ops: OutboxOp[]): OutboxSummary {
  userOpsCache.set(userId, ops);
  let pending = 0;
  let attention = 0;
  const needsAttentionOps: OutboxOp[] = [];

  for (const op of ops) {
    if (op.state === 'pending' || op.state === 'inflight') {
      pending++;
    } else if (op.state === 'attention') {
      attention++;
      needsAttentionOps.push(op);
    }
  }

  const summary: OutboxSummary = {
    pending,
    attention,
    syncing: isSyncingGlobally,
    authRequired: isAuthRequiredGlobally,
    lastSyncedCount: globalLastSyncedCount,
    needsAttentionOps,
  };
  userSummaryCache.set(userId, summary);
  return summary;
}

export function setSyncingStatus(syncing: boolean): void {
  if (isSyncingGlobally !== syncing) {
    isSyncingGlobally = syncing;
    notifyOutboxChanged();
  }
}

export function setAuthRequiredStatus(required: boolean): void {
  if (isAuthRequiredGlobally !== required) {
    isAuthRequiredGlobally = required;
    notifyOutboxChanged();
  }
}

export function setLastSyncedCount(count: number): void {
  globalLastSyncedCount = count;
  notifyOutboxChanged();
}

export function getSyncingStatus(): boolean {
  return isSyncingGlobally;
}

export function getAuthRequiredStatus(): boolean {
  return isAuthRequiredGlobally;
}

export function getLastSyncedCount(): number {
  return globalLastSyncedCount;
}

/**
 * Enqueue an operation into the durable outbox for a user.
 * Applies compaction within a single IDB transaction.
 */
export async function enqueue<K extends OpKind>(input: {
  userId: string;
  kind: K;
  payload: OpPayloadMap[K];
}): Promise<OutboxOp> {
  const { userId, kind, payload } = input;
  const db = await getOfflineDb(userId);

  const tx = db.transaction(['outbox', 'meta'], 'readwrite');
  const outboxStore = tx.objectStore('outbox');
  const metaStore = tx.objectStore('meta');

  // Read all existing ops sorted by seq
  const allOpsRaw = await outboxStore.getAll();
  const existingOps = allOpsRaw
    .filter((op) => op.userId === userId)
    .sort((a, b) => a.seq - b.seq);

  // Compute next monotonic seq
  const lastSeqMeta = ((await metaStore.get('last_seq')) as number) || 0;
  const maxExistingSeq = existingOps.length > 0 ? existingOps[existingOps.length - 1].seq : 0;
  const nextSeq = Math.max(lastSeqMeta, maxExistingSeq) + 1;

  const incomingOp: OutboxOp = {
    opId: crypto.randomUUID(),
    userId,
    seq: nextSeq,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: 'pending',
  } as OutboxOp;

  const compaction = compactIncomingOp(existingOps, incomingOp);

  switch (compaction.action) {
    case 'merged-create':
    case 'merged-update':
    case 'merged-rename': {
      if (compaction.compactedOp) {
        await outboxStore.put(compaction.compactedOp);
      }
      await tx.done;
      notifyOutboxChanged();
      return compaction.compactedOp || incomingOp;
    }

    case 'cancelled': {
      // Find ops that were removed
      const remainingIds = new Set(compaction.ops.map((o) => o.opId));
      for (const op of existingOps) {
        if (!remainingIds.has(op.opId)) {
          await outboxStore.delete(op.opId);
        }
      }
      await tx.done;
      notifyOutboxChanged();
      return incomingOp;
    }

    case 'appended': {
      // If some prior ops were removed (e.g. updates superseded by a delete)
      const remainingIds = new Set(compaction.ops.map((o) => o.opId));
      for (const op of existingOps) {
        if (!remainingIds.has(op.opId)) {
          await outboxStore.delete(op.opId);
        }
      }
      await outboxStore.put(incomingOp);
      await metaStore.put(nextSeq, 'last_seq');
      await tx.done;
      notifyOutboxChanged();
      return incomingOp;
    }
  }
}

export async function getOutboxOps(userId: string): Promise<OutboxOp[]> {
  const db = await getOfflineDb(userId);
  const allOps = await db.getAll('outbox');
  const sorted = allOps
    .filter((op) => op.userId === userId)
    .sort((a, b) => a.seq - b.seq);
  updateUserCache(userId, sorted);
  return sorted;
}

export async function getOutboxSummary(userId: string): Promise<OutboxSummary> {
  const ops = await getOutboxOps(userId);
  return updateUserCache(userId, ops);
}

export async function updateOp(userId: string, op: OutboxOp): Promise<void> {
  const db = await getOfflineDb(userId);
  await db.put('outbox', op);
  notifyOutboxChanged();
}

export async function deleteOp(userId: string, opId: string): Promise<void> {
  const db = await getOfflineDb(userId);
  await db.delete('outbox', opId);
  notifyOutboxChanged();
}

/**
 * Mark dependent ops as blocked when an op fails with a PERMANENT error.
 */
export async function blockDependentOps(userId: string, failedOp: OutboxOp): Promise<void> {
  const db = await getOfflineDb(userId);
  const tx = db.transaction('outbox', 'readwrite');
  const store = tx.store;
  const allOps = (await store.getAll())
    .filter((o) => o.userId === userId)
    .sort((a, b) => a.seq - b.seq);

  // Check if failedOp was workout.ensure or a set op
  const blockedWorkoutIds = new Set<string>();
  if (failedOp.kind === 'workout.ensure') {
    blockedWorkoutIds.add(failedOp.payload.clientWorkoutId);
  }

  const blockedSetIds = new Set<string>();
  if (failedOp.kind === 'set.create' || failedOp.kind === 'set.update') {
    blockedSetIds.add((failedOp.payload as { id: string }).id);
  }

  for (const op of allOps) {
    if (op.seq <= failedOp.seq) continue;
    if (op.state === 'attention') continue;

    let isDependent = false;
    if (
      (op.kind === 'workout.rename' && blockedWorkoutIds.has(op.payload.workoutRef)) ||
      (op.kind === 'set.create' && blockedWorkoutIds.has(op.payload.workoutRef))
    ) {
      isDependent = true;
      if (op.kind === 'set.create') {
        blockedSetIds.add(op.payload.id);
      }
    } else if (
      (op.kind === 'set.update' || op.kind === 'set.delete') &&
      blockedSetIds.has((op.payload as { id: string }).id)
    ) {
      isDependent = true;
    }

    if (isDependent) {
      op.state = 'attention';
      op.error = `blocked by ${failedOp.opId}`;
      op.blockedBy = failedOp.opId;
      await store.put(op);
    }
  }

  await tx.done;
  notifyOutboxChanged();
}

/**
 * Retry an operation that is currently in attention.
 * Unblocks any ops that were blocked by this op.
 */
export async function retryOp(opId: string, userId: string): Promise<void> {
  const db = await getOfflineDb(userId);
  const tx = db.transaction('outbox', 'readwrite');
  const store = tx.store;
  const op = await store.get(opId);
  if (!op || op.userId !== userId) {
    await tx.done;
    return;
  }

  op.state = 'pending';
  delete op.error;
  delete op.blockedBy;
  op.attempts = 0;
  await store.put(op);

  // Also unblock dependent ops that were blocked by this op
  const allOps = await store.getAll();
  for (const other of allOps) {
    if (other.userId === userId && other.blockedBy === opId) {
      other.state = 'pending';
      delete other.error;
      delete other.blockedBy;
      await store.put(other);
    }
  }

  await tx.done;
  notifyOutboxChanged();
}

/**
 * Discard an operation that is in attention.
 * If other ops were blocked by it, unblock them so they can be attempted or evaluated.
 */
export async function discardOp(opId: string, userId: string): Promise<void> {
  const db = await getOfflineDb(userId);
  const tx = db.transaction('outbox', 'readwrite');
  const store = tx.store;
  const op = await store.get(opId);
  if (!op || op.userId !== userId) {
    await tx.done;
    return;
  }

  await store.delete(opId);

  // Unblock dependent ops so they can be processed or re-evaluated
  const allOps = await store.getAll();
  for (const other of allOps) {
    if (other.userId === userId && other.blockedBy === opId) {
      other.state = 'pending';
      delete other.error;
      delete other.blockedBy;
      await store.put(other);
    }
  }

  await tx.done;
  notifyOutboxChanged();
}

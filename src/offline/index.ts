// Core types
export * from './types';

// Database & ID mapping
export {
  getOfflineDb,
  getOfflineDbName,
  closeOfflineDb,
  closeAllOfflineDbs,
  clearUserRqStore,
  deleteOfflineDb,
} from './db';

export {
  setIdMapping,
  getIdMapping,
  resolveWorkoutRef,
  resolveWorkoutRefSync,
  loadIdMappings,
  clearIdMappingsForTesting,
} from './idmap';

// Compaction
export {
  compactIncomingOp,
  type CompactionAction,
  type CompactionResult,
} from './compaction';

// Error classification
export { classifyError } from './classify';

// Replay execution
export {
  executeReplayOp,
  type ReplayResult,
} from './replay';

// Outbox
export {
  enqueue,
  getOutboxOps,
  getOutboxSummary,
  updateOp,
  deleteOp,
  blockDependentOps,
  retryOp,
  discardOp,
  subscribeToOutbox,
  notifyOutboxChanged,
  setSyncingStatus,
  setAuthRequiredStatus,
  setLastSyncedCount,
  getSyncingStatus,
  getAuthRequiredStatus,
  getLastSyncedCount,
  getCachedOutboxSummary,
  getCachedOpsForUser,
  hasCachedOpsForUser,
} from './outbox';

// Flusher & Concurrency
export {
  flushNow,
  enqueueAndAwait,
  onSynced,
  newId,
  setActiveUserForFlusher,
  getActiveUserId,
  setFlusherSessionUser,
} from './flusher';

// Persister & Persist Controller
export {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  WHITELIST_ROOTS,
  shouldDehydrateQuery,
  applyPageCaps,
  createIdbPersister,
} from './persister';

export {
  setupQueryDefaults,
  initPersistForUser,
  stopPersisting,
  clearUserReadCache,
  getCurrentPersistingUserId,
} from './persistController';

// Offline fallback
export { offlineFallback } from './offlineFallback';

// Overlay pure functions
export {
  applyPendingToDaySets,
  pendingSetsBefore,
  applyPendingToHistory,
} from './overlay';

// Hooks
export {
  usePendingOps,
  useOutboxSummary,
} from './hooks';

// Update safety blocker & helpers
export {
  registerOutboxUpdateBlocker,
  pendingBeforeSignOut,
} from './blocker';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerOutboxUpdateBlocker } from '../blocker';
import {
  canApplyUpdate,
  registerUpdateBlocker,
  unregisterUpdateBlocker,
  resetUpdateSafetyForTesting,
} from '../../pwa/updateSafety';
import * as flusherModule from '../flusher';
import * as outboxModule from '../outbox';

describe('registerOutboxUpdateBlocker', () => {
  const userId = 'user-blocker-1';

  beforeEach(() => {
    resetUpdateSafetyForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetUpdateSafetyForTesting();
    unregisterUpdateBlocker('outbox');
    vi.restoreAllMocks();
  });

  it('blocks PWA update when outbox has pending ops', () => {
    vi.spyOn(flusherModule, 'getActiveUserId').mockReturnValue(userId);
    vi.spyOn(outboxModule, 'getSyncingStatus').mockReturnValue(false);
    vi.spyOn(outboxModule, 'getCachedOutboxSummary').mockReturnValue({
      pending: 2,
      attention: 0,
      syncing: false,
      authRequired: false,
      lastSyncedCount: 0,
      needsAttentionOps: [],
    });

    registerOutboxUpdateBlocker(registerUpdateBlocker);
    const result = canApplyUpdate();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Finish your workout and sync first');
  });

  it('blocks PWA update when outbox is actively syncing', () => {
    vi.spyOn(flusherModule, 'getActiveUserId').mockReturnValue(userId);
    vi.spyOn(outboxModule, 'getSyncingStatus').mockReturnValue(true);

    registerOutboxUpdateBlocker(registerUpdateBlocker);
    const result = canApplyUpdate();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Syncing changes in progress');
  });

  it('allows PWA update when outbox has 0 pending ops', () => {
    vi.spyOn(flusherModule, 'getActiveUserId').mockReturnValue(userId);
    vi.spyOn(outboxModule, 'getSyncingStatus').mockReturnValue(false);
    vi.spyOn(outboxModule, 'getCachedOutboxSummary').mockReturnValue({
      pending: 0,
      attention: 0,
      syncing: false,
      authRequired: false,
      lastSyncedCount: 0,
      needsAttentionOps: [],
    });

    registerOutboxUpdateBlocker(registerUpdateBlocker);
    const result = canApplyUpdate();

    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

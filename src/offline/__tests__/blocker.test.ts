import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerOutboxUpdateBlocker, pendingBeforeSignOut } from '../blocker';
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
    expect(result.reason).toBe('Sync pending changes first');
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

  it('blocks PWA update when active user has pending ops in localStorage from another tab', () => {
    vi.spyOn(flusherModule, 'getActiveUserId').mockReturnValue(userId);
    vi.spyOn(outboxModule, 'getSyncingStatus').mockReturnValue(false);
    localStorage.setItem(`yourbody_outbox_pending_${userId}`, '2');

    registerOutboxUpdateBlocker(registerUpdateBlocker);
    const result = canApplyUpdate();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Sync pending changes first');

    localStorage.removeItem(`yourbody_outbox_pending_${userId}`);
  });

  it('allows PWA update when another user has pending ops in localStorage but active user has 0', () => {
    vi.spyOn(flusherModule, 'getActiveUserId').mockReturnValue(userId);
    vi.spyOn(outboxModule, 'getSyncingStatus').mockReturnValue(false);
    // Another user's retained outbox
    localStorage.setItem('yourbody_outbox_pending_other-user', '5');

    registerOutboxUpdateBlocker(registerUpdateBlocker);
    const result = canApplyUpdate();

    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();

    localStorage.removeItem('yourbody_outbox_pending_other-user');
  });
});

describe('pendingBeforeSignOut', () => {
  it('returns count of pending ops for user', async () => {
    vi.spyOn(outboxModule, 'getOutboxOps').mockResolvedValue([
      { state: 'pending' },
      { state: 'completed' },
      { state: 'attention' },
    ] as any);
    const count = await pendingBeforeSignOut('user-1');
    expect(count).toBe(2);
  });

  it('returns sentinel 1 on IDB error to trigger sign-out confirmation safely', async () => {
    vi.spyOn(outboxModule, 'getOutboxOps').mockRejectedValue(new Error('IndexedDB transaction failed'));
    const count = await pendingBeforeSignOut('user-1');
    expect(count).toBe(1);
  });
});

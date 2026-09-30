import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeReplayOp } from '../replay';
import { getIdMapping, setIdMapping, clearIdMappingsForTesting } from '../idmap';
import { closeAllOfflineDbs, deleteOfflineDb } from '../db';
import type { OutboxOp } from '../types';

describe('Replay Executor & Idempotency (§A4, §D)', () => {
  const userId = 'user-replay-1';

  beforeEach(async () => {
    vi.clearAllMocks();
    clearIdMappingsForTesting();
    await closeAllOfflineDbs();
    await deleteOfflineDb(userId);
  });

  it('1. set.create is idempotent: upserts onConflict id ignoreDuplicates', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        upsert: mockUpsert,
      }),
    };

    const op: OutboxOp = {
      opId: 'op-1',
      userId,
      seq: 1,
      kind: 'set.create',
      payload: {
        id: 'set-uuid-1',
        workoutRef: 'workout-canonical-1',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    // First replay execution
    await executeReplayOp(op, mockClient);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'set-uuid-1',
        workout_id: 'workout-canonical-1',
        weight: 100,
        reps: 10,
      }),
      { onConflict: 'id', ignoreDuplicates: true }
    );

    // Second replay execution (e.g. flushed twice or crash recovery)
    await executeReplayOp(op, mockClient);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it('2. crash after server success before local delete is a no-op on re-run', async () => {
    let serverSetCreated = false;
    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        upsert: vi.fn().mockImplementation(() => {
          serverSetCreated = true;
          return Promise.resolve({ data: null, error: null });
        }),
      }),
    };

    const op: OutboxOp = {
      opId: 'op-1',
      userId,
      seq: 1,
      kind: 'set.create',
      payload: {
        id: 'set-uuid-crash',
        workoutRef: 'workout-canonical-1',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    // Simulate run 1: server receives write, but caller crashes before IDB deletion
    await executeReplayOp(op, mockClient);
    expect(serverSetCreated).toBe(true);

    // Simulate run 2 after reload: re-executing the same op against server
    await expect(executeReplayOp(op, mockClient)).resolves.not.toThrow();
  });

  it('3. workout.ensure remaps clientWorkoutId to canonical id when server already has workout for that date', async () => {
    const canonicalServerId = 'server-workout-uuid-456';
    const clientWorkoutId = 'client-gen-uuid-123';

    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: canonicalServerId },
      error: null,
    });
    const mockEqWorkoutDate = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEqUserId = vi.fn().mockReturnValue({ eq: mockEqWorkoutDate });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUserId });

    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        upsert: mockUpsert,
        select: mockSelect,
      }),
    };

    const op: OutboxOp = {
      opId: 'op-ensure',
      userId,
      seq: 1,
      kind: 'workout.ensure',
      payload: {
        clientWorkoutId,
        workout_date: '2026-09-30',
        name: 'Existing Routine',
      },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    const res = await executeReplayOp(op, mockClient);
    expect(res.canonicalId).toBe(canonicalServerId);

    // Save mapping to idmap and verify
    await setIdMapping(userId, clientWorkoutId, res.canonicalId!);
    const mapped = await getIdMapping(userId, clientWorkoutId);
    expect(mapped).toBe(canonicalServerId);
  });

  it('4. set.update pre-image conflict: throws "deleted elsewhere" if row not found', async () => {
    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };

    const op: OutboxOp = {
      opId: 'op-up',
      userId,
      seq: 1,
      kind: 'set.update',
      payload: {
        id: 'deleted-set-id',
        patch: { weight: 120 },
      },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    await expect(executeReplayOp(op, mockClient)).rejects.toThrow('deleted elsewhere');
  });

  it('5. set.update pre-image conflict: returns alreadyApplied if server row matches patch', async () => {
    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'set-1', weight: 120, reps: 10 },
              error: null,
            }),
          }),
        }),
      }),
    };

    const op: OutboxOp = {
      opId: 'op-up',
      userId,
      seq: 1,
      kind: 'set.update',
      payload: {
        id: 'set-1',
        patch: { weight: 120, reps: 10 },
      },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    const res = await executeReplayOp(op, mockClient);
    expect(res.alreadyApplied).toBe(true);
  });

  it('6. set.update pre-image conflict: throws "changed elsewhere" if server row differs from expected', async () => {
    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'set-1', weight: 115, reps: 8 }, // Modified by someone else
              error: null,
            }),
          }),
        }),
      }),
    };

    const op: OutboxOp = {
      opId: 'op-up',
      userId,
      seq: 1,
      kind: 'set.update',
      payload: {
        id: 'set-1',
        patch: { weight: 120 },
        expected: { weight: 100, reps: 10 }, // Pre-image expected
      },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    await expect(executeReplayOp(op, mockClient)).rejects.toThrow('changed elsewhere');
  });

  it('7. set.update succeeds when expected matches server row', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'set-1', weight: 100, reps: 10 },
              error: null,
            }),
          }),
        }),
        update: mockUpdate,
      }),
    };

    const op: OutboxOp = {
      opId: 'op-up',
      userId,
      seq: 1,
      kind: 'set.update',
      payload: {
        id: 'set-1',
        patch: { weight: 105 },
        expected: { weight: 100, reps: 10 },
      },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    await expect(executeReplayOp(op, mockClient)).resolves.not.toThrow();
    expect(mockUpdate).toHaveBeenCalledWith({ weight: 105 });
  });

  it('8. set.delete is idempotent: deletes by id', async () => {
    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const mockClient: any = {
      ['from']: vi.fn().mockReturnValue({
        delete: mockDelete,
      }),
    };

    const op: OutboxOp = {
      opId: 'op-del',
      userId,
      seq: 1,
      kind: 'set.delete',
      payload: { id: 'set-del-1' },
      createdAt: '2026-09-30T10:00:00Z',
      attempts: 0,
      state: 'pending',
    };

    await executeReplayOp(op, mockClient);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});

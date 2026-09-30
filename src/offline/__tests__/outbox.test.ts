import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enqueue,
  getOutboxOps,
  getOutboxSummary,
  blockDependentOps,
  retryOp,
  discardOp,
  updateOp,
} from '../outbox';
import { closeAllOfflineDbs, deleteOfflineDb } from '../db';

describe('Outbox Storage, Ordering & Dependent Blocking (§A4, §D)', () => {
  const userA = 'user-test-a';
  const userB = 'user-test-b';

  beforeEach(async () => {
    await closeAllOfflineDbs();
    await deleteOfflineDb(userA);
    await deleteOfflineDb(userB);
  });

  afterEach(async () => {
    await closeAllOfflineDbs();
    await deleteOfflineDb(userA);
    await deleteOfflineDb(userB);
  });

  it('1. monotonic seq ordering across multiple enqueues', async () => {
    const op1 = await enqueue({
      userId: userA,
      kind: 'workout.ensure',
      payload: {
        clientWorkoutId: 'w-1',
        workout_date: '2026-09-30',
        name: 'Session 1',
      },
    });

    const op2 = await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-1',
        workoutRef: 'w-1',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
    });

    const op3 = await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-2',
        workoutRef: 'w-1',
        exercise_id: 'ex-1',
        weight: 105,
        reps: 8,
        set_index: 2,
        set_type: 'working',
        created_at: '2026-09-30T10:02:00Z',
      },
    });

    expect(op1.seq).toBe(1);
    expect(op2.seq).toBe(2);
    expect(op3.seq).toBe(3);

    const ops = await getOutboxOps(userA);
    expect(ops.map((o) => o.seq)).toEqual([1, 2, 3]);
  });

  it('2. persistence across module re-instantiation / DB reconnection', async () => {
    await enqueue({
      userId: userA,
      kind: 'workout.ensure',
      payload: { clientWorkoutId: 'w-1', workout_date: '2026-09-30' },
    });
    await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-1',
        workoutRef: 'w-1',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
    });

    // Close all connections to simulate app reload / module re-instantiation
    await closeAllOfflineDbs();

    // Reconnect and fetch ops
    const opsAfterReload = await getOutboxOps(userA);
    expect(opsAfterReload).toHaveLength(2);
    expect(opsAfterReload[0].kind).toBe('workout.ensure');
    expect(opsAfterReload[1].kind).toBe('set.create');
    expect(opsAfterReload[0].seq).toBe(1);
    expect(opsAfterReload[1].seq).toBe(2);

    // Enqueue a 3rd op after reload: seq should continue monotonically
    const op3 = await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-2',
        workoutRef: 'w-1',
        exercise_id: 'ex-1',
        weight: 110,
        reps: 6,
        set_index: 2,
        set_type: 'working',
        created_at: '2026-09-30T10:05:00Z',
      },
    });

    expect(op3.seq).toBe(3);
  });

  it('3. per-user isolation: User A and User B never cross-contaminate', async () => {
    await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-user-a',
        workoutRef: 'w-a',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
    });

    await enqueue({
      userId: userB,
      kind: 'set.create',
      payload: {
        id: 's-user-b',
        workoutRef: 'w-b',
        exercise_id: 'ex-2',
        weight: 200,
        reps: 5,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
    });

    const opsA = await getOutboxOps(userA);
    const opsB = await getOutboxOps(userB);

    expect(opsA).toHaveLength(1);
    expect((opsA[0].payload as any).id).toBe('s-user-a');

    expect(opsB).toHaveLength(1);
    expect((opsB[0].payload as any).id).toBe('s-user-b');

    const summaryA = await getOutboxSummary(userA);
    const summaryB = await getOutboxSummary(userB);
    expect(summaryA.pending).toBe(1);
    expect(summaryB.pending).toBe(1);
  });

  it('4. dependent blocking: failed ensure blocks dependent sets, independent ops continue', async () => {
    // 1. Ensure workout 1
    const ensure1 = await enqueue({
      userId: userA,
      kind: 'workout.ensure',
      payload: { clientWorkoutId: 'w-1', workout_date: '2026-09-30' },
    });

    // 2. Set for workout 1
    const set1 = await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-1',
        workoutRef: 'w-1',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
    });

    // 3. Independent ensure workout 2
    await enqueue({
      userId: userA,
      kind: 'workout.ensure',
      payload: { clientWorkoutId: 'w-2', workout_date: '2026-10-01' },
    });

    // 4. Independent set for workout 2
    const set2 = await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-2',
        workoutRef: 'w-2',
        exercise_id: 'ex-1',
        weight: 150,
        reps: 5,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-10-01T10:00:00Z',
      },
    });

    // 5. Update to set1 (transitive dependency on workout 1)
    const set1Update = await enqueue({
      userId: userA,
      kind: 'set.update',
      payload: {
        id: 's-1',
        patch: { weight: 110 },
      },
    });

    // Mark ensure1 as failed with PERMANENT error
    ensure1.state = 'attention';
    ensure1.error = 'Permission denied (RLS policy violation)';
    await updateOp(userA, ensure1);

    // Apply dependent blocking
    await blockDependentOps(userA, ensure1);

    const ops = await getOutboxOps(userA);
    const opMap = new Map(ops.map((o) => [o.opId, o]));

    // ensure1 is in attention
    expect(opMap.get(ensure1.opId)?.state).toBe('attention');

    // set1 depended on w-1 -> blocked by ensure1!
    const updatedSet1 = opMap.get(set1.opId);
    expect(updatedSet1?.state).toBe('attention');
    expect(updatedSet1?.blockedBy).toBe(ensure1.opId);
    expect(updatedSet1?.error).toContain(`blocked by ${ensure1.opId}`);

    // set1Update transitively depended on s-1 -> also blocked by ensure1!
    const updatedSet1Update = opMap.get(set1Update.opId);
    expect(updatedSet1Update?.state).toBe('attention');
    expect(updatedSet1Update?.blockedBy).toBe(ensure1.opId);
    expect(updatedSet1Update?.error).toContain(`blocked by ${ensure1.opId}`);

    // set2 for w-2 is independent -> remains pending!
    const updatedSet2 = opMap.get(set2.opId);
    expect(updatedSet2?.state).toBe('pending');
    expect(updatedSet2?.blockedBy).toBeUndefined();
  });

  it('5. retryOp unblocks dependent operations', async () => {
    const ensure1 = await enqueue({
      userId: userA,
      kind: 'workout.ensure',
      payload: { clientWorkoutId: 'w-1', workout_date: '2026-09-30' },
    });

    const set1 = await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-1',
        workoutRef: 'w-1',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
    });

    ensure1.state = 'attention';
    ensure1.error = 'Failed';
    await updateOp(userA, ensure1);
    await blockDependentOps(userA, ensure1);

    // Retrying ensure1 unblocks set1 as well
    await retryOp(ensure1.opId, userA);

    const ops = await getOutboxOps(userA);
    const opMap = new Map(ops.map((o) => [o.opId, o]));

    expect(opMap.get(ensure1.opId)?.state).toBe('pending');
    expect(opMap.get(set1.opId)?.state).toBe('pending');
    expect(opMap.get(set1.opId)?.blockedBy).toBeUndefined();
  });

  it('6. discardOp removes op from outbox and unblocks dependents', async () => {
    const ensure1 = await enqueue({
      userId: userA,
      kind: 'workout.ensure',
      payload: { clientWorkoutId: 'w-1', workout_date: '2026-09-30' },
    });

    const set1 = await enqueue({
      userId: userA,
      kind: 'set.create',
      payload: {
        id: 's-1',
        workoutRef: 'w-1',
        exercise_id: 'ex-1',
        weight: 100,
        reps: 10,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-30T10:00:00Z',
      },
    });

    ensure1.state = 'attention';
    ensure1.error = 'Failed';
    await updateOp(userA, ensure1);
    await blockDependentOps(userA, ensure1);

    // Discard ensure1
    await discardOp(ensure1.opId, userA);

    const ops = await getOutboxOps(userA);
    expect(ops.find((o) => o.opId === ensure1.opId)).toBeUndefined();

    // set1 is unblocked
    const setOp = ops.find((o) => o.opId === set1.opId);
    expect(setOp?.state).toBe('pending');
    expect(setOp?.blockedBy).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { useHistorySessionSets } from './useHistorySessionSets';
import * as pendingOpsModule from '../workout/useWorkoutPendingOps';
import * as workoutHistoryModule from './useWorkoutHistory';
import type { HistorySession } from './useWorkoutHistory';
import type { OutboxOp } from '../../offline/types';

describe('useHistorySessionSets deduplication', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const session: HistorySession = {
    id: 'w-session-1',
    date: '2026-09-30T10:00:00Z',
    workout_date: '2026-09-30',
    civil_date: '2026-09-30',
    name: 'Chest Day',
    set_count: 1,
    total_volume: 100,
  };

  beforeEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('deduplicates pending set against server fetched rawSets with matching id', async () => {
    // Mock server returning rawSets that already includes the synced set
    vi.spyOn(workoutHistoryModule, 'fetchSessionSets').mockResolvedValue([
      {
        id: 'set-dedup-1',
        workout_id: 'w-session-1',
        exercise_id: 'bench-press',
        weight: 100,
        reps: 10,
        set_index: 0,
        set_type: 'working',
        rpe: null,
        workout_date: '2026-09-30',
        workout_name: 'Chest Day',
        created_at: '2026-09-30T10:00:00Z',
      },
    ]);

    // Mock outbox still having the pending set.create op (e.g. before op deletion completes)
    const pendingOps: OutboxOp[] = [
      {
        opId: 'op-1',
        userId: 'u1',
        seq: 1,
        createdAt: '2026-09-30T10:00:00Z',
        kind: 'set.create',
        payload: {
          id: 'set-dedup-1',
          workoutRef: 'w-session-1',
          exercise_id: 'bench-press',
          weight: 100,
          reps: 10,
          set_index: 0,
          set_type: 'working',
          created_at: '2026-09-30T10:00:00Z',
        },
        state: 'pending',
        attempts: 0,
      },
    ];
    vi.spyOn(pendingOpsModule, 'useWorkoutPendingOps').mockReturnValue(pendingOps);

    const { result } = renderHook(() =>
      useHistorySessionSets({
        targetUserId: 'u1',
        sessions: [session],
        queryClient,
      })
    );

    // Call loadSetsForSession
    await act(async () => {
      await result.current.loadSetsForSession('w-session-1');
    });

    await waitFor(() => {
      expect(result.current.sessionSetsMap['w-session-1']).toBeDefined();
    });

    const sets = result.current.sessionSetsMap['w-session-1'];
    // Must be exactly 1, not duplicated!
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe('set-dedup-1');
  });
});

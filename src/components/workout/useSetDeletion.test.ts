import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSetDeletion } from './useSetDeletion';
import type { WorkoutSet } from '../../types/database';

describe('useSetDeletion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockSet: WorkoutSet = {
    id: 'set-123',
    workout_id: 'workout-1',
    exercise_id: 'ex-1',
    set_index: 2,
    weight: 150,
    reps: 8,
    set_type: 'working',
    rpe: null,
    created_at: new Date().toISOString(),
  };

  it('starts with no pending delete', () => {
    const onCommitDelete = vi.fn();
    const { result } = renderHook(() => useSetDeletion({ onCommitDelete }));

    expect(result.current.pendingSet).toBeNull();
    expect(result.current.pendingSetId).toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(result.current.toast).toBeNull();
  });

  it('schedules delete and sets toast metadata', () => {
    const onCommitDelete = vi.fn();
    const { result } = renderHook(() => useSetDeletion({ onCommitDelete, timeoutMs: 6000 }));

    act(() => {
      result.current.scheduleDelete(mockSet);
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.pendingSet).toEqual(mockSet);
    expect(result.current.pendingSetId).toBe('set-123');
    expect(result.current.toast).toEqual({
      verb: 'Set deleted',
      subject: 'Set 2',
      detail: '150×8',
      onUndo: expect.any(Function),
      undoAriaLabel: 'Undo delete set 2',
    });
    expect(onCommitDelete).not.toHaveBeenCalled();
  });

  it('commits exactly once on 6s expiry', () => {
    const onCommitDelete = vi.fn();
    const { result } = renderHook(() => useSetDeletion({ onCommitDelete, timeoutMs: 6000 }));

    act(() => {
      result.current.scheduleDelete(mockSet);
    });

    expect(onCommitDelete).not.toHaveBeenCalled();

    // 5900ms - not yet
    act(() => {
      vi.advanceTimersByTime(5900);
    });
    expect(onCommitDelete).not.toHaveBeenCalled();

    // 6000ms - exactly once
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onCommitDelete).toHaveBeenCalledTimes(1);
    expect(onCommitDelete).toHaveBeenCalledWith('set-123');
    expect(result.current.isPending).toBe(false);
    expect(result.current.pendingSet).toBeNull();
  });

  it('cancels deletion on undo and does not commit', () => {
    const onCommitDelete = vi.fn();
    const { result } = renderHook(() => useSetDeletion({ onCommitDelete, timeoutMs: 6000 }));

    act(() => {
      result.current.scheduleDelete(mockSet);
    });

    act(() => {
      vi.advanceTimersByTime(2000);
      result.current.undoDelete();
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.pendingSet).toBeNull();
    expect(result.current.pendingSetId).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onCommitDelete).not.toHaveBeenCalled();
  });

  it('triggers undo via toast.onUndo', () => {
    const onCommitDelete = vi.fn();
    const { result } = renderHook(() => useSetDeletion({ onCommitDelete, timeoutMs: 6000 }));

    act(() => {
      result.current.scheduleDelete(mockSet);
    });

    act(() => {
      result.current.toast?.onUndo?.();
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.pendingSet).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onCommitDelete).not.toHaveBeenCalled();
  });

  it('flushes pending delete immediately on flushDelete', () => {
    const onCommitDelete = vi.fn();
    const { result } = renderHook(() => useSetDeletion({ onCommitDelete, timeoutMs: 6000 }));

    act(() => {
      result.current.scheduleDelete(mockSet);
    });

    act(() => {
      result.current.flushDelete();
    });

    expect(onCommitDelete).toHaveBeenCalledTimes(1);
    expect(onCommitDelete).toHaveBeenCalledWith('set-123');
    expect(result.current.isPending).toBe(false);
  });
});

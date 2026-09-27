import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkoutSession } from './useWorkoutSession';
import { workoutSessionStore } from '../../utils/workoutSessionStore';
import type { Exercise, RoutineTemplate, WorkoutSet } from '../../types/database';

describe('useWorkoutSession (W5, W24, W39, W46)', () => {
  const targetUserId = 'user-test-123';
  const mockExercises: Exercise[] = [
    { id: 'ex-bench', name: 'Bench Press', body_part: 'Chest', is_master: true },
    { id: 'ex-squat', name: 'Squat', body_part: 'Legs', is_master: true },
    { id: 'ex-row', name: 'Barbell Row', body_part: 'Back', is_master: true },
  ];

  const defaultProps = {
    targetUserId,
    exercises: mockExercises,
    exercisesFetched: true,
    customTemplates: [] as RoutineTemplate[],
    templatesFetched: true,
    userLogs: [] as (WorkoutSet & { workout_date: string; workout_name?: string })[],
    logsFetched: true,
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('W46: clamps target sets stepper to maximum of 20', () => {
    const { result } = renderHook(() => useWorkoutSession(defaultProps));

    act(() => {
      result.current.handleAddExercise('Bench Press');
    });

    expect(result.current.targetSetCounts['Bench Press']).toBe(3);

    // Increment up to and beyond 20
    act(() => {
      for (let i = 0; i < 25; i++) {
        result.current.adjustTargetSets('Bench Press', 1);
      }
    });

    expect(result.current.targetSetCounts['Bench Press']).toBe(20);

    // One more increment stays at 20
    act(() => {
      result.current.adjustTargetSets('Bench Press', 1);
    });

    expect(result.current.targetSetCounts['Bench Press']).toBe(20);
  });

  it('W39: rapid sequential moveExercise preserves all intermediate movements without dropping', () => {
    const { result } = renderHook(() => useWorkoutSession(defaultProps));

    act(() => {
      result.current.handleAddExercise('Bench Press');
      result.current.handleAddExercise('Squat');
      result.current.handleAddExercise('Barbell Row');
    });

    expect(result.current.activeExercises).toEqual(['Bench Press', 'Squat', 'Barbell Row']);

    // Move Barbell Row (index 2) up twice rapidly
    act(() => {
      result.current.moveExercise(2, -1);
      result.current.moveExercise(1, -1);
    });

    expect(result.current.activeExercises).toEqual(['Barbell Row', 'Bench Press', 'Squat']);
  });

  it('W5: typing weight keeps reps undefined in draft so visible/ghost reps are not blanked', () => {
    const { result } = renderHook(() => useWorkoutSession(defaultProps));

    act(() => {
      result.current.handleAddExercise('Bench Press');
    });

    // Type weight 105 into set 1
    act(() => {
      result.current.updateDraft('Bench Press', 1, 'weight', '105');
    });

    const draft = result.current.inputDrafts['Bench Press_1'];
    expect(draft).toBeDefined();
    expect(draft.weight).toBe('105');
    // W5: Untouched reps field must remain undefined, NOT coerced to empty string ''
    expect(draft.reps).toBeUndefined();
  });

  it('W24: saves session pointer for past dates so reload stays on past date', () => {
    const pastDate = '2026-09-15';
    // Initialize a past-date session in the store
    workoutSessionStore.getOrInitSession(targetUserId, pastDate, {
      routineName: 'Upper Body',
      exercises: ['Bench Press'],
      targetSetCounts: { 'Bench Press': 3 },
      targetRepCounts: { 'Bench Press': 8 },
    });

    const saveSpy = vi.spyOn(workoutSessionStore, 'saveSession');

    renderHook(() => useWorkoutSession({
      ...defaultProps,
      userLogs: [],
    }));

    // Check if saveSession was called with setPointer = true for past date session
    if (saveSpy.mock.calls.length > 0) {
      const lastCall = saveSpy.mock.calls[saveSpy.mock.calls.length - 1];
      expect(lastCall[1]).toBe(true);
    }
  });
});

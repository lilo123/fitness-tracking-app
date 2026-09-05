import { describe, it, expect } from 'vitest';
import { computeGhostSets, getExerciseBenchmarks, normalizeDateStr } from './ghostSets';
import type { WorkoutSet } from '../types/database';

describe('Ghost Sets Algorithm & Benchmarks', () => {
  it('normalizes date strings correctly', () => {
    expect(normalizeDateStr('2026-09-01T12:00:00Z')).toBe('2026-09-01');
    expect(normalizeDateStr('2026-09-01')).toBe('2026-09-01');
    expect(normalizeDateStr(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
    expect(normalizeDateStr('')).toBe('');
  });

  it('returns empty ghost sets when no previous workout history exists', () => {
    const ghosts = computeGhostSets('ex-bench', 3, [], '2026-09-02');
    expect(ghosts).toHaveLength(3);
    expect(ghosts[0]).toEqual({
      weight: '',
      reps: '',
      hintText: '—',
      isFromPrevious: false,
    });
    expect(ghosts[1].isFromPrevious).toBe(false);
    expect(ghosts[2].isFromPrevious).toBe(false);
  });

  it('maps 1:1 previous working sets correctly', () => {
    const history: (WorkoutSet & { workout_date: string })[] = [
      {
        exercise_id: 'ex-bench',
        set_index: 1,
        set_type: 'working',
        weight: 185,
        reps: 8,
        workout_date: '2026-08-28',
      },
      {
        exercise_id: 'ex-bench',
        set_index: 2,
        set_type: 'working',
        weight: 185,
        reps: 7,
        workout_date: '2026-08-28',
      },
      {
        exercise_id: 'ex-bench',
        set_index: 3,
        set_type: 'working',
        weight: 190,
        reps: 5,
        workout_date: '2026-08-28',
      },
    ];

    const ghosts = computeGhostSets('ex-bench', 3, history, '2026-09-01');
    expect(ghosts).toHaveLength(3);
    expect(ghosts[0]).toEqual({
      weight: 185,
      reps: 8,
      hintText: '185 lbs × 8',
      isFromPrevious: true,
    });
    expect(ghosts[1]).toEqual({
      weight: 185,
      reps: 7,
      hintText: '185 lbs × 7',
      isFromPrevious: true,
    });
    expect(ghosts[2]).toEqual({
      weight: 190,
      reps: 5,
      hintText: '190 lbs × 5',
      isFromPrevious: true,
    });
  });

  it('handles set expansion by propagating the last available set values', () => {
    const history: (WorkoutSet & { workout_date: string })[] = [
      {
        exercise_id: 'ex-bench',
        set_index: 1,
        set_type: 'working',
        weight: 135,
        reps: 10,
        workout_date: '2026-08-25',
      },
      {
        exercise_id: 'ex-bench',
        set_index: 2,
        set_type: 'working',
        weight: 155,
        reps: 8,
        workout_date: '2026-08-25',
      },
    ];

    // User is doing 4 sets today
    const ghosts = computeGhostSets('ex-bench', 4, history, '2026-08-29');
    expect(ghosts).toHaveLength(4);
    expect(ghosts[0].weight).toBe(135);
    expect(ghosts[1].weight).toBe(155);
    // Set 3 and Set 4 inherit Set 2
    expect(ghosts[2].weight).toBe(155);
    expect(ghosts[2].reps).toBe(8);
    expect(ghosts[3].weight).toBe(155);
    expect(ghosts[3].reps).toBe(8);
  });

  it('handles set contraction by limiting to target set count', () => {
    const history: (WorkoutSet & { workout_date: string })[] = [
      {
        exercise_id: 'ex-squat',
        set_index: 1,
        set_type: 'working',
        weight: 225,
        reps: 5,
        workout_date: '2026-08-20',
      },
      {
        exercise_id: 'ex-squat',
        set_index: 2,
        set_type: 'working',
        weight: 245,
        reps: 5,
        workout_date: '2026-08-20',
      },
      {
        exercise_id: 'ex-squat',
        set_index: 3,
        set_type: 'working',
        weight: 265,
        reps: 3,
        workout_date: '2026-08-20',
      },
    ];

    // User only wants 2 sets today
    const ghosts = computeGhostSets('ex-squat', 2, history, '2026-08-25');
    expect(ghosts).toHaveLength(2);
    expect(ghosts[0].weight).toBe(225);
    expect(ghosts[1].weight).toBe(245);
  });

  it('prefers working sets and filters out warmup sets from ghost values when working sets exist', () => {
    const history: (WorkoutSet & { workout_date: string })[] = [
      {
        exercise_id: 'ex-deadlift',
        set_index: 1,
        set_type: 'warmup',
        weight: 135,
        reps: 10,
        workout_date: '2026-08-22',
      },
      {
        exercise_id: 'ex-deadlift',
        set_index: 2,
        set_type: 'warmup',
        weight: 225,
        reps: 5,
        workout_date: '2026-08-22',
      },
      {
        exercise_id: 'ex-deadlift',
        set_index: 3,
        set_type: 'working',
        weight: 315,
        reps: 5,
        workout_date: '2026-08-22',
      },
      {
        exercise_id: 'ex-deadlift',
        set_index: 4,
        set_type: 'working',
        weight: 335,
        reps: 3,
        workout_date: '2026-08-22',
      },
    ];

    const ghosts = computeGhostSets('ex-deadlift', 2, history, '2026-08-29');
    expect(ghosts).toHaveLength(2);
    expect(ghosts[0].weight).toBe(315);
    expect(ghosts[0].reps).toBe(5);
    expect(ghosts[1].weight).toBe(335);
    expect(ghosts[1].reps).toBe(3);
  });

  it('selects the strictly most recent previous session and computes PR correctly', () => {
    const history: (WorkoutSet & { workout_date: string })[] = [
      {
        exercise_id: 'ex-press',
        set_index: 1,
        set_type: 'working',
        weight: 100,
        reps: 10,
        workout_date: '2026-08-01',
      },
      {
        exercise_id: 'ex-press',
        set_index: 1,
        set_type: 'working',
        weight: 120,
        reps: 5,
        workout_date: '2026-08-15',
      },
      {
        exercise_id: 'ex-press',
        set_index: 1,
        set_type: 'working',
        weight: 115,
        reps: 6,
        workout_date: '2026-08-25',
      },
    ];

    const benchmarks = getExerciseBenchmarks('ex-press', history, '2026-08-30');
    expect(benchmarks.lastSession).not.toBeNull();
    expect(benchmarks.lastSession?.date).toBe('2026-08-25');
    expect(benchmarks.lastSession?.summaryText).toBe('115×6');

    // PR is the heaviest set (120 lbs)
    expect(benchmarks.pr).not.toBeNull();
    expect(benchmarks.pr?.weight).toBe(120);
    expect(benchmarks.pr?.reps).toBe(5);
    expect(benchmarks.pr?.date).toBe('2026-08-15');
  });
});

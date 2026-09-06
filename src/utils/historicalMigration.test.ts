import { describe, it, expect } from 'vitest';
import {
  resolveExerciseName,
  sanitizeHistoricalLogs,
  calculateTotalVolume,
  assertMigrationIntegrity,
  isMasterExercise,
  isCustomExercise,
  MASTER_EXERCISE_NAMES,
  CUSTOM_EXERCISE_NAMES,
  PURGED_CLIENT_IDS,
  TARGET_COACH_UID,
  TARGET_COACH_EMAIL,
} from './historicalMigration';

describe('Historical Data Migration Utilities', () => {
  it('identifies the approved target coach account correctly', () => {
    expect(TARGET_COACH_UID).toBe('2d444ce2-c0cf-483f-a82e-43c8fb9807b1');
    expect(TARGET_COACH_EMAIL).toBe('diehard643@gmail.com');
  });

  it('aliases Lat Cable Pulldown to Lat Cable Prayer and normalizes Push to Pull', () => {
    expect(resolveExerciseName('Lat Cable Pulldown')).toBe('Lat Cable Prayer');
    expect(resolveExerciseName('lat cable pulldown ')).toBe('Lat Cable Prayer');
    expect(resolveExerciseName('Overhead Tricep Cable Push')).toBe('Overhead Tricep Cable Pull');
    expect(resolveExerciseName('Incline Bench Press')).toBe('Incline Bench Press');
    expect(resolveExerciseName('Dips')).toBe('Dips');
  });

  it('purges the 2 phantom duplicate submissions from historical logs', () => {
    const sampleLogs = [
      {
        Workout_ID: 'Push, Quads, & Core - Reduced',
        Exercise_ID: 'Dips',
        Weight: 170,
        Reps: 11,
        Date: '2026-08-24',
        Set_Index: 3,
        Client_ID: 'C-1787597938443-epapxp', // Legitimate set 3
      },
      {
        Workout_ID: 'Push, Quads, & Core - Reduced',
        Exercise_ID: 'Dips',
        Weight: 170,
        Reps: 11,
        Date: '2026-08-24',
        Set_Index: 3,
        Client_ID: 'C-1787598085077-nsksze', // Phantom duplicate set 3 (14.2s later)
      },
      {
        Workout_ID: 'Pull, Hamstring, & Core - Reduced',
        Exercise_ID: 'Lat Pull Down',
        Weight: 190,
        Reps: 7,
        Date: '2026-08-13',
        Set_Index: 1,
        Client_ID: 'C-1786658480399-o979fn', // Legitimate set 1
      },
      {
        Workout_ID: 'Pull, Hamstring, & Core - Reduced',
        Exercise_ID: 'Lat Pull Down',
        Weight: 190,
        Reps: 7,
        Date: '2026-08-13',
        Set_Index: 1,
        Client_ID: 'C-1786658684370-z2ebzn', // Duplicate set 1
      },
      {
        Workout_ID: 'Pull, Hamstring, & Core - Reduced',
        Exercise_ID: 'Lat Pull Down',
        Weight: 175,
        Reps: 7,
        Date: '2026-08-13',
        Set_Index: 2,
        Client_ID: 'C-1786658684990-tqwbfl', // Legitimate set 2
      },
      {
        Workout_ID: 'Push, Quads, & Core - Reduced',
        Exercise_ID: 'Lat Cable Pulldown',
        Weight: 45,
        Reps: 15,
        Date: '2026-08-25',
        Set_Index: 1,
        Client_ID: 'C-1787679349977-8sp4p3', // Legitimate set aliased
      },
    ];

    expect(PURGED_CLIENT_IDS.has('C-1787598085077-nsksze')).toBe(true);
    expect(PURGED_CLIENT_IDS.has('C-1786658684370-z2ebzn')).toBe(true);

    const sanitized = sanitizeHistoricalLogs(sampleLogs);
    expect(sanitized).toHaveLength(4);

    // Verify duplicates removed
    const clientIds = sanitized.map((s) => s.clientId);
    expect(clientIds).not.toContain('C-1787598085077-nsksze');
    expect(clientIds).not.toContain('C-1786658684370-z2ebzn');
    expect(clientIds).toContain('C-1787597938443-epapxp');
    expect(clientIds).toContain('C-1786658480399-o979fn');

    // Verify aliased exercise
    const aliasedSet = sanitized.find((s) => s.clientId === 'C-1787679349977-8sp4p3');
    expect(aliasedSet?.exerciseName).toBe('Lat Cable Prayer');
  });

  it('correctly calculates total volume including decimal bodyweights', () => {
    const sampleSets = [
      { weight: 178.8, reps: 14 }, // Bodyweight dips on 2026-08-31 = 2503.2
      { weight: 190.0, reps: 9 },   // 1710.0
      { weight: 0.0, reps: 20 },    // Bodyweight reverse crunch = 0
      { weight: 120.0, reps: 10 },  // 1200.0
    ];

    const volume = calculateTotalVolume(sampleSets);
    expect(volume).toBe(5413.2);
  });

  it('validates migration integrity assertion gates', () => {
    const validMetrics = {
      workoutsCount: 21,
      setsCount: 283,
      totalVolume: 242973.2,
      templatesCount: 4,
      templateExercisesCount: 22,
      nutritionLogsCount: 46,
      catalogExercisesCount: 23,
    };

    expect(() => assertMigrationIntegrity(validMetrics)).not.toThrow();

    // Mismatched sets
    expect(() =>
      assertMigrationIntegrity({ ...validMetrics, setsCount: 285 })
    ).toThrowError(/Expected 283 sets, got 285/);

    // Mismatched volume
    expect(() =>
      assertMigrationIntegrity({ ...validMetrics, totalVolume: 246173.2 })
    ).toThrowError(/Expected 242973.2 lbs volume/);

    // Mismatched workouts
    expect(() =>
      assertMigrationIntegrity({ ...validMetrics, workoutsCount: 20 })
    ).toThrowError(/Expected 21 workouts/);

    // Mismatched templates
    expect(() =>
      assertMigrationIntegrity({ ...validMetrics, templatesCount: 3 })
    ).toThrowError(/Expected 4 routine templates/);

    // Mismatched template exercises
    expect(() =>
      assertMigrationIntegrity({ ...validMetrics, templateExercisesCount: 20 })
    ).toThrowError(/Expected 22 template exercises/);

    // Mismatched nutrition logs
    expect(() =>
      assertMigrationIntegrity({ ...validMetrics, nutritionLogsCount: 45 })
    ).toThrowError(/Expected 46 nutrition logs/);

    // Mismatched catalog exercises
    expect(() =>
      assertMigrationIntegrity({ ...validMetrics, catalogExercisesCount: 24 })
    ).toThrowError(/Expected 23 catalog exercises/);
  });

  it('correctly classifies master vs custom exercises', () => {
    // 12 master exercises
    expect(MASTER_EXERCISE_NAMES).toHaveLength(12);
    expect(isMasterExercise('Incline Bench Press')).toBe(true);
    expect(isMasterExercise('dips')).toBe(true);
    expect(isMasterExercise('Overhead Tricep Cable Pull')).toBe(true);
    // Legacy catalog alias
    expect(isMasterExercise('Overhead Tricep Cable Push')).toBe(true);

    // 11 custom exercises
    expect(CUSTOM_EXERCISE_NAMES).toHaveLength(11);
    expect(isCustomExercise('Dragon Flag')).toBe(true);
    expect(isCustomExercise('L2H Cable Fly')).toBe(true);
    expect(isCustomExercise('Lat Cable Prayer')).toBe(true);
    // Legacy logging alias
    expect(isCustomExercise('Lat Cable Pulldown')).toBe(true);

    // Cross-check mutual exclusivity
    expect(isMasterExercise('Dragon Flag')).toBe(false);
    expect(isCustomExercise('Incline Bench Press')).toBe(false);
    expect(isMasterExercise('Unknown Exercise')).toBe(false);
    expect(isCustomExercise('Unknown Exercise')).toBe(false);
  });

  it('safely handles null/undefined inputs and invalid numbers', () => {
    expect(resolveExerciseName(null)).toBe('');
    expect(resolveExerciseName(undefined)).toBe('');
    expect(resolveExerciseName('')).toBe('');

    const corruptedLogs = [
      {
        Workout_ID: 'Workout Test',
        Exercise_ID: 'Dips',
        Weight: -10, // negative weight
        Reps: 'invalid', // NaN reps
        Date: '2026-08-20',
        Set_Index: 0, // invalid index < 1
        Client_ID: 'C-valid-1',
      },
      {
        Workout_ID: 'Workout Test',
        Exercise_ID: 'Dips',
        Weight: 100,
        Reps: 10,
        Date: '2026-08-20',
        Set_Index: 1,
        Client_ID: '', // empty client id
      },
    ];

    const sanitized = sanitizeHistoricalLogs(corruptedLogs as any);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].weight).toBe(0);
    expect(sanitized[0].reps).toBe(0);
    expect(sanitized[0].setIndex).toBe(1);

    // Volume calculation ignores invalid/negative values
    expect(
      calculateTotalVolume([
        { weight: -50, reps: 10 },
        { weight: 100, reps: -5 },
        { weight: NaN, reps: 10 },
        { weight: 50, reps: 10 },
      ])
    ).toBe(500);
  });
});

import { describe, it, expect } from 'vitest';
import { groupTimelineDays, isMidnightUtc } from './timelineGrouping';
import type { CoachNutritionLog, CoachWorkoutSession } from '../components/coach/CoachAthleteTimeline';

describe('groupTimelineDays', () => {
  it('groups nutrition log under local day when UTC timestamp falls on the next day (west of UTC: America/New_York)', () => {
    // 20:30 EDT dinner on Sep 21 is stored as 2026-09-22T00:30:00Z in UTC.
    // In America/New_York (UTC-4 in Sep), this must group under 2026-09-21.
    const nutrition: CoachNutritionLog[] = [
      {
        id: 'nut-evening',
        food_name: 'Late Dinner Steak',
        calories: 750,
        protein: 60,
        carbs: 10,
        fat: 40,
        logged_at: '2026-09-22T00:30:00Z',
      },
    ];

    const result = groupTimelineDays([], nutrition, 'America/New_York');

    // Assert a 2026-09-21 day exists in output and contains the nutrition log
    const dayDates = result.map((d) => d.date);
    expect(dayDates).toContain('2026-09-21');
    expect(dayDates).not.toContain('2026-09-22');

    const sep21 = result.find((d) => d.date === '2026-09-21');
    expect(sep21).toBeDefined();
    expect(sep21?.nutrition).toHaveLength(1);
    expect(sep21?.nutrition[0].id).toBe('nut-evening');
  });

  it('groups nutrition log under local day when UTC timestamp falls on the previous day (east of UTC: Asia/Ho_Chi_Minh)', () => {
    // 03:30 ICT breakfast on Sep 22 is stored as 2026-09-21T20:30:00Z in UTC (UTC+7).
    // In Asia/Ho_Chi_Minh, this must group under 2026-09-22.
    const nutrition: CoachNutritionLog[] = [
      {
        id: 'nut-morning',
        food_name: 'Pho Bo Breakfast',
        calories: 500,
        protein: 30,
        carbs: 65,
        fat: 12,
        logged_at: '2026-09-21T20:30:00Z',
      },
    ];

    const result = groupTimelineDays([], nutrition, 'Asia/Ho_Chi_Minh');

    // Assert a 2026-09-22 day exists in output and contains the nutrition log
    const dayDates = result.map((d) => d.date);
    expect(dayDates).toContain('2026-09-22');
    expect(dayDates).not.toContain('2026-09-21');

    const sep22 = result.find((d) => d.date === '2026-09-22');
    expect(sep22).toBeDefined();
    expect(sep22?.nutrition).toHaveLength(1);
    expect(sep22?.nutrition[0].id).toBe('nut-morning');
  });

  it('preserves workout civil date without timezone shifting (avoiding the opposite bug)', () => {
    // workouts.date is a bare civil date string or UTC midnight timestamptz representing the athlete's day.
    // If timezone conversion were erroneously applied, 2026-09-21T00:00:00Z in America/New_York
    // would shift back to 2026-09-20 20:00 EDT (yesterday).
    const workouts: CoachWorkoutSession[] = [
      {
        id: 'w-1',
        name: 'Heavy Leg Day',
        date: '2026-09-21T00:00:00.000Z',
        sets: [],
      },
      {
        id: 'w-2',
        name: 'Upper Body Push',
        date: '2026-09-20',
        sets: [],
      },
    ];

    const result = groupTimelineDays(workouts, [], 'America/New_York');

    const dayDates = result.map((d) => d.date);
    expect(dayDates).toContain('2026-09-21');
    expect(dayDates).toContain('2026-09-20');
    expect(dayDates).not.toContain('2026-09-19');

    const sep21 = result.find((d) => d.date === '2026-09-21');
    expect(sep21?.workouts).toHaveLength(1);
    expect(sep21?.workouts[0].id).toBe('w-1');
  });

  it('groups workouts and nutrition on the same local day together and sorts days descending', () => {
    const workouts: CoachWorkoutSession[] = [
      {
        id: 'w-sep21',
        name: 'Chest & Arms',
        date: '2026-09-21',
        sets: [],
      },
      {
        id: 'w-sep20',
        name: 'Back & Core',
        date: '2026-09-20',
        sets: [],
      },
    ];

    const nutrition: CoachNutritionLog[] = [
      // 20:30 EDT on Sep 21 = 2026-09-22T00:30:00Z
      {
        id: 'n-dinner',
        food_name: 'Dinner',
        calories: 800,
        protein: 50,
        carbs: 60,
        fat: 25,
        logged_at: '2026-09-22T00:30:00Z',
      },
      // 12:00 EDT on Sep 21 = 2026-09-21T16:00:00Z
      {
        id: 'n-lunch',
        food_name: 'Lunch',
        calories: 600,
        protein: 40,
        carbs: 50,
        fat: 15,
        logged_at: '2026-09-21T16:00:00Z',
      },
    ];

    const result = groupTimelineDays(workouts, nutrition, 'America/New_York');

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-09-21');
    expect(result[1].date).toBe('2026-09-20');

    expect(result[0].workouts).toHaveLength(1);
    expect(result[0].nutrition).toHaveLength(2);

    expect(result[1].workouts).toHaveLength(1);
    expect(result[1].nutrition).toHaveLength(0);
  });

  it('correctly converts non-midnight workout timestamps (database default now()) to local day', () => {
    // A workout recorded at 20:30 EDT on Sep 21 is stored with UTC timestamp 2026-09-22T00:30:00Z.
    // Unlike midnight civil dates, non-midnight timestamps must convert to the athlete's local date (Sep 21).
    const workouts: CoachWorkoutSession[] = [
      {
        id: 'w-late-night',
        name: 'Late Evening Workout',
        date: '2026-09-22T00:30:00Z',
        sets: [],
      },
      {
        id: 'w-civil-midnight',
        name: 'Civil Date Workout',
        date: '2026-09-22T00:00:00.000Z',
        sets: [],
      },
    ];

    const result = groupTimelineDays(workouts, [], 'America/New_York');

    // w-late-night should convert to 2026-09-21 EDT
    const sep21 = result.find((d) => d.date === '2026-09-21');
    expect(sep21).toBeDefined();
    expect(sep21?.workouts.map((w) => w.id)).toContain('w-late-night');

    // w-civil-midnight should remain 2026-09-22
    const sep22 = result.find((d) => d.date === '2026-09-22');
    expect(sep22).toBeDefined();
    expect(sep22?.workouts.map((w) => w.id)).toContain('w-civil-midnight');
  });

  it('correctly converts non-midnight workout timestamps east of UTC to local day', () => {
    // In Asia/Ho_Chi_Minh (UTC+7), a workout at 03:30 ICT on Sep 22 is stored as 2026-09-21T20:30:00Z.
    const workouts: CoachWorkoutSession[] = [
      {
        id: 'w-morning-hcm',
        name: 'Early Morning Run',
        date: '2026-09-21T20:30:00Z',
        sets: [],
      },
    ];

    const result = groupTimelineDays(workouts, [], 'Asia/Ho_Chi_Minh');
    const dayDates = result.map((d) => d.date);
    expect(dayDates).toContain('2026-09-22');
    expect(dayDates).not.toContain('2026-09-21');
  });
});

describe('isMidnightUtc', () => {
  it('identifies bare civil dates as midnight UTC', () => {
    expect(isMidnightUtc('2026-09-21')).toBe(true);
    expect(isMidnightUtc('2026-01-01')).toBe(true);
  });

  it('identifies ISO midnight UTC strings as midnight UTC', () => {
    expect(isMidnightUtc('2026-09-21T00:00:00Z')).toBe(true);
    expect(isMidnightUtc('2026-09-21T00:00:00.000Z')).toBe(true);
    expect(isMidnightUtc('2026-09-21T00:00:00+00:00')).toBe(true);
    expect(isMidnightUtc('2026-09-21 00:00:00+00')).toBe(true);
  });

  it('identifies non-midnight timestamps as NOT midnight UTC', () => {
    expect(isMidnightUtc('2026-09-22T00:30:00Z')).toBe(false);
    expect(isMidnightUtc('2026-09-17 19:07:25.346325+00')).toBe(false);
    expect(isMidnightUtc('2026-09-21T00:00:01Z')).toBe(false);
  });

  it('handles falsy or invalid inputs gracefully', () => {
    expect(isMidnightUtc('')).toBe(false);
    expect(isMidnightUtc(null)).toBe(false);
    expect(isMidnightUtc(undefined)).toBe(false);
    expect(isMidnightUtc('invalid-date')).toBe(false);
  });
});

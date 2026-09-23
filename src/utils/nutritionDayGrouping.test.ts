import { describe, it, expect } from 'vitest';
import { groupNutritionDays } from './nutritionDayGrouping';
import { isWithinDayBounds } from './date';
import type { NutritionLog } from '../types/database';

function createLog(overrides: Partial<NutritionLog> = {}): NutritionLog {
  return {
    id: 'test-log-1',
    user_id: 'test-user',
    food_name: 'Test Food',
    calories: 500,
    protein: 30,
    carbs: 50,
    fat: 20,
    fiber: 5,
    logged_at: '2026-09-21T12:00:00Z',
    ...overrides,
  };
}

describe('groupNutritionDays', () => {
  describe('(a) Regression test: timezone-aware day grouping (HistoryView bug)', () => {
    it('groups a 2026-09-22T02:00:00Z log under 2026-09-21 in America/Los_Angeles (19:00 local)', () => {
      // At 2026-09-22T02:00:00Z, Los Angeles is in PDT (UTC-7), so local time is 2026-09-21 19:00.
      // Without timezone, raw UTC prefix groups this under 2026-09-22 (one day late).
      // With timezone awareness, this correctly groups under 2026-09-21.
      const log = createLog({
        id: 'keto-bar-evening',
        food_name: 'Keto Bar',
        calories: 220,
        protein: 12,
        carbs: 6,
        fat: 16,
        fiber: 3,
        logged_at: '2026-09-22T02:00:00Z',
      });

      const result = groupNutritionDays([log], 'America/Los_Angeles');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-09-21');
      expect(result[0].meals).toHaveLength(1);
      expect(result[0].meals[0].id).toBe('keto-bar-evening');
    });
  });

  describe('(b) Cross-path consistency oracle (HistoryView vs Nutrition tab)', () => {
    it('day key matches selectedDate for which isWithinDayBounds is true across 24 hours and multiple timezones', () => {
      const timezones = [
        'America/Los_Angeles',
        'America/New_York',
        'UTC',
        'Asia/Tokyo',
      ];

      // Spans a full 24 hours (hourly samples on 2026-09-21)
      const candidateDates = ['2026-09-20', '2026-09-21', '2026-09-22'];

      for (const tz of timezones) {
        for (let hour = 0; hour < 24; hour++) {
          const hh = String(hour).padStart(2, '0');
          const timestamp = `2026-09-21T${hh}:30:00.000Z`;

          const log = createLog({
            id: `log-${tz}-${hh}`,
            food_name: `Meal at ${hh}:30 UTC`,
            logged_at: timestamp,
          });

          // The oracle: find which calendar day the Nutrition tab would attribute this timestamp to
          const matchingDates = candidateDates.filter((date) =>
            isWithinDayBounds(timestamp, date, tz)
          );
          expect(matchingDates).toHaveLength(1);
          const oracleDate = matchingDates[0];

          // The History tab grouping under test
          const grouped = groupNutritionDays([log], tz);

          expect(grouped).toHaveLength(1);
          expect(grouped[0].date).toBe(oracleDate);
          expect(isWithinDayBounds(log.logged_at, grouped[0].date, tz)).toBe(true);
        }
      }
    });
  });

  describe('macro maths, totals, percentages, and sorting', () => {
    it('accurately computes totals, 4/4/9 macro calories, and percentage residual trick', () => {
      const log1 = createLog({
        id: 'meal-1',
        calories: 300,
        protein: 25, // 100 cal
        carbs: 35,   // 140 cal
        fat: 10,     // 90 cal
        fiber: 4,
        logged_at: '2026-09-21T14:00:00Z',
      });
      const log2 = createLog({
        id: 'meal-2',
        calories: 400,
        protein: 35, // 140 cal
        carbs: 45,   // 180 cal
        fat: 10,     // 90 cal
        fiber: 6,
        logged_at: '2026-09-21T18:00:00Z',
      });

      const [day] = groupNutritionDays([log1, log2], 'UTC');

      expect(day.date).toBe('2026-09-21');
      expect(day.meals).toHaveLength(2);
      expect(day.totals).toEqual({
        calories: 700,
        protein: 60,
        carbs: 80,
        fat: 20,
        fiber: 10,
      });

      // protein cal: 60 * 4 = 240
      // carbs cal: 80 * 4 = 320
      // fat cal: 20 * 9 = 180
      // totalMacroCal = 740
      expect(day.macroCalories).toEqual({
        protein: 240,
        carbs: 320,
        fat: 180,
        total: 740,
      });

      // pPct = Math.round((240 / 740) * 100) = 32
      // cPct = Math.round((320 / 740) * 100) = 43
      // fPct = Math.max(0, 100 - 32 - 43) = 25
      expect(day.percentages).toEqual({
        protein: 32,
        carbs: 43,
        fat: 25,
      });
      expect(day.percentages.protein + day.percentages.carbs + day.percentages.fat).toBe(100);
    });

    it('handles zero macro calories safely with zeroed percentages', () => {
      const log = createLog({
        id: 'water-log',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        logged_at: '2026-09-21T12:00:00Z',
      });

      const [day] = groupNutritionDays([log], 'UTC');
      expect(day.macroCalories).toEqual({
        protein: 0,
        carbs: 0,
        fat: 0,
        total: 0,
      });
      expect(day.percentages).toEqual({
        protein: 0,
        carbs: 0,
        fat: 0,
      });
    });

    it('sorts multiple days descending by date string', () => {
      const logSep20 = createLog({
        id: 'sep20',
        logged_at: '2026-09-20T12:00:00Z',
      });
      const logSep22 = createLog({
        id: 'sep22',
        logged_at: '2026-09-22T12:00:00Z',
      });
      const logSep21 = createLog({
        id: 'sep21',
        logged_at: '2026-09-21T12:00:00Z',
      });

      const days = groupNutritionDays([logSep20, logSep22, logSep21], 'UTC');
      expect(days.map((d) => d.date)).toEqual(['2026-09-22', '2026-09-21', '2026-09-20']);
    });

    it('skips logs with empty or falsy logged_at', () => {
      const invalidLog1 = createLog({ logged_at: '' });
      const invalidLog2 = createLog({ logged_at: null as any });
      const validLog = createLog({ logged_at: '2026-09-21T12:00:00Z' });

      const days = groupNutritionDays([invalidLog1, invalidLog2, validLog], 'UTC');
      expect(days).toHaveLength(1);
      expect(days[0].date).toBe('2026-09-21');
    });

    it('coerces null and undefined numeric macro values to 0', () => {
      const log = createLog({
        calories: undefined as any,
        protein: null,
        carbs: null,
        fat: null,
        fiber: null,
        logged_at: '2026-09-21T12:00:00Z',
      });

      const [day] = groupNutritionDays([log], 'UTC');
      expect(day.totals).toEqual({
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
      });
    });

    it('falls back to resolvedOptions timezone when timeZone is omitted', () => {
      const log = createLog({
        logged_at: '2026-09-21T12:00:00Z',
      });

      const days = groupNutritionDays([log]);
      expect(days).toHaveLength(1);
      expect(days[0].meals).toHaveLength(1);
    });
  });
});

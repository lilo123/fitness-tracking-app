import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNutritionData } from './useNutritionData';
import { supabase } from '../../lib/supabase';
import { getDayBounds, localCivilToUtcMs, isWithinDayBounds } from '../../utils/date';
import { createSupabaseBuilder, getRecordedSelects, getRecordedTables, clearMockHistory } from '../../test/supabaseBuilderMock';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('useNutritionData (src/components/nutrition/useNutritionData.ts)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    clearMockHistory();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('queries PostgREST using precise startOfDay and endOfDay from getDayBounds', async () => {
    let capturedGte: string | null = null;
    let capturedLte: string | null = null;
    let capturedTable: string | null = null;

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      capturedTable = table;
      const builder = createSupabaseBuilder(table, { data: [], error: null });
      if (table === 'nutrition_logs') {
        const origGte = builder.gte.bind(builder);
        const origLte = builder.lte.bind(builder);
        builder.gte = (col: string, val: any) => {
          capturedGte = val;
          return origGte(col, val);
        };
        builder.lte = (col: string, val: any) => {
          capturedLte = val;
          return origLte(col, val);
        };
      }
      return builder as any;
    });

    const targetDate = '2026-07-04';
    const timeZone = 'America/New_York';
    const expectedBounds = getDayBounds(targetDate, timeZone);

    renderHook(
      () =>
        useNutritionData({
          targetUserId: 'user-123',
          selectedDate: targetDate,
          timeZone,
          profile: null,
          onMutationSuccessReset: vi.fn(),
          setStatus: vi.fn(),
          setIsError: vi.fn(),
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(capturedGte).toBe(expectedBounds.startOfDay);
      expect(capturedLte).toBe(expectedBounds.endOfDay);
    });

    expect(capturedTable).toBe('nutrition_logs');
    expect(capturedGte).toBe('2026-07-04T04:00:00.000Z');
    expect(capturedLte).toBe('2026-07-05T03:59:59.999Z');

    expect(getRecordedTables()).toContain('nutrition_logs');
    expect(getRecordedSelects()).toContainEqual({
      table: 'nutrition_logs',
      projection: 'id, user_id, food_name, meal_type, calories, protein, carbs, fat, fiber, serving_size, serving_unit, logged_at, created_at, has_components',
    });
  });

  it('filters todayLogs in-memory strictly with isWithinDayBounds across positive offset (Tokyo UTC+9)', async () => {
    const targetDate = '2026-09-08';
    const timeZone = 'Asia/Tokyo';

    // Simulated logs from database spanning boundary
    const mockLogs = [
      {
        id: '1',
        food_name: 'Sept 7 late meal (outside Tokyo Sept 8)',
        calories: 500,
        protein: 30,
        carbs: 40,
        fat: 10,
        fiber: 5,
        logged_at: '2026-09-07T14:59:59.999Z', // 23:59:59.999 Sept 7 JST
      },
      {
        id: '2',
        food_name: 'Sept 8 midnight breakfast (inside Tokyo Sept 8)',
        calories: 400,
        protein: 25,
        carbs: 50,
        fat: 10,
        fiber: 4,
        logged_at: '2026-09-07T15:00:00.000Z', // 00:00:00.000 Sept 8 JST
      },
      {
        id: '3',
        food_name: 'Sept 8 midday lunch',
        calories: 700,
        protein: 45,
        carbs: 60,
        fat: 20,
        fiber: 8,
        logged_at: '2026-09-08T03:00:00.000Z', // 12:00:00.000 Sept 8 JST
      },
      {
        id: '4',
        food_name: 'Sept 8 late night snack',
        calories: 300,
        protein: 20,
        carbs: 20,
        fat: 5,
        fiber: 2,
        logged_at: '2026-09-08T14:59:59.999Z', // 23:59:59.999 Sept 8 JST
      },
      {
        id: '5',
        food_name: 'Sept 9 breakfast (outside Tokyo Sept 8, despite UTC Sept 8 prefix)',
        calories: 600,
        protein: 35,
        carbs: 50,
        fat: 15,
        fiber: 5,
        logged_at: '2026-09-08T23:00:00.000Z', // 08:00:00.000 Sept 9 JST
      },
    ];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return createSupabaseBuilder('nutrition_logs', { data: mockLogs, error: null }) as any;
      }
      return createSupabaseBuilder(table, { data: [], error: null }) as any;
    });

    const { result } = renderHook(
      () =>
        useNutritionData({
          targetUserId: 'user-tokyo',
          selectedDate: targetDate,
          timeZone,
          profile: null,
          onMutationSuccessReset: vi.fn(),
          setStatus: vi.fn(),
          setIsError: vi.fn(),
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.nutritionLogs.length).toBe(5);
    });

    // todayLogs in-memory filter must keep exactly IDs 2, 3, 4 and drop 1 and 5
    expect(result.current.nutritionLogs.length - result.current.todayLogs.length).toBe(2);
    expect(result.current.todayLogs.map((l) => l.id)).toEqual(['2', '3', '4']);
    expect(result.current.dailyTotals.calories).toBe(400 + 700 + 300);
    expect(result.current.dailyTotals.protein).toBe(25 + 45 + 20);
    expect(result.current.dailyTotals.carbs).toBe(50 + 60 + 20);
    expect(result.current.dailyTotals.fat).toBe(10 + 20 + 5);
    expect(result.current.dailyTotals.fiber).toBe(4 + 8 + 2);
  });

  it('scaleLogMutation: refetches items before scaling when items are omitted and updates database', async () => {
    const mockDetailLog = {
      id: 'log-detail-1',
      items: [
        {
          id: 'item-1',
          name: 'Brown Rice',
          quantity: 200,
          unit: 'g',
          calories: 220,
          protein: 5,
          carbs: 45,
          fat: 2,
          fiber: 4,
        },
      ],
      calories: 220,
      protein: 5,
      carbs: 45,
      fat: 2,
      fiber: 4,
    };

    let capturedUpdatedData: any = null;

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        const builder = createSupabaseBuilder('nutrition_logs', {
          resolver: (b: any) => {
            if (b.projection === 'id, items, calories, protein, carbs, fat, fiber') {
              return mockDetailLog;
            }
            if (b.updatedData) {
              capturedUpdatedData = b.updatedData;
              return { data: [b.updatedData], error: null };
            }
            return [];
          },
        });
        return builder as any;
      }
      return createSupabaseBuilder(table, { data: [], error: null }) as any;
    });

    const { result } = renderHook(
      () =>
        useNutritionData({
          targetUserId: 'user-scale-1',
          selectedDate: '2026-09-16',
          profile: null,
          onMutationSuccessReset: vi.fn(),
          setStatus: vi.fn(),
          setIsError: vi.fn(),
        }),
      { wrapper }
    );

    // Call scaleLogMutation without items -> triggers detail refetch
    await result.current.scaleLogMutation.mutateAsync({
      log: {
        id: 'log-detail-1',
        user_id: 'user-scale-1',
        food_name: 'Rice Bowl',
        calories: 220,
        protein: 5,
        carbs: 45,
        fat: 2,
        fiber: 4,
        logged_at: '2026-09-16T12:00:00.000Z',
      },
    });

    expect(getRecordedSelects()).toContainEqual({
      table: 'nutrition_logs',
      projection: 'id, items, calories, protein, carbs, fat, fiber',
    });
    expect(capturedUpdatedData).not.toBeNull();
    expect(capturedUpdatedData.calories).toBe(220);
    expect(capturedUpdatedData.items).toHaveLength(1);
  });

  it('scaleLogMutation: throws error when attempting to rescale a meal without component items', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return createSupabaseBuilder('nutrition_logs', {
          resolver: (b: any) => {
            if (b.projection === 'id, items, calories, protein, carbs, fat, fiber') {
              return { id: 'log-no-items', items: null, calories: 100, protein: 0, carbs: 0, fat: 0, fiber: 0 };
            }
            return [];
          },
        }) as any;
      }
      return createSupabaseBuilder(table, { data: [], error: null }) as any;
    });

    const { result } = renderHook(
      () =>
        useNutritionData({
          targetUserId: 'user-scale-2',
          selectedDate: '2026-09-16',
          profile: null,
          onMutationSuccessReset: vi.fn(),
          setStatus: vi.fn(),
          setIsError: vi.fn(),
        }),
      { wrapper }
    );

    await expect(
      result.current.scaleLogMutation.mutateAsync({
        log: {
          id: 'log-no-items',
          user_id: 'user-scale-2',
          food_name: 'Mystery Meal',
          calories: 100,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          logged_at: '2026-09-16T12:00:00.000Z',
        },
      })
    ).rejects.toThrow('Cannot rescale a meal without component items');
  });

  it('scaleLogMutation: prevents data loss by refusing to persist zero macros for non-zero meal', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      return createSupabaseBuilder(table, { data: [], error: null }) as any;
    });

    const { result } = renderHook(
      () =>
        useNutritionData({
          targetUserId: 'user-scale-3',
          selectedDate: '2026-09-16',
          profile: null,
          onMutationSuccessReset: vi.fn(),
          setStatus: vi.fn(),
          setIsError: vi.fn(),
        }),
      { wrapper }
    );

    const zeroCalorieItem = [
      {
        id: 'water-item',
        name: 'Diet Water',
        quantity: 1,
        unit: 'unit' as const,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
      },
    ];

    await expect(
      result.current.scaleLogMutation.mutateAsync({
        log: {
          id: 'log-nonzero-1',
          user_id: 'user-scale-3',
          food_name: 'Hearty Soup',
          calories: 350,
          protein: 20,
          carbs: 30,
          fat: 10,
          fiber: 5,
          logged_at: '2026-09-16T12:00:00.000Z',
        },
        items: zeroCalorieItem,
      })
    ).rejects.toThrow('Refusing to persist zero macros for non-zero meal: data loss prevented');
  });

  describe('RFIX-18: todayLogs day filter timezone boundary correctness', () => {
    const targetDate = '2026-09-17';
    const testTimezones = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'];

    it.each(testTimezones)(
      'rejects zero valid records returned by query across 24 hourly timestamps in %s',
      async (tz) => {
        // Generate 24 hourly timestamps + 23:59:59.999 end-of-day boundary
        const timestamps: string[] = [];
        for (let hour = 0; hour < 24; hour++) {
          const utcMs = localCivilToUtcMs(2026, 9, 17, hour, 0, 0, 0, tz);
          timestamps.push(new Date(utcMs).toISOString());
        }
        const endDayMs = localCivilToUtcMs(2026, 9, 17, 23, 59, 59, 999, tz);
        timestamps.push(new Date(endDayMs).toISOString());

        // 1. Direct validation: isWithinDayBounds preserves 100% of the 25 records
        for (const ts of timestamps) {
          expect(isWithinDayBounds(ts, targetDate, tz)).toBe(true);
        }

        // 2. Component integration via useNutritionData
        const mockLogs = timestamps.map((ts, idx) => ({
          id: `log-${tz}-${idx}`,
          user_id: 'user-tz-test',
          food_name: `Meal hour ${idx}`,
          meal_type: 'snack',
          calories: 100,
          protein: 10,
          carbs: 10,
          fat: 2,
          fiber: 1,
          serving_size: 1,
          serving_unit: 'serving',
          logged_at: ts,
          created_at: ts,
          has_components: false,
        }));

        vi.mocked(supabase.from).mockImplementation((table: string) => {
          if (table === 'nutrition_logs') {
            return createSupabaseBuilder('nutrition_logs', { data: mockLogs, error: null }) as any;
          }
          return createSupabaseBuilder(table, { data: [], error: null }) as any;
        });

        const { result } = renderHook(
          () =>
            useNutritionData({
              targetUserId: 'user-tz-test',
              selectedDate: targetDate,
              timeZone: tz,
              profile: null,
              onMutationSuccessReset: vi.fn(),
              setStatus: vi.fn(),
              setIsError: vi.fn(),
            }),
          { wrapper }
        );

        await waitFor(() => {
          expect(result.current.nutritionLogs.length).toBe(25);
        });

        // Defensive check rejects zero valid records: exactly 25/25 records retained in todayLogs
        expect(result.current.todayLogs.length).toBe(25);
        expect(result.current.todayLogs.map((l) => l.id)).toEqual(mockLogs.map((l) => l.id));
        expect(result.current.dailyTotals.calories).toBe(25 * 100);
      }
    );

    it('NC: naive new Date().toDateString() drops 23:59:59 record with differing UTC date, while defensive check preserves it', () => {
      const tz = 'America/New_York';
      // 23:59:59 EDT on 2026-09-17 is 2026-09-18T03:59:59.000Z in UTC
      const lateNightUtcMs = localCivilToUtcMs(2026, 9, 17, 23, 59, 59, 0, tz);
      const lateNightIso = new Date(lateNightUtcMs).toISOString();

      // Verify the UTC calendar date is indeed next day (2026-09-18)
      expect(lateNightIso.startsWith('2026-09-18')).toBe(true);

      const lateNightLog = {
        id: 'log-late-night',
        user_id: 'user-tz-test',
        food_name: 'Late Night Snack',
        meal_type: 'snack',
        calories: 250,
        protein: 15,
        carbs: 20,
        fat: 5,
        fiber: 2,
        serving_size: 1,
        serving_unit: 'serving',
        logged_at: lateNightIso,
        created_at: lateNightIso,
        has_components: false,
      };

      // 1. Prove naive check FAILS (drops the record)
      // The naive check compares local or UTC date string against targetDate '2026-09-17'
      const naiveIsToday = (iso: string, target: string) => {
        // naive comparison as previously done in old code:
        // new Date(iso).toDateString() === new Date(target).toDateString() in UTC context
        const logUtcDate = new Date(iso).toISOString().slice(0, 10);
        return logUtcDate === target;
      };
      expect(naiveIsToday(lateNightLog.logged_at, targetDate)).toBe(false);

      // 2. Prove fixed defensive check PASSES (preserves the record)
      expect(isWithinDayBounds(lateNightLog.logged_at, targetDate, tz)).toBe(true);
    });
  });
});

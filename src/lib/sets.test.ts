import { describe, it, expect, vi } from 'vitest';
import {
  getNextSetIndex,
  getOrCreateWorkout,
  insertSet,
  batchInsertSets,
  updateSet,
  deleteSet,
} from './sets';

describe('sets data layer writers (src/lib/sets.ts)', () => {
  describe('getNextSetIndex (W19)', () => {
    it('returns 1 for an empty set list', () => {
      expect(getNextSetIndex([])).toBe(1);
    });

    it('returns max(set_index)+1 when sets are sequential', () => {
      expect(getNextSetIndex([{ set_index: 1 }, { set_index: 2 }, { set_index: 3 }])).toBe(4);
    });

    it('returns 4 when set 1 was deleted from [1, 2, 3] (W19 acceptance)', () => {
      // Deleting set 1 leaves [2, 3]; next set must be max(2,3) + 1 = 4, preventing index collision
      expect(getNextSetIndex([{ set_index: 2 }, { set_index: 3 }])).toBe(4);
    });

    it('handles null/undefined/missing set_index gracefully', () => {
      expect(getNextSetIndex([{ set_index: null }, { set_index: 2 }])).toBe(3);
      expect(getNextSetIndex([{ set_index: undefined }])).toBe(1);
    });
  });

  describe('getOrCreateWorkout (W40, W41)', () => {
    it('returns existing workout id if one already exists for that user and civil date', async () => {
      const mockClient: any = {
        ['from']: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'w-existing-123' },
            error: null,
          }),
        }),
      };

      const id = await getOrCreateWorkout(mockClient, 'user-1', '2026-09-27');
      expect(id).toBe('w-existing-123');
    });

    it('inserts a new workout when no existing session is found', async () => {
      const mockClient: any = {
        ['from']: vi.fn().mockImplementation((table: string) => {
          if (table === 'workouts') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'w-new-456' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const id = await getOrCreateWorkout(mockClient, 'user-1', '2026-09-27', 'Leg Day');
      expect(id).toBe('w-new-456');
    });

    it('handles concurrent race condition 23505 (unique_violation) and returns winning row (W41 acceptance)', async () => {
      let callCount = 0;
      const mockClient: any = {
        ['from']: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Initial check: not found
              return Promise.resolve({ data: null, error: null });
            }
            // Conflict recovery check: found winning row
            return Promise.resolve({ data: { id: 'w-concurrent-winner' }, error: null });
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint "workouts_user_id_workout_date_key"',
                },
              }),
            }),
          }),
        })),
      };

      const id = await getOrCreateWorkout(mockClient, 'user-1', '2026-09-27');
      expect(id).toBe('w-concurrent-winner');
    });

    it('lookup uses workout_date to find existing workout', async () => {
      const eqMock = vi.fn().mockReturnThis();
      const mockClient: any = {
        ['from']: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: eqMock,
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'w-workout-date-123' },
            error: null,
          }),
        }),
      };

      const id = await getOrCreateWorkout(mockClient, 'user-1', '2026-09-27');
      expect(id).toBe('w-workout-date-123');
      expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
      expect(eqMock).toHaveBeenCalledWith('workout_date', '2026-09-27');
    });

    it('recovery after 23505 finds the row by workout_date even when its date is on another UTC day', async () => {
      let selectCount = 0;
      const mockClient: any = {
        ['from']: vi.fn().mockImplementation((table: string) => {
          if (table !== 'workouts') return {};
          let eqFilters: Record<string, any> = {};
          let gteCalled = false;
          let lteCalled = false;

          const builder: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              eqFilters[col] = val;
              return builder;
            }),
            gte: vi.fn().mockImplementation(() => {
              gteCalled = true;
              return builder;
            }),
            lte: vi.fn().mockImplementation(() => {
              lteCalled = true;
              return builder;
            }),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => {
              selectCount++;
              if (selectCount === 1) {
                // First select (initial check): row not yet committed by concurrent transaction
                return Promise.resolve({ data: null, error: null });
              }
              // Second select (recovery check):
              // If lookup searches by workout_date, the row is found
              if (eqFilters.workout_date === '2026-09-27') {
                return Promise.resolve({ data: { id: 'w-tokyo-row' }, error: null });
              }
              // If lookup searches by UTC date window, the row is missed because its date is 2026-09-26T16:00Z
              if (gteCalled || lteCalled) {
                return Promise.resolve({ data: null, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "workouts_user_id_workout_date_key"',
                  },
                }),
              }),
            }),
          };
          return builder;
        }),
      };

      const id = await getOrCreateWorkout(mockClient, 'user-1', '2026-09-27');
      expect(id).toBe('w-tokyo-row');
    });

    it('pre-M2 fallback path still works when workout_date column does not exist', async () => {
      let queryCount = 0;
      let dateWindowQueryMade = false;

      const mockClient: any = {
        ['from']: vi.fn().mockImplementation((table: string) => {
          if (table !== 'workouts') return {};
          let eqCol: string | null = null;

          const builder: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'workout_date') {
                eqCol = col;
              }
              return builder;
            }),
            gte: vi.fn().mockImplementation((col: string) => {
              if (col === 'date') dateWindowQueryMade = true;
              return builder;
            }),
            lte: vi.fn().mockImplementation((col: string) => {
              if (col === 'date') dateWindowQueryMade = true;
              return builder;
            }),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => {
              queryCount++;
              if (eqCol === 'workout_date') {
                // Pre-M2 DB: column does not exist error
                return Promise.resolve({
                  data: null,
                  error: {
                    code: '42703',
                    message: 'column workouts.workout_date does not exist',
                  },
                });
              }
              if (dateWindowQueryMade) {
                // Fallback date-window query succeeds
                return Promise.resolve({
                  data: { id: 'w-pre-m2-legacy' },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return builder;
        }),
      };

      const id = await getOrCreateWorkout(mockClient, 'user-1', '2026-09-27');
      expect(id).toBe('w-pre-m2-legacy');
      expect(queryCount).toBe(2);
      expect(dateWindowQueryMade).toBe(true);
    });

    it('handles W41 two concurrent calls returning one single workout id', async () => {
      let createdRow: { id: string; date: string; workout_date: string } | null = null;

      const mockClient: any = {
        ['from']: vi.fn().mockImplementation((table: string) => {
          if (table !== 'workouts') return {};
          let eqFilters: Record<string, any> = {};
          let gteVal: string | null = null;
          let lteVal: string | null = null;

          const builder: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              eqFilters[col] = val;
              return builder;
            }),
            gte: vi.fn().mockImplementation((_col: string, val: string) => {
              gteVal = val;
              return builder;
            }),
            lte: vi.fn().mockImplementation((_col: string, val: string) => {
              lteVal = val;
              return builder;
            }),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(async () => {
              await new Promise((resolve) => setTimeout(resolve, 5));

              if (!createdRow) {
                return { data: null, error: null };
              }

              // Post-M2 workout_date lookup
              if (eqFilters.workout_date === createdRow.workout_date) {
                return { data: { id: createdRow.id }, error: null };
              }

              // Date-window lookup: misses if date is not in the UTC day window
              if (gteVal && lteVal) {
                if (createdRow.date >= gteVal && createdRow.date <= lteVal) {
                  return { data: { id: createdRow.id }, error: null };
                }
                return { data: null, error: null };
              }

              return { data: null, error: null };
            }),
            insert: vi.fn().mockImplementation((rows: any[]) => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(async () => {
                  await new Promise((resolve) => setTimeout(resolve, 5));
                  if (!createdRow) {
                    createdRow = {
                      id: 'w-concurrent-single-id',
                      date: '2026-09-26T16:00:00.000Z', // Tokyo time
                      workout_date: rows[0]?.workout_date || '2026-09-27',
                    };
                    return { data: { id: createdRow.id }, error: null };
                  }
                  return {
                    data: null,
                    error: {
                      code: '23505',
                      message: 'duplicate key value violates unique constraint "workouts_user_id_workout_date_key"',
                    },
                  };
                }),
              }),
            })),
          };
          return builder;
        }),
      };

      const [id1, id2] = await Promise.all([
        getOrCreateWorkout(mockClient, 'user-1', '2026-09-27'),
        getOrCreateWorkout(mockClient, 'user-1', '2026-09-27'),
      ]);

      expect(id1).toBe('w-concurrent-single-id');
      expect(id2).toBe('w-concurrent-single-id');
      expect(id1).toBe(id2);
    });
  });

  describe('insertSet (resolves by exercise_id UUID, W35)', () => {
    it('inserts set with exercise_id UUID and working set type', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'set-1',
              workout_id: 'w-1',
              exercise_id: 'ex-uuid-1',
              weight: 185,
              reps: 5,
              set_index: 1,
              set_type: 'working',
              rpe: null,
              created_at: '2026-09-27T01:00:00Z',
            },
            error: null,
          }),
        }),
      });

      const mockClient: any = {
        ['from']: vi.fn().mockReturnValue({
          insert: mockInsert,
        }),
      };

      const result = await insertSet(mockClient, 'w-1', {
        exerciseId: 'ex-uuid-1',
        weight: 185,
        reps: 5,
        setIndex: 1,
      });

      expect(result.id).toBe('set-1');
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          workout_id: 'w-1',
          exercise_id: 'ex-uuid-1',
          weight: 185,
          reps: 5,
          set_type: 'working',
        }),
      ]);
    });

    it('throws error if exerciseId is missing', async () => {
      const mockClient: any = { ['from']: vi.fn() };
      await expect(
        insertSet(mockClient, 'w-1', { exerciseId: '', weight: 100, reps: 5 })
      ).rejects.toThrow(/exerciseId UUID is required/);
    });
  });

  describe('batchInsertSets', () => {
    it('batch inserts sets and returns result array', async () => {
      const mockClient: any = {
        ['from']: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 's-1', workout_id: 'w-1', exercise_id: 'ex-1', weight: 100, reps: 10 },
                { id: 's-2', workout_id: 'w-1', exercise_id: 'ex-1', weight: 100, reps: 10 },
              ],
              error: null,
            }),
          }),
        }),
      };

      const results = await batchInsertSets(mockClient, 'w-1', [
        { exerciseId: 'ex-1', weight: 100, reps: 10, setIndex: 1 },
        { exerciseId: 'ex-1', weight: 100, reps: 10, setIndex: 2 },
      ]);

      expect(results).toHaveLength(2);
    });
  });

  describe('updateSet and deleteSet', () => {
    it('updates set by id', async () => {
      const mockClient: any = {
        ['from']: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 's-1', weight: 205, reps: 5 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      const result = await updateSet(mockClient, 's-1', { weight: 205 });
      expect(result.weight).toBe(205);
    });

    it('deletes set by id', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockClient: any = {
        ['from']: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: mockEq,
          }),
        }),
      };

      await deleteSet(mockClient, 's-1');
      expect(mockEq).toHaveBeenCalledWith('id', 's-1');
    });
  });
});

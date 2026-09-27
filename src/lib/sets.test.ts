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

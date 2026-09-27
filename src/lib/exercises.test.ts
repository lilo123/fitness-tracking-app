import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchExerciseCatalogPage,
  insertCustomExercise,
  DuplicateExerciseError,
  encodeCatalogCursor,
  flattenCatalogPages,
} from './exercises';
import { supabase } from './supabase';
import { queryKeys } from './queryKeys';
import type { InvalidationClient } from './invalidate';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    /* sb */ ["from"]: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
    },
  },
}));

describe('exercises lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encodeCatalogCursor', () => {
    it('encodes name and id into base64 cursor', () => {
      const cursor = encodeCatalogCursor('Bench Press', 'e1111111-1111-1111-1111-111111111111');
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);
    });
  });

  describe('fetchExerciseCatalogPage', () => {
    it('calls get_exercise_catalog with normalized parameters', async () => {
      const mockRows = [
        {
          id: '1',
          name: 'Zercher Squat',
          body_parts: ['Legs'],
          body_part: 'Legs',
          equipment: 'barbell',
          is_master: true,
          user_id: null,
          is_archived: false,
          is_hidden: false,
          total_count: 1,
        },
      ];
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockRows, error: null } as any);

      const result = await fetchExerciseCatalogPage({
        search: 'rdl',
        scope: 'all',
        equipment: 'barbell',
        limit: 50,
      });

      expect(supabase.rpc).toHaveBeenCalledWith('get_exercise_catalog', {
        p_search: 'romanian deadlift', // alias expanded
        p_scope: 'all',
        p_equipment: 'barbell',
        p_include_hidden: false,
        p_limit: 50,
        p_cursor: null,
      });

      expect(result.items).toEqual(mockRows);
      expect(result.totalCount).toBe(1);
      expect(result.nextCursor).toBeNull(); // Less than limit 50
    });

    it('generates nextCursor when page has limit rows', async () => {
      const mockRows = Array.from({ length: 10 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        name: `Exercise ${i}`,
        body_parts: ['Legs'],
        body_part: 'Legs',
        equipment: null,
        is_master: true,
        user_id: null,
        is_archived: false,
        is_hidden: false,
        total_count: 50,
      }));
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockRows, error: null } as any);

      const result = await fetchExerciseCatalogPage({
        limit: 10,
      });

      expect(result.items.length).toBe(10);
      expect(result.nextCursor).toBeTruthy();
    });
  });

  describe('insertCustomExercise', () => {
    it('throws DuplicateExerciseError on client when name + equipment duplicate exists (L35)', async () => {
      const existingCatalog = [
        { name: 'Bench Press', equipment: 'barbell' },
        { name: 'Overhead Press', equipment: null },
      ];

      // Exact match
      await expect(
        insertCustomExercise(
          { name: 'Bench Press', equipment: 'barbell' },
          undefined,
          existingCatalog
        )
      ).rejects.toThrow(DuplicateExerciseError);

      // Normalized match (case / alias / spaces)
      await expect(
        insertCustomExercise(
          { name: '  bench   press  ', equipment: 'barbell' },
          undefined,
          existingCatalog
        )
      ).rejects.toThrow(DuplicateExerciseError);
    });

    it('allows coexistence when equipment differs (L35: Bench Press Barbell vs Dumbbell)', async () => {
      const existingCatalog = [{ name: 'Bench Press', equipment: 'barbell' }];

      const mockInserted = {
        id: 'new-id',
        name: 'Bench Press',
        body_parts: ['Chest'],
        body_part: 'Chest',
        equipment: 'dumbbell',
        is_master: false,
        user_id: 'test-user-id',
        is_archived: false,
        is_hidden: false,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInserted, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase['from']).mockReturnValue({ insert: mockInsert } as any);

      const result = await insertCustomExercise(
        { name: 'Bench Press', bodyParts: ['Chest'], equipment: 'dumbbell' },
        undefined,
        existingCatalog
      );

      expect(result).toEqual(mockInserted);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bench Press',
          equipment: 'dumbbell',
          is_master: false,
        })
      );
    });

    it('invalidates exercise queries via queryClient on successful insert', async () => {
      const mockInserted = {
        id: 'new-id',
        name: 'Zercher Squat',
        body_parts: ['Legs'],
        body_part: 'Legs',
        equipment: 'barbell',
        is_master: false,
        user_id: 'user-123',
        is_archived: false,
        is_hidden: false,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInserted, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase['from']).mockReturnValue({ insert: mockInsert } as any);

      const mockQueryClient: InvalidationClient = {
        invalidateQueries: vi.fn().mockResolvedValue(undefined),
      };

      await insertCustomExercise(
        { name: 'Zercher Squat', bodyParts: ['Legs'], equipment: 'barbell', targetUserId: 'user-123' },
        mockQueryClient
      );

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: queryKeys.exercises.all })
      );
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: queryKeys.exerciseCatalog.all })
      );
    });
  });

  describe('flattenCatalogPages', () => {
    it('flattens pages correctly', () => {
      const pages = [
        { items: [{ id: '1', name: 'A' } as any], nextCursor: 'c1', totalCount: 2 },
        { items: [{ id: '2', name: 'B' } as any], nextCursor: null, totalCount: 2 },
      ];
      expect(flattenCatalogPages({ pages, pageParams: [null, 'c1'] })).toEqual([
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
      ]);
      expect(flattenCatalogPages(null)).toEqual([]);
    });
  });
});

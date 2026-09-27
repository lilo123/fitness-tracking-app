import { useState, useEffect } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { supabase } from './supabase';
import { queryKeys } from './queryKeys';
import { invalidateExerciseDomain, type InvalidationClient } from './invalidate';
import { normalizeSearch, parseBodyPartTokens } from '../utils/normalizeSearch';

export interface CatalogExercise {
  id: string;
  name: string;
  body_parts: string[] | null;
  body_part: string | null;
  equipment: string | null;
  is_master: boolean;
  user_id: string | null;
  is_archived: boolean;
  is_hidden: boolean;
  total_count?: number | bigint;
}

export class DuplicateExerciseError extends Error {
  readonly code = 'DUPLICATE_EXERCISE' as const;
  readonly exerciseName?: string;
  readonly equipment?: string | null;

  constructor(
    message = 'An exercise with this name and equipment already exists.',
    exerciseName?: string,
    equipment?: string | null
  ) {
    super(message);
    this.name = 'DuplicateExerciseError';
    this.exerciseName = exerciseName;
    this.equipment = equipment;
  }
}

export interface ExerciseCatalogPage {
  items: CatalogExercise[];
  nextCursor: string | null;
  totalCount: number;
}

export function encodeCatalogCursor(name: string, id: string): string {
  try {
    return btoa(unescape(encodeURIComponent(`${name}::${id}`)));
  } catch {
    return `${name}::${id}`;
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    if (delay <= 0) return;
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return delay <= 0 ? value : debouncedValue;
}

export async function fetchExerciseCatalogPage({
  search,
  scope = 'all',
  equipment,
  includeHidden = false,
  limit = 50,
  cursor = null,
}: {
  search?: string;
  scope?: string;
  equipment?: string | null;
  includeHidden?: boolean;
  limit?: number;
  cursor?: string | null;
}): Promise<ExerciseCatalogPage> {
  const normalizedSearch = search ? normalizeSearch(search) : null;
  const pEquipment = equipment && equipment !== 'all' ? equipment.toLowerCase().trim() : null;
  const pLimit = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await (supabase.rpc as any)('get_exercise_catalog', {
    p_search: normalizedSearch || null,
    p_scope: scope || 'all',
    p_equipment: pEquipment,
    p_include_hidden: includeHidden ?? false,
    p_limit: pLimit,
    p_cursor: cursor || null,
  });

  if (error) throw error;

  const rows = ((data || []) as unknown) as CatalogExercise[];
  const totalCount =
    rows.length > 0 && rows[0].total_count != null ? Number(rows[0].total_count) : 0;

  let nextCursor: string | null = null;
  if (rows.length >= pLimit) {
    const lastRow = rows[rows.length - 1];
    nextCursor = encodeCatalogCursor(lastRow.name, lastRow.id);
  }

  return {
    items: rows,
    nextCursor,
    totalCount,
  };
}

export interface UseExerciseCatalogOptions {
  search?: string;
  scope?: string;
  equipment?: string | null;
  includeHidden?: boolean;
  limit?: number;
  debounceMs?: number;
  enabled?: boolean;
}

export function useExerciseCatalog(options: UseExerciseCatalogOptions = {}) {
  const {
    search = '',
    scope = 'all',
    equipment = null,
    includeHidden = false,
    limit = 50,
    debounceMs = 250,
    enabled = true,
  } = options;

  const debouncedSearch = useDebounce(search.trim(), debounceMs);
  const normalizedEquipment =
    equipment && equipment !== 'all' ? equipment.toLowerCase().trim() : null;

  return useInfiniteQuery({
    queryKey: queryKeys.exerciseCatalog.infinite({
      search: debouncedSearch,
      scope,
      equipment: normalizedEquipment || undefined,
      includeHidden,
      limit,
    }),
    initialPageParam: null as string | null,
    enabled,
    queryFn: ({ pageParam }) =>
      fetchExerciseCatalogPage({
        search: debouncedSearch,
        scope,
        equipment: normalizedEquipment,
        includeHidden,
        limit,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? null,
  });
}

export function flattenCatalogPages(data?: InfiniteData<ExerciseCatalogPage> | null): CatalogExercise[] {
  if (!data?.pages) return [];
  return data.pages.flatMap((page) => page.items);
}

export interface InsertCustomExerciseParams {
  name: string;
  bodyParts?: string[] | string;
  equipment?: string | null;
  targetUserId?: string;
}

/**
 * Single custom-exercise insert path with client duplicate check (L35)
 * and typed DuplicateExerciseError.
 */
export async function insertCustomExercise(
  params: InsertCustomExerciseParams,
  queryClient?: InvalidationClient,
  existingCatalog?: Array<{ name: string; equipment?: string | null }>
): Promise<CatalogExercise> {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error('Exercise name cannot be empty.');
  }

  const normalizedCandidateName = normalizeSearch(trimmedName);
  const candidateEquipment =
    params.equipment && params.equipment !== 'all'
      ? params.equipment.toLowerCase().trim()
      : null;

  // 1. Client-side duplicate check (L35: (normalized name, equipment))
  if (existingCatalog && existingCatalog.length > 0) {
    const isDuplicate = existingCatalog.some((ex) => {
      const existingName = normalizeSearch(ex.name);
      const existingEq = ex.equipment ? ex.equipment.toLowerCase().trim() : null;
      const sameName = existingName === normalizedCandidateName;
      if (!sameName) return false;
      return !candidateEquipment || !existingEq || existingEq === candidateEquipment;
    });

    if (isDuplicate) {
      throw new DuplicateExerciseError(
        `An exercise named "${trimmedName}"${candidateEquipment ? ` (${candidateEquipment})` : ''} already exists in your catalog.`,
        trimmedName,
        candidateEquipment
      );
    }
  }

  // 2. Format body parts
  const bodyPartsArray = Array.isArray(params.bodyParts)
    ? params.bodyParts
    : params.bodyParts
    ? parseBodyPartTokens(params.bodyParts)
    : [];
  const bodyPartStr = bodyPartsArray.length > 0 ? bodyPartsArray.join(', ') : null;

  // 3. Resolve user_id
  let userId = params.targetUserId;
  if (!userId) {
    const authRes = await supabase.auth.getUser();
    userId = authRes.data?.user?.id;
  }

  // 4. Insert into exercises table (Rule: single explicit bound for check-query-bounds)
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: trimmedName,
      body_parts: bodyPartsArray.length > 0 ? bodyPartsArray : null,
      body_part: bodyPartStr,
      equipment: candidateEquipment,
      user_id: userId || null,
      is_master: false,
    } as any)
    .select()
    .single();

  if (error) {
    if (
      error.code === '23505' ||
      error.message?.includes('duplicate') ||
      error.message?.includes('unique')
    ) {
      throw new DuplicateExerciseError(
        `An exercise named "${trimmedName}" already exists.`,
        trimmedName,
        candidateEquipment
      );
    }
    throw error;
  }

  // 5. Invalidate caches (RP-1, C8)
  if (queryClient) {
    await invalidateExerciseDomain(queryClient, userId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.exerciseCatalog.all });
  }

  return (data as unknown) as CatalogExercise;
}

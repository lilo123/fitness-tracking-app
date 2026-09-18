import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { WorkoutSet, Exercise, NutritionLog } from '../../types/database';
import { DEFAULT_EXERCISES_LIST } from '../../utils/ghostSets';
import { roundTo1Decimal } from '../../utils/nutrition';
import { itemsForPersist, normalizeItems, sumItems, type NutritionItem } from '../../utils/itemModel';

export interface HistorySet extends WorkoutSet {
  workout_date: string;
  workout_name: string;
  exercise_name?: string;
}

export interface HistorySession {
  id: string;
  date: string;
  name: string;
  set_count: number;
  total_volume: number;
  sets?: HistorySet[];
}

export interface RawExerciseStat {
  exercise_id: string;
  set_count: number;
  max_weight: number;
  pr_reps: number;
  recent_sets: any;
}

export const HISTORY_PAGE_SIZE = 50;

export async function fetchSessionSets(workoutId: string): Promise<HistorySet[]> {
  // detail-fetch — user expands a session card
  const { data, error } = await supabase
    .from('sets')
    .select('id, workout_id, exercise_id, weight, reps, set_index, created_at')
    .eq('workout_id', workoutId)
    .order('set_index', { ascending: true })
    .limit(500);

  if (error) throw error;
  if (!data) return [];

  if (data.length === 500) {
    console.warn(
      `[useHistoryData] fetchSessionSets query reached cap of 500 rows; older historical sets may be truncated.`
    );
  }

  return (data as any[]).map((s) => ({
    ...s,
    exercise_name: s.exercise_name || s.exercise?.name,
    set_index: s.set_index ?? 0,
    set_type: 'working',
    workout_date: '',
    workout_name: '',
  }));
}

async function fetchWorkoutsPage(
  targetUserId: string,
  from: number,
  to: number
): Promise<{ sessions: HistorySession[]; hasMore: boolean }> {
  const limit = to - from + 1;
  if (from === 0) {
    const { error: probeError } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', targetUserId)
      .limit(1);
    if (probeError) throw probeError;
  }

  if (typeof supabase.rpc === 'function') {
    const { data, error } = await supabase.rpc('get_history_sessions', {
      p_user_id: targetUserId,
      p_offset: from,
      p_limit: limit,
    });

    if (error) throw error;
    if (!data || data.length === 0) {
      return { sessions: [], hasMore: false };
    }

    const sessions: HistorySession[] = data.map((row) => ({
      id: row.id,
      date: row.date,
      name: row.name || 'Workout Session',
      set_count: Number(row.set_count) || 0,
      total_volume: Number(row.total_volume) || 0,
      sets: [],
    }));

    const hasMore = data.length >= limit;
    return { sessions, hasMore };
  }

  // Fallback for tests/environments where supabase.rpc is not defined
  const { data, error } = await supabase
    .from('workouts')
    .select('id, date, name')
    .eq('user_id', targetUserId)
    .order('date', { ascending: false })
    .range(from, to);

  if (error) throw error;
  if (!data || data.length === 0) {
    return { sessions: [], hasMore: false };
  }

  const sessions: HistorySession[] = (data as any[]).map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name || 'Workout Session',
    set_count: 0,
    total_volume: 0,
    sets: [],
  }));

  const hasMore = data.length >= limit;
  return { sessions, hasMore };
}

export function useExerciseStats(targetUserId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['exercise_stats', targetUserId],
    enabled: Boolean(targetUserId) && enabled,
    queryFn: async () => {
      if (!targetUserId || typeof supabase.rpc !== 'function') return [];
      const { data, error } = await supabase.rpc('get_exercise_stats', {
        p_user_id: targetUserId,
      });
      if (error) throw error;
      return (data || []) as RawExerciseStat[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useHistoryData(targetUserId: string, onMutationError?: (msg: string) => void) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [hasMoreWorkouts, setHasMoreWorkouts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [prevUserId, setPrevUserId] = useState(targetUserId);
  if (targetUserId !== prevUserId) {
    setPrevUserId(targetUserId);
    setPage(0);
    setHasMoreWorkouts(true);
    setIsLoadingMore(false);
  }

  // Fetch exercises
  const {
    data: exercises = DEFAULT_EXERCISES_LIST,
    isError: isExercisesError,
    error: exercisesError,
    refetch: refetchExercises,
  } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, body_part, is_master')
        .order('name')
        .limit(200);
      if (error) throw error;
      if (!data || data.length === 0) return DEFAULT_EXERCISES_LIST;
      return data as Exercise[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch workout sessions
  const {
    data: sessions = [],
    isError: isWorkoutsError,
    error: workoutsError,
    refetch: refetchWorkouts,
  } = useQuery({
    queryKey: ['workout_sets', targetUserId, 'all'],
    enabled: Boolean(targetUserId),
    queryFn: async () => {
      if (!targetUserId) return [];
      const { sessions: initialSessions, hasMore } = await fetchWorkoutsPage(
        targetUserId,
        0,
        HISTORY_PAGE_SIZE - 1
      );
      setHasMoreWorkouts(hasMore);
      setPage(0);
      return initialSessions;
    },
  });

  const loadMoreWorkouts = useCallback(async () => {
    if (!targetUserId || !hasMoreWorkouts || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const from = nextPage * HISTORY_PAGE_SIZE;
      const to = from + HISTORY_PAGE_SIZE - 1;
      const { sessions: newSessions, hasMore } = await fetchWorkoutsPage(targetUserId, from, to);
      setHasMoreWorkouts(hasMore);
      setPage(nextPage);
      queryClient.setQueryData<HistorySession[]>(['workout_sets', targetUserId, 'all'], (prev = []) => [
        ...prev,
        ...newSessions,
      ]);
    } catch (err) {
      console.error('Failed to load more workouts:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [targetUserId, hasMoreWorkouts, isLoadingMore, page, queryClient]);

  // Fetch nutrition logs for target user
  const {
    data: nutritionLogs = [],
    isError: isNutritionLogsError,
    error: nutritionLogsError,
    refetch: refetchNutritionLogs,
  } = useQuery({
    queryKey: ['nutrition_logs', targetUserId],
    enabled: Boolean(targetUserId),
    queryFn: async () => {
      if (!targetUserId) return [];
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select(
          'id, user_id, food_name, meal_type, calories, protein, carbs, fat, fiber, serving_size, serving_unit, logged_at, created_at, has_components'
        )
        .eq('user_id', targetUserId)
        .order('logged_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!data) return [];
      return data as NutritionLog[];
    },
  });

  // Delete nutrition log mutation
  const deleteMealMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase.from('nutrition_logs').delete().eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to delete meal log. Please try again.';
      onMutationError?.(message);
    },
  });

  // Whole-dish rescale mutation
  const scaleMealMutation = useMutation({
    mutationFn: async ({ log, items }: { log: NutritionLog; items?: NutritionItem[] }) => {
      let activeItems = items;
      if (!activeItems || activeItems.length === 0) {
        if (log.items && Array.isArray(log.items) && log.items.length > 0) {
          activeItems = normalizeItems(log.items) || [];
        } else {
          // payload-gate: detail-fetch — refetch-before-write inside scaleMealMutation
          const { data: fullLog, error: fetchErr } = await supabase
            .from('nutrition_logs')
            .select('id, items, calories, protein, carbs, fat, fiber')
            .eq('id', log.id)
            .maybeSingle();
          if (fetchErr) throw fetchErr;
          if (fullLog?.items) {
            activeItems = normalizeItems(fullLog.items) || [];
          }
        }
      }

      if (!activeItems || activeItems.length === 0) {
        throw new Error('Cannot rescale a meal without component items');
      }

      const totals = sumItems(activeItems);
      if (totals.calories === 0 && Number(log.calories) > 0) {
        throw new Error('Refusing to persist zero macros for non-zero meal: data loss prevented');
      }

      const { error } = await supabase
        .from('nutrition_logs')
        .update({
          items: itemsForPersist(activeItems),
          calories: Math.max(0, roundTo1Decimal(totals.calories)),
          protein: Math.max(0, roundTo1Decimal(totals.protein)),
          carbs: Math.max(0, roundTo1Decimal(totals.carbs)),
          fat: Math.max(0, roundTo1Decimal(totals.fat)),
          fiber: Math.max(0, roundTo1Decimal(totals.fiber)),
        })
        .eq('id', log.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to rescale meal. Please try again.';
      onMutationError?.(message);
    },
  });

  return {
    exercises,
    sessions,
    allSets: [] as HistorySet[],
    nutritionLogs,
    deleteMealMutation,
    scaleMealMutation,
    hasMoreWorkouts,
    loadMoreWorkouts,
    isLoadingMore,
    isWorkoutsError,
    workoutsError,
    refetchWorkouts,
    isNutritionLogsError,
    nutritionLogsError,
    refetchNutritionLogs,
    isExercisesError,
    exercisesError,
    refetchExercises,
  };
}

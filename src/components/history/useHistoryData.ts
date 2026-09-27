import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Exercise, NutritionLog } from '../../types/database';
import { DEFAULT_EXERCISES_LIST } from '../../utils/ghostSets';
import { roundTo1Decimal } from '../../utils/nutrition';
import { itemsForPersist, normalizeItems, sumItems, type NutritionItem } from '../../utils/itemModel';
import {
  setCachedLogItems,
  deleteCachedLogItems,
  rehydrateLogWithCachedItems,
} from '../nutrition/useNutritionData';

export {
  fetchSessionSets,
  useExerciseStats,
  HISTORY_PAGE_SIZE,
  type HistorySet,
  type HistorySession,
  type RawExerciseStat,
} from './useWorkoutHistory';

export function useHistoryData(targetUserId: string, onMutationError?: (msg: string) => void) {
  const queryClient = useQueryClient();

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
        .limit(1000);
      if (error) throw error;
      if (!data || data.length === 0) return DEFAULT_EXERCISES_LIST;
      return data as Exercise[];
    },
    staleTime: 5 * 60 * 1000,
  });

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
          'id, user_id, food_name, meal_type, calories, protein, carbs, fat, fiber, serving_size, serving_unit, logged_at, logged_date, created_at, has_components'
        )
        .eq('user_id', targetUserId)
        .order('logged_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!data) return [];
      return (data as NutritionLog[]).map(rehydrateLogWithCachedItems);
    },
  });

  // Delete nutrition log mutation
  const deleteMealMutation = useMutation({
    mutationFn: async (logId: string) => {
      deleteCachedLogItems(logId);
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
      setCachedLogItems(log.id, activeItems);
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
    nutritionLogs,
    deleteMealMutation,
    scaleMealMutation,
    isNutritionLogsError,
    nutritionLogsError,
    refetchNutritionLogs,
    isExercisesError,
    exercisesError,
    refetchExercises,
  };
}

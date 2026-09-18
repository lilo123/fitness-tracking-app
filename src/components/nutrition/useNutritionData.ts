import { useState, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/supabase';
import type { NutritionLog, CustomDish, CustomDishDetail, UserProfile } from '../../types/database';

// payload-gate: detail-fetch — user opens the dish editor or stages a dish
export async function fetchDishDetail(dishId: string): Promise<CustomDishDetail | null> {
  const { data, error } = await supabase
    .from('custom_dishes')
    .select('id, items, ingredients')
    .eq('id', dishId)
    .maybeSingle();

  if (error) throw error;
  return data as CustomDishDetail | null;
}

import {
  getDayBounds,
  isWithinDayBounds,
} from '../../utils/date';
import { roundTo1Decimal, calculateRemainingFuel } from '../../utils/nutrition';
import { restTimerStore } from '../../utils/restTimerStore';
import {
  itemsForPersist,
  normalizeItems,
  sumItems,
  type NutritionItem,
} from '../../utils/itemModel';

const logItemsMemoryCache = new Map<string, any>();

export interface UseNutritionDataOptions {
  targetUserId: string;
  selectedDate: string;
  profile: UserProfile | null;
  timeZone?: string;
  onMutationSuccessReset: () => void;
  setStatus: (s: string) => void;
  setIsError: (e: boolean) => void;
}

export function useNutritionData({
  targetUserId,
  selectedDate,
  profile,
  timeZone,
  onMutationSuccessReset,
  setStatus,
  setIsError,
}: UseNutritionDataOptions) {
  const queryClient = useQueryClient();

  const targetCalories = profile?.target_calories || 2200;
  const targetProtein = profile?.target_protein || 160;
  const targetCarbs = profile?.target_carbs || 220;
  const targetFat = profile?.target_fat || 70;
  const targetFiber = profile?.target_fiber ?? 30;

  // Fetch custom dishes for context injection & quick log
  const {
    data: customDishes = [],
    isError: isCustomDishesError,
    error: customDishesError,
    refetch: refetchCustomDishes,
  } = useQuery({
    queryKey: ['custom_dishes', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      const { data, error } = await supabase
        .from('custom_dishes')
        .select(
          'id, user_id, name, calories, protein, carbs, fat, fiber, created_at'
        )
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!data) return [];
      return data as CustomDish[];
    },
  });

  // Fetch nutrition logs for target user
  const {
    data: nutritionLogs = [],
    isError: isNutritionLogsError,
    error: nutritionLogsError,
    refetch: refetchNutritionLogs,
  } = useQuery({
    queryKey: ['nutrition_logs', targetUserId, selectedDate, timeZone].filter(Boolean),
    queryFn: async () => {
      if (!targetUserId) return [];
      const { startOfDay, endOfDay } = getDayBounds(selectedDate, timeZone);
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select(
          'id, user_id, food_name, meal_type, calories, protein, carbs, fat, fiber, serving_size, serving_unit, logged_at, created_at, has_components'
        )
        .eq('user_id', targetUserId)
        .gte('logged_at', startOfDay)
        .lte('logged_at', endOfDay)
        .order('logged_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!data) return [];
      return (data as NutritionLog[]).map((log) => {
        if (!log.items && logItemsMemoryCache.has(log.id)) {
          return { ...log, items: logItemsMemoryCache.get(log.id) };
        }
        return log;
      });
    },
    enabled: Boolean(targetUserId && selectedDate),
  });

  // RFIX-18 (resolved 2026-09-17, conductor ruling). The server query above already bounds the
  // result with .gte(startOfDay)/.lte(endOfDay) derived from the SAME getDayBounds(selectedDate,
  // timeZone) call this filter uses, so in production this filter is expected to strip nothing.
  // Measured: 0 rows stripped across 24 hourly timestamps x 4 timezones (UTC, America/New_York,
  // Asia/Tokyo, Pacific/Auckland) — see tier3_evidence/P2-4_verify.txt. Because that count is 0,
  // RFIX-01's server-side bound is confirmed correct and is NOT reopened.
  //
  // The filter is retained rather than deleted for one verified reason: it is load-bearing for the
  // test suite. The createSupabaseBuilder test double returns static fixtures without evaluating
  // PostgREST range predicates, so useNutritionData.test.tsx asserts day-filtering behaviour
  // through this code path (see the removal-counter assertion at useNutritionData.test.tsx:174).
  // Deleting the filter would require deleting those assertions.
  //
  // It is therefore a client-side restatement of a server-side invariant, costing one O(n) pass
  // over at most 100 rows. Do not add semantics here that the server bound does not also enforce —
  // if the two ever disagree, the server bound is the bug.
  const todayLogs = useMemo(() => {
    return nutritionLogs.filter((l) => isWithinDayBounds(l.logged_at, selectedDate, timeZone));
  }, [nutritionLogs, selectedDate, timeZone]);

  const dailyTotals = useMemo(() => {
    return todayLogs.reduce(
      (acc, log) => {
        acc.calories += Number(log.calories) || 0;
        acc.protein += Number(log.protein) || 0;
        acc.carbs += Number(log.carbs) || 0;
        acc.fat += Number(log.fat) || 0;
        acc.fiber += Number(log.fiber) || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [todayLogs]);

  const remainingFuel = useMemo(() => {
    return calculateRemainingFuel(dailyTotals, {
      calories: targetCalories,
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
      fiber: targetFiber,
    });
  }, [dailyTotals, targetCalories, targetProtein, targetCarbs, targetFat, targetFiber]);

  // Insert mutation
  const mutation = useMutation({
    mutationFn: async (newLog: Partial<NutritionLog>) => {
      const payload = {
        ...newLog,
        user_id: targetUserId,
      };

      const { data, error } = await supabase
        .from('nutrition_logs')
        .insert([payload as Database['public']['Tables']['nutrition_logs']['Insert']])
        .select();

      if (error) {
        throw new Error(error.message);
      }
      if (data && Array.isArray(data)) {
        for (const item of data) {
          if (item?.id && (item as any).items) {
            logItemsMemoryCache.set(item.id, (item as any).items);
          }
        }
      }
      return data;
    },
    onSuccess: () => {
      setStatus('Saved');
      setIsError(false);
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
      onMutationSuccessReset();
    },
    onError: (error: Error) => {
      console.error(error);
      setStatus('Failed to save log: ' + error.message);
      setIsError(true);
    },
  });

  // Delete log mutation
  const deleteMutation = useMutation({
    mutationFn: async (logId: string) => {
      logItemsMemoryCache.delete(logId);
      const { error } = await supabase.from('nutrition_logs').delete().eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
    },
  });

  const scaleLogMutation = useMutation({
    mutationFn: async ({ log, items }: { log: NutritionLog; items?: NutritionItem[] }) => {
      let activeItems = items;
      if (!activeItems || activeItems.length === 0) {
        if (log.items && Array.isArray(log.items) && log.items.length > 0) {
          activeItems = normalizeItems(log.items) || [];
        } else {
          // payload-gate: detail-fetch — refetch-before-write inside scaleLogMutation
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
      logItemsMemoryCache.set(log.id, activeItems);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to rescale meal. Please try again.';
      setStatus('Failed to rescale meal: ' + message);
      setIsError(true);
    },
  });

  // Custom Dish CRUD mutations
  const saveCustomDishMutation = useMutation({
    mutationFn: async ({ dishPayload, editingDishId }: { dishPayload: Partial<CustomDishDetail>; editingDishId?: string }) => {
      if (editingDishId) {
        const { data, error } = await supabase
          .from('custom_dishes')
          .update(dishPayload)
          .eq('id', editingDishId)
          .select();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('custom_dishes')
          .insert([{ ...dishPayload, user_id: targetUserId } as Database['public']['Tables']['custom_dishes']['Insert']])
          .select();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
      setStatus('Custom dish saved');
      setIsError(false);
    },
    onError: (err: Error) => {
      setStatus('Failed to save custom dish: ' + err.message);
      setIsError(true);
    },
  });

  const deleteCustomDishMutation = useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase.from('custom_dishes').delete().eq('id', dishId);
      if (error) throw error;
      return dishId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
      setStatus('Custom dish deleted');
      setIsError(false);
    },
    onError: (err: Error) => {
      setStatus('Failed to delete dish: ' + err.message);
      setIsError(true);
    },
  });

  // Floating Quick-Log Toast state
  const [activeToast, setActiveToast] = useState<{ id: string; name: string; calories: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setActiveToast(null);
  };

  const triggerToast = (dish: { name: string; calories: number | null }) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setActiveToast({
      id: String(Date.now()),
      name: dish.name,
      calories: roundTo1Decimal(dish.calories ?? 0),
    });
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
      toastTimerRef.current = null;
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const timerState = useSyncExternalStore(
    restTimerStore.subscribe,
    restTimerStore.getSnapshot,
    restTimerStore.getServerSnapshot
  );
  const isTimerActive = timerState.isRunning || timerState.isPaused;

  return {
    customDishes,
    nutritionLogs,
    todayLogs,
    dailyTotals,
    targets: {
      calories: targetCalories,
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
      fiber: targetFiber,
    },
    remainingFuel,
    mutation,
    deleteMutation,
    scaleLogMutation,
    saveCustomDishMutation,
    deleteCustomDishMutation,
    activeToast,
    dismissToast,
    triggerToast,
    isTimerActive,
    isCustomDishesError,
    customDishesError,
    refetchCustomDishes,
    isNutritionLogsError,
    nutritionLogsError,
    refetchNutritionLogs,
    isReadError: isNutritionLogsError || isCustomDishesError,
    readError: nutritionLogsError || customDishesError,
    refetchRead: async () => {
      await Promise.all([refetchNutritionLogs(), refetchCustomDishes()]);
    },
    fetchDishDetail,
  };
}

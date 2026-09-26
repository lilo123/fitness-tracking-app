import { useState, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/supabase';
import type { NutritionLog, CustomDish, CustomDishDetail, UserProfile } from '../../types/database';

// payload-gate: detail-fetch — user opens the dish editor or stages a dish
export async function fetchDishDetail(dishId: string): Promise<CustomDishDetail | null> {
  const { data, error } = await supabase
    .from('custom_dishes')
    .select('id, items, ingredients, kind, notes')
    .eq('id', dishId)
    .maybeSingle();

  if (error) throw error;
  return data as CustomDishDetail | null;
}

import {
  getDayBounds,
  normalizeDateStr,
} from '../../utils/date';
import { nutritionDayKey } from '../../utils/nutritionDayKey';
import { roundTo1Decimal, calculateRemainingFuel } from '../../utils/nutrition';
import { restTimerStore } from '../../utils/restTimerStore';
import {
  itemsForPersist,
  normalizeItems,
  sumItems,
  type NutritionItem,
} from '../../utils/itemModel';
export const logItemsMemoryCache = new Map<string, any>();

export function getCachedLogItems(logId: string): any {
  return logItemsMemoryCache.get(logId);
}

export function setCachedLogItems(logId: string, items: any): void {
  logItemsMemoryCache.set(logId, items);
}

export function deleteCachedLogItems(logId: string): void {
  logItemsMemoryCache.delete(logId);
}

export function clearLogItemsMemoryCache(): void {
  logItemsMemoryCache.clear();
}

export function rehydrateLogWithCachedItems<T extends { id: string; items?: any }>(log: T): T {
  if (!log.items && logItemsMemoryCache.has(log.id)) {
    return { ...log, items: logItemsMemoryCache.get(log.id) };
  }
  return log;
}

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
          'id, user_id, name, calories, protein, carbs, fat, fiber, created_at, kind, use_count, notes'
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
      // Superset window. A row stamped `logged_date = selectedDate` by a device in another zone
      // can sit up to 26h outside this viewer's day bounds: the civil day spans 24h, and IANA
      // offsets range from -12 to +14, so the worst case (logger at +14, viewer at -12) needs
      // 26h of slack on each side. 48h is that bound with margin.
      const windowStart = new Date(new Date(startOfDay).getTime() - 48 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(new Date(endOfDay).getTime() + 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select(
          'id, user_id, food_name, meal_type, calories, protein, carbs, fat, fiber, serving_size, serving_unit, logged_at, logged_date, created_at, has_components'
        )
        .eq('user_id', targetUserId)
        .gte('logged_at', windowStart)
        .lte('logged_at', windowEnd)
        .order('logged_at', { ascending: false })
        // 500 = the 5-day superset window x the previous 100/day bound. Must stay an
        // unconditional literal: scripts/check-query-bounds.js requires one and does not
        // inspect the argument.
        .limit(500);

      if (error) throw error;
      if (!data) return [];
      return (data as NutritionLog[]).map(rehydrateLogWithCachedItems);
    },
    enabled: Boolean(targetUserId && selectedDate),
  });

  // RFIX-18 (updated): The server query above fetches an intentional five-day superset window
  // (startOfDay - 48h to endOfDay + 48h) to guarantee that meals logged under a different timezone
  // are never excluded by server-side bounds. 48h, not 24h: a row stamped `logged_date = D` by a
  // device at UTC+14 and read by a viewer at UTC-12 sits up to 26h outside the viewer's own day
  // bounds, so a 24h widening would still drop it.
  //
  // The client filter is authoritative: it keys on the civil diary date (`logged_date`), falling
  // back to `normalizeDateStr(logged_at, timeZone)` for legacy rows where `logged_date` is null.
  // This matches the grouping contract used by History and Coach views.
  const todayLogs = useMemo(() => {
    const targetDate = normalizeDateStr(selectedDate, timeZone);
    return nutritionLogs.filter(
      (l) => nutritionDayKey(l, timeZone) === targetDate
    );
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
    onSuccess: (data) => {
      const created = Array.isArray(data) ? data[0] : (data as any);
      if (created?.id) {
        lastCreatedLogIdRef.current = created.id;
        if (pendingLogIdResolveRef.current) {
          pendingLogIdResolveRef.current(created.id);
          pendingLogIdResolveRef.current = null;
        }
      }
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
      return logId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
      setStatus('Meal deleted');
      setIsError(false);
    },
    onError: (err: any) => {
      setStatus('Failed to delete meal: ' + (err?.message || 'Error deleting meal'));
      setIsError(true);
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
      const payloadWithKind = {
        ...dishPayload,
        kind: dishPayload.kind ?? (dishPayload.items && dishPayload.items.length > 1 ? 'recipe' : 'food'),
      };
      if (editingDishId) {
        const { data, error } = await supabase
          .from('custom_dishes')
          .update(payloadWithKind)
          .eq('id', editingDishId)
          .select();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('custom_dishes')
          .insert([{ ...payloadWithKind, user_id: targetUserId } as Database['public']['Tables']['custom_dishes']['Insert']])
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
  const [activeToast, setActiveToast] = useState<{
    id: string;
    variant: 'logged' | 'added';
    dishName: string;
    name: string;
    calories: number;
    onUndo?: () => Promise<void> | void;
    forMeal?: any;
    preMeal?: any;
  } | null>(null);
  const lastCreatedLogIdRef = useRef<string | null>(null);
  const pendingLogIdResolveRef = useRef<((id: string) => void) | null>(null);
  const pendingLogIdPromiseRef = useRef<Promise<string> | null>(null);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  const triggerToast = useCallback(
    (
      dish: { name: string; calories: number | null },
      options?: {
        variant?: 'logged' | 'added';
        onUndo?: () => Promise<void> | void;
        forMeal?: any;
        preMeal?: any;
        dishName?: string;
        calories?: number;
      }
    ) => {
      const isAdded = options?.variant === 'added';
      const dishName = options?.dishName || dish.name;
      const calories = roundTo1Decimal(options?.calories ?? dish.calories ?? 0);

      if (isAdded) {
        setActiveToast({
          id: String(Date.now()),
          variant: 'added',
          dishName,
          name: dishName,
          calories,
          onUndo: options?.onUndo,
          forMeal: options?.forMeal,
          preMeal: options?.preMeal,
        });
        return;
      }

      // Direct log path (variant: 'logged')
      let resolveId: ((id: string) => void) | null = null;
      const idPromise = new Promise<string>((resolve) => {
        resolveId = resolve;
      });
      pendingLogIdResolveRef.current = resolveId;
      pendingLogIdPromiseRef.current = idPromise;

      let alreadyUndone = false;
      const myIdPromise = idPromise;
      const onUndo = async () => {
        if (alreadyUndone) return;
        alreadyUndone = true;
        dismissToast();
        let logId = lastCreatedLogIdRef.current;
        if (!logId && myIdPromise) {
          try {
            logId = await Promise.race([
              myIdPromise,
              new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout waiting for log ID')), 3000)
              ),
            ]);
          } catch {
            return;
          }
        }
        if (!logId) return;

        try {
          await deleteMutation.mutateAsync(logId);
        } catch {
          // onError on deleteMutation handles setStatus and setIsError
        }
      };

      setActiveToast({
        id: String(Date.now()),
        variant: 'logged',
        dishName,
        name: dishName,
        calories,
        onUndo,
      });
    },
    [dismissToast, deleteMutation]
  );

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
    // Deliberately no combined isReadError/readError/refetchRead. Merging these two independent
    // queries meant a custom_dishes failure was rendered as "Failed to load nutrition logs" and,
    // because the meal list was gated on the combined flag, hid meals that had loaded
    // successfully. Consume the specific channel you mean.
    fetchDishDetail,
  };
}

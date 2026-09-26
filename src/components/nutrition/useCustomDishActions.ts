import { useCallback, useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { CustomDish, CustomDishDetail } from '../../types/database';
import { formatLocalTimestamp } from '../../utils/date';
import { formatCalories, roundTo1Decimal } from '../../utils/nutrition';
import {
  itemsFromLegacyIngredients,
  normalizeItems,
} from '../../utils/itemModel';
import { fetchDishDetail as defaultFetchDishDetail } from './useNutritionData';
import {
  buildStagedItem,
  recomputeStagedTotals,
  mergeOrAppendStagedItems,
  type StagedItem,
  type StagedMeal,
} from './nutritionEngineHelpers';

export interface AddedFavoriteBanner {
  message: string;
  onUndo: () => void;
}

export interface UseCustomDishActionsOptions {
  targetUserId: string;
  selectedDate: string;
  stagedMeal?: StagedMeal | null;
  setStagedMeal: (meal: StagedMeal | null) => void;
  setDishFetchError?: (error: { message: string; retry: () => void } | null) => void;
  fetchDishDetail?: (dishId: string) => Promise<CustomDishDetail | null>;
  mutation: { mutate: (payload: any) => void };
  triggerToast?: (dish: CustomDish) => void;
}

export function buildItemsFromDish(dish: CustomDish, detail: CustomDishDetail | null): StagedItem[] {
  const stored =
    normalizeItems(detail?.items) ?? itemsFromLegacyIngredients(dish.id, dish.name, detail?.ingredients);

  let items: StagedItem[] = (stored ?? []).map((it) =>
    buildStagedItem({
      name: it.name,
      portion: it.displayPortion,
      quantity: it.quantity,
      unit: it.unit,
      calories: it.calories,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      fiber: it.fiber,
    })
  );

  if (items.length === 0) {
    items = [
      buildStagedItem({
        name: dish.name,
        portion: '1 serving',
        calories: dish.calories,
        protein: dish.protein,
        carbs: dish.carbs,
        fat: dish.fat,
        fiber: dish.fiber,
      }),
    ];
  }
  return items;
}

export function useCustomDishActions({
  targetUserId,
  selectedDate,
  stagedMeal,
  setStagedMeal,
  setDishFetchError,
  fetchDishDetail,
  mutation,
  triggerToast,
}: UseCustomDishActionsOptions) {
  const queryClient = useQueryClient();
  const [addedFavoriteBanner, setAddedFavoriteBanner] = useState<AddedFavoriteBanner | null>(null);
  const previousStagedMealRef = useRef<StagedMeal | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStagedMealRef = useRef<StagedMeal | null>(stagedMeal ?? null);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    latestStagedMealRef.current = stagedMeal ?? null;
    if (!stagedMeal) {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
      previousStagedMealRef.current = null;
    }
  }, [stagedMeal]);

  const incrementDishUseCount = useCallback(
    (dish: CustomDish) => {
      void supabase
        .from('custom_dishes')
        .update({ use_count: (dish.use_count ?? 0) + 1 })
        .eq('id', dish.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
        });
    },
    [queryClient, targetUserId]
  );

  const handleStageCustomDish = useCallback(
    async function stageDish(dish: CustomDish) {
      setDishFetchError?.(null);
      let detail: CustomDishDetail | null = null;
      const fetcher = fetchDishDetail || defaultFetchDishDetail;
      try {
        detail = await fetcher(dish.id);
      } catch (err: any) {
        const msg = err?.message || 'Failed to load dish details';
        setDishFetchError?.({
          message: msg,
          retry: () => {
            void stageDish(dish);
          },
        });
        return;
      }

      const items = buildItemsFromDish(dish, detail);
      const { explanation, ...tot } = recomputeStagedTotals(items);

      setStagedMeal({
        name: dish.name,
        mealType: 'Breakfast',
        explanation:
          items.length > 1 ? explanation : `${formatCalories(tot.calories)} kcal (${dish.name})`,
        items,
        ...tot,
        servingSize: 1,
        servingUnit: 'serving',
        notes: dish.notes ?? null,
      });

      incrementDishUseCount(dish);
    },
    [fetchDishDetail, incrementDishUseCount, setDishFetchError, setStagedMeal]
  );

  const handleAddCustomDishToStaged = useCallback(
    async function addDishToStaged(dish: CustomDish) {
      if (!latestStagedMealRef.current) return;
      setDishFetchError?.(null);
      let detail: CustomDishDetail | null = null;
      const fetcher = fetchDishDetail || defaultFetchDishDetail;
      try {
        detail = await fetcher(dish.id);
      } catch (err: any) {
        if (!latestStagedMealRef.current) return;
        const msg = err?.message || 'Failed to load dish details';
        setDishFetchError?.({
          message: msg,
          retry: () => {
            void addDishToStaged(dish);
          },
        });
        return;
      }

      const currentStagedMeal = latestStagedMealRef.current;
      if (!currentStagedMeal) {
        return;
      }

      const incomingItems = buildItemsFromDish(dish, detail);
      const snapshot = currentStagedMeal;
      previousStagedMealRef.current = snapshot;

      const mergedItems = mergeOrAppendStagedItems(currentStagedMeal.items, incomingItems);
      const { explanation, ...tot } = recomputeStagedTotals(mergedItems);

      const nextStagedMeal: StagedMeal = {
        ...currentStagedMeal,
        items: mergedItems,
        ...tot,
        explanation:
          mergedItems.length > 1 ? explanation : `${formatCalories(tot.calories)} kcal (${currentStagedMeal.name})`,
      };

      latestStagedMealRef.current = nextStagedMeal;
      setStagedMeal(nextStagedMeal);

      incrementDishUseCount(dish);

      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }

      const onUndo = () => {
        if (bannerTimerRef.current) {
          clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = null;
        }
        if (previousStagedMealRef.current) {
          latestStagedMealRef.current = previousStagedMealRef.current;
          setStagedMeal(previousStagedMealRef.current);
          previousStagedMealRef.current = null;
        }
        setAddedFavoriteBanner(null);
      };

      setAddedFavoriteBanner({
        message: `Added ${dish.name} to staged meal`,
        onUndo,
      });

      bannerTimerRef.current = setTimeout(() => {
        setAddedFavoriteBanner(null);
        bannerTimerRef.current = null;
      }, 5000);
    },
    [fetchDishDetail, incrementDishUseCount, setDishFetchError, setStagedMeal]
  );

  const handleQuickLogCustomDishDirect = useCallback(
    (dish: CustomDish, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const payload = {
        food_name: dish.name,
        calories: roundTo1Decimal(dish.calories),
        protein: roundTo1Decimal(dish.protein),
        carbs: roundTo1Decimal(dish.carbs),
        fat: roundTo1Decimal(dish.fat),
        fiber: roundTo1Decimal(dish.fiber),
        meal_type: 'Breakfast',
        serving_size: 1,
        serving_unit: 'serving',
        logged_at: formatLocalTimestamp(selectedDate),
        logged_date: selectedDate,
        notes: dish.notes ?? null,
      };
      mutation.mutate(payload);
      incrementDishUseCount(dish);
      triggerToast?.(dish);
    },
    [incrementDishUseCount, mutation, selectedDate, triggerToast]
  );

  const dismissAddedFavoriteBanner = useCallback(() => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    setAddedFavoriteBanner(null);
  }, []);

  return {
    handleStageCustomDish,
    handleQuickLogCustomDishDirect,
    handleAddCustomDishToStaged,
    addedFavoriteBanner: stagedMeal ? addedFavoriteBanner : null,
    dismissAddedFavoriteBanner,
  };
}

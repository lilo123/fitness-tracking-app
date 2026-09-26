import { useCallback } from 'react';
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
  type StagedItem,
  type StagedMeal,
} from './nutritionEngineHelpers';

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

export function useCustomDishActions({
  targetUserId,
  selectedDate,
  setStagedMeal,
  setDishFetchError,
  fetchDishDetail,
  mutation,
  triggerToast,
}: UseCustomDishActionsOptions) {
  const queryClient = useQueryClient();

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

  return {
    handleStageCustomDish,
    handleQuickLogCustomDishDirect,
  };
}

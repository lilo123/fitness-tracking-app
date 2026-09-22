import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { roundTo1Decimal } from '../../utils/nutrition';
import { itemsForPersist, sumItems } from '../../utils/itemModel';
import { stagedToItem, type StagedItem, type StagedMeal } from './nutritionEngineHelpers';

export interface UseCustomDishSavingOptions {
  targetUserId: string;
  stagedMeal: StagedMeal | null;
  setStatus: (status: string) => void;
  setIsError: (isError: boolean) => void;
}

export function useCustomDishSaving({
  targetUserId,
  stagedMeal,
  setStatus,
  setIsError,
}: UseCustomDishSavingOptions) {
  const queryClient = useQueryClient();

  const handleSaveStagedAsCustomDish = async () => {
    if (!stagedMeal) return;
    try {
      const items = stagedMeal.items.map(stagedToItem);
      const totals = sumItems(items);
      const { error } = await supabase.from('custom_dishes').insert([
        {
          user_id: targetUserId,
          name: stagedMeal.name,
          kind: items.length > 1 ? 'recipe' : 'food',
          ingredients: JSON.stringify(stagedMeal.items),
          items: items.length > 1 ? itemsForPersist(items) : null,
          calories: roundTo1Decimal(totals.calories),
          protein: roundTo1Decimal(totals.protein),
          carbs: roundTo1Decimal(totals.carbs),
          fat: roundTo1Decimal(totals.fat),
          fiber: roundTo1Decimal(totals.fiber),
          notes: stagedMeal.notes ?? null,
        },
      ]);
      if (error) throw error;
      setStatus('Saved custom dish');
      setIsError(false);
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
    } catch (err: any) {
      setStatus('Failed to save custom dish: ' + err.message);
      setIsError(true);
    }
  };

  const handleSaveItemAsCustomDish = async (item: StagedItem) => {
    try {
      const { error } = await supabase.from('custom_dishes').insert([
        {
          user_id: targetUserId,
          name: item.name,
          kind: 'food',
          ingredients: JSON.stringify([item]),
          items: null,
          calories: roundTo1Decimal(item.calories),
          protein: roundTo1Decimal(item.protein),
          carbs: roundTo1Decimal(item.carbs),
          fat: roundTo1Decimal(item.fat),
          fiber: roundTo1Decimal(item.fiber),
        },
      ]);
      if (error) throw error;
      setStatus(`Saved ${item.name} as custom dish`);
      setIsError(false);
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
    } catch (err: any) {
      setStatus('Failed to save custom dish: ' + err.message);
      setIsError(true);
    }
  };

  return {
    handleSaveStagedAsCustomDish,
    handleSaveItemAsCustomDish,
  };
}

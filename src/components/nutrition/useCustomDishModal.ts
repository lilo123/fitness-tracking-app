import { useState } from 'react';
import type { CustomDish, CustomDishDetail } from '../../types/database';
import { roundTo1Decimal } from '../../utils/nutrition';
import {
  itemsForPersist,
  itemsFromLegacyIngredients,
  normalizeItems,
  sumItems,
  type NutritionItem,
} from '../../utils/itemModel';
import { fetchDishDetail as defaultFetchDishDetail } from './useNutritionData';

export interface UseCustomDishModalOptions {
  onSaveDish: (args: { dishPayload: Partial<CustomDishDetail>; editingDishId?: string }) => void;
  onDeleteDish: (dishId: string) => void;
  onDismissToast: () => void;
  fetchDishDetail?: (dishId: string) => Promise<CustomDishDetail | null>;
  onFetchError?: (err: Error, retry: () => void) => void;
}

export function useCustomDishModal({
  onSaveDish,
  onDeleteDish,
  onDismissToast,
  fetchDishDetail,
  onFetchError,
}: UseCustomDishModalOptions) {
  const [showDishModal, setShowDishModal] = useState(false);
  const [editingDish, setEditingDish] = useState<CustomDishDetail | null>(null);
  const [dishFetchError, setDishFetchError] = useState<{ message: string; retry: () => void } | null>(null);
  const [dishModalName, setDishModalName] = useState('');
  const [dishModalCalories, setDishModalCalories] = useState<number | ''>('');
  const [dishModalProtein, setDishModalProtein] = useState<number | ''>('');
  const [dishModalCarbs, setDishModalCarbs] = useState<number | ''>('');
  const [dishModalFat, setDishModalFat] = useState<number | ''>('');
  const [dishModalFiber, setDishModalFiber] = useState<number | ''>('');
  const [dishModalItems, setDishModalItems] = useState<NutritionItem[]>([]);

  const resetDishModalFields = () => {
    setDishModalName('');
    setDishModalCalories('');
    setDishModalProtein('');
    setDishModalCarbs('');
    setDishModalFat('');
    setDishModalFiber('');
    setDishModalItems([]);
  };

  const handleOpenNewDishModal = () => {
    onDismissToast();
    setDishFetchError(null);
    setEditingDish(null);
    resetDishModalFields();
    setShowDishModal(true);
  };

  const handleOpenEditDishModal = async (dish: CustomDish) => {
    onDismissToast();
    setDishFetchError(null);
    let detail: CustomDishDetail | null = null;
    const fetcher = fetchDishDetail || defaultFetchDishDetail;
    try {
      detail = await fetcher(dish.id);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load dish details';
      const retry = () => {
        void handleOpenEditDishModal(dish);
      };
      setDishFetchError({ message: msg, retry });
      onFetchError?.(err, retry);
      return;
    }

    const mergedDish: CustomDishDetail = {
      ...dish,
      items: detail?.items ?? null,
      ingredients: detail?.ingredients ?? null,
    };
    setEditingDish(mergedDish);
    setDishModalName(dish.name);
    setDishModalCalories(dish.calories != null ? roundTo1Decimal(dish.calories) : '');
    setDishModalProtein(dish.protein != null ? roundTo1Decimal(dish.protein) : '');
    setDishModalCarbs(dish.carbs != null ? roundTo1Decimal(dish.carbs) : '');
    setDishModalFat(dish.fat != null ? roundTo1Decimal(dish.fat) : '');
    setDishModalFiber(dish.fiber != null ? roundTo1Decimal(dish.fiber) : '');
    const rawItems =
      normalizeItems(mergedDish.items) ??
      itemsFromLegacyIngredients(mergedDish.id, mergedDish.name, mergedDish.ingredients) ??
      [];
    setDishModalItems(
      rawItems.map((it) => ({
        ...it,
        quantity: roundTo1Decimal(it.quantity),
        calories: roundTo1Decimal(it.calories),
        protein: roundTo1Decimal(it.protein),
        carbs: roundTo1Decimal(it.carbs),
        fat: roundTo1Decimal(it.fat),
        fiber: roundTo1Decimal(it.fiber),
      }))
    );
    setShowDishModal(true);
  };

  const handleCloseDishModal = () => {
    setShowDishModal(false);
    setEditingDish(null);
    setDishFetchError(null);
    resetDishModalFields();
  };

  const handleSaveCustomDishModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishModalName.trim()) return;

    const persistItems = itemsForPersist(dishModalItems);
    const totals = persistItems ? sumItems(persistItems) : null;
    const clamp = (n: number) => Math.max(0, roundTo1Decimal(n));

    onSaveDish({
      dishPayload: {
        name: dishModalName.trim(),
        calories: clamp(totals ? totals.calories : Number(dishModalCalories) || 0),
        protein: clamp(totals ? totals.protein : Number(dishModalProtein) || 0),
        carbs: clamp(totals ? totals.carbs : Number(dishModalCarbs) || 0),
        fat: clamp(totals ? totals.fat : Number(dishModalFat) || 0),
        fiber: clamp(totals ? totals.fiber : Number(dishModalFiber) || 0),
        items: persistItems,
      },
      editingDishId: editingDish?.id,
    });
    handleCloseDishModal();
  };

  const handleDeleteCustomDish = (dishId: string) => {
    onDeleteDish(dishId);
    handleCloseDishModal();
  };

  return {
    showDishModal,
    editingDish,
    dishModalName,
    setDishModalName,
    dishModalCalories,
    setDishModalCalories,
    dishModalProtein,
    setDishModalProtein,
    dishModalCarbs,
    setDishModalCarbs,
    dishModalFat,
    setDishModalFat,
    dishModalFiber,
    setDishModalFiber,
    dishModalItems,
    setDishModalItems,
    handleOpenNewDishModal,
    handleOpenEditDishModal,
    handleCloseDishModal,
    handleSaveCustomDishModal,
    handleDeleteCustomDish,
    dishFetchError,
    setDishFetchError,
  };
}

import { useState, type FormEvent } from 'react';
import type { NutritionLog } from '../../types/database';
import { formatLocalTimestamp } from '../../utils/date';
import { roundTo1Decimal } from '../../utils/nutrition';

export interface UseManualMealFormOptions {
  selectedDate: string;
  onSubmitLog: (payload: Partial<NutritionLog>) => void;
}

export function useManualMealForm({ selectedDate, onSubmitLog }: UseManualMealFormOptions) {
  // Manual Form Fallback State
  const [manualDishName, setManualDishName] = useState('');
  const [manualCalories, setManualCalories] = useState<number | ''>('');
  const [manualProtein, setManualProtein] = useState<number | ''>('');
  const [manualCarbs, setManualCarbs] = useState<number | ''>('');
  const [manualFat, setManualFat] = useState<number | ''>('');
  const [manualFiber, setManualFiber] = useState<number | ''>('');
  const [manualMealType, setManualMealType] = useState<string>('Breakfast');
  const [manualServingSize, setManualServingSize] = useState<number | ''>(1);
  const [manualServingUnit, setManualServingUnit] = useState<string>('serving');

  const resetManualForm = () => {
    setManualDishName('');
    setManualCalories('');
    setManualProtein('');
    setManualCarbs('');
    setManualFat('');
    setManualFiber('');
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualDishName.trim()) return;

    const payload: Partial<NutritionLog> = {
      food_name: manualDishName,
      calories: roundTo1Decimal(manualCalories),
      protein: roundTo1Decimal(manualProtein),
      carbs: roundTo1Decimal(manualCarbs),
      fat: roundTo1Decimal(manualFat),
      fiber: roundTo1Decimal(manualFiber),
      meal_type: manualMealType,
      serving_size: Number(manualServingSize) || 1,
      serving_unit: manualServingUnit,
      logged_at: formatLocalTimestamp(selectedDate),
      logged_date: selectedDate,
    };

    onSubmitLog(payload);
  };

  return {
    manualDishName,
    setManualDishName,
    manualCalories,
    setManualCalories,
    manualProtein,
    setManualProtein,
    manualCarbs,
    setManualCarbs,
    manualFat,
    setManualFat,
    manualFiber,
    setManualFiber,
    manualMealType,
    setManualMealType,
    manualServingSize,
    setManualServingSize,
    manualServingUnit,
    setManualServingUnit,
    resetManualForm,
    handleManualSubmit,
  };
}

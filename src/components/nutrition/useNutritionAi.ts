import { useState } from 'react';
import type { CustomDish } from '../../types/database';
import { formatCalories } from '../../utils/nutrition';
import type { StagedMeal } from './nutritionEngineHelpers';
import { parseNutrition } from './parseNutrition';
import { useNutritionPhotoPicker } from './useNutritionPhotoPicker';

export interface UseNutritionAiOptions {
  customDishes: CustomDish[];
  onParsedSuccess: (meal: StagedMeal) => void;
  onFallbackToManual: (dishName: string) => void;
  setStatus: (msg: string) => void;
  setIsError: (err: boolean) => void;
}

export function useNutritionAi({
  customDishes,
  onParsedSuccess,
  onFallbackToManual,
  setStatus,
  setIsError,
}: UseNutritionAiOptions) {
  const [nlInput, setNlInput] = useState('');
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const {
    selectedPhoto,
    setSelectedPhoto,
    fileInputRef,
    handlePickPhoto,
    handleFileChange,
    handleRemovePhoto,
  } = useNutritionPhotoPicker({
    onError: (msg) => {
      setIsError(true);
      setStatus(msg);
    },
    onClearError: () => {
      setIsError(false);
      setIsRateLimited(false);
    },
  });

  const handleAnalyze = async () => {
    if (!nlInput.trim() && !selectedPhoto) return;
    setIsAnalyzing(true);
    setStatus(
      selectedPhoto
        ? 'Analyzing (this could take up to 45s)...'
        : 'Analyzing (this could take up to 30s)...'
    );
    setIsError(false);
    setIsRateLimited(false);

    try {
      const parsed = await parseNutrition({
        text: nlInput,
        photo: selectedPhoto,
        customDishes,
      });

      const meal: StagedMeal = {
        name: parsed.name || nlInput || (selectedPhoto ? 'Meal Photo' : 'Meal'),
        mealType: 'Breakfast',
        explanation:
          parsed.explanation ||
          parsed.items
            .map((it) => `${formatCalories(it.calories)} kcal (${it.name})`)
            .join(' + ') + ` = ${formatCalories(parsed.calories)} kcal`,
        items: parsed.items,
        calories: parsed.calories,
        protein: parsed.protein,
        carbs: parsed.carbs,
        fat: parsed.fat,
        fiber: parsed.fiber,
        servingSize: parsed.servingSize,
        servingUnit: parsed.servingUnit,
        photoUrl: selectedPhoto?.dataUrl,
      };

      setIsRateLimited(false);
      setStatus('Analyzed');
      onParsedSuccess(meal);
      return;
    } catch (error: any) {
      console.warn('AI Edge function failed:', error);
      if (error?.is429 || error?.context?.status === 429 || error?.status === 429) {
        setIsRateLimited(true);
        setIsError(false);
        setStatus('');
        return;
      }
      setIsError(true);
      const errorMsg = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      setStatus(
        error?.code === 'NON_FOOD_DETECTED' ||
          error?.status === 422 ||
          error?.context?.status === 422
          ? `Meal Analysis: ${errorMsg}`
          : `AI service unavailable: ${errorMsg}`
      );
      onFallbackToManual(nlInput.trim() || (selectedPhoto ? 'Meal Photo' : ''));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    nlInput,
    setNlInput,
    selectedPhoto,
    setSelectedPhoto,
    isRateLimited,
    setIsRateLimited,
    isAnalyzing,
    fileInputRef,
    handlePickPhoto,
    handleFileChange,
    handleRemovePhoto,
    handleAnalyze,
  };
}

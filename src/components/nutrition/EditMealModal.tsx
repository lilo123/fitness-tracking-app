import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { NutritionLog } from '../../types/database';
import { X, Utensils, AlertCircle } from 'lucide-react';

export interface EditMealModalProps {
  isOpen: boolean;
  meal: NutritionLog | null;
  onClose: () => void;
  targetUserId?: string;
  onSuccess?: () => void;
}

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-Workout', 'Post-Workout'];

interface EditMealFormProps {
  meal: NutritionLog;
  onClose: () => void;
  targetUserId?: string;
  onSuccess?: () => void;
}

const EditMealForm: React.FC<EditMealFormProps> = ({
  meal,
  onClose,
  targetUserId,
  onSuccess,
}) => {
  const queryClient = useQueryClient();

  const initialMealType = (() => {
    const matched = MEAL_TYPES.find(
      (t) => t.toLowerCase() === (meal.meal_type || '').toLowerCase()
    );
    return matched || meal.meal_type || 'Breakfast';
  })();

  const [foodName, setFoodName] = useState(meal.food_name || '');
  const [mealType, setMealType] = useState(initialMealType);
  const [servingSize, setServingSize] = useState<number | string>(meal.serving_size ?? 1);
  const [servingUnit, setServingUnit] = useState(meal.serving_unit || 'serving');
  const [calories, setCalories] = useState<number | string>(meal.calories ?? 0);
  const [protein, setProtein] = useState<number | string>(meal.protein ?? 0);
  const [carbs, setCarbs] = useState<number | string>(meal.carbs ?? 0);
  const [fat, setFat] = useState<number | string>(meal.fat ?? 0);
  const [fiber, setFiber] = useState<number | string>(meal.fiber ?? 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      food_name: string;
      meal_type: string;
      serving_size: number;
      serving_unit: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    }) => {
      const { id, ...updates } = payload;
      const builder = supabase.from('nutrition_logs').update(updates).eq('id', id);
      const res = typeof (builder as any)?.select === 'function'
        ? await (builder as any).select()
        : await builder;

      if (res?.error) {
        throw res.error;
      }
      return res?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs'] });
      if (targetUserId) {
        queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
      }
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to update meal log. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedFoodName = foodName.trim();
    if (!trimmedFoodName) {
      setErrorMessage('Meal name is required');
      return;
    }

    const parsedServing = Number(servingSize);
    const validServing = isNaN(parsedServing) || parsedServing <= 0 ? 1 : parsedServing;

    const parsedCalories = Number(calories);
    const validCalories = isNaN(parsedCalories) ? 0 : Math.max(0, parsedCalories);

    const parsedProtein = Number(protein);
    const validProtein = isNaN(parsedProtein) ? 0 : Math.max(0, parsedProtein);

    const parsedCarbs = Number(carbs);
    const validCarbs = isNaN(parsedCarbs) ? 0 : Math.max(0, parsedCarbs);

    const parsedFat = Number(fat);
    const validFat = isNaN(parsedFat) ? 0 : Math.max(0, parsedFat);

    const parsedFiber = Number(fiber);
    const validFiber = isNaN(parsedFiber) ? 0 : Math.max(0, parsedFiber);

    updateMutation.mutate({
      id: meal.id,
      food_name: trimmedFoodName,
      meal_type: mealType,
      serving_size: validServing,
      serving_unit: servingUnit.trim() || 'serving',
      calories: validCalories,
      protein: validProtein,
      carbs: validCarbs,
      fat: validFat,
      fiber: validFiber,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="edit-meal-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-meal-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 id="edit-meal-modal-title" className="text-base font-black text-white flex items-center gap-2">
            <Utensils className="w-4 h-4 text-cyan-400" />
            <span>Edit Meal</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Close"
            data-testid="close-edit-meal-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div
            className="bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded-2xl p-3 flex items-center gap-2 text-xs"
            data-testid="edit-meal-error"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Meal Name
            </label>
            <input
              type="text"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="e.g. Grilled Chicken & Rice"
              data-testid="edit-meal-name-input"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Meal Type
            </label>
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              data-testid="edit-meal-type-select"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none min-h-[44px]"
            >
              {MEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {!MEAL_TYPES.includes(mealType) && mealType && (
                <option value={mealType}>{mealType}</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                Serving Size
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                inputMode="decimal"
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                placeholder="1"
                data-testid="edit-meal-serving-size-input"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono focus:border-cyan-500 outline-none text-center min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                Serving Unit
              </label>
              <input
                type="text"
                value={servingUnit}
                onChange={(e) => setServingUnit(e.target.value)}
                placeholder="e.g. serving, g, oz"
                data-testid="edit-meal-serving-unit-input"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none text-center min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                Calories
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="0"
                data-testid="edit-meal-calories-input"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center min-h-[44px]"
                required
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                Protein (g)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="0"
                data-testid="edit-meal-protein-input"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center min-h-[44px]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                Carbs (g)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="0"
                data-testid="edit-meal-carbs-input"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center min-h-[44px]"
              />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
                Fat (g)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                placeholder="0"
                data-testid="edit-meal-fat-input"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center min-h-[44px]"
              />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                Fiber (g)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={fiber}
                onChange={(e) => setFiber(e.target.value)}
                placeholder="0"
                data-testid="edit-meal-fiber-input"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center min-h-[44px]"
              />
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>Summary:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-amber-400 font-bold">{calories || 0} kcal</span>
              <span>•</span>
              <span className="text-cyan-400">{protein || 0}g P</span>
              <span>•</span>
              <span className="text-emerald-400">{carbs || 0}g C</span>
              <span>•</span>
              <span className="text-violet-400">{fat || 0}g F</span>
              <span>•</span>
              <span className="text-teal-400">{fiber || 0}g Fib</span>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="cancel-edit-meal-btn"
              className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold text-zinc-400 hover:bg-zinc-800 touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="save-edit-meal-btn"
              className="px-5 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black shadow-neon-cyan font-black disabled:opacity-50 touch-manipulation"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const EditMealModal: React.FC<EditMealModalProps> = ({
  isOpen,
  meal,
  onClose,
  targetUserId,
  onSuccess,
}) => {
  if (!isOpen || !meal) return null;

  return (
    <EditMealForm
      key={meal.id}
      meal={meal}
      onClose={onClose}
      targetUserId={targetUserId}
      onSuccess={onSuccess}
    />
  );
};

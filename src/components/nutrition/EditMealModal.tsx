import React, { useState, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { NutritionLog } from '../../types/database';
import { X, Utensils, AlertCircle } from 'lucide-react';
import { formatCalories, formatMacro, roundTo1Decimal } from '../../utils/nutrition';
import { isLevel1, normalizeItems, sumItems } from '../../utils/itemModel';
import { friendlyError } from '../../utils/nutritionErrors';
import { StatusBanner } from '../common/StatusBanner';
import { AccessibleModal } from '../common/AccessibleModal';

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
  const formId = useId();
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
  const [calories, setCalories] = useState<number | string>(meal.calories != null ? roundTo1Decimal(meal.calories) : 0);
  const [protein, setProtein] = useState<number | string>(meal.protein != null ? roundTo1Decimal(meal.protein) : 0);
  const [carbs, setCarbs] = useState<number | string>(meal.carbs != null ? roundTo1Decimal(meal.carbs) : 0);
  const [fat, setFat] = useState<number | string>(meal.fat != null ? roundTo1Decimal(meal.fat) : 0);
  const [fiber, setFiber] = useState<number | string>(meal.fiber != null ? roundTo1Decimal(meal.fiber) : 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // R-04: this modal used to issue a blind 9-field UPDATE of the parent macros.
  // With a breakdown stored in `items`, that write violates the DB's
  // parent = Σ(items) constraint, so when a breakdown exists the macros are
  // derived here and the corresponding inputs are read-only.
  const items = normalizeItems(meal.items);
  const hasBreakdown = isLevel1(items);
  const derived = hasBreakdown ? sumItems(items!) : null;

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
      const { data, error } = await supabase
        .from('nutrition_logs')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) {
        throw error;
      }
      return data;
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
      setErrorMessage(friendlyError(err));
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
      // When a breakdown exists the parent is not user-editable; sending Σ
      // keeps the row consistent with `items`, which this modal never touches.
      calories: derived ? Math.max(0, roundTo1Decimal(derived.calories)) : roundTo1Decimal(validCalories),
      protein: derived ? Math.max(0, roundTo1Decimal(derived.protein)) : roundTo1Decimal(validProtein),
      carbs: derived ? Math.max(0, roundTo1Decimal(derived.carbs)) : roundTo1Decimal(validCarbs),
      fat: derived ? Math.max(0, roundTo1Decimal(derived.fat)) : roundTo1Decimal(validFat),
      fiber: derived ? Math.max(0, roundTo1Decimal(derived.fiber)) : roundTo1Decimal(validFiber),
    });
  };

  return (
    <AccessibleModal
      isOpen
      onClose={onClose}
      titleId="edit-meal-modal-title"
      overlayTestId="edit-meal-modal"
      className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
    >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 id="edit-meal-modal-title" className="text-base font-bold text-white flex items-center gap-2">
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

        <StatusBanner
          message={errorMessage}
          tone="error"
          testId="edit-meal-error"
          icon={<AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />}
        />

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor={`${formId}-food-name`}
              className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1"
            >
              Meal Name
            </label>
            <input
              id={`${formId}-food-name`}
              type="text"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="e.g. Grilled Chicken & Rice"
              data-testid="edit-meal-name-input"
              className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2.5 text-base font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none min-h-[44px]"
              required
            />
          </div>

          <div>
            <label
              htmlFor={`${formId}-meal-type`}
              className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1"
            >
              Meal Type
            </label>
            <select
              id={`${formId}-meal-type`}
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              data-testid="edit-meal-type-select"
              className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2.5 text-base font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none min-h-[44px]"
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
              <label
                htmlFor={`${formId}-serving-size`}
                className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1"
              >
                Serving Size
              </label>
              <input
                id={`${formId}-serving-size`}
                type="number"
                step="any"
                min="0.01"
                inputMode="decimal"
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                placeholder="1"
                data-testid="edit-meal-serving-size-input"
                className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base tabular-nums font-normal focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[44px]"
              />
            </div>
            <div>
              <label
                htmlFor={`${formId}-serving-unit`}
                className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1"
              >
                Serving Unit
              </label>
              <input
                id={`${formId}-serving-unit`}
                type="text"
                value={servingUnit}
                onChange={(e) => setServingUnit(e.target.value)}
                placeholder="e.g. serving, g, oz"
                data-testid="edit-meal-serving-unit-input"
                className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[44px]"
              />
            </div>
          </div>

          {hasBreakdown && (
            <p
              data-testid="edit-meal-derived-note"
              className="text-xs text-zinc-400"
            >
              Totals are calculated from this meal&rsquo;s {items!.length} components and
              cannot be edited here.
            </p>
          )}

          <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <label
                htmlFor={`${formId}-calories`}
                className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-1"
              >
                Calories
              </label>
              <input
                id={`${formId}-calories`}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={derived ? roundTo1Decimal(derived.calories) : calories}
                onChange={(e) => setCalories(e.target.value)}
                readOnly={hasBreakdown}
                aria-readonly={hasBreakdown}
                placeholder="0"
                data-testid="edit-meal-calories-input"
                className={`w-full border border-border-interactive rounded-xl p-2 text-base tabular-nums font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[44px] ${hasBreakdown ? 'bg-zinc-900 text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 text-white'}`}
                required
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label
                htmlFor={`${formId}-protein`}
                className="block text-xs font-bold text-cyan-400 uppercase tracking-wider mb-1"
              >
                Protein (g)
              </label>
              <input
                id={`${formId}-protein`}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={derived ? roundTo1Decimal(derived.protein) : protein}
                onChange={(e) => setProtein(e.target.value)}
                readOnly={hasBreakdown}
                aria-readonly={hasBreakdown}
                placeholder="0"
                data-testid="edit-meal-protein-input"
                className={`w-full border border-border-interactive rounded-xl p-2 text-base tabular-nums font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[44px] ${hasBreakdown ? 'bg-zinc-900 text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 text-white'}`}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label
                htmlFor={`${formId}-carbs`}
                className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1"
              >
                Carbs (g)
              </label>
              <input
                id={`${formId}-carbs`}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={derived ? roundTo1Decimal(derived.carbs) : carbs}
                onChange={(e) => setCarbs(e.target.value)}
                readOnly={hasBreakdown}
                aria-readonly={hasBreakdown}
                placeholder="0"
                data-testid="edit-meal-carbs-input"
                className={`w-full border border-border-interactive rounded-xl p-2 text-base tabular-nums font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[44px] ${hasBreakdown ? 'bg-zinc-900 text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 text-white'}`}
              />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label
                htmlFor={`${formId}-fat`}
                className="block text-xs font-bold text-violet-400 uppercase tracking-wider mb-1"
              >
                Fat (g)
              </label>
              <input
                id={`${formId}-fat`}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={derived ? roundTo1Decimal(derived.fat) : fat}
                onChange={(e) => setFat(e.target.value)}
                readOnly={hasBreakdown}
                aria-readonly={hasBreakdown}
                placeholder="0"
                data-testid="edit-meal-fat-input"
                className={`w-full border border-border-interactive rounded-xl p-2 text-base tabular-nums font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[44px] ${hasBreakdown ? 'bg-zinc-900 text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 text-white'}`}
              />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label
                htmlFor={`${formId}-fiber`}
                className="block text-xs font-bold text-teal-400 uppercase tracking-wider mb-1"
              >
                Fiber (g)
              </label>
              <input
                id={`${formId}-fiber`}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={derived ? roundTo1Decimal(derived.fiber) : fiber}
                onChange={(e) => setFiber(e.target.value)}
                readOnly={hasBreakdown}
                aria-readonly={hasBreakdown}
                placeholder="0"
                data-testid="edit-meal-fiber-input"
                className={`w-full border border-border-interactive rounded-xl p-2 text-base tabular-nums font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[44px] ${hasBreakdown ? 'bg-zinc-900 text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 text-white'}`}
              />
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs tabular-nums text-zinc-400">
            <span>Summary:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-amber-400 font-bold">{formatCalories(derived ? derived.calories : calories)} kcal</span>
              <span>•</span>
              <span className="text-cyan-400">{formatMacro(derived ? derived.protein : protein)}g P</span>
              <span>•</span>
              <span className="text-emerald-400">{formatMacro(derived ? derived.carbs : carbs)}g C</span>
              <span>•</span>
              <span className="text-violet-400">{formatMacro(derived ? derived.fat : fat)}g F</span>
              <span>•</span>
              <span className="text-teal-400">{formatMacro(derived ? derived.fiber : fiber)}g Fib</span>
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
              className="px-5 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black shadow-neon-cyan disabled:opacity-50 touch-manipulation"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
    </AccessibleModal>
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

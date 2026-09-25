import React, { memo, useEffect, useId, useState } from 'react';
import type { CanonicalUnit } from '../../utils/unitConverter';
import { roundTo1Decimal } from '../../utils/nutrition';

export interface AddItemFormData {
  name: string;
  quantity: number;
  unit: CanonicalUnit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface AddItemFormProps {
  onAddItem: (data: AddItemFormData) => void;
  onCancel: () => void;
}

export const AddItemForm: React.FC<AddItemFormProps> = memo(({
  onAddItem,
  onCancel,
}) => {
  const baseId = useId();
  const nameId = `${baseId}-add-item-name`;
  const quantityId = `${baseId}-add-item-quantity`;
  const unitId = `${baseId}-add-item-unit`;
  const caloriesId = `${baseId}-add-item-calories`;
  const proteinId = `${baseId}-add-item-protein`;
  const carbsId = `${baseId}-add-item-carbs`;
  const fatId = `${baseId}-add-item-fat`;
  const fiberId = `${baseId}-add-item-fiber`;

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [unit, setUnit] = useState('serving');
  const [calories, setCalories] = useState<number | ''>('');
  const [protein, setProtein] = useState<number | ''>('');
  const [carbs, setCarbs] = useState<number | ''>('');
  const [fat, setFat] = useState<number | ''>('');
  const [fiber, setFiber] = useState<number | ''>('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const nameInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const errors: Record<string, string> = {};

  if (hasAttemptedSubmit && !name.trim()) {
    errors.name = 'Item name is required';
  }

  if (quantity !== '' && (Number(quantity) < 0 || Number.isNaN(Number(quantity)))) {
    errors.quantity = 'Must be 0 or more';
  }

  if (calories !== '' && (Number(calories) < 0 || Number.isNaN(Number(calories)))) {
    errors.calories = 'Must be 0 or more';
  } else if (hasAttemptedSubmit && calories === '') {
    errors.calories = 'Calories is required';
  }

  if (protein !== '' && (Number(protein) < 0 || Number.isNaN(Number(protein)))) {
    errors.protein = 'Must be 0 or more';
  }

  if (carbs !== '' && (Number(carbs) < 0 || Number.isNaN(Number(carbs)))) {
    errors.carbs = 'Must be 0 or more';
  }

  if (fat !== '' && (Number(fat) < 0 || Number.isNaN(Number(fat)))) {
    errors.fat = 'Must be 0 or more';
  }

  if (fiber !== '' && (Number(fiber) < 0 || Number.isNaN(Number(fiber)))) {
    errors.fiber = 'Must be 0 or more';
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    const isNameValid = Boolean(name.trim());
    const isQtyValid = quantity === '' || (!Number.isNaN(Number(quantity)) && Number(quantity) >= 0);
    const isCaloriesValid = calories !== '' && !Number.isNaN(Number(calories)) && Number(calories) >= 0;
    const isProteinValid = protein === '' || (!Number.isNaN(Number(protein)) && Number(protein) >= 0);
    const isCarbsValid = carbs === '' || (!Number.isNaN(Number(carbs)) && Number(carbs) >= 0);
    const isFatValid = fat === '' || (!Number.isNaN(Number(fat)) && Number(fat) >= 0);
    const isFiberValid = fiber === '' || (!Number.isNaN(Number(fiber)) && Number(fiber) >= 0);

    if (
      !isNameValid ||
      !isQtyValid ||
      !isCaloriesValid ||
      !isProteinValid ||
      !isCarbsValid ||
      !isFatValid ||
      !isFiberValid
    ) {
      return;
    }

    const rawUnit = unit.trim().toLowerCase();
    const canonicalUnit: CanonicalUnit = (rawUnit === 'g' || rawUnit === 'ml') ? rawUnit : 'unit';

    onAddItem({
      name: name.trim(),
      quantity: quantity === '' ? 1 : Math.max(0, roundTo1Decimal(Number(quantity))),
      unit: canonicalUnit,
      calories: roundTo1Decimal(Number(calories)),
      protein: protein === '' ? 0 : roundTo1Decimal(Number(protein)),
      carbs: carbs === '' ? 0 : roundTo1Decimal(Number(carbs)),
      fat: fat === '' ? 0 : roundTo1Decimal(Number(fat)),
      fiber: fiber === '' ? 0 : roundTo1Decimal(Number(fiber)),
    });
  };

  return (
    <form
      data-testid="add-item-form"
      onSubmit={handleSubmit}
      noValidate
      className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2.5 animate-in fade-in"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
          Add Item to Staged Meal
        </span>
        <button
          type="button"
          data-testid="cancel-add-item-button"
          onClick={onCancel}
          className="text-zinc-500 hover:text-white text-xs min-h-[40px] min-w-[40px] px-2 flex items-center justify-center rounded-lg transition touch-manipulation"
        >
          Cancel
        </button>
      </div>

      <div>
        <label
          htmlFor={nameId}
          className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1"
        >
          Item Name <span className="text-amber-400 font-bold">*</span>
        </label>
        <input
          ref={nameInputRef}
          id={nameId}
          type="text"
          data-testid="add-item-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Olive Oil"
          enterKeyHint="next"
          aria-invalid={Boolean(errors.name)}
          aria-errormessage={errors.name ? `${nameId}-error` : undefined}
          className={`w-full bg-zinc-900 border text-white rounded-xl p-2.5 text-base font-semibold outline-none transition min-h-[40px] ${
            errors.name
              ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/50'
              : 'border-border-interactive focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
          }`}
          required
        />
        {errors.name && (
          <p
            id={`${nameId}-error`}
            role="alert"
            data-testid="add-item-name-error"
            className="text-xs text-rose-400 mt-1"
          >
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor={quantityId}
            className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1"
          >
            Quantity
          </label>
          <input
            id={quantityId}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            enterKeyHint="next"
            data-testid="add-item-quantity-input"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
            aria-invalid={Boolean(errors.quantity)}
            aria-errormessage={errors.quantity ? `${quantityId}-error` : undefined}
            className={`w-full bg-zinc-900 border text-white rounded-xl p-2 text-base tabular-nums font-semibold outline-none text-center transition min-h-[40px] ${
              errors.quantity
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-border-interactive focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
            }`}
          />
          {errors.quantity && (
            <p
              id={`${quantityId}-error`}
              role="alert"
              data-testid="add-item-quantity-error"
              className="text-xs text-rose-400 mt-1"
            >
              {errors.quantity}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor={unitId}
            className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1"
          >
            Unit
          </label>
          <input
            id={unitId}
            type="text"
            data-testid="add-item-unit-input"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            enterKeyHint="next"
            placeholder="serving / g / ml"
            className="w-full bg-zinc-900 border border-border-interactive text-white rounded-xl p-2 text-base font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center min-h-[40px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <label
            htmlFor={caloriesId}
            className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-1"
          >
            Calories <span className="text-amber-400 font-bold">*</span>
          </label>
          <input
            id={caloriesId}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            enterKeyHint="next"
            data-testid="add-item-calories-input"
            value={calories}
            onChange={(e) => setCalories(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            aria-invalid={Boolean(errors.calories)}
            aria-errormessage={errors.calories ? `${caloriesId}-error` : undefined}
            className={`w-full bg-zinc-900 border text-white rounded-xl p-2 text-base tabular-nums font-bold outline-none text-center transition min-h-[40px] ${
              errors.calories
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-border-interactive focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
            }`}
            required
          />
          {errors.calories && (
            <p
              id={`${caloriesId}-error`}
              role="alert"
              data-testid="add-item-calories-error"
              className="text-xs text-rose-400 mt-1"
            >
              {errors.calories}
            </p>
          )}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label
            htmlFor={proteinId}
            className="block text-xs font-bold text-cyan-400 uppercase tracking-wider mb-1"
          >
            Protein (g)
          </label>
          <input
            id={proteinId}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            enterKeyHint="next"
            data-testid="add-item-protein-input"
            value={protein}
            onChange={(e) => setProtein(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            aria-invalid={Boolean(errors.protein)}
            aria-errormessage={errors.protein ? `${proteinId}-error` : undefined}
            className={`w-full bg-zinc-900 border text-white rounded-xl p-2 text-base tabular-nums font-bold outline-none text-center transition min-h-[40px] ${
              errors.protein
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-border-interactive focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
            }`}
          />
          {errors.protein && (
            <p
              id={`${proteinId}-error`}
              role="alert"
              data-testid="add-item-protein-error"
              className="text-xs text-rose-400 mt-1"
            >
              {errors.protein}
            </p>
          )}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label
            htmlFor={carbsId}
            className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1"
          >
            Carbs (g)
          </label>
          <input
            id={carbsId}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            enterKeyHint="next"
            data-testid="add-item-carbs-input"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            aria-invalid={Boolean(errors.carbs)}
            aria-errormessage={errors.carbs ? `${carbsId}-error` : undefined}
            className={`w-full bg-zinc-900 border text-white rounded-xl p-2 text-base tabular-nums font-bold outline-none text-center transition min-h-[40px] ${
              errors.carbs
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-border-interactive focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
            }`}
          />
          {errors.carbs && (
            <p
              id={`${carbsId}-error`}
              role="alert"
              data-testid="add-item-carbs-error"
              className="text-xs text-rose-400 mt-1"
            >
              {errors.carbs}
            </p>
          )}
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label
            htmlFor={fatId}
            className="block text-xs font-bold text-violet-400 uppercase tracking-wider mb-1"
          >
            Fat (g)
          </label>
          <input
            id={fatId}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            enterKeyHint="next"
            data-testid="add-item-fat-input"
            value={fat}
            onChange={(e) => setFat(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            aria-invalid={Boolean(errors.fat)}
            aria-errormessage={errors.fat ? `${fatId}-error` : undefined}
            className={`w-full bg-zinc-900 border text-white rounded-xl p-2 text-base tabular-nums font-bold outline-none text-center transition min-h-[40px] ${
              errors.fat
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-border-interactive focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
            }`}
          />
          {errors.fat && (
            <p
              id={`${fatId}-error`}
              role="alert"
              data-testid="add-item-fat-error"
              className="text-xs text-rose-400 mt-1"
            >
              {errors.fat}
            </p>
          )}
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label
            htmlFor={fiberId}
            className="block text-xs font-bold text-teal-400 uppercase tracking-wider mb-1"
          >
            Fiber (g)
          </label>
          <input
            id={fiberId}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            enterKeyHint="done"
            data-testid="add-item-fiber-input"
            value={fiber}
            onChange={(e) => setFiber(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            aria-invalid={Boolean(errors.fiber)}
            aria-errormessage={errors.fiber ? `${fiberId}-error` : undefined}
            className={`w-full bg-zinc-900 border text-white rounded-xl p-2 text-base tabular-nums font-bold outline-none text-center transition min-h-[40px] ${
              errors.fiber
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-border-interactive focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
            }`}
          />
          {errors.fiber && (
            <p
              id={`${fiberId}-error`}
              role="alert"
              data-testid="add-item-fiber-error"
              className="text-xs text-rose-400 mt-1"
            >
              {errors.fiber}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-850">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-bold text-zinc-400 hover:text-white px-3 py-2 min-h-[40px] min-w-[40px] rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 transition active:scale-95 touch-manipulation"
        >
          Cancel
        </button>
        <button
          type="submit"
          data-testid="submit-add-item-button"
          className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-4 py-2 min-h-[40px] rounded-xl uppercase tracking-wider text-xs shadow-[0_0_12px_rgba(6,182,212,0.3)] active:scale-95 transition touch-manipulation"
        >
          Add Item
        </button>
      </div>
    </form>
  );
});

AddItemForm.displayName = 'AddItemForm';

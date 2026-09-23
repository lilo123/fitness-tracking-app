import React, { memo, useId } from 'react';
import { X } from 'lucide-react';
import type { CompressedImage } from '../../utils/imageCompression';

export interface ManualMealFormProps {
  show: boolean;
  onClose: () => void;
  selectedPhoto: CompressedImage | null;
  onRemovePhoto: () => void;
  manualName: string;
  onManualNameChange: (val: string) => void;
  manualMealType: string;
  onManualMealTypeChange: (val: string) => void;
  manualCalories: number | '';
  onManualCaloriesChange: (val: number | '') => void;
  manualProtein: number | '';
  onManualProteinChange: (val: number | '') => void;
  manualCarbs: number | '';
  onManualCarbsChange: (val: number | '') => void;
  manualFat: number | '';
  onManualFatChange: (val: number | '') => void;
  manualFiber: number | '';
  onManualFiberChange: (val: number | '') => void;
  manualServingSize: number | '';
  onManualServingSizeChange: (val: number | '') => void;
  manualServingUnit: string;
  onManualServingUnitChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
}

export const ManualMealForm: React.FC<ManualMealFormProps> = memo(({
  show,
  onClose,
  selectedPhoto,
  onRemovePhoto,
  manualName,
  onManualNameChange,
  manualMealType,
  onManualMealTypeChange,
  manualCalories,
  onManualCaloriesChange,
  manualProtein,
  onManualProteinChange,
  manualCarbs,
  onManualCarbsChange,
  manualFat,
  onManualFatChange,
  manualFiber,
  onManualFiberChange,
  manualServingSize,
  onManualServingSizeChange,
  manualServingUnit,
  onManualServingUnitChange,
  onSubmit,
  isPending,
}) => {
  const baseId = useId();
  const nameId = `${baseId}-dish-name`;
  const mealTypeId = `${baseId}-meal-type`;
  const caloriesId = `${baseId}-calories`;
  const proteinId = `${baseId}-protein`;
  const carbsId = `${baseId}-carbs`;
  const fatId = `${baseId}-fat`;
  const fiberId = `${baseId}-fiber`;
  const servingSizeId = `${baseId}-serving-size`;
  const servingUnitId = `${baseId}-serving-unit`;

  if (!show) return null;

  return (
    <form
      onSubmit={onSubmit}
      className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-3 animate-in fade-in"
    >
      <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
        <span className="text-xs font-black uppercase tracking-wider text-cyan-400">
          Manual Macro Logging
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-white text-xs"
        >
          Cancel
        </button>
      </div>

      {selectedPhoto && (
        <div data-testid="pinned-photo-in-manual" className="flex items-center gap-3 p-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl">
          <img
            src={selectedPhoto.dataUrl}
            alt="Pinned meal"
            className="w-12 h-12 rounded-xl object-cover border border-cyan-500/30 shrink-0 shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                Pinned Meal Photo
              </span>
              <button
                type="button"
                data-testid="remove-pinned-photo-button"
                onClick={onRemovePhoto}
                className="text-zinc-500 hover:text-rose-400 text-xs min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition touch-manipulation"
                title="Remove Photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 truncate">
              Refer to your meal photo while entering macronutrients manually
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label
            htmlFor={nameId}
            className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"
          >
            Dish / Meal Name *
          </label>
          <input
            id={nameId}
            type="text"
            data-testid="dish-name-input"
            value={manualName}
            onChange={(e) => onManualNameChange(e.target.value)}
            placeholder="e.g. Scrambled Eggs & Toast"
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none"
            required
          />
        </div>
        <div>
          <label
            htmlFor={mealTypeId}
            className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"
          >
            Meal Type
          </label>
          <select
            id={mealTypeId}
            value={manualMealType}
            onChange={(e) => onManualMealTypeChange(e.target.value)}
            className="w-full bg-zinc-950 border border-border-interactive text-zinc-300 rounded-xl p-2 text-base sm:text-xs font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none"
          >
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
            <option value="Snack">Snack</option>
            <option value="Pre-Workout">Pre-Workout</option>
            <option value="Post-Workout">Post-Workout</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <label
            htmlFor={caloriesId}
            className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1"
          >
            Calories *
          </label>
          <input
            id={caloriesId}
            type="number"
            step="any"
            inputMode="numeric"
            data-testid="calories-input"
            value={manualCalories}
            onChange={(e) => onManualCaloriesChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label
            htmlFor={proteinId}
            className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1"
          >
            Protein (g)
          </label>
          <input
            id={proteinId}
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="protein-input"
            value={manualProtein}
            onChange={(e) => onManualProteinChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label
            htmlFor={carbsId}
            className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1"
          >
            Carbs (g)
          </label>
          <input
            id={carbsId}
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="carbs-input"
            value={manualCarbs}
            onChange={(e) => onManualCarbsChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label
            htmlFor={fatId}
            className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1"
          >
            Fat (g)
          </label>
          <input
            id={fatId}
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="fat-input"
            value={manualFat}
            onChange={(e) => onManualFatChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label
            htmlFor={fiberId}
            className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1"
          >
            Fiber (g)
          </label>
          <input
            id={fiberId}
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="fiber-input"
            value={manualFiber}
            onChange={(e) => onManualFiberChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="0"
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor={servingSizeId}
            className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"
          >
            Serving Size
          </label>
          <input
            id={servingSizeId}
            type="number"
            step="any"
            inputMode="decimal"
            value={manualServingSize}
            onChange={(e) => onManualServingSizeChange(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base sm:text-xs font-mono focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
          />
        </div>
        <div>
          <label
            htmlFor={servingUnitId}
            className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"
          >
            Serving Unit
          </label>
          <input
            id={servingUnitId}
            type="text"
            value={manualServingUnit}
            onChange={(e) => onManualServingUnitChange(e.target.value)}
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2 text-base sm:text-xs font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition disabled:opacity-50"
      >
        {isPending ? 'Logging...' : 'Log Meal'}
      </button>
    </form>
  );
});

ManualMealForm.displayName = 'ManualMealForm';

import React, { memo } from 'react';
import { Utensils, Calculator, Check, Star, X } from 'lucide-react';
import { roundTo1Decimal, formatCalories } from '../../utils/nutrition';
import type { NutritionItem } from '../../utils/itemModel';
import { ComponentRow } from './ComponentRow';
import {
  stagedToItem,
  stagedReference,
  type StagedItem,
  type StagedMeal,
} from './nutritionEngineHelpers';

export interface StagedMealCardProps {
  stagedMeal: StagedMeal;
  onUpdateStagedMeal: (updated: StagedMeal) => void;
  onApplyStagedItemChange: (id: string, next: NutritionItem) => void;
  onDeleteItem: (id: string) => void;
  onSaveItemAsCustomDish: (item: StagedItem) => void;
  onLogStagedMeal: () => void;
  onSaveStagedAsCustomDish: () => void;
  onDiscardStagedMeal: () => void;
  isPending: boolean;
}

export const StagedMealCard: React.FC<StagedMealCardProps> = memo(({
  stagedMeal,
  onUpdateStagedMeal,
  onApplyStagedItemChange,
  onDeleteItem,
  onSaveItemAsCustomDish,
  onLogStagedMeal,
  onSaveStagedAsCustomDish,
  onDiscardStagedMeal,
  isPending,
}) => {
  return (
    <div data-testid="staged-meal-card" className="bg-zinc-900/90 border border-cyan-500/50 rounded-3xl p-5 shadow-[0_0_30px_rgba(6,182,212,0.15)] space-y-4 animate-in fade-in">
      {/* Header row: Dish Name & Meal Type */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
          {stagedMeal.photoUrl ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-cyan-500/40 shrink-0 bg-zinc-950 shadow-md">
              <img
                src={stagedMeal.photoUrl}
                alt="Staged meal preview"
                data-testid="staged-meal-photo-thumbnail"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
              <Utensils className="w-4 h-4 text-cyan-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              data-testid="dish-name-input"
              value={stagedMeal.name}
              onChange={(e) => onUpdateStagedMeal({ ...stagedMeal, name: e.target.value })}
              className="bg-zinc-950 border border-zinc-800 text-white font-black text-base rounded-xl px-3 py-1.5 w-full focus:border-cyan-500 outline-none"
              placeholder="Meal name..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={stagedMeal.mealType}
            onChange={(e) => onUpdateStagedMeal({ ...stagedMeal, mealType: e.target.value })}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl px-2.5 py-2 focus:border-cyan-500 outline-none"
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

      {/* Itemized Ingredient Breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-black uppercase text-zinc-400 tracking-wider">
          <span>Itemized Breakdown ({stagedMeal.items.length})</span>
          <span className="text-zinc-500 text-[10px]">Adjust portion or remove item</span>
        </div>

        <div className="space-y-1.5">
          {stagedMeal.items.map((item) => (
            <ComponentRow
              key={item.id}
              item={stagedToItem(item)}
              reference={stagedReference(item)}
              onChange={(next) => onApplyStagedItemChange(item.id, next)}
              onRemove={() => onDeleteItem(item.id)}
              onSaveToQuickLog={() => onSaveItemAsCustomDish(item)}
            />
          ))}
        </div>
      </div>

      {/* Mathematical Breakdown Callout */}
      {stagedMeal.explanation && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-2.5 flex items-start gap-2 text-xs">
          <Calculator className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="font-mono text-cyan-200 text-[11px]">
            {stagedMeal.explanation}
          </div>
        </div>
      )}

      {/* Macro Summary Row & Editable Fields */}
      <div className="grid grid-cols-6 sm:grid-cols-5 gap-2 pt-1">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
            Calories
          </label>
          <input
            type="number"
            step="any"
            inputMode="numeric"
            data-testid="calories-input"
            value={roundTo1Decimal(stagedMeal.calories)}
            onChange={(e) =>
              onUpdateStagedMeal({
                ...stagedMeal,
                calories: e.target.value === '' ? 0 : roundTo1Decimal(Number(e.target.value)),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
            Protein (g)
          </label>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="protein-input"
            value={roundTo1Decimal(stagedMeal.protein)}
            onChange={(e) =>
              onUpdateStagedMeal({
                ...stagedMeal,
                protein: e.target.value === '' ? 0 : roundTo1Decimal(Number(e.target.value)),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
            Carbs (g)
          </label>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="carbs-input"
            value={roundTo1Decimal(stagedMeal.carbs)}
            onChange={(e) =>
              onUpdateStagedMeal({
                ...stagedMeal,
                carbs: e.target.value === '' ? 0 : roundTo1Decimal(Number(e.target.value)),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
            Fat (g)
          </label>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="fat-input"
            value={roundTo1Decimal(stagedMeal.fat)}
            onChange={(e) =>
              onUpdateStagedMeal({
                ...stagedMeal,
                fat: e.target.value === '' ? 0 : roundTo1Decimal(Number(e.target.value)),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
            Fiber (g)
          </label>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            data-testid="fiber-input"
            value={roundTo1Decimal(stagedMeal.fiber)}
            onChange={(e) =>
              onUpdateStagedMeal({
                ...stagedMeal,
                fiber: e.target.value === '' ? 0 : roundTo1Decimal(Number(e.target.value)),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
          />
        </div>
      </div>

      {/* Action Buttons Bar */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onLogStagedMeal}
          disabled={isPending}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black py-3 px-4 min-h-[44px] rounded-xl text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          <span>
            {isPending
              ? 'Logging...'
              : `Log Meal (+${formatCalories(stagedMeal.calories)} kcal)`}
          </span>
        </button>

        <button
          type="button"
          onClick={onSaveStagedAsCustomDish}
          className="bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold py-3 px-3.5 min-h-[44px] rounded-xl text-xs border border-zinc-700 transition flex items-center gap-1.5"
          title="Save this meal as a quick-log custom dish"
        >
          <Star className="w-3.5 h-3.5 fill-amber-400" />
          <span className="hidden sm:inline">Save as Custom Dish</span>
        </button>

        <button
          type="button"
          onClick={onDiscardStagedMeal}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-3 min-h-[44px] min-w-[44px] rounded-xl transition border border-zinc-700 flex items-center justify-center"
          title="Discard"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

StagedMealCard.displayName = 'StagedMealCard';

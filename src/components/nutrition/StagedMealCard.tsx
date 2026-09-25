import React, { memo } from 'react';
import { Utensils, Check, Star, X } from 'lucide-react';
import { roundTo1Decimal, formatCalories, formatMacro } from '../../utils/nutrition';
import type { NutritionItem } from '../../utils/itemModel';
import { ComponentRow } from './ComponentRow';
import {
  stagedToItem,
  stagedReference,
  reanchorStagedItem,
  recomputeStagedTotals,
  updateStagedItemNutrition,
  type StagedItem,
  type StagedMeal,
} from './nutritionEngineHelpers';
import { computeVisibleMacroColumns, MACRO_COLUMNS_CONFIG, getMacroGridTemplateColumns } from './macroColumns';
import { DayTotalRow, type MacroTotalsShape } from './TodayAfterRow';

export interface StagedMealCardProps {
  stagedMeal: StagedMeal;
  dailyTotals?: Partial<MacroTotalsShape>;
  targets?: Partial<MacroTotalsShape>;
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
  dailyTotals,
  targets,
  onUpdateStagedMeal,
  onApplyStagedItemChange,
  onDeleteItem,
  onSaveItemAsCustomDish,
  onLogStagedMeal,
  onSaveStagedAsCustomDish,
  onDiscardStagedMeal,
  isPending,
}) => {
  const isMultiItem = stagedMeal.items && stagedMeal.items.length > 1;
  const macroColumns = computeVisibleMacroColumns(stagedMeal.items);

  return (
    <div
      data-testid="staged-meal-card"
      className="bg-zinc-900/90 border border-cyan-500/50 rounded-2xl sm:rounded-3xl px-3 py-2 sm:p-4 shadow-[0_0_30px_rgba(6,182,212,0.15)] space-y-1.5 sm:space-y-2 animate-in fade-in"
    >
      {/* Header row: Dish Name & Meal Type (1 row on mobile & desktop) */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-1.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {stagedMeal.photoUrl ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-cyan-500/40 shrink-0 bg-zinc-950 shadow-md">
              <img
                src={stagedMeal.photoUrl}
                alt="Staged meal preview"
                data-testid="staged-meal-photo-thumbnail"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
              <Utensils className="w-4 h-4 text-cyan-400" />
            </div>
          )}
          <input
            type="text"
            data-testid="dish-name-input"
            value={stagedMeal.name}
            onChange={(e) => onUpdateStagedMeal({ ...stagedMeal, name: e.target.value })}
            className="flex-1 min-w-0 bg-zinc-950 border border-border-interactive text-white font-bold text-base rounded-xl px-2.5 py-1.5 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none truncate min-h-[40px] h-10"
            placeholder="Meal name..."
          />
        </div>

        <select
          aria-label="Meal type"
          value={stagedMeal.mealType}
          onChange={(e) => onUpdateStagedMeal({ ...stagedMeal, mealType: e.target.value })}
          className="w-28 shrink-0 bg-zinc-950 border border-border-interactive text-zinc-300 text-xs font-semibold rounded-xl px-2 py-2 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none min-h-[40px] h-10"
        >
          <option value="Breakfast">Breakfast</option>
          <option value="Lunch">Lunch</option>
          <option value="Dinner">Dinner</option>
          <option value="Snack">Snack</option>
          <option value="Pre-Workout">Pre-Workout</option>
          <option value="Post-Workout">Post-Workout</option>
        </select>
      </div>

      {/* Itemized Ingredient Breakdown */}
      <div className="space-y-0.5">
        {isMultiItem && (
          <div className="flex items-center justify-between text-xs font-bold uppercase text-zinc-400 tracking-wider">
            <span>Itemized Breakdown ({stagedMeal.items.length})</span>
          </div>
        )}

        <div className="divide-y divide-zinc-800/80">
          {stagedMeal.items.map((item) => (
            <ComponentRow
              key={item.id}
              item={stagedToItem(item)}
              reference={stagedReference(item)}
              macroColumns={macroColumns}
              onChange={(next) => onApplyStagedItemChange(item.id, next)}
              onReanchor={(next) => {
                const updatedItems = stagedMeal.items.map((it) =>
                  it.id === item.id ? reanchorStagedItem(it, next) : it
                );
                const totals = recomputeStagedTotals(updatedItems);
                onUpdateStagedMeal({
                  ...stagedMeal,
                  items: updatedItems,
                  ...totals,
                });
              }}
              onRemove={() => onDeleteItem(item.id)}
              onSaveToQuickLog={() => onSaveItemAsCustomDish(item)}
              onEditNutrition={(edited) => {
                const updatedItems = stagedMeal.items.map((it) =>
                  it.id === item.id ? updateStagedItemNutrition(it, edited) : it
                );
                const totals = recomputeStagedTotals(updatedItems);
                onUpdateStagedMeal({
                  ...stagedMeal,
                  items: updatedItems,
                  ...totals,
                });
              }}
            />
          ))}
        </div>

        {/* Macro Totals: Read-only for multi-item (Fix D5) directly under the rows */}
        {isMultiItem && (
          <div
            data-testid="staged-meal-totals"
            className="pt-1.5 border-t border-zinc-700/80 text-xs tabular-nums leading-tight"
            aria-label="Totals are the sum of items"
            title="Totals are the sum of items · edit an item via ⋯"
          >
            <div
              data-testid="this-meal-label"
              className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-0.5 leading-none"
            >
              This meal
            </div>
            <div
              data-testid="staged-meal-totals-grid"
              className="grid text-xs tabular-nums leading-tight"
              style={{ gridTemplateColumns: getMacroGridTemplateColumns(macroColumns) }}
            >
              <span className="sr-only">Totals are the sum of items</span>
              {macroColumns.map((colKey) => {
                const config = MACRO_COLUMNS_CONFIG[colKey];
                const rawVal = stagedMeal[colKey];
                const num = roundTo1Decimal(rawVal);
                const isZero = colKey === 'calories' ? Math.abs(num) < 0.5 : Math.abs(num) < 0.05;
                const formatted = isZero ? '0' : (colKey === 'calories' ? formatCalories(rawVal) : formatMacro(rawVal));

                return (
                  <div
                    key={colKey}
                    data-testid={`staged-total-${colKey}`}
                    className={`text-right text-xs tabular-nums ${isZero ? 'text-zinc-600 font-normal' : config.colorClass}`}
                  >
                    <span data-testid={`macro-val-${colKey}`} className={`tabular-nums ${isZero ? 'font-normal' : 'font-semibold'}`}>
                      {formatted}
                    </span>{' '}
                    <span className="opacity-70 font-normal">
                      {config.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Day total row (Fix D8 redesign, D14: drop isMultiItem gate so single-item meals show Day total) */}
        {(dailyTotals || targets) && (
          <DayTotalRow
            macroColumns={macroColumns}
            mealTotals={{
              calories: stagedMeal.calories,
              protein: stagedMeal.protein,
              carbs: stagedMeal.carbs,
              fat: stagedMeal.fat,
              fiber: stagedMeal.fiber,
            }}
            dailyTotals={dailyTotals}
            targets={targets}
          />
        )}
      </div>

      {/* Accessible math explanation for screen readers (Fix D4: visual formula box removed) */}
      {stagedMeal.explanation && (
        <span className="sr-only">{stagedMeal.explanation}</span>
      )}

      {/* Action Buttons Bar */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onLogStagedMeal}
          disabled={isPending}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black py-2.5 px-3 min-h-[40px] rounded-xl text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-1.5 touch-manipulation"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {isPending
              ? 'Logging...'
              : `Log Meal (+${formatCalories(stagedMeal.calories)} kcal)`}
          </span>
        </button>

        <button
          type="button"
          onClick={onSaveStagedAsCustomDish}
          className="bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold py-2.5 px-3 min-h-[40px] rounded-xl text-xs border border-border-interactive transition flex items-center gap-1.5 touch-manipulation shrink-0"
          title="Save this meal as a quick-log custom dish"
        >
          <Star className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
          <span className="hidden sm:inline">Save as Custom Dish</span>
        </button>

        <button
          type="button"
          aria-label="Discard staged meal"
          onClick={onDiscardStagedMeal}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-2.5 min-h-[40px] min-w-[40px] rounded-xl transition border border-border-interactive flex items-center justify-center touch-manipulation shrink-0"
          title="Discard"
        >
          <X className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
});

StagedMealCard.displayName = 'StagedMealCard';

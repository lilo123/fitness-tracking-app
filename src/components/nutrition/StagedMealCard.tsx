import React, { memo, useId, useState } from 'react';
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
  type EditedItemNutrition,
  type StagedItem,
  type StagedMeal,
} from './nutritionEngineHelpers';
import { computeVisibleMacroColumns, MACRO_COLUMNS_CONFIG, getMacroGridTemplateColumns } from './macroColumns';

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

type MacroField = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';

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
  const baseId = useId();
  const caloriesId = `${baseId}-calories`;
  const proteinId = `${baseId}-protein`;
  const carbsId = `${baseId}-carbs`;
  const fatId = `${baseId}-fat`;
  const fiberId = `${baseId}-fiber`;

  const [drafts, setDrafts] = useState<Partial<Record<MacroField, string>>>({});

  const isMultiItem = stagedMeal.items && stagedMeal.items.length > 1;
  const macroColumns = computeVisibleMacroColumns(stagedMeal.items);

  const commitSingleItemField = (field: MacroField, num: number) => {
    if (!stagedMeal.items || stagedMeal.items.length === 0) {
      onUpdateStagedMeal({
        ...stagedMeal,
        [field]: num,
      });
      return;
    }

    const item0 = stagedMeal.items[0];
    const currentEdited: EditedItemNutrition = {
      calories: item0.calories,
      protein: item0.protein,
      carbs: item0.carbs,
      fat: item0.fat,
      fiber: item0.fiber,
    };
    currentEdited[field] = num;

    const updatedItem = updateStagedItemNutrition(item0, currentEdited);
    const updatedItems = [updatedItem];
    const totals = recomputeStagedTotals(updatedItems);
    onUpdateStagedMeal({
      ...stagedMeal,
      items: updatedItems,
      ...totals,
    });
  };

  const handleInputChange = (field: MacroField, rawVal: string) => {
    setDrafts((prev) => ({ ...prev, [field]: rawVal }));

    // In-progress typing (e.g. "3." or "-") should not commit yet
    if (rawVal.endsWith('.') || rawVal === '-') {
      return;
    }

    if (rawVal === '') {
      commitSingleItemField(field, 0);
      return;
    }

    const parsed = parseFloat(rawVal);
    if (Number.isFinite(parsed) && parsed >= 0) {
      commitSingleItemField(field, roundTo1Decimal(parsed));
    }
  };

  const handleInputBlur = (field: MacroField) => {
    const draftVal = drafts[field];
    if (draftVal !== undefined) {
      const parsed = parseFloat(draftVal);
      const num = Number.isFinite(parsed) && parsed >= 0 ? roundTo1Decimal(parsed) : 0;
      commitSingleItemField(field, num);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const getInputValue = (field: MacroField): string => {
    if (drafts[field] !== undefined) {
      return drafts[field]!;
    }
    return String(roundTo1Decimal(stagedMeal[field]));
  };

  return (
    <div
      data-testid="staged-meal-card"
      className="bg-zinc-900/90 border border-cyan-500/50 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-[0_0_30px_rgba(6,182,212,0.15)] space-y-2 sm:space-y-2.5 animate-in fade-in"
    >
      {/* Header row: Dish Name & Meal Type (1 row on mobile & desktop) */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
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
            className="flex-1 min-w-0 bg-zinc-950 border border-border-interactive text-white font-bold text-base rounded-xl px-2.5 py-1.5 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none truncate"
            placeholder="Meal name..."
          />
        </div>

        <select
          aria-label="Meal type"
          value={stagedMeal.mealType}
          onChange={(e) => onUpdateStagedMeal({ ...stagedMeal, mealType: e.target.value })}
          className="w-28 shrink-0 bg-zinc-950 border border-border-interactive text-zinc-300 text-xs font-semibold rounded-xl px-2 py-2 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none"
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
        <div className="flex items-center justify-between text-xs font-bold uppercase text-zinc-400 tracking-wider">
          <span>Itemized Breakdown ({stagedMeal.items.length})</span>
        </div>

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
            className="grid pt-1.5 border-t border-zinc-700/80 text-xs tabular-nums leading-tight"
            style={{ gridTemplateColumns: getMacroGridTemplateColumns(macroColumns) }}
            aria-label="Totals are the sum of items"
            title="Totals are the sum of items · edit an item via ⋯"
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
        )}
      </div>

      {/* Accessible math explanation for screen readers (Fix D4: visual formula box removed) */}
      {stagedMeal.explanation && (
        <span className="sr-only">{stagedMeal.explanation}</span>
      )}

      {/* Macro Totals: editable for single-item */}
      {!isMultiItem && (
        <div className="grid grid-cols-5 gap-1.5 pt-0.5">
          <div>
            <label
              htmlFor={caloriesId}
              className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-0.5 text-center"
            >
              Calories
            </label>
            <input
              id={caloriesId}
              type="number"
              step="any"
              inputMode="numeric"
              data-testid="calories-input"
              value={getInputValue('calories')}
              onChange={(e) => handleInputChange('calories', e.target.value)}
              onBlur={() => handleInputBlur('calories')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl py-1.5 px-1 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            />
          </div>
          <div>
            <label
              htmlFor={proteinId}
              className="block text-xs font-bold text-cyan-400 uppercase tracking-wider mb-0.5 text-center"
            >
              Protein (g)
            </label>
            <input
              id={proteinId}
              type="number"
              step="any"
              inputMode="decimal"
              data-testid="protein-input"
              value={getInputValue('protein')}
              onChange={(e) => handleInputChange('protein', e.target.value)}
              onBlur={() => handleInputBlur('protein')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl py-1.5 px-1 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            />
          </div>
          <div>
            <label
              htmlFor={carbsId}
              className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-0.5 text-center"
            >
              Carbs (g)
            </label>
            <input
              id={carbsId}
              type="number"
              step="any"
              inputMode="decimal"
              data-testid="carbs-input"
              value={getInputValue('carbs')}
              onChange={(e) => handleInputChange('carbs', e.target.value)}
              onBlur={() => handleInputBlur('carbs')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl py-1.5 px-1 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            />
          </div>
          <div>
            <label
              htmlFor={fatId}
              className="block text-xs font-bold text-violet-400 uppercase tracking-wider mb-0.5 text-center"
            >
              Fat (g)
            </label>
            <input
              id={fatId}
              type="number"
              step="any"
              inputMode="decimal"
              data-testid="fat-input"
              value={getInputValue('fat')}
              onChange={(e) => handleInputChange('fat', e.target.value)}
              onBlur={() => handleInputBlur('fat')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl py-1.5 px-1 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            />
          </div>
          <div>
            <label
              htmlFor={fiberId}
              className="block text-xs font-bold text-teal-400 uppercase tracking-wider mb-0.5 text-center"
            >
              Fiber (g)
            </label>
            <input
              id={fiberId}
              type="number"
              step="any"
              inputMode="decimal"
              data-testid="fiber-input"
              value={getInputValue('fiber')}
              onChange={(e) => handleInputChange('fiber', e.target.value)}
              onBlur={() => handleInputBlur('fiber')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl py-1.5 px-1 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none text-center"
            />
          </div>
        </div>
      )}

      {/* Action Buttons Bar */}
      <div className="flex items-center gap-2 pt-1">
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

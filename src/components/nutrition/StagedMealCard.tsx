import React, { memo, useRef, useEffect, useState } from 'react';
import { Utensils, Check, Star, X, ChevronDown } from 'lucide-react';
import { roundTo1Decimal, formatCalories, formatMacro } from '../../utils/nutrition';
import type { NutritionItem } from '../../utils/itemModel';
import { ComponentRow } from './ComponentRow';
import {
  stagedToItem,
  stagedReference,
  reanchorStagedItem,
  recomputeStagedTotals,
  updateStagedItemNutrition,
  buildStagedItem,
  getScrollBehavior,
  useNavHeight,
  type StagedItem,
  type StagedMeal,
} from './nutritionEngineHelpers';
import { AddItemForm, type AddItemFormData } from './AddItemForm';
import { computeVisibleMacroColumns, MACRO_COLUMNS_CONFIG, getMacroGridTemplateColumns } from './macroColumns';
import { DayTotalRow, type MacroTotalsShape } from './TodayAfterRow';

export interface StagedMealCardProps {
  navHeight?: number;
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
  navHeight: navHeightProp,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const measuredNavHeight = useNavHeight();
  const effectiveNavHeight = navHeightProp ?? measuredNavHeight;

  useEffect(() => {
    const behavior = getScrollBehavior();
    if (cardRef.current) {
      if (typeof cardRef.current.scrollIntoView === 'function') {
        cardRef.current.scrollIntoView({ behavior, block: 'start' });
      }
    }

    const triggerEl = typeof document !== 'undefined' ? document.activeElement : null;
    const frameId = requestAnimationFrame(() => {
      if (!cardRef.current) return;
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (!activeEl || activeEl === document.body || activeEl === document.documentElement) {
        const dishNameInput = cardRef.current.querySelector<HTMLInputElement>('[data-testid="dish-name-input"]');
        dishNameInput?.focus({ preventScroll: true });
        return;
      }

      if (cardRef.current.contains(activeEl)) {
        return;
      }

      // Only autofocus if focus is still on the element that triggered staging
      // and not moved elsewhere (e.g. date picker or outside input)
      const isTrigger =
        triggerEl &&
        activeEl === triggerEl &&
        activeEl.tagName !== 'INPUT' &&
        activeEl.tagName !== 'TEXTAREA';

      if (isTrigger) {
        const dishNameInput = cardRef.current.querySelector<HTMLInputElement>('[data-testid="dish-name-input"]');
        dishNameInput?.focus({ preventScroll: true });
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, []);

  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newlyAddedItemId, setNewlyAddedItemId] = useState<string | null>(null);
  const wasAddingItemRef = useRef(false);
  const addItemBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (newlyAddedItemId && cardRef.current) {
      const row = cardRef.current.querySelector(`[data-item-id="${newlyAddedItemId}"]`);
      const qtyInput = row?.querySelector<HTMLInputElement>('[data-testid="component-quantity-input"]');
      qtyInput?.focus();
      setNewlyAddedItemId(null);
    } else if (wasAddingItemRef.current && !isAddingItem) {
      addItemBtnRef.current?.focus();
    }
    wasAddingItemRef.current = isAddingItem;
  }, [newlyAddedItemId, isAddingItem]);

  const handleAddItem = (data: AddItemFormData) => {
    const newItem = buildStagedItem({
      name: data.name,
      portion: `${data.quantity} ${data.unit}`,
      quantity: data.quantity,
      unit: data.unit,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      fiber: data.fiber,
    });
    const updatedItems = [...stagedMeal.items, newItem];
    const totals = recomputeStagedTotals(updatedItems);
    onUpdateStagedMeal({
      ...stagedMeal,
      items: updatedItems,
      ...totals,
    });
    setIsAddingItem(false);
    setNewlyAddedItemId(newItem.id);
  };

  const isMultiItem = stagedMeal.items && stagedMeal.items.length > 1;
  const macroColumns = computeVisibleMacroColumns(stagedMeal.items);

  return (
    <div
      ref={cardRef}
      data-testid="staged-meal-card"
      className="bg-zinc-900/90 border border-cyan-500/50 rounded-2xl sm:rounded-3xl px-3 pt-0.5 pb-0 sm:pt-4 sm:px-4 sm:pb-0 shadow-[0_0_30px_rgba(6,182,212,0.15)] space-y-1.5 sm:space-y-2 animate-in fade-in motion-reduce:animate-none scroll-mt-16 sm:scroll-mt-20"
    >
      {/* Header row: Dish Name & Meal Type (1 row on mobile & desktop) */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-1">
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
            aria-label="Meal name"
            value={stagedMeal.name}
            onChange={(e) => onUpdateStagedMeal({ ...stagedMeal, name: e.target.value })}
            className="flex-1 min-w-0 bg-zinc-950 border border-border-interactive text-white font-bold text-base rounded-xl px-2.5 py-1.5 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none truncate min-h-[40px] h-10"
            placeholder="Meal name..."
          />
        </div>

        <div className="relative w-[134px] shrink-0">
          <select
            aria-label="Meal type"
            value={stagedMeal.mealType}
            onChange={(e) => onUpdateStagedMeal({ ...stagedMeal, mealType: e.target.value })}
            className="w-full appearance-none bg-zinc-950 border border-border-interactive text-zinc-300 text-base font-semibold rounded-xl pl-2 pr-7 py-2 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none min-h-[40px] h-10 cursor-pointer"
          >
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
            <option value="Snack">Snack</option>
            <option value="Pre-Workout">Pre-Workout</option>
            <option value="Post-Workout">Post-Workout</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Itemized Ingredient Breakdown */}
      <div className="space-y-0.5 pt-0.5">
        <div className="flex items-center justify-between text-xs font-bold uppercase text-zinc-400 tracking-wider">
          {isMultiItem ? (
            <span>Itemized Breakdown ({stagedMeal.items.length})</span>
          ) : (
            <span className="sr-only">Items</span>
          )}
          {!isAddingItem && (
            <button
              ref={addItemBtnRef}
              type="button"
              data-testid="add-item-button"
              aria-label="Add manual item"
              onClick={() => setIsAddingItem(true)}
              className="ml-auto text-cyan-400 hover:text-cyan-300 font-bold text-xs uppercase tracking-wider min-h-[40px] h-10 px-2.5 flex items-center justify-center -my-3 rounded-lg transition motion-reduce:transition-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              + Manual
            </button>
          )}
        </div>

        <div className="divide-y divide-zinc-800/80 pt-3.5">
          {stagedMeal.items.map((item) => (
            <div key={item.id} data-item-id={item.id}>
              <ComponentRow
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
            </div>
          ))}
        </div>

        {isAddingItem && (
          <div className="pt-1">
            <AddItemForm
              onAddItem={handleAddItem}
              onCancel={() => setIsAddingItem(false)}
            />
          </div>
        )}

        {/* Macro Totals: Read-only for multi-item (Fix D5) directly under the rows */}
        {isMultiItem && (
          <div
            data-testid="staged-meal-totals"
            className="pt-1 border-t border-zinc-700/80 text-xs tabular-nums leading-tight"
            aria-label="Totals are the sum of items"
            title="Totals are the sum of items · edit an item via ⋯"
          >
            <div
              data-testid="this-meal-label"
              className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-0 leading-none"
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
                    className={`text-right text-xs tabular-nums whitespace-nowrap ${isZero ? 'text-zinc-600 font-normal' : config.colorClass}`}
                  >
                    <span data-testid={`macro-val-${colKey}`} className={`text-sm tabular-nums ${isZero ? 'font-normal' : 'font-semibold'}`}>
                      {formatted}
                    </span>{' '}
                    <span className="text-xs opacity-70 font-normal">
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
        <span className="sr-only" aria-live="polite">{stagedMeal.explanation}</span>
      )}

      {/* Action Buttons Bar */}
      <div
        data-testid="staged-card-actions"
        style={{ bottom: `${effectiveNavHeight}px` }}
        className="sticky z-20 bg-zinc-900 border-t border-zinc-800/80 -mx-3 px-3 sm:-mx-4 sm:px-4 py-1.5 flex items-center gap-1.5 sm:gap-2 rounded-b-2xl sm:rounded-b-3xl"
      >
        <button
          type="button"
          onClick={onLogStagedMeal}
          disabled={isPending}
          className="flex-1 min-w-0 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-2.5 px-2 min-h-[40px] rounded-xl text-xs uppercase tracking-tight shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition motion-reduce:transition-none disabled:opacity-50 flex items-center justify-center gap-1 touch-manipulation whitespace-nowrap"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">
            {isPending
              ? 'Logging...'
              : `Log Meal (+${formatCalories(stagedMeal.calories)} kcal)`}
          </span>
        </button>

        <button
          type="button"
          aria-label="Save as Custom Dish"
          onClick={onSaveStagedAsCustomDish}
          className="bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold py-2.5 px-3 min-h-[40px] rounded-xl text-xs border border-border-interactive transition motion-reduce:transition-none flex items-center gap-1.5 touch-manipulation shrink-0"
          title="Save this meal as a quick-log custom dish"
        >
          <Star className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
          <span className="hidden sm:inline">Save as Custom Dish</span>
        </button>

        <button
          type="button"
          aria-label="Discard staged meal"
          onClick={onDiscardStagedMeal}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-2.5 min-h-[40px] min-w-[40px] rounded-xl transition motion-reduce:transition-none border border-border-interactive flex items-center justify-center touch-manipulation shrink-0"
          title="Discard"
        >
          <X className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
});

StagedMealCard.displayName = 'StagedMealCard';

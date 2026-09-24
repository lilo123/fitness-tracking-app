import React, { useState } from 'react';
import { formatCalories, formatMacro, roundTo1Decimal } from '../../utils/nutrition';
import { parseQuantityInput, shortUnitLabel, type CanonicalUnit } from '../../utils/unitConverter';
import { scaleItemToQuantity, reanchorItemTo, type NutritionItem } from '../../utils/itemModel';
import { OverflowMenu, type OverflowMenuItem } from '../common/OverflowMenu';
import { UnitChip } from './UnitChip';
import { ItemNutritionModal } from './ItemNutritionModal';
import type { EditedItemNutrition } from './nutritionEngineHelpers';

export interface ComponentRowProps {
  item: NutritionItem;
  /** The item at its reference quantity. Scaling is relative to this, so there is no accumulating drift and no dead end. */
  reference: NutritionItem;
  onChange?: (next: NutritionItem) => void;
  onReanchor?: (next: NutritionItem) => void;
  onRemove?: () => void;
  onSaveToQuickLog?: () => void;
  onEditNutrition?: (edited: EditedItemNutrition) => void;
  /** Coach read-only inspection: expanding is allowed, every mutating affordance is not. */
  readOnly?: boolean;
}

/**
 * Compact item row for staged meals and meal logs (Fixes D1, D2, D6, R3).
 *
 * Layout:
 *   Left  (flex-1 min-w-0): name (line 1, truncate) stacked above non-zero macros
 *         (line 2, kcal first in amber, then non-zero P/C/F/Fib in macro colors).
 *   Right (shrink-0): compact stepper [ - ][ editable qty input ][ + ] with inline UnitChip,
 *         followed by the OverflowMenu (⋯).
 *
 * Maintains touch target sizes >= 40x40 px and typography >= 12 px (text-xs).
 */
export const ComponentRow: React.FC<ComponentRowProps> = ({
  item,
  reference,
  onChange,
  onReanchor,
  onRemove,
  onSaveToQuickLog,
  onEditNutrition,
  readOnly = false,
}) => {
  // The input is free text so an in-progress value like "" or "12." is not
  // clobbered by the controlled numeric round trip.
  const [draft, setDraft] = useState<string | null>(null);
  const [pendingUnit, setPendingUnit] = useState<CanonicalUnit | null>(null);
  const [pendingAbsurdEdit, setPendingAbsurdEdit] = useState<NutritionItem | null>(null);
  const [localAnchor, setLocalAnchor] = useState<NutritionItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const shown = draft ?? (pendingUnit !== null ? '' : String(roundTo1Decimal(item.quantity)));

  const editable = !readOnly && Boolean(onChange);

  const effectiveRef =
    reference.unit === item.unit
      ? reference
      : localAnchor?.unit === item.unit
        ? localAnchor
        : reference;

  const handleUnitChange = (nextUnit: CanonicalUnit) => {
    if (!editable) return;
    const currentActiveUnit = pendingUnit ?? item.unit;
    if (nextUnit === currentActiveUnit) {
      // Re-selecting already-active unit is a no-op
      return;
    }
    if (nextUnit === item.unit) {
      // Re-selecting the row's base unit cancels pending re-anchor
      setPendingUnit(null);
      setDraft(null);
      return;
    }
    setPendingUnit(nextUnit);
    setDraft('');
  };

  const commit = (raw: string) => {
    const parsed = parseQuantityInput(raw);
    if (parsed === null || !onChange) {
      if (pendingUnit) {
        setDraft('');
      } else {
        setDraft(null);
      }
      return;
    }

    if (pendingUnit) {
      const reanchored = reanchorItemTo(item, roundTo1Decimal(parsed), pendingUnit);
      setLocalAnchor(reanchored);
      setPendingUnit(null);
      setDraft(null);
      if (onReanchor) {
        onReanchor(reanchored);
      } else {
        onChange(reanchored);
      }
      return;
    }

    const scaled = scaleItemToQuantity(effectiveRef, roundTo1Decimal(parsed));
    const nextItem: NutritionItem = {
      ...scaled,
      quantity: roundTo1Decimal(scaled.quantity),
      calories: roundTo1Decimal(scaled.calories),
      protein: roundTo1Decimal(scaled.protein),
      carbs: roundTo1Decimal(scaled.carbs),
      fat: roundTo1Decimal(scaled.fat),
      fiber: roundTo1Decimal(scaled.fiber),
      unit: item.unit,
    };

    if (item.calories > 0 && nextItem.calories > item.calories * 20) {
      setPendingAbsurdEdit(nextItem);
      return;
    }

    onChange(nextItem);
    setDraft(null);
  };

  const step = (delta: number) => {
    if (!onChange || pendingUnit) return;
    const base = parseQuantityInput(shown) ?? item.quantity;
    const next = Math.max(0, roundTo1Decimal(base + delta));
    const scaled = scaleItemToQuantity(effectiveRef, next);
    const nextItem: NutritionItem = {
      ...scaled,
      quantity: roundTo1Decimal(scaled.quantity),
      calories: roundTo1Decimal(scaled.calories),
      protein: roundTo1Decimal(scaled.protein),
      carbs: roundTo1Decimal(scaled.carbs),
      fat: roundTo1Decimal(scaled.fat),
      fiber: roundTo1Decimal(scaled.fiber),
      unit: item.unit,
    };

    if (item.calories > 0 && nextItem.calories > item.calories * 20) {
      setPendingAbsurdEdit(nextItem);
      return;
    }

    onChange(nextItem);
    setDraft(null);
  };

  const menuItems: OverflowMenuItem[] = [];
  if (onEditNutrition) {
    menuItems.push({
      label: 'Edit nutrition',
      onSelect: () => setIsEditModalOpen(true),
      testId: 'component-edit-nutrition',
    });
  }
  if (onSaveToQuickLog) {
    menuItems.push({ label: 'Save to quick log', onSelect: onSaveToQuickLog, testId: 'component-save-quick-log' });
  }
  if (onRemove) {
    menuItems.push({ label: 'Remove', onSelect: onRemove, tone: 'danger', testId: 'component-remove' });
  }

  const p = roundTo1Decimal(item.protein);
  const c = roundTo1Decimal(item.carbs);
  const f = roundTo1Decimal(item.fat);
  const fib = roundTo1Decimal(item.fiber);
  const hasMacros = p > 0 || c > 0 || f > 0 || fib > 0;

  return (
    <div
      data-testid="component-row"
      className="py-1 border-b border-zinc-800/80 last:border-b-0 min-h-[44px] flex flex-col justify-center"
    >
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        {/* LEFT (flex-1, min-w-0): name (line 1, text-xs/semibold, may truncate) above macros line (line 2, text-xs, font-mono, kcal first in amber, then non-zero P/C/F/Fib in their macro colors; kcal never truncated) */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          {/* Line 1: Name */}
          <div
            data-testid="component-name"
            title={item.name}
            className="truncate text-xs font-semibold text-white leading-tight"
          >
            {item.name}
          </div>

          {/* Line 2: Macros line */}
          <div
            data-testid="component-macros"
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs tabular-nums text-zinc-400 leading-tight"
          >
            <span className="font-bold text-amber-400 shrink-0">
              {formatCalories(item.calories)} kcal
            </span>
            {hasMacros && <span className="text-zinc-600 shrink-0">·</span>}
            {p > 0 && (
              <span className="text-cyan-400 shrink-0">P {formatMacro(item.protein)}</span>
            )}
            {c > 0 && (
              <span className="text-emerald-400 shrink-0">C {formatMacro(item.carbs)}</span>
            )}
            {f > 0 && (
              <span className="text-violet-400 shrink-0">F {formatMacro(item.fat)}</span>
            )}
            {fib > 0 && (
              <span className="text-teal-400 shrink-0">Fib {formatMacro(item.fiber)}</span>
            )}
          </div>
        </div>

        {/* RIGHT (shrink-0): compact stepper [−][editable qty input][inline UnitChip][+] + ⋯ OverflowMenu */}
        <div className="shrink-0 flex items-center gap-1">
          {editable ? (
            <div className="inline-flex items-center rounded-lg border border-border-interactive bg-zinc-950 p-0.5 shadow-sm">
              <button
                type="button"
                aria-label={`Decrease quantity of ${item.name}`}
                onClick={() => step(-1)}
                disabled={Boolean(pendingUnit)}
                aria-disabled={Boolean(pendingUnit)}
                className="min-h-[40px] min-w-[40px] w-10 h-10 shrink-0 rounded flex items-center justify-center bg-zinc-800 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
              >
                -
              </button>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                data-testid="component-quantity-input"
                aria-label={`Quantity of ${item.name}`}
                value={shown}
                placeholder={pendingUnit ? `amount in ${pendingUnit} for this ${formatCalories(item.calories)} kcal` : undefined}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit((e.target as HTMLInputElement).value);
                  }
                }}
                className="min-h-[40px] w-11 sm:w-16 min-w-0 bg-transparent text-center text-base sm:text-xs font-semibold tabular-nums text-white outline-none px-0.5 input-text-xs"
              />
              <UnitChip
                value={pendingUnit ?? item.unit}
                onChange={handleUnitChange}
                testId="component-unit-chip"
                embedded
              />
              <button
                type="button"
                aria-label={`Increase quantity of ${item.name}`}
                onClick={() => step(1)}
                disabled={Boolean(pendingUnit)}
                aria-disabled={Boolean(pendingUnit)}
                className="min-h-[40px] min-w-[40px] w-10 h-10 shrink-0 rounded flex items-center justify-center bg-zinc-800 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
              >
                +
              </button>
            </div>
          ) : (
            <span className="text-xs font-mono font-medium text-zinc-400 px-1">
              {roundTo1Decimal(item.quantity)}{shortUnitLabel(item.unit)}
            </span>
          )}

          {!readOnly && menuItems.length > 0 && (
            <OverflowMenu
              ariaLabel={`Actions for ${item.name}`}
              items={menuItems}
              testId="component-actions"
            />
          )}
        </div>
      </div>

      {pendingUnit && (
        <div data-testid="component-reanchor-hint" className="mt-1 text-xs text-zinc-400">
          amount in {pendingUnit} for this {formatCalories(item.calories)} kcal
        </div>
      )}

      {/* Inline confirmation for absurd edits (>20x calories) */}
      {pendingAbsurdEdit && (
        <div
          data-testid="absurd-edit-confirm"
          className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 p-2 text-xs space-y-1.5"
        >
          <div className="text-amber-200">
            This edit increases calories by more than 20x ({formatCalories(item.calories)} → {formatCalories(pendingAbsurdEdit.calories)} kcal).
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="confirm-apply-edit"
              onClick={() => {
                onChange?.(pendingAbsurdEdit);
                setPendingAbsurdEdit(null);
                setDraft(null);
              }}
              className="rounded bg-amber-500 px-2 py-1 font-bold text-zinc-950 hover:bg-amber-400 min-h-[40px] touch-manipulation"
            >
              Apply anyway
            </button>
            <button
              type="button"
              data-testid="cancel-apply-edit"
              onClick={() => {
                setPendingAbsurdEdit(null);
                setDraft(null);
              }}
              className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700 min-h-[40px] touch-manipulation"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {onEditNutrition && (
        <ItemNutritionModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          item={item}
          onSave={onEditNutrition}
        />
      )}
    </div>
  );
};

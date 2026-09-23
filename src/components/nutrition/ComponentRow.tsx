import React, { useState } from 'react';
import { formatCalories, formatMacro, roundTo1Decimal } from '../../utils/nutrition';
import { parseQuantityInput, shortUnitLabel, type CanonicalUnit } from '../../utils/unitConverter';
import { scaleItemToQuantity, reanchorItemTo, type NutritionItem } from '../../utils/itemModel';
import { OverflowMenu, type OverflowMenuItem } from '../common/OverflowMenu';
import { UnitChip } from './UnitChip';

export interface ComponentRowProps {
  item: NutritionItem;
  /** The item at its reference quantity. Scaling is relative to this, so there is no accumulating drift and no dead end. */
  reference: NutritionItem;
  onChange?: (next: NutritionItem) => void;
  onReanchor?: (next: NutritionItem) => void;
  onRemove?: () => void;
  onSaveToQuickLog?: () => void;
  /** Coach read-only inspection: expanding is allowed, every mutating affordance is not. */
  readOnly?: boolean;
}

/**
 * A level-2 component, laid out as three stacked full-width zones.
 *
 * Today's shipping row puts everything on one line and overflows its card by
 * 38 px at a 320 px viewport — the delete icon renders outside the card. The
 * team's usual `min-w-0` / `shrink-0` fix does not help here: the control
 * group's intrinsic width genuinely exceeds the space, so `shrink-0`
 * *guarantees* the overflow. This row is restructured, not annotated.
 *
 *   Zone 1  identity   name (truncate, whole line) + one overflow button
 *   Zone 2  macro line portion chip first, then all five macros
 *   Zone 3  controls   quantity pill (-, free-text input, +) + unit chip
 *
 * The portion chip leads zone 2 rather than trailing the name: `truncate` on a
 * flex *container* does not ellipsise a flex item, so a trailing chip is
 * clipped clean off the end and the name breaks mid-glyph. Demoting the chip is
 * what buys the name its whole first line.
 */
export const ComponentRow: React.FC<ComponentRowProps> = ({
  item,
  reference,
  onChange,
  onReanchor,
  onRemove,
  onSaveToQuickLog,
  readOnly = false,
}) => {
  // The input is free text so an in-progress value like "" or "12." is not
  // clobbered by the controlled numeric round trip.
  const [draft, setDraft] = useState<string | null>(null);
  const [pendingUnit, setPendingUnit] = useState<CanonicalUnit | null>(null);
  const [pendingAbsurdEdit, setPendingAbsurdEdit] = useState<NutritionItem | null>(null);
  const [localAnchor, setLocalAnchor] = useState<NutritionItem | null>(null);

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
  if (onSaveToQuickLog) {
    menuItems.push({ label: 'Save to quick log', onSelect: onSaveToQuickLog, testId: 'component-save-quick-log' });
  }
  if (onRemove) {
    menuItems.push({ label: 'Remove', onSelect: onRemove, tone: 'danger', testId: 'component-remove' });
  }

  // Hierarchy is signalled by a 2px left accent on the row itself, not by outer
  // indentation: a pl-3 border-l-2 indent costs 14 px and pushes the quantity
  // field down to 29 px at 320 px, where the accent costs 1 px.
  return (
    <div
      data-testid="component-row"
      className="rounded-xl border border-zinc-800 border-l-2 border-l-cyan-500/40 bg-zinc-900/90 p-2 sm:p-2.5 space-y-1.5"
    >
      {/* Zone 1 — identity */}
      <div className="flex items-center gap-1.5">
        <span
          data-testid="component-name"
          title={item.name}
          className="min-w-0 flex-1 truncate text-xs font-bold text-white"
        >
          {item.name}
        </span>
        {!readOnly && menuItems.length > 0 && (
          <OverflowMenu
            ariaLabel={`Actions for ${item.name}`}
            items={menuItems}
            testId="component-actions"
          />
        )}
      </div>

      {/* Zone 2 — portion chip, then all five macros */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-zinc-400">
        <span
          data-testid="component-portion-chip"
          className="whitespace-nowrap rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
        >
          {roundTo1Decimal(item.quantity)} {shortUnitLabel(item.unit)}
        </span>
        <span className="whitespace-nowrap font-bold text-amber-400">
          {formatCalories(item.calories)} kcal
        </span>
        <span className="whitespace-nowrap text-cyan-400">P {formatMacro(item.protein)}</span>
        <span className="whitespace-nowrap text-emerald-400">C {formatMacro(item.carbs)}</span>
        <span className="whitespace-nowrap text-violet-400">F {formatMacro(item.fat)}</span>
        <span className="whitespace-nowrap text-teal-400">Fib {formatMacro(item.fiber)}</span>
      </div>

      {/* Zone 3 — compound quantity stepper + unit chip */}
      {editable && (
        <div className="space-y-1.5">
          <div className="flex items-center">
            <div className="inline-flex items-center gap-0.5 rounded-xl border border-zinc-500 bg-zinc-950 p-0.5 shadow-sm">
              <button
                type="button"
                aria-label={`Decrease quantity of ${item.name}`}
                onClick={() => step(-1)}
                disabled={Boolean(pendingUnit)}
                aria-disabled={Boolean(pendingUnit)}
                className="min-h-[44px] min-w-[44px] shrink-0 rounded-lg bg-zinc-800 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation flex items-center justify-center"
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
                className="min-h-[44px] w-12 sm:w-16 min-w-0 bg-transparent text-center text-base sm:text-xs font-mono font-bold text-white outline-none px-0.5"
              />
              <button
                type="button"
                aria-label={`Increase quantity of ${item.name}`}
                onClick={() => step(1)}
                disabled={Boolean(pendingUnit)}
                aria-disabled={Boolean(pendingUnit)}
                className="min-h-[44px] min-w-[44px] shrink-0 rounded-lg bg-zinc-800 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation flex items-center justify-center"
              >
                +
              </button>

              {/* Internal vertical divider separating stepper from unit selector */}
              <div className="h-6 w-px bg-zinc-800 mx-0.5 shrink-0" aria-hidden="true" />

              {/* Seamless embedded UnitChip */}
              <UnitChip
                value={pendingUnit ?? item.unit}
                onChange={handleUnitChange}
                testId="component-unit-chip"
                embedded
              />
            </div>
          </div>
          {pendingUnit && (
            <div data-testid="component-reanchor-hint" className="text-[10px] text-zinc-400">
              amount in {pendingUnit} for this {formatCalories(item.calories)} kcal
            </div>
          )}
        </div>
      )}

      {/* Inline confirmation for absurd edits (>20x calories) */}
      {pendingAbsurdEdit && (
        <div
          data-testid="absurd-edit-confirm"
          className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-2 text-xs space-y-1.5"
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
              className="rounded bg-amber-500 px-2 py-1 font-bold text-zinc-950 hover:bg-amber-400"
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
              className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

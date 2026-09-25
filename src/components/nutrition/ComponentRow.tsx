import React, { useState } from 'react';
import { formatCalories, formatMacro, roundTo1Decimal } from '../../utils/nutrition';
import { parseQuantityInput, shortUnitLabel, type CanonicalUnit } from '../../utils/unitConverter';
import { scaleItemToQuantity, reanchorItemTo, type NutritionItem } from '../../utils/itemModel';
import { OverflowMenu, type OverflowMenuItem } from '../common/OverflowMenu';
import { UnitChip } from './UnitChip';
import { ItemNutritionModal } from './ItemNutritionModal';
import type { EditedItemNutrition } from './nutritionEngineHelpers';
import { DEFAULT_MACRO_COLUMNS, MACRO_COLUMNS_CONFIG, getMacroGridTemplateColumns, type MacroColumnKey } from './macroColumns';

export interface ComponentRowProps {
  item: NutritionItem;
  /** The item at its reference quantity. Scaling is relative to this, so there is no accumulating drift and no dead end. */
  reference: NutritionItem;
  macroColumns?: MacroColumnKey[];
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
  macroColumns,
  onChange,
  onReanchor,
  onRemove,
  onSaveToQuickLog,
  onEditNutrition,
  readOnly = false,
}) => {
  const columns = macroColumns ?? DEFAULT_MACRO_COLUMNS;
  // The input is free text so an in-progress value like "" or "12." is not
  // clobbered by the controlled numeric round trip.
  const [draft, setDraft] = useState<string | null>(null);
  const [pendingUnit, setPendingUnit] = useState<CanonicalUnit | null>(null);
  const [pendingAbsurdEdit, setPendingAbsurdEdit] = useState<NutritionItem | null>(null);
  const [localAnchor, setLocalAnchor] = useState<NutritionItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const shown = draft ?? (pendingUnit !== null ? '' : String(roundTo1Decimal(item.quantity)));
  const activeUnit = pendingUnit ?? item.unit;

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
    if (parsed === null || parsed <= 0 || !onChange) {
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

  const accessibleParts: string[] = [`${formatCalories(item.calories)} kcal`];
  if (columns.includes('protein') && roundTo1Decimal(item.protein) > 0) {
    accessibleParts.push(`protein ${formatMacro(item.protein)} g`);
  }
  if (columns.includes('carbs') && roundTo1Decimal(item.carbs) > 0) {
    accessibleParts.push(`carbs ${formatMacro(item.carbs)} g`);
  }
  if (columns.includes('fat') && roundTo1Decimal(item.fat) > 0) {
    accessibleParts.push(`fat ${formatMacro(item.fat)} g`);
  }
  if (columns.includes('fiber') && roundTo1Decimal(item.fiber) > 0) {
    accessibleParts.push(`fiber ${formatMacro(item.fiber)} g`);
  }
  const accessibleRowText = `${item.name}: ${accessibleParts.join(', ')}`;

  return (
    <div
      data-testid="component-row"
      className="py-0.5 border-b border-zinc-800/80 last:border-b-0 min-h-[44px] flex flex-col justify-center gap-0.5"
    >
      {/* LINE 1: Name (left, flex-1, may truncate) + stepper and ⋯ (right) */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <div
          data-testid="component-name"
          title={item.name}
          className="flex-1 min-w-0 text-sm font-semibold text-white leading-tight break-words line-clamp-2"
        >
          {item.name}
        </div>

        {/* RIGHT (shrink-0): [field: input + UnitChip] + ⋯ OverflowMenu */}
        <div data-testid="component-right-cluster" className="shrink-0 flex items-center gap-1">
          {editable ? (
            <div
              data-testid="component-quantity-field"
              className="w-[100px] min-h-[40px] h-10 shrink-0 rounded-lg border border-border-interactive bg-zinc-950 flex items-center overflow-hidden transition hover:border-cyan-500/70 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-400"
            >
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
                className="min-h-[40px] h-10 w-[46px] shrink-0 bg-transparent text-right pr-1 pl-1 text-base font-semibold tabular-nums text-white outline-none border-0 m-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <UnitChip
                value={activeUnit}
                onChange={handleUnitChange}
                testId="component-unit-chip"
                ariaLabel={`Change unit for ${item.name}, currently ${shortUnitLabel(activeUnit)}`}
                embedded
              />
            </div>
          ) : (
            <span className="text-xs tabular-nums font-normal text-zinc-400 px-1">
              {roundTo1Decimal(item.quantity)}{shortUnitLabel(item.unit)}
            </span>
          )}

          {!readOnly && menuItems.length > 0 && (
            <div className="[&>div>button]:!min-h-[40px] [&>div>button]:!h-10 [&>div>button]:!min-w-[40px] [&>div>button]:!w-10 [&>div>button]:!p-0 flex items-center justify-center">
              <OverflowMenu
                ariaLabel={`Actions for ${item.name}`}
                items={menuItems}
                testId="component-actions"
              />
            </div>
          )}
        </div>
      </div>

      {/* LINE 2: Fixed-column-width macro grid */}
      <div className="w-full">
        <span className="sr-only">{accessibleRowText}</span>
        <div
          data-testid="component-macros"
          aria-hidden="true"
          className="grid text-xs tabular-nums text-zinc-400 leading-tight"
          style={{ gridTemplateColumns: getMacroGridTemplateColumns(columns) }}
        >
          {columns.map((colKey) => {
            const config = MACRO_COLUMNS_CONFIG[colKey];
            const rawVal = item[colKey];
            const num = roundTo1Decimal(rawVal);
            const isZero = colKey === 'calories' ? Math.abs(num) < 0.5 : Math.abs(num) < 0.05;
            const formatted = isZero ? '0' : (colKey === 'calories' ? formatCalories(rawVal) : formatMacro(rawVal));

            return (
              <div
                key={colKey}
                data-testid={`component-macro-${colKey}`}
                className={`text-right text-xs tabular-nums ${isZero ? 'text-zinc-600 font-normal' : config.colorClass}`}
              >
                <span data-testid={`macro-val-${colKey}`} className="tabular-nums font-normal">
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

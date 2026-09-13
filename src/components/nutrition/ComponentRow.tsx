import React, { useState } from 'react';
import { formatCalories, formatMacro } from '../../utils/nutrition';
import { parseQuantityInput } from '../../utils/unitConverter';
import { scaleItemToQuantity, type NutritionItem } from '../../utils/itemModel';
import { OverflowMenu, type OverflowMenuItem } from '../common/OverflowMenu';
import { UnitChip } from './UnitChip';

export interface ComponentRowProps {
  item: NutritionItem;
  /** The item at its reference quantity. Scaling is relative to this, so there is no accumulating drift and no dead end. */
  reference: NutritionItem;
  onChange?: (next: NutritionItem) => void;
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
  onRemove,
  onSaveToQuickLog,
  readOnly = false,
}) => {
  // The input is free text so an in-progress value like "" or "12." is not
  // clobbered by the controlled numeric round trip.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(item.quantity);

  const editable = !readOnly && Boolean(onChange);

  const commit = (raw: string) => {
    const parsed = parseQuantityInput(raw);
    if (parsed === null || !onChange) {
      // Unusable input: keep the previous value rather than silently writing 0.
      setDraft(null);
      return;
    }
    const scaled = scaleItemToQuantity(reference, parsed);
    onChange({ ...scaled, unit: item.unit });
    setDraft(null);
  };

  const step = (delta: number) => {
    if (!onChange) return;
    const base = parseQuantityInput(shown) ?? item.quantity;
    const next = Math.max(0, base + delta);
    const scaled = scaleItemToQuantity(reference, next);
    onChange({ ...scaled, unit: item.unit });
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
      className="rounded-xl border border-zinc-800 border-l-2 border-l-cyan-500/40 bg-zinc-900/90 p-2.5 space-y-1.5"
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
        {item.displayPortion && (
          <span
            data-testid="component-portion-chip"
            className="whitespace-nowrap rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
          >
            {item.displayPortion}
          </span>
        )}
        <span className="whitespace-nowrap font-bold text-amber-400">
          {formatCalories(item.calories)} kcal
        </span>
        <span className="whitespace-nowrap">P {formatMacro(item.protein)}</span>
        <span className="whitespace-nowrap">C {formatMacro(item.carbs)}</span>
        <span className="whitespace-nowrap">F {formatMacro(item.fat)}</span>
        <span className="whitespace-nowrap text-teal-400">Fib {formatMacro(item.fiber)}</span>
      </div>

      {/* Zone 3 — quantity pill + unit chip */}
      {editable && (
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            <button
              type="button"
              aria-label={`Decrease quantity of ${item.name}`}
              onClick={() => step(-1)}
              className="min-h-[44px] min-w-[44px] shrink-0 rounded bg-zinc-800 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 touch-manipulation"
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
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit((e.target as HTMLInputElement).value);
                }
              }}
              className="min-h-[44px] w-full min-w-0 flex-1 bg-transparent text-center text-base font-mono font-bold text-white outline-none sm:text-xs"
            />
            <button
              type="button"
              aria-label={`Increase quantity of ${item.name}`}
              onClick={() => step(1)}
              className="min-h-[44px] min-w-[44px] shrink-0 rounded bg-zinc-800 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700 touch-manipulation"
            >
              +
            </button>
          </div>
          <UnitChip
            value={item.unit}
            onChange={(unit) => onChange?.({ ...item, unit })}
            testId="component-unit-chip"
          />
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { NutritionLog } from '../../types/database';
import { getDishIcon } from '../../utils/dishIcons';
import { formatCalories, formatMacro } from '../../utils/nutrition';
import {
  normalizeItems,
  scaleItems,
  sumItems,
  isLevel1,
  type NutritionItem,
} from '../../utils/itemModel';
import { friendlyError } from '../../utils/nutritionErrors';
import { OverflowMenu, type OverflowMenuItem } from '../common/OverflowMenu';
import { ComponentRow } from './ComponentRow';

export interface MealLogRowProps {
  log: NutritionLog & { items?: unknown };
  onEdit: (log: NutritionLog) => void;
  onDelete: (log: NutritionLog) => void;
  /**
   * Coach read-only inspection. Expanding is allowed — seeing the breakdown is
   * exactly what a coach wants and RLS permits SELECT — but every mutating
   * affordance is hidden, because RLS rejects the UPDATE and the error surfaces
   * as a raw Postgres string.
   */
  readOnly?: boolean;
  /**
   * Persist a new component set for this log. Both the parent macros and
   * `items` are written together, because the database asserts
   * `parent = Σ(items)` and rejects either half on its own.
   *
   * Carries a whole-dish rescale and a single-component edit alike.
   *
   * Return the write's promise (e.g. `mutateAsync(...)`) and a rejection will
   * roll the row back to its last persisted components and show the reason.
   * A `void` return is still accepted, but then a rejected write leaves the
   * optimistic value on screen — the row has no way to learn it failed.
   */
  onItemsChange?: (log: NutritionLog, items: NutritionItem[]) => void | Promise<unknown>;
}

const SCALE_STEPS = [0.5, 1, 1.5, 2] as const;

/**
 * The single meal row, shared by NutritionEngine and HistoryView.
 *
 * These two files previously rendered structurally identical rows and had
 * already drifted apart (mt-0.5 vs mt-1, a 5 h/w icon box vs 6, a stray `group`
 * class). Building the accordion in place would have meant building it twice
 * and keeping the overflow, truncation, a11y and read-only fixes in sync
 * between two copies.
 *
 * Layout is two rows inside a 220 px content box at 320 px:
 *   row 1  a real <button> trigger: chevron, icon, name, count badge
 *   row 2  the macro cluster plus one overflow button
 *
 * A row with fewer than two components renders no chevron, no count badge and
 * no trigger at all. Every one of the 98 existing production logs is such a
 * leaf; if they all looked expandable the feature would look broken on day one.
 */
export const MealLogRow: React.FC<MealLogRowProps> = ({
  log,
  onEdit,
  onDelete,
  readOnly = false,
  onItemsChange,
}) => {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  const baseItems = useMemo(() => normalizeItems(log.items), [log.items]);
  const [workingItems, setWorkingItems] = useState<NutritionItem[] | null>(null);
  // Set when a persist is rejected; cleared when the next one is attempted.
  const [error, setError] = useState<string | null>(null);

  // The last component set the database actually accepted, and therefore the
  // value a rejected write must fall back to. `null` means "nothing of ours has
  // landed — follow the row as it was fetched".
  const lastPersistedRef = useRef<NutritionItem[] | null>(null);
  const lastPersistedSeq = useRef(0);
  // Monotonic write counter. Only the newest write may move what is on screen:
  // a late rejection from a superseded write would otherwise drag the row back
  // to a value the user has already moved past, and — worse — a "reject,
  // reject" pair would land on the first write's optimistic value, which was
  // never persisted at all. A ref because nothing renders from it.
  const writeSeq = useRef(0);

  // Fresh server state supersedes the optimistic overlay. Without this the
  // overlay shadows `log.items` for the lifetime of the row, so a meal changed
  // anywhere else — EditMealModal, another device — would keep displaying the
  // numbers from an earlier rescale. react-query's structural sharing keeps
  // `log.items` referentially stable when nothing changed, so a refetch that
  // returns the same components does not trip this.
  //
  // Done during render, not in an effect: React's documented "adjust state when
  // a prop changes" idiom re-runs this component immediately, so the stale
  // overlay is never painted, not even for one frame.
  const [seenItems, setSeenItems] = useState<unknown>(log.items);
  const refreshed = log.items !== seenItems;
  if (refreshed) {
    setSeenItems(log.items);
    setWorkingItems(null);
    setError(null);
  }

  useEffect(() => {
    lastPersistedRef.current = null;
    lastPersistedSeq.current = 0;
  }, [log.items]);

  const items = (refreshed ? null : workingItems) ?? baseItems;
  const expandable = isLevel1(baseItems);

  // Every mutating affordance is behind this. A coach inspecting an athlete can
  // SELECT the row but not UPDATE it, so offering an editor would give them
  // controls whose every save RLS rejects.
  const editable = !readOnly && Boolean(onItemsChange);

  // Displayed macros follow the components whenever there are components, so a
  // pending rescale is visible before it is saved.
  const totals = items ? sumItems(items) : null;
  const shown = totals ?? {
    calories: Number(log.calories) || 0,
    protein: Number(log.protein) || 0,
    carbs: Number(log.carbs) || 0,
    fat: Number(log.fat) || 0,
    fiber: Number(log.fiber) || 0,
  };

  const menuItems: OverflowMenuItem[] = [
    { label: 'Edit meal', onSelect: () => onEdit(log), testId: `edit-meal-${log.id}` },
    { label: 'Delete meal', onSelect: () => onDelete(log), tone: 'danger', testId: `delete-meal-${log.id}` },
  ];

  // The scaling anchor, captured when the panel is opened.
  //
  // `baseItems` cannot serve as the anchor once a change is persisted: the
  // write rewrites the stored components, `baseItems` refetches to the scaled
  // values, and the next tap scales the already-scaled row. Two taps of x0.5
  // would give a quarter and x1 would return nothing — precisely the one-way
  // ladder this control replaced. Anchoring to the set as it was when the panel
  // opened keeps every factor and every quantity absolute while it is open.
  //
  // State rather than a ref: it is read during render to give each component
  // row its scaling reference, and a render-phase ref read is not safe under
  // concurrent rendering.
  const [anchorItems, setAnchorItems] = useState<NutritionItem[] | null>(null);
  const anchor = anchorItems ?? baseItems;

  const toggleExpanded = () => {
    if (!expanded) setAnchorItems(baseItems);
    setExpanded((v) => !v);
  };

  const persist = (next: NutritionItem[]) => {
    // Without a rollback a rejected write left the optimistic quantity on
    // screen, so the user was shown a number that was never saved. Phase 5's
    // CHECK constraints make that reachable in normal use, not just on a
    // network fault.
    const seq = ++writeSeq.current;
    setWorkingItems(next);
    setError(null);

    const rollback = (err: unknown) => {
      // A superseded write's failure must not move the row: what is on screen
      // belongs to a later write, which reports its own outcome. Rolling back
      // here would show the older write's target instead.
      if (seq !== writeSeq.current) return;
      setWorkingItems(lastPersistedRef.current);
      setError(friendlyError(err));
    };

    const markPersisted = () => {
      // Guard against out-of-order write resolutions: only record as
      // persisted if this write is newer than what was already persisted.
      if (seq > lastPersistedSeq.current) {
        lastPersistedSeq.current = seq;
        lastPersistedRef.current = next;
      }
    };

    let result: void | Promise<unknown>;
    try {
      result = onItemsChange?.(log, next);
    } catch (err) {
      rollback(err);
      return;
    }

    if (!result || typeof (result as Promise<unknown>).then !== 'function') {
      // A handler that returns nothing never reports an outcome, so the row has
      // no way to learn the write failed. Treat the value as accepted, which is
      // the pre-promise behaviour.
      markPersisted();
      return;
    }

    void (result as Promise<unknown>).then(
      markPersisted,
      rollback
    );
  };

  const applyScale = (factor: number) => {
    if (!anchor) return;
    persist(scaleItems(anchor, factor));
  };

  // A single component edited to an absolute quantity. The whole-dish bar only
  // offers four factors; this is how any other amount is reached, and it is
  // what makes the quantity a real amount in a canonical unit rather than a
  // multiplier.
  const applyItemChange = (index: number, next: NutritionItem) => {
    const current = items;
    if (!current) return;
    persist(current.map((it, i) => (i === index ? next : it)));
  };

  const identity = (
    <>
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
        {getDishIcon(log.food_name)}
      </div>
      <span
        data-testid="meal-log-name"
        title={log.food_name}
        className="min-w-0 flex-1 truncate text-left text-xs font-extrabold text-white"
      >
        {log.food_name}
      </span>
    </>
  );

  return (
    <div
      data-testid="meal-log-item"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-3 shadow-sm"
    >
      {/* Row 1 — the trigger (or a plain identity line for a leaf). */}
      {expandable ? (
        <button
          type="button"
          data-testid="meal-log-accordion-trigger"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={toggleExpanded}
          className="flex w-full min-h-[44px] items-center gap-2 text-left touch-manipulation"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden="true" />
          )}
          {identity}
          <span
            data-testid="meal-log-count-badge"
            className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-black text-cyan-300"
          >
            {baseItems?.length}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2">{identity}</div>
      )}

      {/* Row 2 — macro cluster plus a single overflow control. */}
      <div className="mt-1 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 font-mono text-[11px] text-zinc-400">
          {log.meal_type && (
            <span
              data-testid="meal-log-type-chip"
              className="whitespace-nowrap rounded-lg border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400"
            >
              {log.meal_type}
            </span>
          )}
          <span className="whitespace-nowrap font-bold text-amber-400">
            {formatCalories(shown.calories)} kcal
          </span>
          <span className="whitespace-nowrap">P {formatMacro(shown.protein)}</span>
          <span className="whitespace-nowrap">C {formatMacro(shown.carbs)}</span>
          <span className="whitespace-nowrap">F {formatMacro(shown.fat)}</span>
          <span className="whitespace-nowrap text-teal-400">Fib {formatMacro(shown.fiber)}</span>
        </div>
        {!readOnly && (
          <OverflowMenu
            ariaLabel={`Actions for ${log.food_name}`}
            items={menuItems}
            testId={`meal-actions-${log.id}`}
          />
        )}
      </div>

      {/* A rejected write has already been rolled back above; this says why.
          role="alert" because the value on screen just changed back under the
          user without them touching anything. */}
      {error && (
        <p
          role="alert"
          data-testid="meal-log-error"
          className="mt-1.5 break-words rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300"
        >
          {error}
        </p>
      )}

      {/* Expanded panel — whole-dish scale, then the components. */}
      {expandable && expanded && (
        <div id={panelId} data-testid="meal-log-panel" className="mt-2 space-y-1.5">
          {editable && (
            <div
              role="group"
              aria-label="Scale whole dish"
              data-testid="dish-scale-bar"
              className="flex w-full items-stretch gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5"
            >
              {/* Discrete absolute values, deliberately. The old +/-0.5 stepper
                  with a 0.25 floor produced the one-way ladder
                  1 -> 0.5 -> 0.25 -> 0.75 -> 1.25 from which x1 was
                  unreachable. Here x1 is always one tap away. */}
              {SCALE_STEPS.map((factor) => (
                <button
                  key={factor}
                  type="button"
                  data-testid={`dish-scale-${factor}`}
                  onClick={() => applyScale(factor)}
                  className="min-h-[44px] flex-1 rounded text-[11px] font-black text-zinc-300 transition hover:bg-zinc-800 touch-manipulation"
                >
                  &times;{factor}
                </button>
              ))}
            </div>
          )}

          {(items ?? []).map((item, index) => (
            <ComponentRow
              key={item.id}
              item={item}
              // Scale against the set as it was when the panel opened, not
              // against the refetched (already-scaled) values, or each edit
              // compounds on the last.
              reference={anchor?.[index] ?? item}
              onChange={editable ? (next) => applyItemChange(index, next) : undefined}
              readOnly={!editable}
            />
          ))}
        </div>
      )}
    </div>
  );
};

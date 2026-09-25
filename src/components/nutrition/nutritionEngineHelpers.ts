import { useState, useEffect } from 'react';

export const getScrollBehavior = (): ScrollBehavior => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'smooth';
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'smooth';
  }
};

export const useNavHeight = (): number => {
  const [navHeight, setNavHeight] = useState<number>(() => {
    if (typeof document !== 'undefined') {
      const nav = document.querySelector('nav');
      if (nav) {
        const rect = nav.getBoundingClientRect();
        if (rect.height > 0) return Math.round(rect.height);
      }
    }
    return 66;
  });

  useEffect(() => {
    const update = () => {
      const nav = document.querySelector('nav');
      if (nav) {
        const rect = nav.getBoundingClientRect();
        if (rect.height > 0) {
          setNavHeight(Math.round(rect.height));
        }
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return navHeight;
};

import { convertPortion, type CanonicalUnit } from '../../utils/unitConverter';
import { roundTo1Decimal, formatCalories } from '../../utils/nutrition';
import { sumItems, type NutritionItem } from '../../utils/itemModel';

export interface StagedItem {
  id: string;
  name: string;
  /** The original free-text portion string, kept verbatim for provenance. */
  portion: string;
  /**
   * Retained only so that a saved custom dish written by an older client still
   * round-trips. Quantity is the authoritative control now.
   */
  portionMultiplier: number;
  /** Canonical quantity in `unit`, derived from `portion` on first staging. */
  quantity: number;
  unit: CanonicalUnit;
  /** The quantity at which base* below were measured. Scaling is relative to this. */
  baseQuantity: number;
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  baseFiber: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** Optional flag indicating user explicitly edited the item's nutrition. */
  userOverridden?: boolean;
}

/** The staged component as the shared level-2 model sees it. */
export function stagedToItem(it: StagedItem): NutritionItem {
  return {
    id: it.id,
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    displayPortion: it.portion,
    calories: it.calories,
    protein: it.protein,
    carbs: it.carbs,
    fat: it.fat,
    fiber: it.fiber,
  };
}

/** The same component at its reference quantity, for drift-free rescaling. */
export function stagedReference(it: StagedItem): NutritionItem {
  return {
    id: it.id,
    name: it.name,
    quantity: it.baseQuantity,
    unit: it.unit,
    displayPortion: it.portion,
    calories: it.baseCalories,
    protein: it.baseProtein,
    carbs: it.baseCarbs,
    fat: it.baseFat,
    fiber: it.baseFiber,
  };
}

/**
 * Re-anchor a staged component to a new unit and quantity.
 * All base* fields are rewritten so that subsequent portion adjustments
 * scale relative to this new anchor.
 */
export function reanchorStagedItem(item: StagedItem, next: NutritionItem): StagedItem {
  const q = roundTo1Decimal(next.quantity);
  const c = roundTo1Decimal(next.calories);
  const p = roundTo1Decimal(next.protein);
  const cb = roundTo1Decimal(next.carbs);
  const f = roundTo1Decimal(next.fat);
  const fib = roundTo1Decimal(next.fiber);
  return {
    ...item,
    name: next.name,
    quantity: q,
    unit: next.unit,
    calories: c,
    protein: p,
    carbs: cb,
    fat: f,
    fiber: fib,
    baseQuantity: q,
    baseCalories: c,
    baseProtein: p,
    baseCarbs: cb,
    baseFat: f,
    baseFiber: fib,
    portionMultiplier: 1,
  };
}

function sanitizeEditedMacro(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return roundTo1Decimal(n);
}

export interface EditedItemNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/**
 * Update a staged component's nutrition with user-edited macros.
 * All base* fields are rewritten and baseQuantity is synchronized to current
 * quantity (unless quantity <= 0, in which case baseQuantity is preserved),
 * ensuring subsequent stepper adjustments scale linearly from the edited baseline
 * without precision drift.
 */
export function updateStagedItemNutrition(
  item: StagedItem,
  edited: EditedItemNutrition
): StagedItem {
  const c = sanitizeEditedMacro(edited.calories);
  const p = sanitizeEditedMacro(edited.protein);
  const cb = sanitizeEditedMacro(edited.carbs);
  const f = sanitizeEditedMacro(edited.fat);
  const fib = sanitizeEditedMacro(edited.fiber);
  const baseQuantity = item.quantity > 0 ? item.quantity : item.baseQuantity;

  return {
    ...item,
    calories: c,
    protein: p,
    carbs: cb,
    fat: f,
    fiber: fib,
    baseCalories: c,
    baseProtein: p,
    baseCarbs: cb,
    baseFat: f,
    baseFiber: fib,
    baseQuantity,
    portionMultiplier: 1,
    userOverridden: true,
  };
}

export interface StagedMeal {
  name: string;
  mealType: string;
  explanation: string;
  items: StagedItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingSize: number;
  servingUnit: string;
  photoUrl?: string;
  notes?: string | null;
}

let itemSequence = 0;
export function generateItemId(): string {
  itemSequence += 1;
  return `item-${Date.now()}-${itemSequence}`;
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a staged component, deriving its canonical (quantity, unit) from the
 * free-text portion string. The portion string itself is kept verbatim: it is
 * the provenance escape hatch that makes any future re-interpretation possible.
 */
export function buildStagedItem(raw: {
  name: string;
  portion?: string | null;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  fiber?: unknown;
  /** Present only when re-staging something that was already scaled. */
  base?: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  quantity?: unknown;
  unit?: unknown;
  portionMultiplier?: unknown;
}): StagedItem {
  const portion = raw.portion || '1 serving';
  const derived = convertPortion(portion);
  const quantity =
    raw.quantity !== undefined && raw.quantity !== null && Number.isFinite(Number(raw.quantity))
      ? Math.max(0, Number(raw.quantity))
      : derived.quantity;
  const unit: CanonicalUnit =
    raw.unit === 'g' || raw.unit === 'ml' || raw.unit === 'unit' ? raw.unit : derived.unit;

  const current = {
    calories: roundTo1Decimal(toNumber(raw.calories)),
    protein: roundTo1Decimal(toNumber(raw.protein)),
    carbs: roundTo1Decimal(toNumber(raw.carbs)),
    fat: roundTo1Decimal(toNumber(raw.fat)),
    fiber: roundTo1Decimal(toNumber(raw.fiber)),
  };
  const base = raw.base
    ? {
        calories: roundTo1Decimal(raw.base.calories),
        protein: roundTo1Decimal(raw.base.protein),
        carbs: roundTo1Decimal(raw.base.carbs),
        fat: roundTo1Decimal(raw.base.fat),
        fiber: roundTo1Decimal(raw.base.fiber),
      }
    : current;

  const mult = Number(raw.portionMultiplier);
  const baseQuantity =
    raw.base && Number.isFinite(mult) && mult > 0
      ? quantity / mult
      : quantity;

  return {
    id: generateItemId(),
    name: raw.name,
    portion,
    portionMultiplier: Number.isFinite(Number(raw.portionMultiplier)) ? Number(raw.portionMultiplier) : 1,
    quantity: roundTo1Decimal(quantity),
    unit,
    baseQuantity: roundTo1Decimal(baseQuantity),
    baseCalories: base.calories,
    baseProtein: base.protein,
    baseCarbs: base.carbs,
    baseFat: base.fat,
    baseFiber: base.fiber,
    ...current,
  };
}

/**
 * Re-derive the staged parent from its components. Called after every component
 * edit so `parent = SUM(items)` holds continuously rather than only at save
 * time — which is also exactly what the database constraint checks.
 */
export function recomputeStagedTotals(items: StagedItem[]) {
  const totals = sumItems(items.map(stagedToItem));
  const explanation =
    items.map((it) => `${formatCalories(it.calories)} kcal (${it.name})`).join(' + ') +
    ` = ${formatCalories(totals.calories)} kcal`;
  return {
    calories: roundTo1Decimal(totals.calories),
    protein: roundTo1Decimal(totals.protein),
    carbs: roundTo1Decimal(totals.carbs),
    fat: roundTo1Decimal(totals.fat),
    fiber: roundTo1Decimal(totals.fiber),
    explanation,
  };
}

export type MacroColumnKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';

export interface MacroColumnConfig {
  key: MacroColumnKey;
  label: string;
  colorClass: string;
}

export const MACRO_COLUMNS_CONFIG: Record<MacroColumnKey, MacroColumnConfig> = {
  calories: {
    key: 'calories',
    label: 'kcal',
    colorClass: 'text-amber-400',
  },
  protein: {
    key: 'protein',
    label: 'P',
    colorClass: 'text-cyan-400',
  },
  carbs: {
    key: 'carbs',
    label: 'C',
    colorClass: 'text-emerald-400',
  },
  fat: {
    key: 'fat',
    label: 'F',
    colorClass: 'text-violet-400',
  },
  fiber: {
    key: 'fiber',
    label: 'Fib',
    colorClass: 'text-teal-400',
  },
};

export const DEFAULT_MACRO_COLUMNS: MacroColumnKey[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
];

/**
 * Computes visible macro columns for a meal.
 * - 'calories' is ALWAYS shown.
 * - 'protein', 'carbs', 'fat', 'fiber' are shown if ANY item in the meal has a value >= 0.05.
 * - Order is fixed: kcal, P, C, F, Fib.
 */
export function computeVisibleMacroColumns(
  items?: Array<{ protein?: number; carbs?: number; fat?: number; fiber?: number }> | null
): MacroColumnKey[] {
  if (!items || items.length === 0) {
    return DEFAULT_MACRO_COLUMNS;
  }

  const columns: MacroColumnKey[] = ['calories'];

  const hasP = items.some((item) => (item.protein ?? 0) >= 0.05);
  if (hasP) columns.push('protein');

  const hasC = items.some((item) => (item.carbs ?? 0) >= 0.05);
  if (hasC) columns.push('carbs');

  const hasF = items.some((item) => (item.fat ?? 0) >= 0.05);
  if (hasF) columns.push('fat');

  const hasFib = items.some((item) => (item.fiber ?? 0) >= 0.05);
  if (hasFib) columns.push('fiber');

  return columns;
}

/**
 * Per-column fixed widths: kcal is 4.5rem (72px), other columns are 3.5rem (56px).
 * Generates an identical gridTemplateColumns template for rows and totals.
 */
export function getMacroGridTemplateColumns(columns: MacroColumnKey[]): string {
  return columns.map((col) => (col === 'calories' ? '4.5rem' : '3.5rem')).join(' ');
}

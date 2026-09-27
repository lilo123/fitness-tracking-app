/**
 * Canonical Weight & Unit Conversion Utilities (RD-1, W7, STD-DAT-1)
 *
 * Guarantees:
 * 1. Canonical storage unit in PostgreSQL is pounds (lb) with full precision.
 * 2. Conversions only happen at display and input boundaries.
 * 3. Display rounding rounds to 0.5 of the display unit.
 * 4. 0 lbs or null bodyweight formats consistently as "BW" / "BW×reps".
 * 5. Uses multiplication symbol "×" (U+00D7) across all formatted sets.
 */

export type WeightUnit = 'lb' | 'kg';

const LB_PER_KG = 2.20462262185;
const KG_PER_LB = 0.45359237;

/**
 * Converts pounds to kilograms.
 */
export function lbToKg(lb: number): number {
  if (!lb || isNaN(lb)) return 0;
  return lb * KG_PER_LB;
}

/**
 * Converts kilograms to pounds.
 */
export function kgToLb(kg: number): number {
  if (!kg || isNaN(kg)) return 0;
  return kg * LB_PER_KG;
}

/**
 * Rounds a number to the nearest 0.5 step.
 */
export function roundToHalf(val: number): number {
  return Math.round(val * 2) / 2;
}

/**
 * Converts a weight value between units and rounds to 0.5 of the target unit.
 */
export function convertWeight(weight: number, fromUnit: WeightUnit, toUnit: WeightUnit): number {
  if (!weight || isNaN(weight)) return 0;
  if (fromUnit === toUnit) return weight;
  if (fromUnit === 'lb' && toUnit === 'kg') {
    return roundToHalf(lbToKg(weight));
  }
  if (fromUnit === 'kg' && toUnit === 'lb') {
    return roundToHalf(kgToLb(weight));
  }
  return weight;
}

export interface FormatWeightOptions {
  showUnit?: boolean;
}

/**
 * Formats a weight value for display.
 * 0 or null represents bodyweight ("BW").
 */
export function formatWeight(
  weight: number | null | undefined,
  unit: WeightUnit = 'lb',
  options?: FormatWeightOptions
): string {
  if (weight == null || weight === 0 || isNaN(Number(weight))) {
    return 'BW';
  }

  const numWeight = Number(weight);
  const displayVal = unit === 'kg' ? convertWeight(numWeight, 'lb', 'kg') : roundToHalf(numWeight);

  if (options?.showUnit) {
    return `${displayVal} ${unit === 'kg' ? 'kg' : 'lbs'}`;
  }

  return String(displayVal);
}

/**
 * Formats a set (weight and reps) into canonical string notation (e.g. "100×8", "BW×10").
 */
export function formatSet(
  weight: number | null | undefined,
  reps: number | null | undefined,
  unit: WeightUnit = 'lb'
): string {
  const isBW = weight == null || weight === 0 || isNaN(Number(weight));
  const hasReps = reps != null && !isNaN(Number(reps));

  if (isBW) {
    return hasReps ? `BW×${reps}` : 'BW';
  }

  const weightStr = formatWeight(weight, unit);
  return hasReps ? `${weightStr}×${reps}` : weightStr;
}

/**
 * Parses user weight input into canonical storage pounds (lb).
 * Understands "BW" / "0" as bodyweight (0).
 */
export function parseWeightInput(input: string, unit: WeightUnit = 'lb'): number | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  if (trimmed.toUpperCase() === 'BW' || trimmed === '0') {
    return 0;
  }

  const num = Number(trimmed);
  if (isNaN(num) || num < 0) {
    return null;
  }

  if (unit === 'kg') {
    return kgToLb(num);
  }

  return num;
}

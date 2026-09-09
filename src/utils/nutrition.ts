/**
 * Nutrition calculation and formatting utilities with IEEE-754 precision protection.
 */

export interface DailyMacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface MacroTargets {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  target_calories?: number;
  target_protein?: number;
  target_carbs?: number;
  target_fat?: number;
  target_fiber?: number;
}

export interface FuelItem {
  rawDiff: number;
  formattedValue: string;
  isOver: boolean;
  badgeLabel: string;
}

export interface RemainingFuel {
  calories: FuelItem;
  protein: FuelItem;
  carbs: FuelItem;
  fat: FuelItem;
  fiber: FuelItem;
}

/**
 * Formats calorie values to whole integers, safely handling null/undefined/NaN/Infinity,
 * negative zero, string values, and minor floating-point drift.
 */
export function formatCalories(val: number | string | null | undefined): string {
  if (val == null) return '0';
  const num = Number(val);
  if (isNaN(num) || !isFinite(num) || Math.abs(num) < 0.5) return '0';
  const sign = num < 0 ? -1 : 1;
  const rounded = sign * Math.round(Math.abs(num));
  if (rounded === 0 || Object.is(rounded, -0)) {
    return '0';
  }
  return rounded.toString();
}

/**
 * Formats macronutrient values to at most 1 decimal place with trailing zeros stripped.
 * Sanitizes negative zero, string values, non-finite values, and near-zero drift (< 0.05 -> '0').
 */
export function formatMacro(val: number | string | null | undefined): string {
  if (val == null) return '0';
  const num = Number(val);
  if (isNaN(num) || !isFinite(num) || Math.abs(num) < 0.05) {
    return '0';
  }
  const sign = num < 0 ? -1 : 1;
  const rounded = (sign * Math.round(Math.abs(num) * 10)) / 10;
  if (rounded === 0 || Object.is(rounded, -0) || Math.abs(rounded) < 0.05) {
    return '0';
  }
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
}

/**
 * Calculates remaining fuel across all 5 macronutrients compared against daily targets.
 * Handles IEEE-754 floating point arithmetic drift, over-budget states, and partial inputs.
 *
 * For each macro, returns:
 * - rawDiff: target - current (positive when remaining, negative when over)
 * - formattedValue: clean formatted numeric difference
 * - isOver: true if current exceeded target
 * - badgeLabel: "+X kcal over" / "+Xg P over" when over; "X kcal" / "Xg P" when remaining
 */
export function calculateRemainingFuel(
  dailyTotals?: Partial<DailyMacroTotals> | null,
  targets?: Partial<MacroTargets> | null
): RemainingFuel {
  const safeTotals = dailyTotals ?? {};
  const safeTargets = targets ?? {};

  // Calorie calculation
  const targetCal = Number(safeTargets.calories ?? safeTargets.target_calories) || 0;
  const currentCal = Number(safeTotals.calories) || 0;
  let rawCalDiff = targetCal - currentCal;
  if (Math.abs(rawCalDiff) < 0.5 || Object.is(rawCalDiff, -0)) {
    rawCalDiff = 0;
  } else {
    rawCalDiff = Math.round(rawCalDiff);
  }
  const calOver = rawCalDiff < 0;
  const calAbs = Math.abs(rawCalDiff);
  const calFormatted = formatCalories(calAbs);
  const calBadgeLabel = calOver ? `+${calFormatted} kcal over` : `${calFormatted} kcal`;

  // Helper for gram-based macronutrients
  const computeMacroFuel = (
    current: number | string | null | undefined,
    target: number | string | null | undefined,
    unitSuffix: string
  ): FuelItem => {
    const c = Number(current) || 0;
    const t = Number(target) || 0;
    let diff = t - c;
    // Sanitize near-zero drift (< 0.05) and negative zero
    if (Math.abs(diff) < 0.05 || Object.is(diff, -0)) {
      diff = 0;
    } else {
      diff = Math.round(diff * 10) / 10;
    }
    const isOver = diff < 0;
    const absDiff = Math.abs(diff);
    const formattedValue = formatMacro(absDiff);
    const badgeLabel = isOver
      ? `+${formattedValue}g ${unitSuffix} over`
      : `${formattedValue}g ${unitSuffix}`;

    return {
      rawDiff: diff,
      formattedValue,
      isOver,
      badgeLabel,
    };
  };

  const protein = computeMacroFuel(
    safeTotals.protein,
    safeTargets.protein ?? safeTargets.target_protein,
    'P'
  );

  const carbs = computeMacroFuel(
    safeTotals.carbs,
    safeTargets.carbs ?? safeTargets.target_carbs,
    'C'
  );

  const fat = computeMacroFuel(
    safeTotals.fat,
    safeTargets.fat ?? safeTargets.target_fat,
    'F'
  );

  const fiber = computeMacroFuel(
    safeTotals.fiber,
    safeTargets.fiber ?? safeTargets.target_fiber,
    'Fib'
  );

  return {
    calories: {
      rawDiff: rawCalDiff,
      formattedValue: calFormatted,
      isOver: calOver,
      badgeLabel: calBadgeLabel,
    },
    protein,
    carbs,
    fat,
    fiber,
  };
}

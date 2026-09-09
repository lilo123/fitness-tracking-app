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
 * Formats calorie values to whole integers, safely handling null/undefined/NaN,
 * negative zero, and minor floating-point drift.
 */
export function formatCalories(val: number | null | undefined): string {
  if (val == null) return '0';
  const num = Number(val);
  if (isNaN(num) || Math.abs(num) < 0.5) return '0';
  const sign = num < 0 ? -1 : 1;
  const rounded = sign * Math.round(Math.abs(num));
  if (rounded === 0 || Object.is(rounded, -0)) {
    return '0';
  }
  return rounded.toString();
}

/**
 * Formats macronutrient values to at most 1 decimal place with trailing zeros stripped.
 * Sanitizes negative zero and near-zero drift (< 0.05 -> '0').
 */
export function formatMacro(val: number | null | undefined): string {
  if (val == null) return '0';
  const num = Number(val);
  if (isNaN(num) || Math.abs(num) < 0.05) {
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
 * Handles IEEE-754 floating point arithmetic drift and over-budget states.
 *
 * For each macro, returns:
 * - rawDiff: target - current (positive when remaining, negative when over)
 * - formattedValue: clean formatted numeric difference
 * - isOver: true if current exceeded target
 * - badgeLabel: "+X kcal over" / "+Xg P over" when over; "X kcal" / "Xg P" when remaining
 */
export function calculateRemainingFuel(
  dailyTotals: DailyMacroTotals,
  targets: MacroTargets
): RemainingFuel {
  // Calorie calculation
  const targetCal = targets.calories ?? targets.target_calories ?? 0;
  const currentCal = dailyTotals.calories ?? 0;
  let rawCalDiff = targetCal - currentCal;
  if (Math.abs(rawCalDiff) < 0.5 || Object.is(rawCalDiff, -0)) {
    rawCalDiff = 0;
  }
  const calOver = rawCalDiff < 0;
  const calAbs = Math.abs(rawCalDiff);
  const calFormatted = formatCalories(calAbs);
  const calBadgeLabel = calOver ? `+${calFormatted} kcal over` : `${calFormatted} kcal`;

  // Helper for gram-based macronutrients
  const computeMacroFuel = (
    current: number,
    target: number,
    unitSuffix: string
  ): FuelItem => {
    let diff = target - current;
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
    dailyTotals.protein ?? 0,
    targets.protein ?? targets.target_protein ?? 0,
    'P'
  );

  const carbs = computeMacroFuel(
    dailyTotals.carbs ?? 0,
    targets.carbs ?? targets.target_carbs ?? 0,
    'C'
  );

  const fat = computeMacroFuel(
    dailyTotals.fat ?? 0,
    targets.fat ?? targets.target_fat ?? 0,
    'F'
  );

  const fiber = computeMacroFuel(
    dailyTotals.fiber ?? 0,
    targets.fiber ?? targets.target_fiber ?? 0,
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

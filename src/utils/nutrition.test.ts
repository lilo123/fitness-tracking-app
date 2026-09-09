import { describe, it, expect } from 'vitest';
import {
  formatCalories,
  formatMacro,
  calculateRemainingFuel,
} from './nutrition';

describe('nutrition utility', () => {
  describe('formatCalories', () => {
    it('rounds numbers to whole integers', () => {
      expect(formatCalories(2200)).toBe('2200');
      expect(formatCalories(2199.6)).toBe('2200');
      expect(formatCalories(2199.4)).toBe('2199');
      expect(formatCalories(0.6)).toBe('1');
    });

    it('sanitizes zero, negative zero, and near-zero values (< 0.5)', () => {
      expect(formatCalories(0)).toBe('0');
      expect(formatCalories(-0)).toBe('0');
      expect(formatCalories(0.2)).toBe('0');
      expect(formatCalories(-0.4)).toBe('0');
    });

    it('handles null, undefined, and NaN gracefully', () => {
      expect(formatCalories(null)).toBe('0');
      expect(formatCalories(undefined)).toBe('0');
      expect(formatCalories(NaN)).toBe('0');
    });

    it('formats negative calorie values correctly', () => {
      expect(formatCalories(-15)).toBe('-15');
      expect(formatCalories(-15.6)).toBe('-16');
    });
  });

  describe('formatMacro', () => {
    it('strips trailing zeros for whole numbers', () => {
      expect(formatMacro(160)).toBe('160');
      expect(formatMacro(12.0)).toBe('12');
      expect(formatMacro(0)).toBe('0');
      expect(formatMacro(-0)).toBe('0');
    });

    it('formats decimals to at most 1 decimal place', () => {
      expect(formatMacro(12.5)).toBe('12.5');
      expect(formatMacro(12.54)).toBe('12.5');
      expect(formatMacro(12.56)).toBe('12.6');
    });

    it('handles IEEE-754 floating point arithmetic precision drift', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS
      expect(formatMacro(0.1 + 0.2)).toBe('0.3');
      // 159.99999999999997 from repeated additions
      expect(formatMacro(159.99999999999997)).toBe('160');
      // 12.000000000000002
      expect(formatMacro(12.000000000000002)).toBe('12');
      // 12.500000000000002
      expect(formatMacro(12.500000000000002)).toBe('12.5');
    });

    it('sanitizes near-zero drift (< 0.05 to 0)', () => {
      expect(formatMacro(0.04)).toBe('0');
      expect(formatMacro(0.01)).toBe('0');
      expect(formatMacro(0.00001)).toBe('0');
      expect(formatMacro(-0.04)).toBe('0');
      expect(formatMacro(-0.01)).toBe('0');
      // Threshold at 0.05 rounds to 0.1
      expect(formatMacro(0.05)).toBe('0.1');
      expect(formatMacro(-0.05)).toBe('-0.1');
    });

    it('handles null, undefined, and NaN gracefully', () => {
      expect(formatMacro(null)).toBe('0');
      expect(formatMacro(undefined)).toBe('0');
      expect(formatMacro(NaN)).toBe('0');
    });

    it('formats negative macro values correctly', () => {
      expect(formatMacro(-5)).toBe('-5');
      expect(formatMacro(-5.2)).toBe('-5.2');
    });
  });

  describe('calculateRemainingFuel', () => {
    it('calculates remaining fuel accurately when under target budget', () => {
      const dailyTotals = {
        calories: 1800,
        protein: 120,
        carbs: 170,
        fat: 50,
        fiber: 20,
      };
      const targets = {
        calories: 2200,
        protein: 160,
        carbs: 220,
        fat: 70,
        fiber: 30,
      };

      const result = calculateRemainingFuel(dailyTotals, targets);

      // Calories
      expect(result.calories.isOver).toBe(false);
      expect(result.calories.rawDiff).toBe(400);
      expect(result.calories.formattedValue).toBe('400');
      expect(result.calories.badgeLabel).toBe('400 kcal');

      // Protein
      expect(result.protein.isOver).toBe(false);
      expect(result.protein.rawDiff).toBe(40);
      expect(result.protein.formattedValue).toBe('40');
      expect(result.protein.badgeLabel).toBe('40g P');

      // Carbs
      expect(result.carbs.isOver).toBe(false);
      expect(result.carbs.rawDiff).toBe(50);
      expect(result.carbs.formattedValue).toBe('50');
      expect(result.carbs.badgeLabel).toBe('50g C');

      // Fat
      expect(result.fat.isOver).toBe(false);
      expect(result.fat.rawDiff).toBe(20);
      expect(result.fat.formattedValue).toBe('20');
      expect(result.fat.badgeLabel).toBe('20g F');

      // Fiber
      expect(result.fiber.isOver).toBe(false);
      expect(result.fiber.rawDiff).toBe(10);
      expect(result.fiber.formattedValue).toBe('10');
      expect(result.fiber.badgeLabel).toBe('10g Fib');
    });

    it('displays over target badges (+X kcal over / +Xg P over) when over budget', () => {
      const dailyTotals = {
        calories: 2350,
        protein: 175.5,
        carbs: 240,
        fat: 75.2,
        fiber: 32,
      };
      const targets = {
        calories: 2200,
        protein: 160,
        carbs: 220,
        fat: 70,
        fiber: 30,
      };

      const result = calculateRemainingFuel(dailyTotals, targets);

      // Calories
      expect(result.calories.isOver).toBe(true);
      expect(result.calories.rawDiff).toBe(-150);
      expect(result.calories.formattedValue).toBe('150');
      expect(result.calories.badgeLabel).toBe('+150 kcal over');

      // Protein
      expect(result.protein.isOver).toBe(true);
      expect(result.protein.rawDiff).toBe(-15.5);
      expect(result.protein.formattedValue).toBe('15.5');
      expect(result.protein.badgeLabel).toBe('+15.5g P over');

      // Carbs
      expect(result.carbs.isOver).toBe(true);
      expect(result.carbs.rawDiff).toBe(-20);
      expect(result.carbs.formattedValue).toBe('20');
      expect(result.carbs.badgeLabel).toBe('+20g C over');

      // Fat
      expect(result.fat.isOver).toBe(true);
      expect(result.fat.rawDiff).toBe(-5.2);
      expect(result.fat.formattedValue).toBe('5.2');
      expect(result.fat.badgeLabel).toBe('+5.2g F over');

      // Fiber
      expect(result.fiber.isOver).toBe(true);
      expect(result.fiber.rawDiff).toBe(-2);
      expect(result.fiber.formattedValue).toBe('2');
      expect(result.fiber.badgeLabel).toBe('+2g Fib over');
    });

    it('sanitizes near-zero drift (< 0.05) and handles exact target match', () => {
      const dailyTotals = {
        calories: 2200.2, // diff -0.2 kcal -> rounds to 0
        protein: 160.03, // diff -0.03g -> near-zero drift (< 0.05)
        carbs: 219.97, // diff +0.03g -> near-zero drift (< 0.05)
        fat: 70,
        fiber: 30,
      };
      const targets = {
        calories: 2200,
        protein: 160,
        carbs: 220,
        fat: 70,
        fiber: 30,
      };

      const result = calculateRemainingFuel(dailyTotals, targets);

      expect(result.calories.isOver).toBe(false);
      expect(result.calories.rawDiff).toBe(0);
      expect(result.calories.badgeLabel).toBe('0 kcal');

      expect(result.protein.isOver).toBe(false);
      expect(result.protein.rawDiff).toBe(0);
      expect(result.protein.badgeLabel).toBe('0g P');

      expect(result.carbs.isOver).toBe(false);
      expect(result.carbs.rawDiff).toBe(0);
      expect(result.carbs.badgeLabel).toBe('0g C');

      expect(result.fat.isOver).toBe(false);
      expect(result.fat.rawDiff).toBe(0);
      expect(result.fat.badgeLabel).toBe('0g F');

      expect(result.fiber.isOver).toBe(false);
      expect(result.fiber.rawDiff).toBe(0);
      expect(result.fiber.badgeLabel).toBe('0g Fib');
    });

    it('supports user profile target property names (target_calories, etc.)', () => {
      const dailyTotals = {
        calories: 1500,
        protein: 100,
        carbs: 150,
        fat: 50,
        fiber: 20,
      };
      const targets = {
        target_calories: 2000,
        target_protein: 150,
        target_carbs: 200,
        target_fat: 65,
        target_fiber: 28,
      };

      const result = calculateRemainingFuel(dailyTotals, targets);

      expect(result.calories.badgeLabel).toBe('500 kcal');
      expect(result.protein.badgeLabel).toBe('50g P');
      expect(result.carbs.badgeLabel).toBe('50g C');
      expect(result.fat.badgeLabel).toBe('15g F');
      expect(result.fiber.badgeLabel).toBe('8g Fib');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { buildStagedItem, stagedReference } from './nutritionEngineHelpers';
import { scaleItemToQuantity } from '../../utils/itemModel';

describe('buildStagedItem', () => {
  it('assigns baseQuantity from quantity when portion is 1 serving (not 1)', () => {
    const item = buildStagedItem({
      name: 'Beef Pho',
      portion: '1 serving',
      quantity: 540,
      unit: 'g',
      calories: 665,
    });
    expect(item.baseQuantity).toBe(540);
    expect(item.baseQuantity).not.toBe(1);
    expect(item.quantity).toBe(540);
    expect(item.unit).toBe('g');
    expect(item.portion).toBe('1 serving');
  });

  it('assigns baseQuantity from quantity when portion is 1.5 cups cooked (not 1.5)', () => {
    const item = buildStagedItem({
      name: 'Cooked Rice',
      portion: '1.5 cups cooked',
      quantity: 240,
      unit: 'g',
      calories: 300,
    });
    expect(item.baseQuantity).toBe(240);
    expect(item.baseQuantity).not.toBe(1.5);
    expect(item.quantity).toBe(240);
    expect(item.unit).toBe('g');
  });

  it('scales linearly end-to-end without 270x calorie explosion', () => {
    const staged = buildStagedItem({
      name: 'Beef Pho',
      portion: '1 serving',
      quantity: 540,
      unit: 'g',
      calories: 665,
    });
    const reference = stagedReference(staged);
    const halved = scaleItemToQuantity(reference, 270);
    expect(halved.calories).toBeCloseTo(332.5, 1);
    expect(halved.calories).not.toBeCloseTo(179550, 0);
  });

  it('derives baseQuantity from quantity / portionMultiplier when raw.base is present', () => {
    const item = buildStagedItem({
      name: 'Pre-scaled Dish',
      portion: '1 bowl',
      quantity: 6,
      unit: 'unit',
      calories: 200,
      base: { calories: 100, protein: 10, carbs: 10, fat: 5, fiber: 2 },
      portionMultiplier: 2,
    });
    expect(item.baseQuantity).toBe(3);
    expect(item.baseQuantity).not.toBe(1);
  });

  it('guards against degenerate portionMultiplier values without producing Infinity/NaN', () => {
    const degenerateValues = [0, -1, NaN, undefined, -0, -Infinity, Infinity];
    for (const mult of degenerateValues) {
      const item = buildStagedItem({
        name: 'Degenerate Mult',
        portion: '1 serving',
        quantity: 100,
        unit: 'g',
        calories: 200,
        base: { calories: 200, protein: 10, carbs: 10, fat: 5, fiber: 2 },
        portionMultiplier: mult,
      });
      expect(Number.isFinite(item.baseQuantity)).toBe(true);
      expect(Number.isNaN(item.baseQuantity)).toBe(false);
      expect(item.baseQuantity).toBe(100);
    }
  });

  it('preserves fallback to convertPortion when raw.quantity is absent', () => {
    const item = buildStagedItem({
      name: 'Bananas',
      portion: '2 bananas',
      calories: 210,
    });
    expect(item.quantity).toBe(2);
    expect(item.unit).toBe('unit');
    expect(item.baseQuantity).toBe(2);
    expect(item.baseQuantity).not.toBe(1);

    const itemUndefined = buildStagedItem({
      name: 'Apples',
      portion: '3 apples',
      quantity: undefined,
      calories: 285,
    });
    expect(itemUndefined.quantity).toBe(3);
    expect(itemUndefined.baseQuantity).toBe(3);

    const itemNull = buildStagedItem({
      name: 'Oranges',
      portion: '4 oranges',
      quantity: null,
      calories: 240,
    });
    expect(itemNull.quantity).toBe(4);
    expect(itemNull.baseQuantity).toBe(4);
  });
});

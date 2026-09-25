import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  buildStagedItem,
  stagedReference,
  recomputeStagedTotals,
  updateStagedItemNutrition,
  buildStagedMealFromManualData,
  useStagedCardFocus,
  type StagedItem,
} from './nutritionEngineHelpers';
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

describe('updateStagedItemNutrition', () => {
  it('(a) sets current macros, base macros, baseQuantity to item.quantity, portionMultiplier to 1, and userOverridden flag', () => {
    const item = buildStagedItem({
      name: 'Chicken Breast',
      portion: '50g',
      quantity: 50,
      unit: 'g',
      calories: 104,
      protein: 15,
      carbs: 0,
      fat: 2,
      fiber: 0,
    });

    const updated = updateStagedItemNutrition(item, {
      calories: 150,
      protein: 20,
      carbs: 5,
      fat: 3,
      fiber: 1,
    });

    expect(updated.calories).toBe(150);
    expect(updated.baseCalories).toBe(150);
    expect(updated.protein).toBe(20);
    expect(updated.baseProtein).toBe(20);
    expect(updated.carbs).toBe(5);
    expect(updated.baseCarbs).toBe(5);
    expect(updated.fat).toBe(3);
    expect(updated.baseFat).toBe(3);
    expect(updated.fiber).toBe(1);
    expect(updated.baseFiber).toBe(1);
    expect(updated.baseQuantity).toBe(50);
    expect(updated.portionMultiplier).toBe(1);
    expect(updated.userOverridden).toBe(true);
  });

  it('(b) scales linearly to 75g via the app stepper code path yielding 225 kcal, and back to 50g yields 150 exactly', () => {
    const item = buildStagedItem({
      name: 'Chicken Breast',
      portion: '50g',
      quantity: 50,
      unit: 'g',
      calories: 104,
    });

    const edited = updateStagedItemNutrition(item, {
      calories: 150,
      protein: 20,
      carbs: 0,
      fat: 3,
      fiber: 0,
    });

    // Code path used by ComponentRow.tsx / NutritionEngine.tsx:
    // reference = stagedReference(edited)
    // scaled = scaleItemToQuantity(reference, nextQuantity)
    const ref = stagedReference(edited);
    const scaled75 = scaleItemToQuantity(ref, 75);
    expect(scaled75.calories).toBe(225);

    const scaled50 = scaleItemToQuantity(ref, 50);
    expect(scaled50.calories).toBe(150);
  });

  it('(c) clamps negative and non-finite (NaN, Infinity) inputs to 0', () => {
    const item = buildStagedItem({
      name: 'Test Item',
      portion: '1 serving',
      quantity: 100,
      unit: 'g',
      calories: 200,
    });

    const updated = updateStagedItemNutrition(item, {
      calories: -100,
      protein: NaN,
      carbs: -0.02,
      fat: Infinity,
      fiber: -Infinity,
    });

    expect(updated.calories).toBe(0);
    expect(updated.baseCalories).toBe(0);
    expect(updated.protein).toBe(0);
    expect(updated.baseProtein).toBe(0);
    expect(updated.carbs).toBe(0);
    expect(updated.baseCarbs).toBe(0);
    expect(updated.fat).toBe(0);
    expect(updated.baseFat).toBe(0);
    expect(updated.fiber).toBe(0);
    expect(updated.baseFiber).toBe(0);
  });

  it('(d) recomputeStagedTotals over [edited, other] equals their sum', () => {
    const item1 = buildStagedItem({
      name: 'Item 1',
      portion: '50g',
      quantity: 50,
      unit: 'g',
      calories: 104,
    });
    const edited1 = updateStagedItemNutrition(item1, {
      calories: 150,
      protein: 20,
      carbs: 10,
      fat: 4,
      fiber: 2,
    });

    const item2 = buildStagedItem({
      name: 'Item 2',
      portion: '100g',
      quantity: 100,
      unit: 'g',
      calories: 200,
      protein: 10,
      carbs: 25,
      fat: 5,
      fiber: 3,
    });

    const totals = recomputeStagedTotals([edited1, item2]);
    expect(totals.calories).toBe(350);
    expect(totals.protein).toBe(30);
    expect(totals.carbs).toBe(35);
    expect(totals.fat).toBe(9);
    expect(totals.fiber).toBe(5);
  });

  it('(e) does not mutate the input item object', () => {
    const original = buildStagedItem({
      name: 'Immutable Item',
      portion: '50g',
      quantity: 50,
      unit: 'g',
      calories: 104,
      protein: 15,
      carbs: 2,
      fat: 1,
      fiber: 0,
    });
    const snapshot = JSON.parse(JSON.stringify(original));

    const updated = updateStagedItemNutrition(original, {
      calories: 200,
      protein: 30,
      carbs: 5,
      fat: 4,
      fiber: 1,
    });

    expect(original).toEqual(snapshot);
    expect(updated).not.toBe(original);
  });

  it('preserves baseQuantity if item.quantity <= 0 while updating base macros', () => {
    const item = buildStagedItem({
      name: 'Zero Quantity Item',
      portion: '0g',
      quantity: 0,
      unit: 'g',
      calories: 100,
    });
    const itemWithBase: StagedItem = { ...item, baseQuantity: 50, quantity: 0 };

    const updated = updateStagedItemNutrition(itemWithBase, {
      calories: 180,
      protein: 15,
      carbs: 10,
      fat: 5,
      fiber: 2,
    });

    expect(updated.baseQuantity).toBe(50);
    expect(updated.calories).toBe(180);
    expect(updated.baseCalories).toBe(180);
  });
});

describe('buildStagedMealFromManualData', () => {
  it('constructs a single-item StagedMeal from manual data with calculated explanation and photos', () => {
    const staged = buildStagedMealFromManualData(
      {
        food_name: 'Grilled Salmon',
        calories: 350,
        protein: 34,
        carbs: 0,
        fat: 22,
        fiber: 0,
        meal_type: 'Dinner',
        serving_size: 200,
        serving_unit: 'g',
      },
      'data:image/jpeg;base64,sample'
    );

    expect(staged.name).toBe('Grilled Salmon');
    expect(staged.mealType).toBe('Dinner');
    expect(staged.photoUrl).toBe('data:image/jpeg;base64,sample');
    expect(staged.calories).toBe(350);
    expect(staged.protein).toBe(34);
    expect(staged.carbs).toBe(0);
    expect(staged.fat).toBe(22);
    expect(staged.fiber).toBe(0);
    expect(staged.servingSize).toBe(200);
    expect(staged.servingUnit).toBe('g');
    expect(staged.explanation).toBe('350 kcal (Grilled Salmon)');

    expect(staged.items).toHaveLength(1);
    const item = staged.items[0];
    expect(item.name).toBe('Grilled Salmon');
    expect(item.portion).toBe('200 g');
    expect(item.quantity).toBe(200);
    expect(item.unit).toBe('g');
    expect(item.calories).toBe(350);
  });

  it('falls back mealType to Breakfast and unit to unit when unspecified or unknown', () => {
    const staged = buildStagedMealFromManualData({
      food_name: 'Custom Snack',
      calories: 120,
      protein: 2,
      carbs: 15,
      fat: 5,
      fiber: 1,
      meal_type: '',
      serving_size: 1,
      serving_unit: 'piece',
    });

    expect(staged.mealType).toBe('Breakfast');
    expect(staged.items[0].unit).toBe('unit');
    expect(staged.photoUrl).toBeUndefined();
  });
});

describe('useStagedCardFocus', () => {
  it('focuses section heading when textarea is not rendered and card unmounts with focus inside (F5)', () => {
    let isStaged = true;
    const { result, rerender } = renderHook(() => useStagedCardFocus(isStaged));

    const mockHeading = document.createElement('h3');
    mockHeading.tabIndex = -1;
    document.body.appendChild(mockHeading);
    const focusSpy = vi.spyOn(mockHeading, 'focus');

    // Attach heading ref but leave textarea ref null
    (result.current.headingRef as any).current = mockHeading;
    expect(result.current.textareaRef.current).toBeNull();

    // Simulate focus inside the staged card
    act(() => {
      result.current.markFocusInside();
    });

    // Card unmounts
    isStaged = false;
    rerender();

    expect(focusSpy).toHaveBeenCalledTimes(1);
    document.body.removeChild(mockHeading);
  });

  it('prioritizes focusing textarea when both textarea and heading are rendered (F5)', () => {
    let isStaged = true;
    const { result, rerender } = renderHook(() => useStagedCardFocus(isStaged));

    const mockTextarea = document.createElement('textarea');
    const mockHeading = document.createElement('h3');
    document.body.appendChild(mockTextarea);
    document.body.appendChild(mockHeading);
    const textareaFocusSpy = vi.spyOn(mockTextarea, 'focus');
    const headingFocusSpy = vi.spyOn(mockHeading, 'focus');

    (result.current.textareaRef as any).current = mockTextarea;
    (result.current.headingRef as any).current = mockHeading;

    act(() => {
      result.current.markFocusInside();
    });

    isStaged = false;
    rerender();

    expect(textareaFocusSpy).toHaveBeenCalledTimes(1);
    expect(headingFocusSpy).not.toHaveBeenCalled();

    document.body.removeChild(mockTextarea);
    document.body.removeChild(mockHeading);
  });
});

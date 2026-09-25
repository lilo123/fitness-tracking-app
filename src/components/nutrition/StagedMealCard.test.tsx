import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StagedMealCard } from './StagedMealCard';
import type { StagedMeal } from './nutritionEngineHelpers';
import { expectNoA11yViolations, expectNoA11yViolationsForRules } from '../../test/a11y';

function makeStagedMeal(): StagedMeal {
  return {
    name: 'Vietnamese Breakfast',
    mealType: 'Breakfast',
    explanation: 'Calculated from ingredients',
    servingSize: 1,
    servingUnit: 'serving',
    calories: 600,
    protein: 30,
    carbs: 40,
    fat: 20,
    fiber: 5,
    items: [
      {
        id: 'stage-1',
        name: 'Egg Meatloaf',
        portion: '1 slice',
        portionMultiplier: 1,
        quantity: 1,
        calories: 600,
        protein: 30,
        carbs: 40,
        fat: 20,
        fiber: 5,
        baseQuantity: 1,
        baseCalories: 600,
        baseProtein: 30,
        baseCarbs: 40,
        baseFat: 20,
        baseFiber: 5,
        unit: 'unit',
      },
    ],
  };
}

function makeMultiItemMeal(): StagedMeal {
  return {
    name: '4-Item Feast',
    mealType: 'Dinner',
    explanation: '104 kcal (Salmon) + 74 kcal (Trout) + 125 kcal (Beef) + 181 kcal (Pork) = 484 kcal',
    servingSize: 1,
    servingUnit: 'serving',
    calories: 484,
    protein: 39.5,
    carbs: 0,
    fat: 34.5,
    fiber: 0,
    items: [
      {
        id: 'item-1',
        name: 'Salmon',
        portion: '50g',
        portionMultiplier: 1,
        quantity: 50,
        unit: 'g',
        calories: 104,
        protein: 10,
        carbs: 0,
        fat: 6.5,
        fiber: 0,
        baseQuantity: 50,
        baseCalories: 104,
        baseProtein: 10,
        baseCarbs: 0,
        baseFat: 6.5,
        baseFiber: 0,
      },
      {
        id: 'item-2',
        name: 'Trout',
        portion: '50g',
        portionMultiplier: 1,
        quantity: 50,
        unit: 'g',
        calories: 74,
        protein: 10.5,
        carbs: 0,
        fat: 3.5,
        fiber: 0,
        baseQuantity: 50,
        baseCalories: 74,
        baseProtein: 10.5,
        baseCarbs: 0,
        baseFat: 3.5,
        baseFiber: 0,
      },
      {
        id: 'item-3',
        name: 'Beef',
        portion: '50g',
        portionMultiplier: 1,
        quantity: 50,
        unit: 'g',
        calories: 125,
        protein: 13,
        carbs: 0,
        fat: 8,
        fiber: 0,
        baseQuantity: 50,
        baseCalories: 125,
        baseProtein: 13,
        baseCarbs: 0,
        baseFat: 8,
        baseFiber: 0,
      },
      {
        id: 'item-4',
        name: 'Pork',
        portion: '50g',
        portionMultiplier: 1,
        quantity: 50,
        unit: 'g',
        calories: 181,
        protein: 6,
        carbs: 0,
        fat: 16.5,
        fiber: 0,
        baseQuantity: 50,
        baseCalories: 181,
        baseProtein: 6,
        baseCarbs: 0,
        baseFat: 16.5,
        baseFiber: 0,
      },
    ],
  };
}

describe('StagedMealCard', () => {
  it('updates base* fields on re-anchor so subsequent adjustments scale from the new baseline', () => {
    let currentMeal = makeStagedMeal();
    const onUpdateStagedMeal = vi.fn((updated: StagedMeal) => {
      currentMeal = updated;
    });
    const onApplyStagedItemChange = vi.fn();
    const onDeleteItem = vi.fn();
    const onSaveItemAsCustomDish = vi.fn();
    const onLogStagedMeal = vi.fn();
    const onSaveStagedAsCustomDish = vi.fn();
    const onDiscardStagedMeal = vi.fn();

    const { rerender } = render(
      <StagedMealCard
        stagedMeal={currentMeal}
        onUpdateStagedMeal={onUpdateStagedMeal}
        onApplyStagedItemChange={onApplyStagedItemChange}
        onDeleteItem={onDeleteItem}
        onSaveItemAsCustomDish={onSaveItemAsCustomDish}
        onLogStagedMeal={onLogStagedMeal}
        onSaveStagedAsCustomDish={onSaveStagedAsCustomDish}
        onDiscardStagedMeal={onDiscardStagedMeal}
        isPending={false}
      />
    );

    // Switch unit from 'unit' to 'g'
    fireEvent.click(screen.getByTestId('component-unit-chip'));
    fireEvent.click(screen.getByTestId('unit-option-g'));

    // Commit 540g
    const input = screen.getByTestId('component-quantity-input');
    fireEvent.change(input, { target: { value: '540' } });
    fireEvent.blur(input);

    expect(onUpdateStagedMeal).toHaveBeenCalledTimes(1);
    const updated = onUpdateStagedMeal.mock.calls[0][0] as StagedMeal;

    // Verify all base* fields are rewritten and portionMultiplier is reset to 1
    const reanchoredItem = updated.items[0];
    expect(reanchoredItem.unit).toBe('g');
    expect(reanchoredItem.baseQuantity).toBe(540);
    expect(reanchoredItem.baseCalories).toBe(600);
    expect(reanchoredItem.baseProtein).toBe(30);
    expect(reanchoredItem.baseCarbs).toBe(40);
    expect(reanchoredItem.baseFat).toBe(20);
    expect(reanchoredItem.baseFiber).toBe(5);
    expect(reanchoredItem.portionMultiplier).toBe(1);

    // Re-render with the updated meal
    rerender(
      <StagedMealCard
        stagedMeal={currentMeal}
        onUpdateStagedMeal={onUpdateStagedMeal}
        onApplyStagedItemChange={onApplyStagedItemChange}
        onDeleteItem={onDeleteItem}
        onSaveItemAsCustomDish={onSaveItemAsCustomDish}
        onLogStagedMeal={onLogStagedMeal}
        onSaveStagedAsCustomDish={onSaveStagedAsCustomDish}
        onDiscardStagedMeal={onDiscardStagedMeal}
        isPending={false}
      />
    );

    // Now adjust quantity to 594 (which is 1.1x of 540g)
    const nextInput = screen.getByTestId('component-quantity-input');
    fireEvent.change(nextInput, { target: { value: '594' } });
    fireEvent.blur(nextInput);

    expect(onApplyStagedItemChange).toHaveBeenCalledTimes(1);
    const scaled = onApplyStagedItemChange.mock.calls[0][1];
    expect(scaled.quantity).toBe(594);
    expect(scaled.unit).toBe('g');
    expect(scaled.calories).toBe(660);
    expect(scaled.protein).toBe(33);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <StagedMealCard
        stagedMeal={makeStagedMeal()}
        onUpdateStagedMeal={vi.fn()}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );
    await expectNoA11yViolations(container);
  });

  it('renders two StagedMealCards simultaneously without duplicate id violations', async () => {
    const meal1 = makeStagedMeal();
    const meal2 = { ...makeStagedMeal(), name: 'Lunch Meal' };
    const { container } = render(
      <div>
        <StagedMealCard
          stagedMeal={meal1}
          onUpdateStagedMeal={vi.fn()}
          onApplyStagedItemChange={vi.fn()}
          onDeleteItem={vi.fn()}
          onSaveItemAsCustomDish={vi.fn()}
          onLogStagedMeal={vi.fn()}
          onSaveStagedAsCustomDish={vi.fn()}
          onDiscardStagedMeal={vi.fn()}
          isPending={false}
        />
        <StagedMealCard
          stagedMeal={meal2}
          onUpdateStagedMeal={vi.fn()}
          onApplyStagedItemChange={vi.fn()}
          onDeleteItem={vi.fn()}
          onSaveItemAsCustomDish={vi.fn()}
          onLogStagedMeal={vi.fn()}
          onSaveStagedAsCustomDish={vi.fn()}
          onDiscardStagedMeal={vi.fn()}
          isPending={false}
        />
      </div>
    );
    await expectNoA11yViolationsForRules(container, ['duplicate-id', 'label']);
  });

  it('D3 & D4: omits "Adjust portion or remove item" helper label and formula callout box', () => {
    const meal = makeMultiItemMeal();
    const { container } = render(
      <StagedMealCard
        stagedMeal={meal}
        onUpdateStagedMeal={vi.fn()}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.queryByText(/adjust portion or remove item/i)).toBeNull();
    expect(container.querySelector('.lucide-calculator')).toBeNull();
    expect(screen.getByText(/itemized breakdown \(4\)/i)).toBeDefined();
  });

  it('D5: renders read-only totals with no inputs for multi-item meal and shows 484/39.5/34.5 values', () => {
    const meal = makeMultiItemMeal();
    render(
      <StagedMealCard
        stagedMeal={meal}
        onUpdateStagedMeal={vi.fn()}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    const totalsContainer = screen.getByTestId('staged-meal-totals');
    expect(within(totalsContainer).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(totalsContainer).queryAllByRole('textbox')).toHaveLength(0);

    // Verify typography matches ComponentRow: proportional tabular-nums, font-mono absent
    expect(totalsContainer.className).not.toContain('font-mono');
    expect(totalsContainer.className).toContain('tabular-nums');

    // Verify visible read-only non-zero figures via individual testids with exact-number assertions
    expect(screen.getByTestId('staged-total-calories')).toHaveTextContent(/^484\s*kcal$/);
    expect(screen.getByTestId('staged-total-protein')).toHaveTextContent(/^39\.5\s*P$/);
    expect(screen.getByTestId('staged-total-fat')).toHaveTextContent(/^34\.5\s*F$/);

    // Verify zero macros are not rendered (assert absence via queryByTestId === null)
    expect(screen.queryByTestId('staged-total-carbs')).toBeNull();
    expect(screen.queryByTestId('staged-total-fiber')).toBeNull();

    // Verify column headers are absent per user feedback (dropped header row)
    expect(screen.queryByTestId('macro-columns-header')).toBeNull();
    expect(screen.queryByTestId('header-macro-calories')).toBeNull();
    expect(screen.queryByTestId('header-macro-protein')).toBeNull();
    expect(screen.queryByTestId('header-macro-fat')).toBeNull();
    expect(screen.queryByTestId('header-macro-carbs')).toBeNull();
    expect(screen.queryByTestId('header-macro-fiber')).toBeNull();

    expect(screen.getByText(/totals are the sum of items/i)).toBeDefined();

    // Verify absolutely no hidden or visible macro inputs exist on multi-item card
    expect(screen.queryByTestId('calories-input')).toBeNull();
    expect(screen.queryByTestId('protein-input')).toBeNull();
    expect(screen.queryByTestId('carbs-input')).toBeNull();
    expect(screen.queryByTestId('fat-input')).toBeNull();
    expect(screen.queryByTestId('fiber-input')).toBeNull();
  });

  it('renders all macro figures when all macros are non-zero', () => {
    const meal = makeMultiItemMeal();
    meal.items[0].carbs = 20;
    meal.items[0].fiber = 5;
    meal.carbs = 20;
    meal.fiber = 5;
    render(
      <StagedMealCard
        stagedMeal={meal}
        onUpdateStagedMeal={vi.fn()}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.getByTestId('staged-total-calories')).toHaveTextContent(/^484\s*kcal$/);
    expect(screen.getByTestId('staged-total-protein')).toHaveTextContent(/^39\.5\s*P$/);
    expect(screen.getByTestId('staged-total-carbs')).toHaveTextContent(/^20\s*C$/);
    expect(screen.getByTestId('staged-total-fat')).toHaveTextContent(/^34\.5\s*F$/);
    expect(screen.getByTestId('staged-total-fiber')).toHaveTextContent(/^5\s*Fib$/);

    // Verify header row is absent
    expect(screen.queryByTestId('macro-columns-header')).toBeNull();
  });

  it('renders muted 0 C in totals when a visible column has a 0 total', () => {
    const meal = makeMultiItemMeal();
    // One item has carbs so carbs is visible across the meal, but total carbs is 0
    meal.items[0].carbs = 0;
    meal.items[1].carbs = 0;
    meal.items[2].carbs = 0.06;
    meal.items[3].carbs = -0.06;
    meal.carbs = 0;
    render(
      <StagedMealCard
        stagedMeal={meal}
        onUpdateStagedMeal={vi.fn()}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    // Totals carbs renders muted 0 C
    const totalCarbs = screen.getByTestId('staged-total-carbs');
    expect(totalCarbs).toHaveTextContent(/^0\s*C$/);
  });

  it('single-item meal: keeps editable total inputs and writes back to items[0] and base fields', () => {
    const meal = makeStagedMeal();
    const onUpdateStagedMeal = vi.fn();
    render(
      <StagedMealCard
        stagedMeal={meal}
        onUpdateStagedMeal={onUpdateStagedMeal}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    const calInput = screen.getByTestId('calories-input');
    fireEvent.change(calInput, { target: { value: '650' } });

    expect(onUpdateStagedMeal).toHaveBeenCalled();
    const lastCallArg = onUpdateStagedMeal.mock.calls[onUpdateStagedMeal.mock.calls.length - 1][0] as StagedMeal;
    expect(lastCallArg.calories).toBe(650);
    expect(lastCallArg.items[0].calories).toBe(650);
    expect(lastCallArg.items[0].baseCalories).toBe(650);
    expect(lastCallArg.items[0].userOverridden).toBe(true);
  });

  it('Option A: wires onEditNutrition to update item nutrition and recompute staged totals', () => {
    const meal = makeMultiItemMeal();
    const onUpdateStagedMeal = vi.fn();
    render(
      <StagedMealCard
        stagedMeal={meal}
        onUpdateStagedMeal={onUpdateStagedMeal}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    // Open overflow menu on the first item (Salmon: 104 kcal)
    const actionButtons = screen.getAllByTestId('component-actions');
    fireEvent.click(actionButtons[0]);

    // Click "Edit nutrition"
    const editBtn = screen.getByTestId('component-edit-nutrition');
    fireEvent.click(editBtn);

    // Edit nutrition modal is open
    const calInput = screen.getByTestId('edit-item-calories-input');
    fireEvent.change(calInput, { target: { value: '150' } });

    // Save
    const saveBtn = screen.getByTestId('save-edit-item-nutrition-btn');
    fireEvent.click(saveBtn);

    expect(onUpdateStagedMeal).toHaveBeenCalledTimes(1);
    const updated = onUpdateStagedMeal.mock.calls[0][0] as StagedMeal;

    // First item updated: 150 kcal
    expect(updated.items[0].calories).toBe(150);
    expect(updated.items[0].baseCalories).toBe(150);
    expect(updated.items[0].userOverridden).toBe(true);

    // Totals recomputed: 484 - 104 + 150 = 530 kcal
    expect(updated.calories).toBe(530);
  });
});

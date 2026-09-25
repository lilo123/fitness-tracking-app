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

  it('single-item meal (D14): renders no inputs in the single-item card and hides Itemized Breakdown and This meal row', () => {
    const meal = makeStagedMeal();
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

    // No macro input fields exist on single-item card
    expect(screen.queryByTestId('calories-input')).toBeNull();
    expect(screen.queryByTestId('protein-input')).toBeNull();
    expect(screen.queryByTestId('carbs-input')).toBeNull();
    expect(screen.queryByTestId('fat-input')).toBeNull();
    expect(screen.queryByTestId('fiber-input')).toBeNull();

    // No Itemized Breakdown header or This meal row for 1 item
    expect(screen.queryByText(/itemized breakdown/i)).toBeNull();
    expect(screen.queryByTestId('this-meal-label')).toBeNull();
    expect(screen.queryByTestId('staged-meal-totals')).toBeNull();

    // The single item row is displayed directly
    expect(screen.getByTestId('component-name')).toHaveTextContent('Egg Meatloaf');
    expect(screen.getByTestId('component-quantity-input')).toHaveValue(1);
  });

  it('single-item meal (D14): renders Day total row with 1 item when dailyTotals and targets provided', () => {
    const meal = makeStagedMeal(); // 600 kcal, 30 P, 40 C, 20 F, 5 Fib
    render(
      <StagedMealCard
        stagedMeal={meal}
        dailyTotals={{ calories: 1200, protein: 70, carbs: 100, fat: 40, fiber: 15 }}
        targets={{ calories: 2000, protein: 150, carbs: 200, fat: 70, fiber: 30 }}
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

    // Day total row is present even for a single-item meal (dropped isMultiItem gate)
    const dayTotal = screen.getByTestId('staged-meal-day-total');
    expect(dayTotal).toBeInTheDocument();
    expect(screen.getByTestId('day-total-label')).toHaveTextContent('Day total');

    // Day total arithmetic: 1200 + 600 = 1800 kcal, 70 + 30 = 100 P, 100 + 40 = 140 C, 40 + 20 = 60 F, 15 + 5 = 20 Fib
    expect(screen.getByTestId('day-total-val-calories')).toHaveTextContent('1800');
    expect(screen.getByTestId('day-total-val-protein')).toHaveTextContent('100');
    expect(screen.getByTestId('day-total-val-carbs')).toHaveTextContent('140');
    expect(screen.getByTestId('day-total-val-fat')).toHaveTextContent('60');
    expect(screen.getByTestId('day-total-val-fiber')).toHaveTextContent('20');

    // This meal row remains hidden for single item
    expect(screen.queryByTestId('this-meal-label')).toBeNull();
  });

  it('single-item meal (D14): modal edit updates item 0 nutrition and recomputes meal totals', () => {
    const meal = makeStagedMeal();
    let currentMeal = meal;
    const onUpdateStagedMeal = vi.fn((updated: StagedMeal) => {
      currentMeal = updated;
    });
    const onLogStagedMeal = vi.fn();

    const { rerender } = render(
      <StagedMealCard
        stagedMeal={currentMeal}
        onUpdateStagedMeal={onUpdateStagedMeal}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={onLogStagedMeal}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    // Open overflow menu for the item
    fireEvent.click(screen.getByTestId('component-actions'));
    // Click Edit nutrition
    fireEvent.click(screen.getByTestId('component-edit-nutrition'));

    // Modal is open, edit calories and protein
    fireEvent.change(screen.getByTestId('edit-item-calories-input'), { target: { value: '750' } });
    fireEvent.change(screen.getByTestId('edit-item-protein-input'), { target: { value: '45' } });
    fireEvent.click(screen.getByTestId('save-edit-item-nutrition-btn'));

    expect(onUpdateStagedMeal).toHaveBeenCalledTimes(1);
    const updated = onUpdateStagedMeal.mock.calls[0][0] as StagedMeal;

    // Item 0 is updated
    expect(updated.items[0].calories).toBe(750);
    expect(updated.items[0].protein).toBe(45);
    expect(updated.items[0].baseCalories).toBe(750);
    expect(updated.items[0].baseProtein).toBe(45);
    expect(updated.items[0].userOverridden).toBe(true);

    // Meal totals recomputed to match item 0
    expect(updated.calories).toBe(750);
    expect(updated.protein).toBe(45);

    // Rerender with updated meal and verify Log Meal button reflects the edited calories
    rerender(
      <StagedMealCard
        stagedMeal={updated}
        onUpdateStagedMeal={onUpdateStagedMeal}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={onLogStagedMeal}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.getByText('Log Meal (+750 kcal)')).toBeInTheDocument();
  });

  it('deleting from 2 items down to 1 (D14): removes This meal row and Itemized Breakdown header without rendering inputs', () => {
    const multiMeal: StagedMeal = {
      name: '2-Item Meal',
      mealType: 'Lunch',
      explanation: 'Calculated from ingredients',
      servingSize: 1,
      servingUnit: 'serving',
      calories: 300,
      protein: 25,
      carbs: 20,
      fat: 10,
      fiber: 2,
      items: [
        {
          id: 'item-1',
          name: 'Chicken Breast',
          portion: '100g',
          portionMultiplier: 1,
          quantity: 100,
          unit: 'g',
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 3.6,
          fiber: 0,
          baseQuantity: 100,
          baseCalories: 165,
          baseProtein: 31,
          baseCarbs: 0,
          baseFat: 3.6,
          baseFiber: 0,
        },
        {
          id: 'item-2',
          name: 'Brown Rice',
          portion: '100g',
          portionMultiplier: 1,
          quantity: 100,
          unit: 'g',
          calories: 135,
          protein: 3,
          carbs: 28,
          fat: 1,
          fiber: 2,
          baseQuantity: 100,
          baseCalories: 135,
          baseProtein: 3,
          baseCarbs: 28,
          baseFat: 1,
          baseFiber: 2,
        },
      ],
    };

    const onDeleteItem = vi.fn();
    const { rerender } = render(
      <StagedMealCard
        stagedMeal={multiMeal}
        dailyTotals={{ calories: 500, protein: 30, carbs: 50, fat: 20, fiber: 5 }}
        targets={{ calories: 2000, protein: 150, carbs: 200, fat: 70, fiber: 30 }}
        onUpdateStagedMeal={vi.fn()}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={onDeleteItem}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    // Initial 2-item state: shows Itemized Breakdown (2) and This meal row
    expect(screen.getByText(/itemized breakdown \(2\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('this-meal-label')).toHaveTextContent('This meal');
    expect(screen.getByTestId('staged-meal-day-total')).toBeInTheDocument();

    // Trigger delete on item-2
    const actionButtons = screen.getAllByTestId('component-actions');
    fireEvent.click(actionButtons[1]);
    fireEvent.click(screen.getByTestId('component-remove'));
    expect(onDeleteItem).toHaveBeenCalledWith('item-2');

    // Simulate parent state update after delete down to 1 item
    const singleMeal: StagedMeal = {
      ...multiMeal,
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: 0,
      items: [multiMeal.items[0]],
    };

    rerender(
      <StagedMealCard
        stagedMeal={singleMeal}
        dailyTotals={{ calories: 500, protein: 30, carbs: 50, fat: 20, fiber: 5 }}
        targets={{ calories: 2000, protein: 150, carbs: 200, fat: 70, fiber: 30 }}
        onUpdateStagedMeal={vi.fn()}
        onApplyStagedItemChange={vi.fn()}
        onDeleteItem={onDeleteItem}
        onSaveItemAsCustomDish={vi.fn()}
        onLogStagedMeal={vi.fn()}
        onSaveStagedAsCustomDish={vi.fn()}
        onDiscardStagedMeal={vi.fn()}
        isPending={false}
      />
    );

    // 1-item state: This meal row and Itemized Breakdown are gone!
    expect(screen.queryByText(/itemized breakdown/i)).toBeNull();
    expect(screen.queryByTestId('this-meal-label')).toBeNull();
    expect(screen.queryByTestId('staged-meal-totals')).toBeNull();

    // No inputs appear!
    expect(screen.queryByTestId('calories-input')).toBeNull();
    expect(screen.queryByTestId('protein-input')).toBeNull();

    // Day total remains visible
    expect(screen.getByTestId('staged-meal-day-total')).toBeInTheDocument();
    expect(screen.getByTestId('day-total-val-calories')).toHaveTextContent('665'); // 500 + 165
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

  it('Task 5 (revised D8): renders This meal label on totals and Day total row directly under bold totals when dailyTotals and targets provided', () => {
    const meal = makeMultiItemMeal();
    render(
      <StagedMealCard
        stagedMeal={meal}
        dailyTotals={{ calories: 1000, protein: 50, carbs: 0, fat: 30, fiber: 0 }}
        targets={{ calories: 2000, protein: 120, carbs: 200, fat: 70, fiber: 30 }}
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

    // This meal label on totals
    expect(screen.getByTestId('this-meal-label')).toHaveTextContent('This meal');

    // Day total row
    const dayTotal = screen.getByTestId('staged-meal-day-total');
    expect(dayTotal).toBeInTheDocument();
    expect(screen.getByTestId('day-total-label')).toHaveTextContent('Day total');

    // Multi-item meal has totals: 484 kcal, 39.5 P, 34.5 F
    // Daily totals: 1000 kcal, 50 P, 30 F
    // Day total: 1484 kcal, 89.5 P, 64.5 F
    expect(screen.getByTestId('day-total-val-calories')).toHaveTextContent('1484');
    expect(screen.getByTestId('day-total-val-protein')).toHaveTextContent('89.5');
    expect(screen.getByTestId('day-total-val-fat')).toHaveTextContent('64.5');
  });

  it('Task 5: omits Day total row when neither dailyTotals nor targets provided', () => {
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

    expect(screen.queryByTestId('staged-meal-day-total')).toBeNull();
  });

  it('Task 5: highlights red and adds accessible text when over target, keeps standard macro colors otherwise', () => {
    const meal = makeMultiItemMeal(); // 484 kcal, 39.5 P
    render(
      <StagedMealCard
        stagedMeal={meal}
        dailyTotals={{ calories: 1600, protein: 75, carbs: 0, fat: 20, fiber: 0 }}
        targets={{ calories: 2000, protein: 120, carbs: 200, fat: 80, fiber: 30 }}
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

    // Calories: 1600 + 484 = 2084 > 2000 -> red (text-red-400), accessible description present
    const calCell = screen.getByTestId('day-total-calories');
    expect(calCell).toHaveClass('text-red-400');
    expect(screen.getByTestId('day-total-over-calories')).toHaveTextContent('over target by 84 kcal');

    // Protein: 75 + 39.5 = 114.5 <= 120 -> cyan-400 (no amber tier, no red)
    const pCell = screen.getByTestId('day-total-protein');
    expect(pCell).toHaveClass('text-cyan-400');
    expect(pCell).not.toHaveClass('text-red-400');
    expect(screen.queryByTestId('day-total-over-protein')).toBeNull();
  });
});


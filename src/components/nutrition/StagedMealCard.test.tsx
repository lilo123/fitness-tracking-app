import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});

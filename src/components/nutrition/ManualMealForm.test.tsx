import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManualMealForm } from './ManualMealForm';
import { expectNoA11yViolations, expectNoA11yViolationsForRules } from '../../test/a11y';

function renderForm() {
  return render(
    <ManualMealForm
      show={true}
      onClose={vi.fn()}
      selectedPhoto={null}
      onRemovePhoto={vi.fn()}
      manualName="Oatmeal"
      onManualNameChange={vi.fn()}
      manualMealType="Breakfast"
      onManualMealTypeChange={vi.fn()}
      manualCalories={350}
      onManualCaloriesChange={vi.fn()}
      manualProtein={12}
      onManualProteinChange={vi.fn()}
      manualCarbs={60}
      onManualCarbsChange={vi.fn()}
      manualFat={5}
      onManualFatChange={vi.fn()}
      manualFiber={8}
      onManualFiberChange={vi.fn()}
      manualServingSize={1}
      onManualServingSizeChange={vi.fn()}
      manualServingUnit="bowl"
      onManualServingUnitChange={vi.fn()}
      onSubmit={vi.fn()}
      isPending={false}
    />
  );
}

describe('ManualMealForm', () => {
  it('has no accessibility violations', async () => {
    const { container } = renderForm();
    await expectNoA11yViolations(container);
  });

  it('associates all form labels with their controls', () => {
    renderForm();
    expect(screen.getByLabelText(/Dish \/ Meal Name/)).toBe(screen.getByTestId('dish-name-input'));
    expect(screen.getByLabelText('Meal Type')).toBeDefined();
    expect(screen.getByLabelText(/Calories/)).toBe(screen.getByTestId('calories-input'));
    expect(screen.getByLabelText(/Protein/)).toBe(screen.getByTestId('protein-input'));
    expect(screen.getByLabelText(/Carbs/)).toBe(screen.getByTestId('carbs-input'));
    expect(screen.getByLabelText(/Fat/)).toBe(screen.getByTestId('fat-input'));
    expect(screen.getByLabelText(/Fiber/)).toBe(screen.getByTestId('fiber-input'));
    expect(screen.getByLabelText('Serving Size')).toBeDefined();
    expect(screen.getByLabelText('Serving Unit')).toBeDefined();
  });

  it('renders two forms simultaneously without duplicate id violations', async () => {
    const { container } = render(
      <div>
        <ManualMealForm
          show={true}
          onClose={vi.fn()}
          selectedPhoto={null}
          onRemovePhoto={vi.fn()}
          manualName="Meal 1"
          onManualNameChange={vi.fn()}
          manualMealType="Breakfast"
          onManualMealTypeChange={vi.fn()}
          manualCalories={300}
          onManualCaloriesChange={vi.fn()}
          manualProtein={10}
          onManualProteinChange={vi.fn()}
          manualCarbs={50}
          onManualCarbsChange={vi.fn()}
          manualFat={4}
          onManualFatChange={vi.fn()}
          manualFiber={6}
          onManualFiberChange={vi.fn()}
          manualServingSize={1}
          onManualServingSizeChange={vi.fn()}
          manualServingUnit="bowl"
          onManualServingUnitChange={vi.fn()}
          onSubmit={vi.fn()}
          isPending={false}
        />
        <ManualMealForm
          show={true}
          onClose={vi.fn()}
          selectedPhoto={null}
          onRemovePhoto={vi.fn()}
          manualName="Meal 2"
          onManualNameChange={vi.fn()}
          manualMealType="Lunch"
          onManualMealTypeChange={vi.fn()}
          manualCalories={500}
          onManualCaloriesChange={vi.fn()}
          manualProtein={30}
          onManualProteinChange={vi.fn()}
          manualCarbs={40}
          onManualCarbsChange={vi.fn()}
          manualFat={15}
          onManualFatChange={vi.fn()}
          manualFiber={5}
          onManualFiberChange={vi.fn()}
          manualServingSize={1}
          onManualServingSizeChange={vi.fn()}
          manualServingUnit="plate"
          onManualServingUnitChange={vi.fn()}
          onSubmit={vi.fn()}
          isPending={false}
        />
      </div>
    );
    await expectNoA11yViolationsForRules(container, ['duplicate-id', 'label']);
  });
});

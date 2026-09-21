import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomDishesModal } from './CustomDishesModal';
import { expectNoA11yViolations, expectNoA11yViolationsForRules } from '../../test/a11y';

function renderModal() {
  return render(
    <CustomDishesModal
      isOpen={true}
      onClose={vi.fn()}
      editingDish={null}
      dishModalName="Protein Oatmeal"
      setDishModalName={vi.fn()}
      dishModalCalories={400}
      setDishModalCalories={vi.fn()}
      dishModalProtein={30}
      setDishModalProtein={vi.fn()}
      dishModalCarbs={50}
      setDishModalCarbs={vi.fn()}
      dishModalFat={8}
      setDishModalFat={vi.fn()}
      dishModalFiber={6}
      setDishModalFiber={vi.fn()}
      dishModalItems={[]}
      setDishModalItems={vi.fn()}
      onSaveDish={vi.fn()}
      onDeleteDish={vi.fn()}
      isSaving={false}
      isDeleting={false}
      customDishes={[]}
      onOpenEditDishModal={vi.fn()}
    />
  );
}

describe('CustomDishesModal', () => {
  it('has no accessibility violations', async () => {
    const { container } = renderModal();
    await expectNoA11yViolations(container);
  });

  it('associates all form labels with their controls', () => {
    renderModal();
    expect(screen.getByLabelText('Dish Name')).toBeDefined();
    expect(screen.getByLabelText('Calories')).toBeDefined();
    expect(screen.getByLabelText(/Protein/)).toBeDefined();
    expect(screen.getByLabelText(/Carbs/)).toBeDefined();
    expect(screen.getByLabelText(/Fat/)).toBeDefined();
    expect(screen.getByLabelText(/Fiber/)).toBeDefined();
  });

  it('renders two modals simultaneously without duplicate id violations', async () => {
    const { container } = render(
      <div>
        <CustomDishesModal
          isOpen={true}
          onClose={vi.fn()}
          editingDish={null}
          dishModalName="Dish 1"
          setDishModalName={vi.fn()}
          dishModalCalories={400}
          setDishModalCalories={vi.fn()}
          dishModalProtein={30}
          setDishModalProtein={vi.fn()}
          dishModalCarbs={50}
          setDishModalCarbs={vi.fn()}
          dishModalFat={8}
          setDishModalFat={vi.fn()}
          dishModalFiber={6}
          setDishModalFiber={vi.fn()}
          dishModalItems={[]}
          setDishModalItems={vi.fn()}
          onSaveDish={vi.fn()}
          onDeleteDish={vi.fn()}
          isSaving={false}
          isDeleting={false}
          customDishes={[]}
          onOpenEditDishModal={vi.fn()}
        />
        <CustomDishesModal
          isOpen={true}
          onClose={vi.fn()}
          editingDish={null}
          dishModalName="Dish 2"
          setDishModalName={vi.fn()}
          dishModalCalories={300}
          setDishModalCalories={vi.fn()}
          dishModalProtein={20}
          setDishModalProtein={vi.fn()}
          dishModalCarbs={40}
          setDishModalCarbs={vi.fn()}
          dishModalFat={6}
          setDishModalFat={vi.fn()}
          dishModalFiber={4}
          setDishModalFiber={vi.fn()}
          dishModalItems={[]}
          setDishModalItems={vi.fn()}
          onSaveDish={vi.fn()}
          onDeleteDish={vi.fn()}
          isSaving={false}
          isDeleting={false}
          customDishes={[]}
          onOpenEditDishModal={vi.fn()}
        />
      </div>
    );
    await expectNoA11yViolationsForRules(container, ['duplicate-id', 'label']);
  });
});

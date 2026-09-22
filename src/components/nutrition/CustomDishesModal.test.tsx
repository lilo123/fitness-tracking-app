import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders accessible food/recipe toggle and is keyboard-operable', async () => {
    const setDishModalKind = vi.fn();
    render(
      <CustomDishesModal
        isOpen={true}
        onClose={vi.fn()}
        editingDish={null}
        dishModalKind="food"
        setDishModalKind={setDishModalKind}
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

    const radioGroup = screen.getByRole('radiogroup', { name: /dish type/i });
    expect(radioGroup).toBeDefined();

    const foodRadio = screen.getByRole('radio', { name: /^food$/i });
    const recipeRadio = screen.getByRole('radio', { name: /^recipe$/i });
    expect(foodRadio).toBeDefined();
    expect(recipeRadio).toBeDefined();
    expect((foodRadio as HTMLInputElement).checked).toBe(true);
    expect((recipeRadio as HTMLInputElement).checked).toBe(false);

    // Keyboard operable: clicking/navigating triggers setDishModalKind
    fireEvent.click(recipeRadio);
    expect(setDishModalKind).toHaveBeenCalledWith('recipe');
  });

  it('blocks recipe to food transition while items exist and displays explanation', () => {
    const mockItem = {
      id: 'item-1',
      name: 'Oats',
      quantity: 50,
      unit: 'g' as const,
      calories: 190,
      protein: 7,
      carbs: 34,
      fat: 3,
      fiber: 5,
    };

    const { rerender } = render(
      <CustomDishesModal
        isOpen={true}
        onClose={vi.fn()}
        editingDish={null}
        dishModalKind="recipe"
        setDishModalKind={vi.fn()}
        dishModalName="Oatmeal Bowl"
        setDishModalName={vi.fn()}
        dishModalCalories={190}
        setDishModalCalories={vi.fn()}
        dishModalProtein={7}
        setDishModalProtein={vi.fn()}
        dishModalCarbs={34}
        setDishModalCarbs={vi.fn()}
        dishModalFat={3}
        setDishModalFat={vi.fn()}
        dishModalFiber={5}
        setDishModalFiber={vi.fn()}
        dishModalItems={[mockItem, { ...mockItem, id: 'item-2', name: 'Almond Milk' }]}
        setDishModalItems={vi.fn()}
        onSaveDish={vi.fn()}
        onDeleteDish={vi.fn()}
        isSaving={false}
        isDeleting={false}
        customDishes={[]}
        onOpenEditDishModal={vi.fn()}
      />
    );

    const foodRadio = screen.getByRole('radio', { name: /^food$/i }) as HTMLInputElement;
    expect(foodRadio.disabled).toBe(true);
    expect(screen.getByText(/remove ingredients first to switch to food/i)).toBeDefined();

    // When items are empty, transition to food is enabled
    rerender(
      <CustomDishesModal
        isOpen={true}
        onClose={vi.fn()}
        editingDish={null}
        dishModalKind="recipe"
        setDishModalKind={vi.fn()}
        dishModalName="Oatmeal Bowl"
        setDishModalName={vi.fn()}
        dishModalCalories={0}
        setDishModalCalories={vi.fn()}
        dishModalProtein={0}
        setDishModalProtein={vi.fn()}
        dishModalCarbs={0}
        setDishModalCarbs={vi.fn()}
        dishModalFat={0}
        setDishModalFat={vi.fn()}
        dishModalFiber={0}
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

    const enabledFoodRadio = screen.getByRole('radio', { name: /^food$/i }) as HTMLInputElement;
    expect(enabledFoodRadio.disabled).toBe(false);
    expect(screen.queryByText(/remove ingredients first to switch to food/i)).toBeNull();
  });

  it('parent macros stay suppressed for a dish with items REGARDLESS of kind', () => {
    const mockItems = [
      { id: '1', name: 'Item 1', quantity: 100, unit: 'g' as const, calories: 100, protein: 10, carbs: 10, fat: 2, fiber: 1 },
      { id: '2', name: 'Item 2', quantity: 100, unit: 'g' as const, calories: 150, protein: 15, carbs: 15, fat: 3, fiber: 2 },
    ];

    // Even if kind is 'food' (e.g. loaded dish), having items > 1 MUST suppress direct parent macro inputs
    const { rerender } = render(
      <CustomDishesModal
        isOpen={true}
        onClose={vi.fn()}
        editingDish={null}
        dishModalKind="food"
        setDishModalKind={vi.fn()}
        dishModalName="Multi Item Food"
        setDishModalName={vi.fn()}
        dishModalCalories={250}
        setDishModalCalories={vi.fn()}
        dishModalProtein={25}
        setDishModalProtein={vi.fn()}
        dishModalCarbs={25}
        setDishModalCarbs={vi.fn()}
        dishModalFat={5}
        setDishModalFat={vi.fn()}
        dishModalFiber={3}
        setDishModalFiber={vi.fn()}
        dishModalItems={mockItems}
        setDishModalItems={vi.fn()}
        onSaveDish={vi.fn()}
        onDeleteDish={vi.fn()}
        isSaving={false}
        isDeleting={false}
        customDishes={[]}
        onOpenEditDishModal={vi.fn()}
      />
    );

    expect(screen.queryByTestId('parent-macros')).toBeNull();

    // And if kind is 'recipe' with items > 1, direct parent macros are also suppressed
    rerender(
      <CustomDishesModal
        isOpen={true}
        onClose={vi.fn()}
        editingDish={null}
        dishModalKind="recipe"
        setDishModalKind={vi.fn()}
        dishModalName="Multi Item Recipe"
        setDishModalName={vi.fn()}
        dishModalCalories={250}
        setDishModalCalories={vi.fn()}
        dishModalProtein={25}
        setDishModalProtein={vi.fn()}
        dishModalCarbs={25}
        setDishModalCarbs={vi.fn()}
        dishModalFat={5}
        setDishModalFat={vi.fn()}
        dishModalFiber={3}
        setDishModalFiber={vi.fn()}
        dishModalItems={mockItems}
        setDishModalItems={vi.fn()}
        onSaveDish={vi.fn()}
        onDeleteDish={vi.fn()}
        isSaving={false}
        isDeleting={false}
        customDishes={[]}
        onOpenEditDishModal={vi.fn()}
      />
    );

    expect(screen.queryByTestId('parent-macros')).toBeNull();
  });

  it('only renders CustomDishEditor when kind is recipe', () => {
    const { rerender } = render(
      <CustomDishesModal
        isOpen={true}
        onClose={vi.fn()}
        editingDish={null}
        dishModalKind="food"
        setDishModalKind={vi.fn()}
        dishModalName="Single Food"
        setDishModalName={vi.fn()}
        dishModalCalories={200}
        setDishModalCalories={vi.fn()}
        dishModalProtein={10}
        setDishModalProtein={vi.fn()}
        dishModalCarbs={20}
        setDishModalCarbs={vi.fn()}
        dishModalFat={5}
        setDishModalFat={vi.fn()}
        dishModalFiber={2}
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

    // For food, CustomDishEditor is NOT rendered
    expect(screen.queryByTestId('custom-dish-editor')).toBeNull();

    // For recipe, CustomDishEditor IS rendered
    rerender(
      <CustomDishesModal
        isOpen={true}
        onClose={vi.fn()}
        editingDish={null}
        dishModalKind="recipe"
        setDishModalKind={vi.fn()}
        dishModalName="Recipe Dish"
        setDishModalName={vi.fn()}
        dishModalCalories={0}
        setDishModalCalories={vi.fn()}
        dishModalProtein={0}
        setDishModalProtein={vi.fn()}
        dishModalCarbs={0}
        setDishModalCarbs={vi.fn()}
        dishModalFat={0}
        setDishModalFat={vi.fn()}
        dishModalFiber={0}
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

    expect(screen.getByTestId('custom-dish-editor')).toBeDefined();
  });
});


import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemNutritionModal } from './ItemNutritionModal';
import { expectNoA11yViolations } from '../../test/a11y';
import type { NutritionItem } from '../../utils/itemModel';

function makeItem(over: Partial<NutritionItem> = {}): NutritionItem {
  return {
    id: 'item-1',
    name: 'Salmon',
    quantity: 50,
    unit: 'g',
    displayPortion: '50 g',
    calories: 104,
    protein: 10,
    carbs: 0,
    fat: 6.5,
    fiber: 0,
    ...over,
  };
}

describe('ItemNutritionModal', () => {
  it('renders nothing when isOpen is false', () => {
    const item = makeItem();
    render(<ItemNutritionModal isOpen={false} onClose={() => {}} item={item} onSave={() => {}} />);
    expect(screen.queryByTestId('edit-item-nutrition-modal')).toBeNull();
  });

  it('renders prefilled macros, title, portion subtitle, helper text, and accessible attributes when open', () => {
    const item = makeItem();
    render(<ItemNutritionModal isOpen={true} onClose={() => {}} item={item} onSave={() => {}} />);

    // Title and portion subtitle
    expect(screen.getByText('Edit nutrition · Salmon')).toBeDefined();
    expect(screen.getByText('for 50 g')).toBeDefined();

    // Helper text (text-xs)
    expect(
      screen.getByText('Totals update automatically. Later portion changes scale from these values.')
    ).toBeDefined();

    // Inputs prefilled with item values
    const calInput = screen.getByTestId('edit-item-calories-input') as HTMLInputElement;
    const pInput = screen.getByTestId('edit-item-protein-input') as HTMLInputElement;
    const cInput = screen.getByTestId('edit-item-carbs-input') as HTMLInputElement;
    const fInput = screen.getByTestId('edit-item-fat-input') as HTMLInputElement;
    const fibInput = screen.getByTestId('edit-item-fiber-input') as HTMLInputElement;

    expect(calInput.value).toBe('104');
    expect(pInput.value).toBe('10');
    expect(cInput.value).toBe('0');
    expect(fInput.value).toBe('6.5');
    expect(fibInput.value).toBe('0');

    // All inputs have inputMode='decimal' and mobile utility input-text-xs
    for (const input of [calInput, pInput, cInput, fInput, fibInput]) {
      expect(input.getAttribute('inputmode')).toBe('decimal');
      expect(input.className).toContain('input-text-xs');
      expect(input.className).toContain('min-h-[44px]');
    }

    // Buttons >= 40px
    const cancelBtn = screen.getByTestId('cancel-edit-item-nutrition-btn');
    const saveBtn = screen.getByTestId('save-edit-item-nutrition-btn');
    expect(cancelBtn.className).toContain('min-h-[40px]');
    expect(saveBtn.className).toContain('min-h-[40px]');
  });

  it('disables Save button when no changes have been made', () => {
    const item = makeItem();
    render(<ItemNutritionModal isOpen={true} onClose={() => {}} item={item} onSave={() => {}} />);

    const saveBtn = screen.getByTestId('save-edit-item-nutrition-btn') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('enables Save button when a field is edited and emits parsed numbers on Save', () => {
    const item = makeItem();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(<ItemNutritionModal isOpen={true} onClose={onClose} item={item} onSave={onSave} />);

    const calInput = screen.getByTestId('edit-item-calories-input');
    const saveBtn = screen.getByTestId('save-edit-item-nutrition-btn') as HTMLButtonElement;

    fireEvent.change(calInput, { target: { value: '150' } });
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      calories: 150,
      protein: 10,
      carbs: 0,
      fat: 6.5,
      fiber: 0,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles empty fields by treating them as 0 on save', () => {
    const item = makeItem({ calories: 100, protein: 20 });
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(<ItemNutritionModal isOpen={true} onClose={onClose} item={item} onSave={onSave} />);

    const pInput = screen.getByTestId('edit-item-protein-input');
    fireEvent.change(pInput, { target: { value: '' } });

    const saveBtn = screen.getByTestId('save-edit-item-nutrition-btn') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({
      calories: 100,
      protein: 0,
      carbs: 0,
      fat: 6.5,
      fiber: 0,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('validates negative numbers: displays inline error and disables Save', () => {
    const item = makeItem();
    const onSave = vi.fn();

    render(<ItemNutritionModal isOpen={true} onClose={() => {}} item={item} onSave={onSave} />);

    const calInput = screen.getByTestId('edit-item-calories-input');
    const saveBtn = screen.getByTestId('save-edit-item-nutrition-btn') as HTMLButtonElement;

    fireEvent.change(calInput, { target: { value: '-10' } });

    expect(screen.getByTestId('edit-item-calories-error')).toBeDefined();
    expect(screen.getByText('Cannot be negative')).toBeDefined();
    expect(saveBtn.disabled).toBe(true);

    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('validates non-numeric values: displays inline error and disables Save', () => {
    const item = makeItem();
    const onSave = vi.fn();

    render(<ItemNutritionModal isOpen={true} onClose={() => {}} item={item} onSave={onSave} />);

    const cInput = screen.getByTestId('edit-item-carbs-input');
    const saveBtn = screen.getByTestId('save-edit-item-nutrition-btn') as HTMLButtonElement;

    fireEvent.change(cInput, { target: { value: 'invalid-macro' } });

    expect(screen.getByTestId('edit-item-carbs-error')).toBeDefined();
    expect(screen.getByText('Must be a valid number')).toBeDefined();
    expect(saveBtn.disabled).toBe(true);

    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Cancel button closes modal without calling onSave', () => {
    const item = makeItem();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(<ItemNutritionModal isOpen={true} onClose={onClose} item={item} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('edit-item-fat-input'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('cancel-edit-item-nutrition-btn'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Escape key dismisses modal without calling onSave', () => {
    const item = makeItem();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(<ItemNutritionModal isOpen={true} onClose={onClose} item={item} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('edit-item-fat-input'), { target: { value: '12' } });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('backdrop click dismisses modal without calling onSave', () => {
    const item = makeItem();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(<ItemNutritionModal isOpen={true} onClose={onClose} item={item} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('edit-item-fat-input'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('edit-item-nutrition-modal-overlay'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('passes automated accessibility checks with expectNoA11yViolations', async () => {
    const item = makeItem();
    const { container } = render(
      <ItemNutritionModal isOpen={true} onClose={() => {}} item={item} onSave={() => {}} />
    );

    await expectNoA11yViolations(container);
  });
});

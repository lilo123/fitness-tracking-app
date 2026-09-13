import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomDishEditor } from './CustomDishEditor';
import type { NutritionItem } from '../../utils/itemModel';

function item(over: Partial<NutritionItem> = {}): NutritionItem {
  return {
    id: 'i1',
    name: 'Rolled oats',
    quantity: 80,
    unit: 'g',
    displayPortion: '1 cup',
    calories: 300,
    protein: 10,
    carbs: 54,
    fat: 5,
    fiber: 8,
    ...over,
  };
}

describe('CustomDishEditor', () => {
  it('renders one row per component and a derived dish total', () => {
    render(
      <CustomDishEditor
        items={[item(), item({ id: 'i2', name: 'Whey', calories: 120, protein: 25, carbs: 3, fat: 1, fiber: 0 })]}
        onChange={() => {}}
      />
    );

    expect(screen.getAllByTestId('dish-item-row')).toHaveLength(2);
    const totals = screen.getByTestId('dish-derived-totals');
    // 300 + 120 = 420 kcal, 10 + 25 = 35 g protein.
    expect(totals.textContent).toContain('420');
    expect(totals.textContent).toContain('35');
  });

  it('adds an empty component with a usable default quantity', () => {
    const onChange = vi.fn();
    render(<CustomDishEditor items={[]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('dish-add-item'));

    const next = onChange.mock.calls[0][0] as NutritionItem[];
    expect(next).toHaveLength(1);
    // A zero quantity would make the row unscalable later.
    expect(next[0].quantity).toBe(1);
    expect(next[0].unit).toBe('unit');
    expect(next[0].calories).toBe(0);
  });

  it('clamps a negative macro to zero rather than passing it to the DB', () => {
    const onChange = vi.fn();
    render(<CustomDishEditor items={[item()]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('dish-item-calories'), { target: { value: '-50' } });

    expect((onChange.mock.calls[0][0] as NutritionItem[])[0].calories).toBe(0);
  });

  it('treats a cleared macro field as zero, not NaN', () => {
    const onChange = vi.fn();
    render(<CustomDishEditor items={[item()]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('dish-item-protein'), { target: { value: '' } });

    const value = (onChange.mock.calls[0][0] as NutritionItem[])[0].protein;
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBe(0);
  });

  it('removes the targeted component and leaves the rest intact', () => {
    const onChange = vi.fn();
    render(
      <CustomDishEditor
        items={[item(), item({ id: 'i2', name: 'Whey' })]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getAllByTestId('dish-item-remove')[0]);

    const next = onChange.mock.calls[0][0] as NutritionItem[];
    expect(next.map((i) => i.id)).toEqual(['i2']);
  });

  it('accepts a decimal quantity without rounding it', () => {
    const onChange = vi.fn();
    render(<CustomDishEditor items={[item()]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('dish-item-quantity'), { target: { value: '12.5' } });

    expect((onChange.mock.calls[0][0] as NutritionItem[])[0].quantity).toBe(12.5);
  });

  it('shows no totals block when there are no components', () => {
    render(<CustomDishEditor items={[]} onChange={() => {}} />);
    expect(screen.queryByTestId('dish-derived-totals')).toBeNull();
  });
});

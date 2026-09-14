import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentRow } from './ComponentRow';
import type { NutritionItem } from '../../utils/itemModel';

function component(over: Partial<NutritionItem> = {}): NutritionItem {
  return {
    id: 'c1',
    name: 'Vietnamese Steamed Egg Meatloaf',
    quantity: 150,
    unit: 'g',
    displayPortion: '1 slice (150g)',
    calories: 182,
    protein: 12.5,
    carbs: 3.2,
    fat: 13.1,
    fiber: 1.2,
    ...over,
  };
}

describe('ComponentRow', () => {
  it('renders 3-zone layout: name, portion chip, all 5 macros, and controls', () => {
    const item = component();
    render(<ComponentRow item={item} reference={item} onChange={() => {}} />);

    // Zone 1: Identity
    expect(screen.getByTestId('component-name').textContent).toBe(item.name);

    // Zone 2: Portion chip + 5 macros
    expect(screen.getByTestId('component-portion-chip').textContent).toBe(item.displayPortion);
    expect(screen.getByText(/182 kcal/)).toBeDefined();
    expect(screen.getByText(/P 12.5/)).toBeDefined();
    expect(screen.getByText(/C 3.2/)).toBeDefined();
    expect(screen.getByText(/F 13.1/)).toBeDefined();
    expect(screen.getByText(/Fib 1.2/)).toBeDefined();

    // Zone 3: Steppers, input, unit chip
    expect(screen.getByTestId('component-quantity-input')).toBeDefined();
    expect((screen.getByTestId('component-quantity-input') as HTMLInputElement).value).toBe('150');
    expect(screen.getByTestId('component-unit-chip')).toBeDefined();
  });

  it('steps quantity up and down and scales macros linearly', () => {
    const item = component({ quantity: 100, calories: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 });
    const onChange = vi.fn();
    render(<ComponentRow item={item} reference={item} onChange={onChange} />);

    // Step up
    fireEvent.click(screen.getByLabelText(/Increase quantity of/));
    expect(onChange).toHaveBeenCalledTimes(1);
    const steppedUp = onChange.mock.calls[0][0] as NutritionItem;
    expect(steppedUp.quantity).toBe(101);
    expect(steppedUp.calories).toBeCloseTo(202, 1);

    // Step down
    fireEvent.click(screen.getByLabelText(/Decrease quantity of/));
    expect(onChange).toHaveBeenCalledTimes(2);
    const steppedDown = onChange.mock.calls[1][0] as NutritionItem;
    expect(steppedDown.quantity).toBe(99);
    expect(steppedDown.calories).toBeCloseTo(198, 1);
  });

  it('preserves edited unit when quantity is subsequently adjusted', () => {
    // Reference has initial unit 'g'
    const reference = component({ quantity: 100, unit: 'g' });
    // Item has been updated by user to 'ml'
    const itemWithNewUnit = component({ quantity: 100, unit: 'ml' });
    const onChange = vi.fn();

    render(<ComponentRow item={itemWithNewUnit} reference={reference} onChange={onChange} />);

    // Tap increase quantity button
    fireEvent.click(screen.getByLabelText(/Increase quantity of/));
    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as NutritionItem;

    // Must preserve 'ml', NOT revert to reference's 'g'
    expect(result.unit).toBe('ml');
    expect(result.quantity).toBe(101);

    // Also verify commit via text input preserves unit
    const input = screen.getByTestId('component-quantity-input');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);

    const committed = onChange.mock.calls[1][0] as NutritionItem;
    expect(committed.unit).toBe('ml');
    expect(committed.quantity).toBe(250);
  });

  it('hides mutating controls when read-only', () => {
    const item = component();
    render(
      <ComponentRow
        item={item}
        reference={item}
        readOnly
        onRemove={() => {}}
        onSaveToQuickLog={() => {}}
      />
    );

    expect(screen.getByTestId('component-name')).toBeDefined();
    expect(screen.queryByTestId('component-quantity-input')).toBeNull();
    expect(screen.queryByTestId('component-unit-chip')).toBeNull();
    expect(screen.queryByTestId('component-actions')).toBeNull();
  });

  it('exposes overflow actions for save to quick log and remove', () => {
    const onSave = vi.fn();
    const onRemove = vi.fn();
    const item = component();
    render(
      <ComponentRow
        item={item}
        reference={item}
        onChange={() => {}}
        onSaveToQuickLog={onSave}
        onRemove={onRemove}
      />
    );

    fireEvent.click(screen.getByTestId('component-actions'));
    expect(screen.getByTestId('component-save-quick-log')).toBeDefined();
    expect(screen.getByTestId('component-remove')).toBeDefined();

    fireEvent.click(screen.getByTestId('component-save-quick-log'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('renders colored macro badges and an elegant constrained quantity stepper', () => {
    const item = component();
    render(<ComponentRow item={item} reference={item} onChange={() => {}} />);

    // Macro color classes
    expect(screen.getByText(/182 kcal/).className).toContain('text-amber-400');
    expect(screen.getByText(/P 12.5/).className).toContain('text-cyan-400');
    expect(screen.getByText(/C 3.2/).className).toContain('text-emerald-400');
    expect(screen.getByText(/F 13.1/).className).toContain('text-violet-400');
    expect(screen.getByText(/Fib 1.2/).className).toContain('text-teal-400');

    // Stepper input should be elegantly constrained rather than stretching full-width
    const input = screen.getByTestId('component-quantity-input');
    expect(input.className).toContain('w-16');
    expect(input.className).not.toContain('w-full');
    // text-base on mobile prevents iOS Safari auto-zoom on input focus
    expect(input.className).toContain('text-base');
  });

  it('formats floating point quantity drift to 1 decimal place', () => {
    const item = component({ quantity: 40.00000000001 });
    render(<ComponentRow item={item} reference={item} onChange={() => {}} />);

    const input = screen.getByTestId('component-quantity-input') as HTMLInputElement;
    expect(input.value).toBe('40');
  });

  it('rounds scaled macros to 1 decimal place on commit', () => {
    // 33g reference with fractional macros
    const ref = component({
      quantity: 33,
      calories: 115.5,
      protein: 19.806,
      carbs: 1.633,
      fat: 2.858,
      fiber: 0,
    });
    const onChange = vi.fn();
    render(<ComponentRow item={ref} reference={ref} onChange={onChange} />);

    const input = screen.getByTestId('component-quantity-input');
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledTimes(1);
    const scaled = onChange.mock.calls[0][0] as NutritionItem;
    // 40 / 33 * 115.5 = 140.0025 -> 140
    expect(scaled.calories).toBe(140);
    // 40 / 33 * 19.806 = 24.0072 -> 24
    expect(scaled.protein).toBe(24);
    // 40 / 33 * 1.633 = 1.979 -> 2
    expect(scaled.carbs).toBe(2);
    // 40 / 33 * 2.858 = 3.464 -> 3.5
    expect(scaled.fat).toBe(3.5);
    expect(scaled.fiber).toBe(0);
  });
});

import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditMealModal } from './EditMealModal';
import { friendlyError } from '../../utils/nutritionErrors';
import { expectNoA11yViolations } from '../../test/a11y';
import type { NutritionLog } from '../../types/database';
import type { NutritionItem } from '../../utils/itemModel';
import { createSupabaseBuilder, getRecordedSelects, getRecordedTables, clearMockHistory } from '../../test/supabaseBuilderMock';

const mockUpdate = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const builder = createSupabaseBuilder(table, [{ id: 'log-1' }]);
      builder.update = vi.fn((payload: any) => {
        mockUpdate(payload);
        return createSupabaseBuilder(table, [{ id: 'log-1' }]);
      }) as any;
      return builder;
    }),
  },
}));

function component(over: Partial<NutritionItem> = {}): NutritionItem {
  return {
    id: 'c1',
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

function meal(items: NutritionItem[] | null): NutritionLog {
  return {
    id: 'log-1',
    user_id: 'u1',
    food_name: 'Google Breakkie',
    calories: 420,
    protein: 35,
    carbs: 57,
    fat: 6,
    fiber: 8,
    meal_type: 'Breakfast',
    serving_size: 1,
    serving_unit: 'serving',
    logged_at: '2026-01-01T08:00:00Z',
    items,
  };
}

function renderModal(m: NutritionLog) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EditMealModal isOpen meal={m} onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe('EditMealModal with a stored breakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockHistory();
  });

  const items = [
    component(),
    component({ id: 'c2', name: 'Whey', calories: 120, protein: 25, carbs: 3, fat: 1, fiber: 0 }),
  ];

  it('locks the macro fields and explains why', () => {
    renderModal(meal(items));

    expect(screen.getByTestId('edit-meal-derived-note')).toBeDefined();
    for (const field of ['calories', 'protein', 'carbs', 'fat', 'fiber']) {
      const input = screen.getByTestId(`edit-meal-${field}-input`) as HTMLInputElement;
      expect(input.readOnly).toBe(true);
    }
  });

  it('shows the component sum, not the stored parent scalar, when they disagree', () => {
    const drifted = { ...meal(items), calories: 999 };
    renderModal(drifted);

    expect((screen.getByTestId('edit-meal-calories-input') as HTMLInputElement).value).toBe('420');
  });

  it('writes the derived sum so the parent = sum(items) constraint holds', async () => {
    renderModal(meal(items));

    fireEvent.change(screen.getByTestId('edit-meal-name-input'), {
      target: { value: 'Renamed Breakkie' },
    });
    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const payload = mockUpdate.mock.calls[0][0] as any;
    expect(payload.food_name).toBe('Renamed Breakkie');
    expect(payload.calories).toBe(420);
    expect(payload.protein).toBe(35);
    // The modal must not touch `items`; a partial write is what breaks the row.
    expect('items' in payload).toBe(false);

    expect(getRecordedTables()).toContain('nutrition_logs');
    expect(getRecordedSelects()).toContainEqual({
      table: 'nutrition_logs',
      projection: 'WILDCARD_MUTATION_RETURN',
    });
  });

  it('still allows free macro editing when there is no breakdown', async () => {
    renderModal(meal(null));

    const calories = screen.getByTestId('edit-meal-calories-input') as HTMLInputElement;
    expect(calories.readOnly).toBe(false);
    expect(screen.queryByTestId('edit-meal-derived-note')).toBeNull();

    fireEvent.change(calories, { target: { value: '777' } });
    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect((mockUpdate.mock.calls[0][0] as any).calories).toBe(777);
  });

  it('treats a one-component breakdown as no breakdown', () => {
    renderModal(meal([component()]));
    expect((screen.getByTestId('edit-meal-calories-input') as HTMLInputElement).readOnly).toBe(false);
  });

  it('rounds multi-decimal floating macros to 1 decimal in inputs and updates summary bar with derived values', () => {
    const rawMeal = {
      ...meal(items),
      calories: 140.0024,
      protein: 24.0075,
      carbs: 1.979999,
      fat: 3.465,
      fiber: 0,
    };
    renderModal(rawMeal);

    // Derived values should be displayed (300 + 120 = 420, 10 + 25 = 35)
    expect((screen.getByTestId('edit-meal-calories-input') as HTMLInputElement).value).toBe('420');
    expect((screen.getByTestId('edit-meal-protein-input') as HTMLInputElement).value).toBe('35');

    // Summary bar should display derived values and colored text
    expect(screen.getByText(/420 kcal/)).toBeDefined();
    expect(screen.getByText(/35g P/)).toBeDefined();
  });

  it('mounts an idle live region that persists and populates when validation fails', async () => {
    const { container } = renderModal(meal(null));

    // Idle: role="alert" live region exists from the start and is silent
    const alertRegion = container.querySelector('[role="alert"]');
    expect(alertRegion).not.toBeNull();
    expect(alertRegion).toHaveTextContent('');
    expect(screen.queryByTestId('edit-meal-error')).toBeNull();

    // Trigger error by clearing name and saving
    fireEvent.change(screen.getByTestId('edit-meal-name-input'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    // Same live region now holds the error message
    expect(alertRegion).toHaveTextContent('Meal name is required');
    expect(screen.getByTestId('edit-meal-error')).toBeDefined();
  });

  it('has no a11y violations', async () => {
    const { container } = renderModal(meal(null));
    await expectNoA11yViolations(container);
  });
});

describe('friendlyError', () => {
  it('translates the parent/items sum constraint', () => {
    const msg = friendlyError({
      message:
        'new row for relation "nutrition_logs" violates check constraint "chk_nl_parent_equals_items_sum"',
    });
    expect(msg).toMatch(/components/i);
    expect(msg).not.toMatch(/check constraint/i);
  });

  it('translates the items shape constraint', () => {
    expect(friendlyError({ message: 'violates check constraint "chk_cd_items_shape"' })).toMatch(
      /invalid breakdown/i
    );
  });

  it('translates a non-negative constraint', () => {
    expect(
      friendlyError({ message: 'violates check constraint "chk_cd_calories_non_negative"' })
    ).toBe('Macros cannot be negative.');
  });

  it('translates an RLS rejection', () => {
    expect(
      friendlyError({ message: 'new row violates row-level security policy' })
    ).toMatch(/permission/i);
  });

  it('passes an unrecognised message through unchanged', () => {
    expect(friendlyError({ message: 'network unreachable' })).toBe('network unreachable');
  });

  it('passes a raw string error through unchanged', () => {
    expect(friendlyError('raw socket failure')).toBe('raw socket failure');
  });

  it('falls back to a generic message when there is none', () => {
    expect(friendlyError({})).toBe('Failed to update meal log. Please try again.');
  });

  describe('accessibility and focus management', () => {
    it('traps focus, restores focus on close, and closes on Escape', () => {
      function Wrapper() {
        const [open, setOpen] = useState(false);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return (
          <QueryClientProvider client={client}>
            <button data-testid="opener-btn" onClick={() => setOpen(true)}>
              Open
            </button>
            <EditMealModal
              isOpen={open}
              meal={meal(null)}
              onClose={() => setOpen(false)}
            />
          </QueryClientProvider>
        );
      }

      render(<Wrapper />);
      const opener = screen.getByTestId('opener-btn');
      opener.focus();
      fireEvent.click(opener);

      // 1. Dialog exists with ARIA attributes
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'edit-meal-modal-title');

      // 2. Focus moved into dialog
      const firstFocusable = screen.getByTestId('close-edit-meal-btn');
      expect(document.activeElement).toBe(firstFocusable);

      // 3. Tab wraps from last focusable to first focusable
      const saveBtn = screen.getByTestId('save-edit-meal-btn');
      saveBtn.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(firstFocusable);

      // 4. Shift+Tab wraps from first focusable to last focusable
      firstFocusable.focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(saveBtn);

      // 5. Escape closes the modal and restores focus to opener
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  });
});

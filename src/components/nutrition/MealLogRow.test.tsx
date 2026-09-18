import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MealLogRow } from './MealLogRow';
import type { NutritionLog } from '../../types/database';
import type { NutritionItem } from '../../utils/itemModel';
import { supabase } from '../../lib/supabase';
import {
  createSupabaseBuilder,
  getRecordedSelects,
  clearMockHistory,
} from '../../test/supabaseBuilderMock';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
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

function log(items: NutritionItem[] | null): NutritionLog {
  const sum = (k: keyof NutritionItem) =>
    (items ?? []).reduce((a, i) => a + (i[k] as number), 0);
  return {
    id: 'log-1',
    user_id: 'u1',
    food_name: 'Google Breakkie',
    calories: items ? sum('calories') : 500,
    protein: items ? sum('protein') : 30,
    carbs: items ? sum('carbs') : 50,
    fat: items ? sum('fat') : 20,
    fiber: items ? sum('fiber') : 6,
    meal_type: 'Breakfast',
    logged_at: '2026-01-01T08:00:00Z',
    items,
  };
}

const noop = () => {};

describe('MealLogRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockHistory();
    (supabase.from as any).mockImplementation((table: string) =>
      createSupabaseBuilder(table, { data: null, error: null })
    );
  });

  it('renders no accordion affordance for a single-component or plain log', () => {
    render(<MealLogRow log={log(null)} onEdit={noop} onDelete={noop} />);

    // Every pre-existing production log is a leaf. If they all looked
    // expandable the feature would look broken on day one.
    expect(screen.queryByTestId('meal-log-accordion-trigger')).toBeNull();
    expect(screen.queryByTestId('meal-log-count-badge')).toBeNull();
  });

  it('treats a one-item breakdown as a leaf, not a one-child accordion', () => {
    render(<MealLogRow log={log([component()])} onEdit={noop} onDelete={noop} />);
    expect(screen.queryByTestId('meal-log-accordion-trigger')).toBeNull();
  });

  it('renders no accordion affordance when items is omitted from projection (undefined)', () => {
    const rowWithoutItems: NutritionLog = {
      id: 'log-no-items',
      user_id: 'u1',
      food_name: 'Plain Rice',
      calories: 200,
      protein: 4,
      carbs: 45,
      fat: 1,
      fiber: 1,
      meal_type: 'Lunch',
      logged_at: '2026-01-01T12:00:00Z',
      // items omitted
    };
    render(<MealLogRow log={rowWithoutItems} onEdit={noop} onDelete={noop} />);
    expect(screen.queryByTestId('meal-log-accordion-trigger')).toBeNull();
    expect(screen.queryByTestId('meal-log-count-badge')).toBeNull();
  });

  it('expands a multi-component log and lists its components', () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120 })];
    render(<MealLogRow log={log(items)} onEdit={noop} onDelete={noop} />);

    const trigger = screen.getByTestId('meal-log-accordion-trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('meal-log-count-badge').textContent).toBe('2');
    expect(screen.queryByTestId('meal-log-panel')).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByTestId('meal-log-panel');
    expect(within(panel).getAllByTestId('component-row')).toHaveLength(2);
    expect(trigger.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
  });

  it('hides every mutating affordance when read-only', () => {
    const items = [component(), component({ id: 'c2' })];
    render(
      <MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={noop} readOnly />
    );

    expect(screen.queryByTestId('meal-actions-log-1')).toBeNull();

    // Expanding is still permitted: a coach may read the breakdown.
    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));
    expect(screen.getByTestId('meal-log-panel')).toBeDefined();
    expect(screen.queryByTestId('dish-scale-bar')).toBeNull();
    // R-20: the per-component editor is a write too. A coach's UPDATE is
    // rejected by RLS, so offering these would only produce failures.
    expect(screen.queryByTestId('component-quantity-input')).toBeNull();
    expect(screen.queryByTestId('component-unit-chip')).toBeNull();
  });

  it('persists a single component edited to an absolute quantity', () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const onItemsChange = vi.fn();
    render(
      <MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />
    );

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));

    // The whole-dish bar only offers four factors. Any other amount — and the
    // user's actual complaint, that portions were multipliers rather than real
    // quantities — needs this.
    const quantity = screen.getAllByTestId('component-quantity-input')[0] as HTMLInputElement;
    expect(quantity.value).toBe('80');
    fireEvent.change(quantity, { target: { value: '40' } });
    fireEvent.blur(quantity);

    const next = onItemsChange.mock.calls[0][1] as NutritionItem[];
    // Only the edited component moves, and it moves linearly.
    expect(next[0].quantity).toBe(40);
    expect(next[0].calories).toBe(150);
    expect(next[1].calories).toBe(120);
  });

  it('exposes edit and delete only after the overflow menu is opened', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<MealLogRow log={log(null)} onEdit={onEdit} onDelete={onDelete} />);

    expect(screen.queryByTestId('edit-meal-log-1')).toBeNull();

    fireEvent.click(screen.getByTestId('meal-actions-log-1'));
    fireEvent.click(screen.getByTestId('delete-meal-log-1'));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('scales every component and reports the scaled set, with x1 always reachable', () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const onItemsChange = vi.fn();
    render(<MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));

    const halved = onItemsChange.mock.calls[0][1] as NutritionItem[];
    expect(halved.map((i) => i.calories)).toEqual([150, 60]);
    expect(halved.map((i) => i.quantity)).toEqual([40, 40]);

    // The old +/-0.5 stepper had a one-way ladder from which x1 was
    // unreachable; here it is always one tap away.
    fireEvent.click(screen.getByTestId('dish-scale-1'));
    const restored = onItemsChange.mock.calls[1][1] as NutritionItem[];
    expect(restored.map((i) => i.calories)).toEqual([300, 120]);
  });

  it('keeps scale factors absolute when each scale is persisted back into the row', () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const onItemsChange = vi.fn();
    const { rerender } = render(
      <MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />
    );

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));

    // Simulate the write landing and the query refetching: the row now arrives
    // with the halved components as its stored state.
    const halved = onItemsChange.mock.calls[0][1] as NutritionItem[];
    rerender(<MealLogRow log={log(halved)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);

    fireEvent.click(screen.getByTestId('dish-scale-0.5'));
    const again = onItemsChange.mock.calls[1][1] as NutritionItem[];
    // Still half of the original, not a quarter.
    expect(again.map((i) => i.calories)).toEqual([150, 60]);

    fireEvent.click(screen.getByTestId('dish-scale-1'));
    const back = onItemsChange.mock.calls[2][1] as NutritionItem[];
    expect(back.map((i) => i.calories)).toEqual([300, 120]);
  });

  it('shows totals derived from components rather than the stored parent scalar', () => {
    const items = [component({ calories: 100 }), component({ id: 'c2', calories: 250 })];
    const drifted = { ...log(items), calories: 999 };
    render(<MealLogRow log={drifted} onEdit={noop} onDelete={noop} />);

    expect(screen.getByText(/350 kcal/)).toBeDefined();
    expect(screen.queryByText(/999 kcal/)).toBeNull();
  });

  it('ignores a malformed items payload instead of crashing', () => {
    const broken = { ...log(null), items: 'not an array' as unknown as NutritionItem[] };
    render(<MealLogRow log={broken} onEdit={noop} onDelete={noop} />);

    expect(screen.getByTestId('meal-log-item')).toBeDefined();
    expect(screen.queryByTestId('meal-log-accordion-trigger')).toBeNull();
    expect(screen.getByText(/500 kcal/)).toBeDefined();
  });

  it('rolls a rejected write back to the stored components and shows the reason', async () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    // Exactly what Phase 5 returns when the parent no longer matches Σ(items).
    const onItemsChange = vi
      .fn()
      .mockRejectedValueOnce({
        message:
          'new row for relation "nutrition_logs" violates check constraint "chk_nl_parent_equals_items_sum"',
      });
    render(<MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));

    // Optimistic: the halved total is on screen before the write lands.
    expect(screen.getByText(/210 kcal/)).toBeDefined();

    // Once the write is rejected the row must not keep showing a number the
    // database refused.
    const alert = await screen.findByTestId('meal-log-error');
    expect(alert.textContent).toMatch(/no longer match its components/);
    expect(screen.getByText(/420 kcal/)).toBeDefined();
    expect(screen.queryByText(/210 kcal/)).toBeNull();
    expect((screen.getAllByTestId('component-quantity-input')[0] as HTMLInputElement).value).toBe('80');

    // The next attempt clears the stale message.
    fireEvent.click(screen.getByTestId('dish-scale-1'));
    expect(screen.queryByTestId('meal-log-error')).toBeNull();
  });

  it('rolls back to the last persisted set, not to the stored row, after a partial sequence', async () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const onItemsChange = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ message: 'network unreachable' });
    render(<MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));

    // First write succeeds: 210 kcal is now the persisted truth.
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));
    await waitFor(() => expect(onItemsChange).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/210 kcal/)).toBeDefined();

    // Second write fails: the row returns to 210, not to the row's own 420.
    fireEvent.click(screen.getByTestId('dish-scale-2'));
    expect(screen.getByText(/840 kcal/)).toBeDefined();

    const alert = await screen.findByTestId('meal-log-error');
    // A non-constraint error is passed through verbatim by friendlyError.
    expect(alert.textContent).toBe('network unreachable');
    expect(screen.getByText(/210 kcal/)).toBeDefined();
  });

  it('rolls back when the persist handler throws synchronously', () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const onItemsChange = vi.fn(() => {
      throw new Error('offline');
    });
    render(<MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));

    expect(screen.getByTestId('meal-log-error').textContent).toBe('offline');
    expect(screen.getByText(/420 kcal/)).toBeDefined();
  });

  it('lands on a persisted value when two overlapping writes are both rejected', async () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const deferred = () => {
      let reject!: (err: unknown) => void;
      const promise = new Promise((_res, rej) => {
        reject = rej;
      });
      return { promise, reject };
    };
    const first = deferred();
    const second = deferred();
    const onItemsChange = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);
    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));

    // Two scale factors tapped before either write resolves.
    fireEvent.click(screen.getByTestId('dish-scale-0.5')); // 210, in flight
    fireEvent.click(screen.getByTestId('dish-scale-2')); // 840, in flight

    // The superseded write fails first. It must not move the row: 840 belongs
    // to a later write that has not reported yet.
    first.reject({ message: 'first rejected' });
    await waitFor(() => expect(onItemsChange).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/840 kcal/)).toBeDefined();
    expect(screen.queryByTestId('meal-log-error')).toBeNull();

    // Now the live write fails too. The row must land on 420 — the stored row,
    // the only value the database ever confirmed — and never on 210, which was
    // merely the first tap's optimistic guess.
    second.reject({ message: 'second rejected' });
    const alert = await screen.findByTestId('meal-log-error');
    expect(alert.textContent).toBe('second rejected');
    expect(screen.getByText(/420 kcal/)).toBeDefined();
    expect(screen.queryByText(/210 kcal/)).toBeNull();
  });

  it('lets a refetch carrying different components supersede the optimistic overlay', async () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const onItemsChange = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />
    );

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));
    await waitFor(() => expect(screen.getByText(/210 kcal/)).toBeDefined());

    // The meal is then changed somewhere else — EditMealModal, another device —
    // and the query refetches. The overlay must not keep shadowing it, or the
    // row displays numbers the database does not hold.
    const edited = [component({ calories: 999 }), component({ id: 'c2', name: 'Whey', calories: 1 })];
    rerender(<MealLogRow log={log(edited)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);

    expect(screen.getByText(/1000 kcal/)).toBeDefined();
    expect(screen.queryByText(/210 kcal/)).toBeNull();
  });

  it('clears error message when fresh server state arrives', async () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const onItemsChange = vi.fn().mockRejectedValueOnce({ message: 'network down' });
    const { rerender } = render(
      <MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />
    );

    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));

    const alert = await screen.findByTestId('meal-log-error');
    expect(alert.textContent).toBe('network down');

    // Fresh server state arrives (e.g. from query refetch after another change)
    rerender(
      <MealLogRow
        log={{ ...log(items), items: [component({ calories: 350 }), component({ id: 'c2', calories: 120 })] }}
        onEdit={noop}
        onDelete={noop}
        onItemsChange={onItemsChange}
      />
    );

    // Stale error must be cleared
    expect(screen.queryByTestId('meal-log-error')).toBeNull();
  });

  it('does not allow an older out-of-order write to clobber a newer persisted state', async () => {
    const items = [component(), component({ id: 'c2', name: 'Whey', calories: 120, protein: 25 })];
    const deferred = () => {
      let resolve!: (val: unknown) => void;
      const promise = new Promise((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const first = deferred();
    const second = deferred();
    const onItemsChange = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockRejectedValueOnce({ message: 'third write failed' });

    render(<MealLogRow log={log(items)} onEdit={noop} onDelete={noop} onItemsChange={onItemsChange} />);
    fireEvent.click(screen.getByTestId('meal-log-accordion-trigger'));

    // Write 1 (halved: 210) and Write 2 (doubled: 840)
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));
    fireEvent.click(screen.getByTestId('dish-scale-2'));

    // Write 2 resolves first!
    second.resolve(undefined);
    await waitFor(() => expect(screen.getByText(/840 kcal/)).toBeDefined());

    // Write 1 resolves second (out of order). It must NOT overwrite persisted state.
    first.resolve(undefined);

    // Now Write 3 is triggered and fails. It must roll back to Write 2 (840 kcal), NOT Write 1 (210 kcal).
    fireEvent.click(screen.getByTestId('dish-scale-1'));
    const alert = await screen.findByTestId('meal-log-error');
    expect(alert.textContent).toBe('third write failed');
    expect(screen.getByText(/840 kcal/)).toBeDefined();
    expect(screen.queryByText(/210 kcal/)).toBeNull();
  });

  it('does not fan out queries on mount when items are omitted and fetches exactly 1 query on expand', async () => {
    const multiItems = [
      component({ id: 'c1', name: 'Salmon', calories: 300 }),
      component({ id: 'c2', name: 'Rice', calories: 200 }),
    ];

    const rows: (NutritionLog & { has_components?: boolean })[] = Array.from({ length: 10 }, (_, i) => ({
      id: `log-multi-${i}`,
      user_id: 'u1',
      food_name: `Meal ${i}`,
      calories: 500,
      protein: 40,
      carbs: 45,
      fat: 15,
      fiber: 5,
      meal_type: 'Dinner',
      logged_at: '2026-01-01T18:00:00Z',
      has_components: i === 0,
    }));

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return createSupabaseBuilder('nutrition_logs', {
          data: { id: 'log-multi-0', items: multiItems },
          error: null,
        });
      }
      return createSupabaseBuilder(table, { data: null, error: null });
    });

    render(
      <div>
        {rows.map((r) => (
          <MealLogRow key={r.id} log={r} onEdit={noop} onDelete={noop} />
        ))}
      </div>
    );

    // Assert zero queries before expand: eliminates the N+1 fan-out regression
    const queriesBefore = getRecordedSelects().filter((s) => s.table === 'nutrition_logs');
    expect(queriesBefore.length).toBe(0);

    // Assert honest conservative presentation: only row 0 has trigger, rows 1-9 render as leaves
    const triggers = screen.queryAllByTestId('meal-log-accordion-trigger');
    expect(triggers).toHaveLength(1);

    // Expand the single expandable row
    fireEvent.click(triggers[0]);

    // Assert exactly 1 query after one expand (lazy on-demand fetch)
    await waitFor(() => {
      const queriesAfter = getRecordedSelects().filter((s) => s.table === 'nutrition_logs');
      expect(queriesAfter.length).toBe(1);
    });

    expect(getRecordedSelects()).toContainEqual({
      table: 'nutrition_logs',
      projection: 'id, items',
    });

    // Components rendered in panel
    expect(await screen.findByTestId('meal-log-panel')).toBeDefined();
    expect(screen.getByText('Salmon')).toBeDefined();
    expect(screen.getByText('Rice')).toBeDefined();
  });

  it('surfaces an error state with retry button when on-demand fetch fails on expand and allows retry', async () => {
    const rowWithComponents: NutritionLog & { has_components?: boolean } = {
      id: 'log-fetch-error-test',
      user_id: 'u1',
      food_name: 'Failed Fetch Meal',
      calories: 400,
      protein: 30,
      carbs: 40,
      fat: 10,
      fiber: 4,
      meal_type: 'Lunch',
      logged_at: '2026-01-01T12:00:00Z',
      has_components: true,
    };

    // First attempt: on-demand fetch fails
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return createSupabaseBuilder('nutrition_logs', {
          data: null,
          error: { message: 'Network timeout loading components' },
        });
      }
      return createSupabaseBuilder(table, { data: null, error: null });
    });

    render(<MealLogRow log={rowWithComponents} onEdit={noop} onDelete={noop} />);

    // 0 queries on mount
    expect(getRecordedSelects().filter((s) => s.table === 'nutrition_logs').length).toBe(0);

    // Trigger is rendered because has_components is true
    const trigger = screen.getByTestId('meal-log-accordion-trigger');
    fireEvent.click(trigger);

    // Must surface error state with role="alert" and data-testid="meal-log-fetch-error"
    const errorAlert = await screen.findByTestId('meal-log-fetch-error');
    expect(errorAlert.getAttribute('role')).toBe('alert');
    expect(errorAlert.textContent).toContain('Network timeout loading components');

    // Must provide retry button
    const retryBtn = screen.getByTestId('meal-log-fetch-retry');
    expect(retryBtn).toBeDefined();

    // Second attempt: retry succeeds with 2 components
    const multiItems = [
      component({ id: 'c1', name: 'Chicken', calories: 250 }),
      component({ id: 'c2', name: 'Rice', calories: 150 }),
    ];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return createSupabaseBuilder('nutrition_logs', {
          data: { id: 'log-fetch-error-test', items: multiItems },
          error: null,
        });
      }
      return createSupabaseBuilder(table, { data: null, error: null });
    });

    // Click retry
    fireEvent.click(retryBtn);

    // Error alert disappears, and panel expands
    await waitFor(() => {
      expect(screen.queryByTestId('meal-log-fetch-error')).toBeNull();
    });
    expect(await screen.findByTestId('meal-log-panel')).toBeDefined();
    expect(screen.getByText('Chicken')).toBeDefined();
    expect(screen.getByText('Rice')).toBeDefined();
  });

  it('maintains conservative leaf presentation (expandable = false) when has_components is omitted', () => {
    const leafRows: NutritionLog[] = Array.from({ length: 10 }, (_, i) => ({
      id: `log-leaf-${i}`,
      user_id: 'u1',
      food_name: `Plain Meal ${i}`,
      calories: 300,
      protein: 20,
      carbs: 30,
      fat: 10,
      fiber: 2,
      meal_type: 'Breakfast',
      logged_at: '2026-01-01T08:00:00Z',
    }));

    render(
      <div>
        {leafRows.map((r) => (
          <MealLogRow key={r.id} log={r} onEdit={noop} onDelete={noop} />
        ))}
      </div>
    );

    // No queries issued
    expect(getRecordedSelects().filter((s) => s.table === 'nutrition_logs').length).toBe(0);
    // 0 accordion triggers or badges rendered
    expect(screen.queryAllByTestId('meal-log-accordion-trigger')).toHaveLength(0);
    expect(screen.queryAllByTestId('meal-log-count-badge')).toHaveLength(0);
  });
});



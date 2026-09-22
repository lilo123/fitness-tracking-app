import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickLogFavorites } from './QuickLogFavorites';
import type { CustomDish } from '../../types/database';

function createMockDish(overrides: Partial<CustomDish & { notes?: string | null }> = {}): CustomDish & { notes?: string | null } {
  return {
    id: 'dish-1',
    user_id: 'test-user',
    name: 'Protein Oatmeal',
    calories: 420,
    protein: 35,
    carbs: 55,
    fat: 6,
    fiber: 8,
    created_at: '2026-03-01T10:00:00Z',
    kind: 'recipe',
    use_count: 5,
    notes: 'with blueberries and whey',
    ...overrides,
  };
}

describe('QuickLogFavorites (Phase 5.1 Redesign)', () => {

  it('renders top 4 dishes in a 2x2 bento grid and provides Browse & Search All button', () => {
    const dishes = Array.from({ length: 6 }, (_, i) =>
      createMockDish({
        id: `dish-${i + 1}`,
        name: `Dish ${i + 1}`,
        use_count: 10 - i,
      })
    );

    render(
      <QuickLogFavorites
        customDishes={dishes}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    // Only top 4 dishes should be rendered inline
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByTestId(`custom-dish-card-dish-${i}`)).toBeDefined();
    }
    // Dishes beyond top 4 must NOT be rendered inline
    expect(screen.queryByTestId('custom-dish-card-dish-5')).toBeNull();
    expect(screen.queryByTestId('custom-dish-card-dish-6')).toBeNull();

    // Must have the Browse & Search All button
    expect(screen.getByTestId('open-favorites-sheet-btn')).toBeDefined();
  });

  it('renders clean empty state when no custom dishes exist', () => {
    render(
      <QuickLogFavorites
        customDishes={[]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    expect(screen.getByText(/No saved custom dishes yet/i)).toBeDefined();
    expect(screen.queryByTestId('open-favorites-sheet-btn')).toBeNull();
  });

  it('resolves NEW-10 defect: primary card button carries staging onClick without nested buttons', () => {
    const onStageCustomDish = vi.fn();
    const dish = createMockDish({ id: 'dish-new-10', name: 'Clean Salmon' });

    render(
      <QuickLogFavorites
        customDishes={[dish]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={onStageCustomDish}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    const stagingCardBtn = screen.getByTestId('custom-dish-card-dish-new-10');
    // Staging button is a semantic <button>
    expect(stagingCardBtn.tagName.toLowerCase()).toBe('button');
    // No nested buttons exist inside the staging button
    expect(stagingCardBtn.querySelectorAll('button').length).toBe(0);

    // Clicking stages dish
    fireEvent.click(stagingCardBtn);
    expect(onStageCustomDish).toHaveBeenCalledWith(dish);
  });

  it('renders notes affordance icon and includes note in aria-label when dish has notes', () => {
    const dishWithNotes = createMockDish({
      id: 'dish-notes',
      name: 'Greek Yogurt Bowl',
      notes: 'Contains chia seeds & honey',
    });

    render(
      <QuickLogFavorites
        customDishes={[dishWithNotes]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    const card = screen.getByTestId('custom-dish-card-dish-notes');
    const ariaLabel = card.getAttribute('aria-label') || '';
    expect(ariaLabel.includes('note attached')).toBe(true);

    const noteIcons = screen.getAllByLabelText('Has saved note');
    expect(noteIcons.length).toBeGreaterThan(0);
  });

  it('triggers edit modal and 1-tap quick log from bento card action buttons', () => {
    const onOpenEditDishModal = vi.fn();
    const onQuickLogCustomDishDirect = vi.fn();
    const dish = createMockDish({ id: 'dish-actions', name: 'Steak & Rice' });

    render(
      <QuickLogFavorites
        customDishes={[dish]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={onOpenEditDishModal}
        onQuickLogCustomDishDirect={onQuickLogCustomDishDirect}
        onDismissToast={vi.fn()}
      />
    );

    const editBtn = screen.getByTestId('edit-dish-btn-dish-actions');
    fireEvent.click(editBtn);
    expect(onOpenEditDishModal).toHaveBeenCalledWith(dish);

    const quickLogBtn = screen.getByTestId('quick-log-btn-dish-actions');
    fireEvent.click(quickLogBtn);
    expect(onQuickLogCustomDishDirect).toHaveBeenCalled();
  });

  it('sorts dishes strictly by use_count desc, then created_at desc without pin UI', () => {
    const dishA = createMockDish({ id: 'dish-a', name: 'Dish A', use_count: 3, created_at: '2026-03-01T00:00:00Z' });
    const dishB = createMockDish({ id: 'dish-b', name: 'Dish B', use_count: 10, created_at: '2026-02-01T00:00:00Z' });
    const dishC = createMockDish({ id: 'dish-c', name: 'Dish C', use_count: 5, created_at: '2026-03-05T00:00:00Z' });
    const dishD = createMockDish({ id: 'dish-d', name: 'Dish D', use_count: 5, created_at: '2026-03-10T00:00:00Z' }); // newer with tie on use_count
    const dishE = createMockDish({ id: 'dish-e', name: 'Dish E', use_count: 1, created_at: '2026-03-01T00:00:00Z' });

    render(
      <QuickLogFavorites
        customDishes={[dishA, dishB, dishC, dishD, dishE]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    // Order should be: Dish B (10), Dish D (5, newer), Dish C (5, older), Dish A (3)
    // Dish E (1) is 5th and should not be inline
    expect(screen.getByTestId('custom-dish-card-dish-b')).toBeDefined();
    expect(screen.getByTestId('custom-dish-card-dish-d')).toBeDefined();
    expect(screen.getByTestId('custom-dish-card-dish-c')).toBeDefined();
    expect(screen.getByTestId('custom-dish-card-dish-a')).toBeDefined();
    expect(screen.queryByTestId('custom-dish-card-dish-e')).toBeNull();

    // Verify NO pin UI exists (strictly forbidden by locked decisions)
    expect(screen.queryByLabelText(/pin/i)).toBeNull();
    expect(screen.queryByTestId(/pin/i)).toBeNull();
  });

  it('opens Tier 2 sheet and allows instant search by name and notes', () => {
    const dishes = [
      createMockDish({ id: 'dish-1', name: 'Avocado Toast', notes: 'organic sourdough' }),
      createMockDish({ id: 'dish-2', name: 'Whey Isolate', notes: 'chocolate peanut butter' }),
      createMockDish({ id: 'dish-3', name: 'Chicken Breast', notes: 'air fried with rosemary' }),
    ];

    render(
      <QuickLogFavorites
        customDishes={dishes}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    // Open sheet
    fireEvent.click(screen.getByTestId('open-favorites-sheet-btn'));
    expect(screen.getByTestId('quick-log-all-sheet')).toBeDefined();

    const searchInput = screen.getByTestId('search-favorites-input') as HTMLInputElement;
    // Input must have text-base sm:text-xs to prevent iOS Safari auto-zoom
    expect(searchInput.className.includes('text-base sm:text-xs')).toBe(true);

    // Search by name
    fireEvent.change(searchInput, { target: { value: 'Avocado' } });
    expect(screen.getByTestId('sheet-dish-card-dish-1')).toBeDefined();
    expect(screen.queryByTestId('sheet-dish-card-dish-2')).toBeNull();
    expect(screen.queryByTestId('sheet-dish-card-dish-3')).toBeNull();

    // Search by note
    fireEvent.change(searchInput, { target: { value: 'chocolate' } });
    expect(screen.queryByTestId('sheet-dish-card-dish-1')).toBeNull();
    expect(screen.getByTestId('sheet-dish-card-dish-2')).toBeDefined();
    expect(screen.queryByTestId('sheet-dish-card-dish-3')).toBeNull();

    // Search no match
    fireEvent.change(searchInput, { target: { value: 'nonexistent keyword' } });
    expect(screen.getByText(/No dishes found matching/i)).toBeDefined();
  });

  it('handles actions inside Tier 2 sheet: staging, editing, quick log, and new dish creation', () => {
    const onStageCustomDish = vi.fn();
    const onOpenEditDishModal = vi.fn();
    const onQuickLogCustomDishDirect = vi.fn();
    const onOpenNewDishModal = vi.fn();
    const dish = createMockDish({ id: 'dish-sheet-act', name: 'Pancakes' });

    render(
      <QuickLogFavorites
        customDishes={[dish]}
        onOpenNewDishModal={onOpenNewDishModal}
        onStageCustomDish={onStageCustomDish}
        onOpenEditDishModal={onOpenEditDishModal}
        onQuickLogCustomDishDirect={onQuickLogCustomDishDirect}
        onDismissToast={vi.fn()}
      />
    );

    // Open sheet
    fireEvent.click(screen.getByTestId('open-favorites-sheet-btn'));

    // Stage dish from sheet
    const stageBtn = screen.getByTestId('sheet-dish-card-dish-sheet-act');
    fireEvent.click(stageBtn);
    expect(onStageCustomDish).toHaveBeenCalledWith(dish);

    // Reopen sheet for edit test
    fireEvent.click(screen.getByTestId('open-favorites-sheet-btn'));
    const editBtn = screen.getByTestId('sheet-edit-dish-btn-dish-sheet-act');
    fireEvent.click(editBtn);
    expect(onOpenEditDishModal).toHaveBeenCalledWith(dish);

    // Reopen sheet for quick log test
    fireEvent.click(screen.getByTestId('open-favorites-sheet-btn'));
    const quickLogBtn = screen.getByTestId('sheet-quick-log-btn-dish-sheet-act');
    fireEvent.click(quickLogBtn);
    expect(onQuickLogCustomDishDirect).toHaveBeenCalled();

    // Create dish from sheet footer
    const createBtn = screen.getByTestId('sheet-create-dish-btn');
    fireEvent.click(createBtn);
    expect(onOpenNewDishModal).toHaveBeenCalled();
  });
});

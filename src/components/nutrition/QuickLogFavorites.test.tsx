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
describe('QuickLogFavorites (Horizontal Bar Redesign)', () => {

  it('renders top 5 dishes in collapsed state and provides expander button to toggle full list', () => {
    const dishes = Array.from({ length: 7 }, (_, i) =>
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

    // Only top 5 dishes should be rendered in collapsed state
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`custom-dish-card-dish-${i}`)).toBeDefined();
    }
    // Dishes beyond top 5 must NOT be rendered in collapsed state
    expect(screen.queryByTestId('custom-dish-card-dish-6')).toBeNull();
    expect(screen.queryByTestId('custom-dish-card-dish-7')).toBeNull();

    // Expander button is present and indicates 7 total favorites
    const expandBtn = screen.getByTestId('open-favorites-sheet-btn');
    expect(expandBtn).toBeDefined();
    expect(expandBtn.textContent).toContain('Show all 7 favorites');

    // Click expander: renders all 7 dishes
    fireEvent.click(expandBtn);
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByTestId(`custom-dish-card-dish-${i}`)).toBeDefined();
    }
    expect(expandBtn.textContent).toContain('Collapse to top favorites');

    // Click expander again: collapses back to top 5
    fireEvent.click(expandBtn);
    expect(screen.getByTestId('custom-dish-card-dish-5')).toBeDefined();
    expect(screen.queryByTestId('custom-dish-card-dish-6')).toBeNull();
    expect(screen.queryByTestId('custom-dish-card-dish-7')).toBeNull();
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
    expect(screen.queryByTestId('search-favorites-input')).toBeNull();
  });

  it('satisfies touch-target className contract (min-h-[44px] min-w-[44px]) on create-custom-dish-btn and triggers modal', () => {
    const onOpenNewDishModal = vi.fn();
    render(
      <QuickLogFavorites
        customDishes={[]}
        onOpenNewDishModal={onOpenNewDishModal}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    const createBtn = screen.getByTestId('create-custom-dish-btn');
    expect(createBtn).toBeDefined();
    expect(createBtn.className).toContain('min-h-[44px]');
    expect(createBtn.className).toContain('min-w-[44px]');

    fireEvent.click(createBtn);
    expect(onOpenNewDishModal).toHaveBeenCalledTimes(1);
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

  it('triggers edit modal and 1-tap quick log from dish card action buttons', () => {
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
    const dishE = createMockDish({ id: 'dish-e', name: 'Dish E', use_count: 2, created_at: '2026-03-01T00:00:00Z' });
    const dishF = createMockDish({ id: 'dish-f', name: 'Dish F', use_count: 1, created_at: '2026-03-01T00:00:00Z' });

    render(
      <QuickLogFavorites
        customDishes={[dishA, dishB, dishC, dishD, dishE, dishF]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    // Order should be: Dish B (10), Dish D (5, newer), Dish C (5, older), Dish A (3), Dish E (2)
    // Dish F (1) is 6th and should not be inline initially
    expect(screen.getByTestId('custom-dish-card-dish-b')).toBeDefined();
    expect(screen.getByTestId('custom-dish-card-dish-d')).toBeDefined();
    expect(screen.getByTestId('custom-dish-card-dish-c')).toBeDefined();
    expect(screen.getByTestId('custom-dish-card-dish-a')).toBeDefined();
    expect(screen.getByTestId('custom-dish-card-dish-e')).toBeDefined();
    expect(screen.queryByTestId('custom-dish-card-dish-f')).toBeNull();

    // Verify NO pin UI exists (strictly forbidden by locked decisions)
    expect(screen.queryByLabelText(/pin/i)).toBeNull();
    expect(screen.queryByTestId(/pin/i)).toBeNull();
  });

  // §5 Required Test 1: Search reaches past the visible cap
  it('search reaches past the visible cap (queries full set, not visible slice)', () => {
    const dishes = Array.from({ length: 14 }, (_, i) =>
      createMockDish({
        id: `dish-${i + 1}`,
        name: i === 8 ? 'Almond Butter Toast' : `Dish ${i + 1}`,
        use_count: 14 - i,
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

    // Dish 9 (Almond Butter Toast) is ranked #9, beyond default cap of 5
    expect(screen.queryByTestId('custom-dish-card-dish-9')).toBeNull();

    const searchInput = screen.getByTestId('search-favorites-input');
    fireEvent.change(searchInput, { target: { value: 'almond' } });

    // Dish 9 MUST now be rendered in the DOM
    expect(screen.getByTestId('custom-dish-card-dish-9')).toBeDefined();
    // Non-matching dishes must not be rendered
    expect(screen.queryByTestId('custom-dish-card-dish-1')).toBeNull();
    // Result count reflects 1 of 14
    expect(screen.getByText('(1 of 14)')).toBeDefined();
  });

  // §5 Required Test 2: Clearing the query restores the prior expand state
  it('clearing the query restores the prior expand state', () => {
    const dishes = Array.from({ length: 14 }, (_, i) =>
      createMockDish({
        id: `dish-${i + 1}`,
        name: i === 8 ? 'Almond Butter Toast' : `Dish ${i + 1}`,
        use_count: 14 - i,
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

    const searchInput = screen.getByTestId('search-favorites-input');
    const expandBtn = screen.getByTestId('open-favorites-sheet-btn');

    // Scenario A: Collapsed initially -> search -> clear -> still collapsed
    expect(expandBtn.textContent).toContain('Show all 14 favorites');
    expect(screen.queryByTestId('custom-dish-card-dish-9')).toBeNull();

    fireEvent.change(searchInput, { target: { value: 'Almond' } });
    expect(screen.getByTestId('custom-dish-card-dish-9')).toBeDefined();

    // Clear search
    const clearBtn = screen.getByLabelText('Clear search');
    fireEvent.click(clearBtn);

    // Must still be collapsed (Dish 9 is absent, expander still offers Show all 14)
    expect(screen.queryByTestId('custom-dish-card-dish-9')).toBeNull();
    expect(screen.getByTestId('open-favorites-sheet-btn').textContent).toContain('Show all 14 favorites');

    // Scenario B: Expanded initially -> search -> clear -> still expanded
    fireEvent.click(screen.getByTestId('open-favorites-sheet-btn'));
    expect(screen.getByTestId('open-favorites-sheet-btn').textContent).toContain('Collapse to top favorites');
    expect(screen.getByTestId('custom-dish-card-dish-9')).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'Dish 1' } });
    expect(screen.getByTestId('custom-dish-card-dish-1')).toBeDefined();

    // Clear search via input change
    fireEvent.change(searchInput, { target: { value: '' } });

    // Must still be expanded (Dish 9 is present, expander still says Collapse to top favorites)
    expect(screen.getByTestId('custom-dish-card-dish-9')).toBeDefined();
    expect(screen.getByTestId('open-favorites-sheet-btn').textContent).toContain('Collapse to top favorites');
  });

  // §5 Required Test 3: Distinct dishes render distinct rows
  it('distinct dishes render distinct rows even with similar names', () => {
    const dishes = [
      createMockDish({ id: 'dish-shake-choco', name: 'Protein Shake Chocolate' }),
      createMockDish({ id: 'dish-shake-vanilla', name: 'Protein Shake Vanilla' }),
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

    const cardChoco = screen.getByTestId('custom-dish-card-dish-shake-choco');
    const cardVanilla = screen.getByTestId('custom-dish-card-dish-shake-vanilla');

    expect(cardChoco).toBeDefined();
    expect(cardVanilla).toBeDefined();
    expect(cardChoco).not.toBe(cardVanilla);
    expect(screen.getByText('Protein Shake Chocolate')).toBeDefined();
    expect(screen.getByText('Protein Shake Vanilla')).toBeDefined();
  });

  // §5 Required Test 4: The adaptive row classes are present on the right rows
  it('row 5 carries the max-height:799px hidden variant (class contract, not a layout measurement)', () => {
    const dishes = Array.from({ length: 5 }, (_, i) =>
      createMockDish({ id: `dish-${i + 1}`, name: `Dish ${i + 1}` })
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

    // Rows 1-3 (indices 0, 1, 2) must NOT carry height hiding variants
    for (let i = 0; i < 3; i++) {
      const row = screen.getByTestId(`favorite-row-${i}`);
      expect(row.className).not.toContain('max-height');
    }

    // Row 4 (index 3) must carry max-height:699px variant, but NOT max-height:799px
    const row4 = screen.getByTestId('favorite-row-3');
    expect(row4.className).toContain('[@media(max-height:699px)]:hidden');
    expect(row4.className).not.toContain('[@media(max-height:799px)]:hidden');

    // Row 5 (index 4) must carry max-height:799px variant on its row container
    const row5 = screen.getByTestId('favorite-row-4');
    expect(row5.className).toContain('[@media(max-height:799px)]:hidden');
  });

  // §5 Required Test 5: Bar density contract
  it('bar density contract: QuickLogDishCard root contains p-2 and does NOT contain p-2.5, p-3, or min-h-[92px]', () => {
    const dish = createMockDish({ id: 'dish-density', name: 'Keto Bar' });

    render(
      <QuickLogFavorites
        customDishes={[dish]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    const card = screen.getByTestId('custom-dish-card-dish-density');
    const article = card.closest('article')!;
    const classes = article.className.split(/\s+/);

    expect(classes).toContain('p-2');
    expect(classes).not.toContain('p-2.5');
    expect(classes).not.toContain('p-3');
    expect(classes).not.toContain('min-h-[92px]');
    expect(classes).not.toContain('flex-col');
  });

  // §5 Required Test 6: Preserved testids still resolve after regrid
  it('the three preserved testids still resolve after the regrid', () => {
    const dish = createMockDish({ id: 'dish-preserve-testids', name: 'Whey Protein' });

    render(
      <QuickLogFavorites
        customDishes={[dish]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    // Primary staging button testid
    expect(screen.getByTestId('custom-dish-card-dish-preserve-testids')).toBeDefined();
    // Edit dish button testid
    expect(screen.getByTestId('edit-dish-btn-dish-preserve-testids')).toBeDefined();
    // Quick log button testid
    expect(screen.getByTestId('quick-log-btn-dish-preserve-testids')).toBeDefined();

    // Accessible pairing
    const article = screen.getByTestId('custom-dish-card-dish-preserve-testids').closest('article')!;
    expect(article.getAttribute('aria-labelledby')).toBe('dish-name-dish-preserve-testids');
    const nameEl = article.querySelector('#dish-name-dish-preserve-testids');
    expect(nameEl).toBeDefined();
    expect(nameEl?.textContent).toBe('Whey Protein');
  });

  it('shows no-results message and updates count when search query matches nothing', () => {
    const dishes = [
      createMockDish({ id: 'dish-1', name: 'Avocado Toast' }),
      createMockDish({ id: 'dish-2', name: 'Whey Isolate' }),
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

    const searchInput = screen.getByTestId('search-favorites-input');
    fireEvent.change(searchInput, { target: { value: 'pizza' } });

    expect(screen.getByText(/No dishes found matching "pizza"/i)).toBeDefined();
    expect(screen.getByText('(0 of 2)')).toBeDefined();
    expect(screen.queryByTestId('custom-dish-card-dish-1')).toBeNull();
    expect(screen.queryByTestId('custom-dish-card-dish-2')).toBeNull();
  });

  it('search input satisfies text-base sm:text-xs class contract to prevent iOS auto-zoom', () => {
    render(
      <QuickLogFavorites
        customDishes={[createMockDish()]}
        onOpenNewDishModal={vi.fn()}
        onStageCustomDish={vi.fn()}
        onOpenEditDishModal={vi.fn()}
        onQuickLogCustomDishDirect={vi.fn()}
        onDismissToast={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('search-favorites-input');
    expect(searchInput.className).toContain('text-base sm:text-xs');
  });

  // Attack A & E: Note searching across full set
  it('searches by note as well as dish name across full set', () => {
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

    const searchInput = screen.getByTestId('search-favorites-input');
    // Search by note keyword
    fireEvent.change(searchInput, { target: { value: 'chocolate' } });
    expect(screen.queryByTestId('custom-dish-card-dish-1')).toBeNull();
    expect(screen.getByTestId('custom-dish-card-dish-2')).toBeDefined();
    expect(screen.queryByTestId('custom-dish-card-dish-3')).toBeNull();
    expect(screen.getByText('(1 of 3)')).toBeDefined();
  });

  // Attack G1 & G2: Expander renders for 4-dish list carrying min-height:700px variant and aria-expanded contract
  it('Attack G1 & G2: expander renders for 4-dish list carrying min-height:700px variant and aria-expanded contract', () => {
    const dishes = Array.from({ length: 4 }, (_, i) =>
      createMockDish({ id: `dish-${i + 1}`, name: `Dish ${i + 1}` })
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

    const expandBtn = screen.getByTestId('open-favorites-sheet-btn');
    expect(expandBtn).toBeDefined();
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
    expect(expandBtn.className).toContain('[@media(min-height:700px)]:hidden');
    expect(expandBtn.textContent).toContain('Show all 4 favorites');

    fireEvent.click(expandBtn);
    expect(expandBtn.getAttribute('aria-expanded')).toBe('true');
    expect(expandBtn.textContent).toContain('Collapse to top favorites');
  });

  // Attack G1: Expander renders for 5-dish list carrying min-height:800px variant
  it('Attack G1: expander renders for 5-dish list carrying min-height:800px variant', () => {
    const dishes = Array.from({ length: 5 }, (_, i) =>
      createMockDish({ id: `dish-${i + 1}`, name: `Dish ${i + 1}` })
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

    const expandBtn = screen.getByTestId('open-favorites-sheet-btn');
    expect(expandBtn).toBeDefined();
    expect(expandBtn.className).toContain('[@media(min-height:800px)]:hidden');
    expect(expandBtn.textContent).toContain('Show all 5 favorites');
  });

  // Attack G1: Expander does not render when list has 3 or fewer dishes
  it('Attack G1: expander does not render when list has 3 or fewer dishes', () => {
    const dishes = Array.from({ length: 3 }, (_, i) =>
      createMockDish({ id: `dish-${i + 1}`, name: `Dish ${i + 1}` })
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

    expect(screen.queryByTestId('open-favorites-sheet-btn')).toBeNull();
  });

  // Attack G3: Live regions for search result count and no-results message
  it('Attack G3: search result count and no-results message have polite live region role', () => {
    const dishes = [
      createMockDish({ id: 'dish-1', name: 'Eggs & Toast' }),
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

    const countSpan = screen.getByRole('status');
    expect(countSpan).toBeDefined();
    expect(countSpan.getAttribute('aria-live')).toBe('polite');

    const searchInput = screen.getByTestId('search-favorites-input');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    const statusRegions = screen.getAllByRole('status');
    expect(statusRegions.length).toBe(2);
    const noResults = screen.getByText(/No dishes found matching "nonexistent"/i);
    expect(statusRegions).toContain(noResults);
    expect(noResults.getAttribute('aria-live')).toBe('polite');
  });
});


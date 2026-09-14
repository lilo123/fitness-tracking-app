import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  NutrientBreakdownModal,
  type BreakdownNutrient,
} from './NutrientBreakdownModal';
import type { NutritionLog } from '../../types/database';

describe('NutrientBreakdownModal', () => {
  const mockCompositeMeal: NutritionLog = {
    id: 'log-composite-1',
    user_id: 'user-1',
    food_name: 'Steamed Egg Meatloaf Plate',
    calories: 452,
    protein: 25.5,
    carbs: 31.2,
    fat: 24.6,
    fiber: 3.1,
    logged_at: '2026-09-14T12:00:00.000Z',
    items: [
      {
        id: 'item-1',
        name: 'Steamed Egg Meatloaf',
        quantity: 150,
        unit: 'g',
        displayPortion: '1 slice (150g)',
        calories: 182,
        protein: 12.5,
        carbs: 3.2,
        fat: 13.1,
        fiber: 1.2,
      },
      {
        id: 'item-2',
        name: 'Cooking Oil',
        quantity: 15,
        unit: 'g',
        displayPortion: '1 tbsp (15g)',
        calories: 215,
        protein: 0.1,
        carbs: 21.0,
        fat: 11.3,
        fiber: 0,
      },
      {
        id: 'item-3',
        name: 'Cucumber & Tomato Pickles',
        quantity: 1,
        unit: 'unit',
        displayPortion: '1 bowl',
        calories: 55,
        protein: 12.9,
        carbs: 7.0,
        fat: 0.2,
        fiber: 1.9,
      },
    ],
  };

  const mockSingleItemMeal: NutritionLog = {
    id: 'log-single-1',
    user_id: 'user-1',
    food_name: 'Whey Protein Shake',
    calories: 130,
    protein: 25.0,
    carbs: 3.0,
    fat: 1.5,
    fiber: 0.5,
    serving_size: 1,
    serving_unit: 'scoop',
    logged_at: '2026-09-14T08:00:00.000Z',
    items: [
      {
        id: 'item-single',
        name: 'Whey Protein Powder',
        quantity: 1,
        unit: 'unit',
        displayPortion: '1 scoop',
        calories: 130,
        protein: 25.0,
        carbs: 3.0,
        fat: 1.5,
        fiber: 0.5,
      },
    ],
  };

  const mockStandaloneLeafMeal: NutritionLog = {
    id: 'log-leaf-1',
    user_id: 'user-1',
    food_name: 'Apple',
    calories: 95,
    protein: 0.5,
    carbs: 25.0,
    fat: 0.3,
    fiber: 4.4,
    serving_size: 1,
    serving_unit: 'medium apple',
    logged_at: '2026-09-14T15:00:00.000Z',
    items: null,
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    selectedNutrient: 'protein' as BreakdownNutrient,
    onSelectNutrient: vi.fn(),
    logs: [mockCompositeMeal, mockSingleItemMeal, mockStandaloneLeafMeal],
    dailyTotals: {
      calories: 677,
      protein: 51.0,
      carbs: 59.2,
      fat: 26.4,
      fiber: 8.0,
    },
    targets: {
      calories: 2200,
      protein: 160,
      carbs: 220,
      fat: 70,
      fiber: 30,
    },
  };

  it('renders nothing when isOpen is false', () => {
    render(<NutrientBreakdownModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('nutrient-breakdown-modal')).toBeNull();
  });

  it('renders modal dialog with 2-row stacked header and mobile drag handle when open', () => {
    render(<NutrientBreakdownModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByTestId('nutrient-breakdown-modal')).toBeDefined();
    expect(screen.getByTestId('bottom-sheet-drag-handle')).toBeDefined();
    expect(screen.getByText('Nutrient Breakdown')).toBeDefined();
    expect(screen.getByTestId('close-breakdown-modal-btn')).toBeDefined();
  });

  it('calls onClose when close button or backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<NutrientBreakdownModal {...defaultProps} onClose={onClose} />);

    // Click close button
    fireEvent.click(screen.getByTestId('close-breakdown-modal-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Click backdrop
    const modalContainer = screen.getByRole('dialog').parentElement!;
    fireEvent.click(modalContainer);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders 5-nutrient segmented pill switcher and triggers onSelectNutrient when clicked', () => {
    const onSelectNutrient = vi.fn();
    render(
      <NutrientBreakdownModal
        {...defaultProps}
        selectedNutrient="calories"
        onSelectNutrient={onSelectNutrient}
      />
    );

    const calPill = screen.getByTestId('nutrient-pill-calories');
    const proteinPill = screen.getByTestId('nutrient-pill-protein');
    const carbsPill = screen.getByTestId('nutrient-pill-carbs');
    const fatPill = screen.getByTestId('nutrient-pill-fat');
    const fiberPill = screen.getByTestId('nutrient-pill-fiber');

    expect(calPill.textContent).toBe('Cal');
    expect(calPill.getAttribute('aria-selected')).toBe('true');

    expect(proteinPill.textContent).toBe('Protein');
    expect(proteinPill.getAttribute('aria-selected')).toBe('false');

    expect(carbsPill.textContent).toBe('Carbs');
    expect(fatPill.textContent).toBe('Fat');
    expect(fiberPill.textContent).toBe('Fiber');

    fireEvent.click(proteinPill);
    expect(onSelectNutrient).toHaveBeenCalledWith('protein');

    fireEvent.click(fiberPill);
    expect(onSelectNutrient).toHaveBeenCalledWith('fiber');
  });

  it('renders daily summary for the selected nutrient with targets', () => {
    render(
      <NutrientBreakdownModal
        {...defaultProps}
        selectedNutrient="protein"
      />
    );

    expect(screen.getByText("Today's Protein")).toBeDefined();
    expect(screen.getByText('51g')).toBeDefined();
    expect(screen.getByText('/ 160g')).toBeDefined();
  });

  it('displays empty state when no logs are present', () => {
    render(
      <NutrientBreakdownModal
        {...defaultProps}
        logs={[]}
        dailyTotals={{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }}
      />
    );

    expect(screen.getByTestId('breakdown-empty-state')).toBeDefined();
    expect(screen.getByText('No meals logged for this date.')).toBeDefined();
  });

  describe('Hierarchy requirements', () => {
    it('renders Level 1 composite meal with expandable accordion, count badge, and chevron', () => {
      render(
        <NutrientBreakdownModal
          {...defaultProps}
          selectedNutrient="protein"
        />
      );

      const trigger = screen.getByTestId('breakdown-accordion-trigger-log-composite-1');
      expect(trigger).toBeDefined();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');

      // Count badge displays number of child items (3)
      const countBadge = screen.getByTestId('breakdown-count-badge-log-composite-1');
      expect(countBadge.textContent).toBe('3');

      // Panel is initially collapsed
      expect(screen.queryByTestId('breakdown-accordion-panel-log-composite-1')).toBeNull();

      // Expand accordion
      fireEvent.click(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      const panel = screen.getByTestId('breakdown-accordion-panel-log-composite-1');
      expect(panel).toBeDefined();

      // Displays each child ingredient
      const childRows = screen.getAllByTestId('breakdown-child-row');
      expect(childRows.length).toBe(3);

      expect(screen.getByText('Steamed Egg Meatloaf')).toBeDefined();
      expect(screen.getByText('Cooking Oil')).toBeDefined();
      expect(screen.getByText('Cucumber & Tomato Pickles')).toBeDefined();

      // Collapse accordion
      fireEvent.click(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId('breakdown-accordion-panel-log-composite-1')).toBeNull();
    });

    it('renders Level 2 standalone / single-item meals as flat leaf rows without chevrons or count badges', () => {
      render(
        <NutrientBreakdownModal
          {...defaultProps}
          selectedNutrient="protein"
        />
      );

      // Single item meal (1 item in items)
      const singleLeafRow = screen.getByTestId('breakdown-leaf-row-log-single-1');
      expect(singleLeafRow).toBeDefined();
      expect(screen.queryByTestId('breakdown-accordion-trigger-log-single-1')).toBeNull();
      expect(screen.queryByTestId('breakdown-count-badge-log-single-1')).toBeNull();

      // Standalone leaf meal (null items)
      const standaloneLeafRow = screen.getByTestId('breakdown-leaf-row-log-leaf-1');
      expect(standaloneLeafRow).toBeDefined();
      expect(screen.queryByTestId('breakdown-accordion-trigger-log-leaf-1')).toBeNull();
      expect(screen.queryByTestId('breakdown-count-badge-log-leaf-1')).toBeNull();
    });

    it('displays adaptive percentage formatting (<1% for tiny contributions) for child items', () => {
      render(
        <NutrientBreakdownModal
          {...defaultProps}
          selectedNutrient="protein"
        />
      );

      // Expand composite meal
      fireEvent.click(screen.getByTestId('breakdown-accordion-trigger-log-composite-1'));

      // In Steamed Egg Meatloaf Plate:
      // Total protein is 25.5g
      // Steamed Egg Meatloaf: 12.5g -> (12.5 / 25.5) * 100 = 49%
      // Cooking Oil: 0.1g -> (0.1 / 25.5) * 100 = 0.39% -> strictly < 1% -> '<1%'
      // Cucumber & Tomato Pickles: 12.9g -> (12.9 / 25.5) * 100 = 51%
      const childPctBadges = screen.getAllByTestId('breakdown-child-pct');
      expect(childPctBadges[0].textContent).toBe('49%');
      expect(childPctBadges[1].textContent).toBe('<1%');
      expect(childPctBadges[2].textContent).toBe('51%');
    });

    it('displays 0% for child items that contribute zero of the selected nutrient', () => {
      render(
        <NutrientBreakdownModal
          {...defaultProps}
          selectedNutrient="fiber"
        />
      );

      // Expand composite meal
      fireEvent.click(screen.getByTestId('breakdown-accordion-trigger-log-composite-1'));

      // Total fiber is 3.1g
      // Cooking Oil has 0 fiber -> 0%
      const childPctBadges = screen.getAllByTestId('breakdown-child-pct');
      expect(childPctBadges[1].textContent).toBe('0%');
    });
  });

  describe('Number formatting and WCAG touch target compliance', () => {
    it('formats calories with kcal unit and macros with g unit', () => {
      const { rerender } = render(
        <NutrientBreakdownModal
          {...defaultProps}
          selectedNutrient="calories"
        />
      );

      // Total calories
      expect(screen.getByText('677 kcal')).toBeDefined();

      // Switch to carbs
      rerender(
        <NutrientBreakdownModal
          {...defaultProps}
          selectedNutrient="carbs"
        />
      );

      expect(screen.getByText('59.2g')).toBeDefined();
    });

    it('ensures all clickable elements satisfy WCAG 2.5.5 min-h-[44px]', () => {
      render(<NutrientBreakdownModal {...defaultProps} />);

      const closeBtn = screen.getByTestId('close-breakdown-modal-btn');
      expect(closeBtn.className).toContain('min-h-[44px]');
      expect(closeBtn.className).toContain('min-w-[44px]');

      const pillBtn = screen.getByTestId('nutrient-pill-calories');
      expect(pillBtn.className).toContain('min-h-[44px]');

      const accordionTrigger = screen.getByTestId('breakdown-accordion-trigger-log-composite-1');
      expect(accordionTrigger.className).toContain('min-h-[44px]');
    });

    it('cleans floating point drift using roundTo1Decimal when dailyTotals or items contain precision drift', () => {
      const noisyMeal: NutritionLog = {
        id: 'log-noisy',
        user_id: 'user-1',
        food_name: 'Noisy Meal',
        calories: 100,
        protein: 0.1 + 0.2, // 0.30000000000000004
        carbs: 10.000000000000002,
        fat: 5.05,
        fiber: 0.04, // should round to 0g and 0%
        logged_at: '2026-09-14T12:00:00.000Z',
        items: [
          {
            id: 'item-noisy-1',
            name: 'Noisy Ingredient',
            quantity: 1,
            unit: 'unit',
            calories: 100,
            protein: 0.30000000000000004,
            carbs: 10.000000000000002,
            fat: 5.05,
            fiber: 0.04,
          },
          {
            id: 'item-noisy-2',
            name: 'Zero Ingredient',
            quantity: 1,
            unit: 'unit',
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
          },
        ],
      };

      render(
        <NutrientBreakdownModal
          {...defaultProps}
          logs={[noisyMeal]}
          dailyTotals={{
            calories: 100,
            protein: 0.30000000000000004,
            carbs: 10.000000000000002,
            fat: 5.05,
            fiber: 0.04,
          }}
          selectedNutrient="fiber"
        />
      );

      // Fiber total: 0.04g rounds to 0g, formatted as 0g
      expect(screen.getByText("Today's Fiber")).toBeDefined();
      expect(screen.getAllByText('0g').length).toBeGreaterThanOrEqual(2);

      // Expand accordion
      fireEvent.click(screen.getByTestId('breakdown-accordion-trigger-log-noisy'));
      const childPctBadges = screen.getAllByTestId('breakdown-child-pct');
      // Fiber 0.04g rounds to 0g, which contributes 0% (not <1%)
      expect(childPctBadges[0].textContent).toBe('0%');
    });
  });

  describe('Focus, accessibility, and dismiss behavior', () => {
    it('restores focus to the opener element when the modal is dismissed', () => {
      const opener = document.createElement('button');
      opener.setAttribute('data-testid', 'test-opener-ring');
      document.body.appendChild(opener);
      opener.focus();
      expect(document.activeElement).toBe(opener);

      const { rerender } = render(
        <NutrientBreakdownModal {...defaultProps} isOpen={true} />
      );

      // Focus moved into the modal
      expect(document.activeElement).not.toBe(opener);

      // Close modal
      rerender(<NutrientBreakdownModal {...defaultProps} isOpen={false} />);

      // Focus is restored to the opener ring
      expect(document.activeElement).toBe(opener);
      document.body.removeChild(opener);
    });

    it('dismisses modal when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<NutrientBreakdownModal {...defaultProps} isOpen={true} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('connects role=tabpanel and aria-controls between tabs and content panel', () => {
      render(<NutrientBreakdownModal {...defaultProps} />);

      const tab = screen.getByTestId('nutrient-pill-calories');
      expect(tab.getAttribute('aria-controls')).toBe('nutrient-breakdown-tabpanel');

      const panel = screen.getByRole('tabpanel');
      expect(panel.id).toBe('nutrient-breakdown-tabpanel');
      expect(panel.getAttribute('aria-label')).toBe('Protein breakdown');
    });

    it('handles long portion descriptions and fallbacks for missing names without crashing', () => {
      const fallbackMeal: NutritionLog = {
        id: 'log-fallback',
        user_id: 'user-1',
        food_name: '',
        calories: 120,
        protein: 10,
        carbs: 5,
        fat: 2,
        fiber: 1,
        serving_size: 1,
        serving_unit: 'extraordinarily long serving unit description that could blow out small screens',
        logged_at: '2026-09-14T12:00:00.000Z',
        items: [
          {
            id: 'child-fb-1',
            name: '',
            quantity: 1,
            unit: 'unit',
            displayPortion: 'very long portion specification string that needs truncation at 320px',
            calories: 60,
            protein: 5,
            carbs: 2,
            fat: 1,
            fiber: 0.5,
          },
          {
            id: 'child-fb-2',
            name: 'Child 2',
            quantity: 1,
            unit: 'unit',
            calories: 60,
            protein: 5,
            carbs: 3,
            fat: 1,
            fiber: 0.5,
          },
        ],
      };

      render(
        <NutrientBreakdownModal
          {...defaultProps}
          logs={[fallbackMeal]}
          selectedNutrient="protein"
        />
      );

      // Fallback name is rendered
      expect(screen.getByText('Unnamed Meal')).toBeDefined();

      // Expand accordion
      fireEvent.click(screen.getByTestId('breakdown-accordion-trigger-log-fallback'));

      // Child fallback name is rendered
      expect(screen.getByText('Item')).toBeDefined();

      // Portion badge is truncated with max-w constraint
      const portionBadge = screen.getByTestId('breakdown-child-portion');
      expect(portionBadge.className).toContain('truncate');
      expect(portionBadge.className).toContain('max-w-[90px]');
    });
  });
});


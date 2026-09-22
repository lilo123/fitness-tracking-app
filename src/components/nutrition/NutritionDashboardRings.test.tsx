import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NutritionDashboardRings, type NutritionDashboardRingsProps } from './NutritionDashboardRings';

function renderDashboard(propsOverride: Partial<NutritionDashboardRingsProps> = {}) {
  const defaultProps: NutritionDashboardRingsProps = {
    selectedDate: '2026-09-22',
    onDateChange: vi.fn(),
    dailyTotals: {
      calories: 1800,
      protein: 130,
      carbs: 180,
      fat: 60,
      fiber: 25,
    },
    targets: {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 70,
      fiber: 30,
    },
    remainingFuel: {
      calories: { badgeLabel: '200 kcal', isOver: false },
      protein: { badgeLabel: '20g P', isOver: false },
      carbs: { badgeLabel: '20g C', isOver: false },
      fat: { badgeLabel: '10g F', isOver: false },
      fiber: { badgeLabel: '5g Fib', isOver: false },
    },
    onSelectBreakdownNutrient: vi.fn(),
  };

  const mergedProps = { ...defaultProps, ...propsOverride };
  const view = render(<NutritionDashboardRings {...mergedProps} />);
  return { ...view, props: mergedProps };
}

describe('NutritionDashboardRings', () => {
  it('renders exactly 5 actionable buttons in the dashboard (one per macro ring, zero for fuel pills)', () => {
    renderDashboard();

    const buttons = screen.getAllByRole('button');
    // Tab stops check: Exactly 5 buttons for the 5 macro rings, pills are non-interactive <div>
    expect(buttons).toHaveLength(5);

    const testIds = buttons.map((b) => b.getAttribute('data-testid'));
    expect(testIds).toEqual([
      'macro-ring-calories',
      'macro-ring-protein',
      'macro-ring-carbs',
      'macro-ring-fat',
      'macro-ring-fiber',
    ]);

    // Ensure none of the remaining fuel elements have role="button"
    const nutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;
    nutrients.forEach((nutrient) => {
      const pill = screen.getByTestId(`remaining-fuel-${nutrient}`);
      expect(pill.tagName.toLowerCase()).toBe('div');
      expect(pill.getAttribute('role')).toBeNull();
    });
  });

  it('calls onSelectBreakdownNutrient when macro rings are clicked', () => {
    const onSelect = vi.fn();
    renderDashboard({ onSelectBreakdownNutrient: onSelect });

    const nutrients = [
      { id: 'calories', testId: 'macro-ring-calories' },
      { id: 'protein', testId: 'macro-ring-protein' },
      { id: 'carbs', testId: 'macro-ring-carbs' },
      { id: 'fat', testId: 'macro-ring-fat' },
      { id: 'fiber', testId: 'macro-ring-fiber' },
    ] as const;

    nutrients.forEach(({ id, testId }) => {
      onSelect.mockClear();
      fireEvent.click(screen.getByTestId(testId));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(id);
    });
  });

  it('does not trigger onSelectBreakdownNutrient when remaining fuel pills are clicked', () => {
    const onSelect = vi.fn();
    renderDashboard({ onSelectBreakdownNutrient: onSelect });

    const nutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;
    nutrients.forEach((nutrient) => {
      onSelect.mockClear();
      fireEvent.click(screen.getByTestId(`remaining-fuel-${nutrient}`));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  it('renders under-budget styling correctly for each remaining fuel pill', () => {
    renderDashboard({
      remainingFuel: {
        calories: { badgeLabel: '200 kcal', isOver: false },
        protein: { badgeLabel: '20g P', isOver: false },
        carbs: { badgeLabel: '20g C', isOver: false },
        fat: { badgeLabel: '10g F', isOver: false },
        fiber: { badgeLabel: '5g Fib', isOver: false },
      },
    });

    const expectedTokens = {
      calories: {
        text: '200 kcal',
        classes: ['bg-amber-500/10', 'border-amber-500/25', 'text-amber-400', 'shadow-[0_0_8px_rgba(245,158,11,0.1)]'],
      },
      protein: {
        text: '20g P',
        classes: ['bg-cyan-500/10', 'border-cyan-500/25', 'text-cyan-400', 'shadow-[0_0_8px_rgba(6,182,212,0.1)]'],
      },
      carbs: {
        text: '20g C',
        classes: ['bg-emerald-500/10', 'border-emerald-500/25', 'text-emerald-400', 'shadow-[0_0_8px_rgba(16,185,129,0.1)]'],
      },
      fat: {
        text: '10g F',
        classes: ['bg-violet-500/10', 'border-violet-500/25', 'text-violet-400', 'shadow-[0_0_8px_rgba(139,92,246,0.1)]'],
      },
      fiber: {
        text: '5g Fib',
        classes: ['bg-teal-500/10', 'border-teal-500/25', 'text-teal-400', 'shadow-[0_0_8px_rgba(20,184,166,0.1)]'],
      },
    };

    (Object.keys(expectedTokens) as (keyof typeof expectedTokens)[]).forEach((nutrient) => {
      const pill = screen.getByTestId(`remaining-fuel-${nutrient}`);
      expect(pill.textContent).toBe(expectedTokens[nutrient].text);
      expectedTokens[nutrient].classes.forEach((cls) => {
        expect(pill.className).toContain(cls);
      });
      // Verify interactive and min-h-[44px] classes are dropped
      expect(pill.className).not.toContain('cursor-pointer');
      expect(pill.className).not.toContain('hover:brightness-110');
      expect(pill.className).not.toContain('active:scale-95');
      expect(pill.className).not.toContain('touch-manipulation');
      expect(pill.className).not.toContain('min-h-[44px]');
    });
  });

  it('renders over-budget styling correctly for all remaining fuel pills', () => {
    renderDashboard({
      remainingFuel: {
        calories: { badgeLabel: '+100 kcal over', isOver: true },
        protein: { badgeLabel: '+5g P over', isOver: true },
        carbs: { badgeLabel: '+15g C over', isOver: true },
        fat: { badgeLabel: '+8g F over', isOver: true },
        fiber: { badgeLabel: '+2g Fib over', isOver: true },
      },
    });

    const overClasses = [
      'bg-rose-500/15',
      'border-rose-500/30',
      'text-rose-400',
      'shadow-[0_0_8px_rgba(244,63,94,0.15)]',
    ];

    const nutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;
    nutrients.forEach((nutrient) => {
      const pill = screen.getByTestId(`remaining-fuel-${nutrient}`);
      overClasses.forEach((cls) => {
        expect(pill.className).toContain(cls);
      });
      // Verify interactive and min-h-[44px] classes are dropped
      expect(pill.className).not.toContain('cursor-pointer');
      expect(pill.className).not.toContain('hover:brightness-110');
      expect(pill.className).not.toContain('active:scale-95');
      expect(pill.className).not.toContain('touch-manipulation');
      expect(pill.className).not.toContain('min-h-[44px]');
    });
  });
});

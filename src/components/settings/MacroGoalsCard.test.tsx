import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MacroGoalsCard } from './MacroGoalsCard';
import { expectNoA11yViolations } from '../../test/a11y';

describe('MacroGoalsCard accessibility', () => {
  const defaultProps = {
    targetCalories: 2200,
    setTargetCalories: vi.fn(),
    targetProtein: 160,
    setTargetProtein: vi.fn(),
    targetCarbs: 220,
    setTargetCarbs: vi.fn(),
    targetFat: 70,
    setTargetFat: vi.fn(),
    targetFiber: 30,
    setTargetFiber: vi.fn(),
    loading: false,
    status: null,
    onSave: vi.fn(),
  };

  it('associates labels with all 5 macro goal inputs', () => {
    render(<MacroGoalsCard {...defaultProps} />);

    expect(screen.getByLabelText(/calories/i)).toBeDefined();
    expect(screen.getByLabelText(/protein/i)).toBeDefined();
    expect(screen.getByLabelText(/carbs/i)).toBeDefined();
    expect(screen.getByLabelText(/^fat/i)).toBeDefined();
    expect(screen.getByLabelText(/fiber/i)).toBeDefined();
  });

  it('passes axe accessibility audits with no violations', async () => {
    const { container } = render(<MacroGoalsCard {...defaultProps} />);
    await expectNoA11yViolations(container);
  });
});

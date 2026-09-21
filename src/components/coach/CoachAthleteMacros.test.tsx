import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoachAthleteMacros } from './CoachAthleteMacros';
import { expectNoA11yViolations } from '../../test/a11y';

describe('CoachAthleteMacros accessibility', () => {
  const defaultProps = {
    selectedAthlete: { name: 'Alice' },
    athleteCal: 2000,
    setAthleteCal: vi.fn(),
    athletePro: 150,
    setAthletePro: vi.fn(),
    athleteCarb: 200,
    setAthleteCarb: vi.fn(),
    athleteFat: 60,
    setAthleteFat: vi.fn(),
    athleteFiber: 30,
    setAthleteFiber: vi.fn(),
    isUpdatingMacros: false,
    macroStatus: null,
    onUpdateAthleteMacros: vi.fn(),
  };

  it('associates labels with all 5 macro inputs', () => {
    render(<CoachAthleteMacros {...defaultProps} />);

    expect(screen.getByLabelText(/daily calorie target/i)).toBeDefined();
    expect(screen.getByLabelText(/protein/i)).toBeDefined();
    expect(screen.getByLabelText(/carbs/i)).toBeDefined();
    expect(screen.getByLabelText(/^fat$/i)).toBeDefined();
    expect(screen.getByLabelText(/fiber/i)).toBeDefined();
  });

  it('passes axe accessibility audits with no violations', async () => {
    const { container } = render(<CoachAthleteMacros {...defaultProps} />);
    await expectNoA11yViolations(container);
  });
});

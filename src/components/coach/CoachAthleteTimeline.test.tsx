import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CoachAthleteTimeline } from './CoachAthleteTimeline';
import type { CoachAthleteTimelineProps } from './CoachAthleteTimeline';
import { expectNoA11yViolations } from '../../test/a11y';

describe('CoachAthleteTimeline accessibility (NEW-15)', () => {
  const defaultProps: CoachAthleteTimelineProps = {
    selectedAthleteId: 'athlete-1',
    selectedAthlete: { name: 'Bob' },
    timelineDays: [],
    athleteWorkoutsWithSets: [],
    athleteProfile: null,
    exercises: [],
    expandedExercises: {},
    onToggleExercise: vi.fn(),
    onLoadOlderDays: vi.fn(),
    isWorkoutsError: false,
    workoutsError: null,
    onRetryWorkouts: vi.fn(),
  };

  it('passes axe accessibility audits with no violations', async () => {
    const { container } = render(<CoachAthleteTimeline {...defaultProps} />);
    await expectNoA11yViolations(container);
  });

  it('NEW-15: mounts live regions unconditionally and mutates assertive region on workout error', () => {
    const politeOf = (c: HTMLElement) => c.querySelector('[role="status"]');
    const assertiveOf = (c: HTMLElement) => c.querySelector('[role="alert"]');

    const { container, rerender } = render(<CoachAthleteTimeline {...defaultProps} />);
    const politeBefore = politeOf(container);
    const assertiveBefore = assertiveOf(container);

    expect(politeBefore).not.toBeNull();
    expect(assertiveBefore).not.toBeNull();
    expect(politeBefore!.textContent).toBe('');
    expect(assertiveBefore!.textContent).toBe('');

    // Error transition
    rerender(
      <CoachAthleteTimeline
        {...defaultProps}
        isWorkoutsError={true}
        workoutsError={new Error('Network failure')}
      />
    );

    const politeAfter = politeOf(container);
    const assertiveAfter = assertiveOf(container);

    expect(politeAfter).toBe(politeBefore);
    expect(assertiveAfter).toBe(assertiveBefore);
    expect(assertiveAfter!.textContent).toContain('Network failure');
    expect(politeAfter!.textContent).toBe('');
  });

  it('H4: renders civil date in timeline day header with zero raw ISO timestamp text', () => {
    const timelineDays = [
      {
        date: '2026-09-15',
        workouts: [
          {
            id: 'w-1',
            date: '2026-09-15T00:00:00.000Z',
            civil_date: '2026-09-15',
            workout_date: '2026-09-15',
            name: 'Push Day',
            sets: [],
          },
        ],
        nutrition: [],
      },
    ];

    const { container } = render(
      <CoachAthleteTimeline
        {...defaultProps}
        timelineDays={timelineDays}
        athleteWorkoutsWithSets={timelineDays[0].workouts}
      />
    );

    // Formatted civil date header
    expect(container.textContent).toContain('Sep 15');
    // Zero raw ISO text
    expect(container.textContent).not.toContain('2026-09-15T00:00:00');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkoutHeader } from './WorkoutHeader';

describe('WorkoutHeader', () => {
  const defaultProps = {
    mutationError: null,
    onClearMutationError: vi.fn(),
    activeRoutineName: 'Chest Day',
    onOpenRoutineModal: vi.fn(),
    workoutDate: '2026-09-21',
    onDateChange: vi.fn(),
    onClearWorkout: vi.fn(),
  };

  it('mounts live regions empty while idle and retains same DOM node on error mutation (NEW-15)', () => {
    const onClear = vi.fn();
    const { rerender, container } = render(
      <WorkoutHeader {...defaultProps} mutationError={null} onClearMutationError={onClear} />
    );

    const assertiveBefore = container.querySelector('[role="alert"]');
    const politeBefore = container.querySelector('[role="status"]');

    expect(assertiveBefore).not.toBeNull();
    expect(politeBefore).not.toBeNull();
    expect(assertiveBefore!.textContent).toBe('');
    expect(politeBefore!.textContent).toBe('');

    // Rerender with mutation error
    rerender(
      <WorkoutHeader
        {...defaultProps}
        mutationError="Failed to save workout set"
        onClearMutationError={onClear}
      />
    );

    const assertiveAfter = container.querySelector('[role="alert"]');
    expect(assertiveAfter).toBe(assertiveBefore);
    expect(assertiveAfter!.textContent).toBe('Failed to save workout set');

    // Dismiss button works
    const dismissBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(dismissBtn);
    expect(onClear).toHaveBeenCalledTimes(1);

    // Rerender back to idle
    rerender(
      <WorkoutHeader {...defaultProps} mutationError={null} onClearMutationError={onClear} />
    );

    expect(container.querySelector('[role="alert"]')).toBe(assertiveBefore);
    expect(assertiveBefore!.textContent).toBe('');
  });
});

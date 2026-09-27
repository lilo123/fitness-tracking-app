import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UndoToast } from './UndoToast';
import { expectNoA11yViolations } from '../../test/a11y';

describe('UndoToast', () => {
  it('renders generic toast and passes accessibility audit', async () => {
    const handleUndo = vi.fn();
    const handleDismiss = vi.fn();

    const { container } = render(
      <UndoToast
        toast={{
          verb: 'Set deleted',
          subject: 'Bench Press',
          detail: '135 lb × 8',
          onUndo: handleUndo,
          undoAriaLabel: 'Undo delete Bench Press',
        }}
        onDismiss={handleDismiss}
      />
    );

    expect(screen.getByText('Set deleted')).toBeInTheDocument();
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.getByText('135 lb × 8')).toBeInTheDocument();

    const undoBtn = screen.getByRole('button', { name: 'Undo delete Bench Press' });
    expect(undoBtn).toBeInTheDocument();
    expect(undoBtn.className).toContain('min-h-[44px]');

    fireEvent.click(undoBtn);
    expect(handleUndo).toHaveBeenCalledTimes(1);
    expect(handleDismiss).toHaveBeenCalledTimes(1);

    await expectNoA11yViolations(container);
  });

  describe('timer and interaction behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('omits Undo button when onUndo is not provided and showUndo is false', () => {
      render(
        <UndoToast
          toast={{
            verb: 'Exercise archived',
            subject: 'Incline Bench',
          }}
          onDismiss={vi.fn()}
        />
      );

      expect(screen.getByText('Exercise archived')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('pauses auto-hide timer on hover and resumes on mouse leave', () => {
      const handleDismiss = vi.fn();

      render(
        <UndoToast
          toast={{
            verb: 'Logged',
            subject: 'Power Bowl',
            onUndo: vi.fn(),
          }}
          durationMs={6000}
          onDismiss={handleDismiss}
        />
      );

      const undoBtn = screen.getByRole('button');

      // Advance 4000ms
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(handleDismiss).not.toHaveBeenCalled();

      // Hover button at 4000ms
      fireEvent.mouseEnter(undoBtn);

      // Advance past 6000ms (to 7000ms)
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(handleDismiss).not.toHaveBeenCalled();

      // Mouse leave -> should dismiss immediately since expired
      fireEvent.mouseLeave(undoBtn);
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });

    it('auto-dismisses after 6000ms by default', () => {
      const handleDismiss = vi.fn();

      render(
        <UndoToast
          toast={{
            verb: 'Logged',
            subject: 'Snack',
          }}
          onDismiss={handleDismiss}
        />
      );

      act(() => {
        vi.advanceTimersByTime(5900);
      });
      expect(handleDismiss).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });
});

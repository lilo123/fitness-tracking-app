import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditTemplateModal } from './EditTemplateModal';
import { expectNoA11yViolationsForRules } from '../../test/a11y';
import type { Exercise, RoutineTemplate } from '../../types/database';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('EditTemplateModal', () => {
  const mockTemplate: RoutineTemplate = {
    id: 'tpl-1',
    user_id: 'user-1',
    name: 'Push Day',
    is_master: false,
    days_of_week: ['Mon'],
    assigned_to: null,
    exercises: [],
  };

  const mockProps = {
    isOpen: true,
    template: mockTemplate,
    exercises: [] as Exercise[],
    targetUserId: 'user-1',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  it('has accessible label association for Template Name and uses input-text-sm (NEW-17)', () => {
    render(<EditTemplateModal {...mockProps} />);
    const input = screen.getByLabelText(/template name/i);
    expect(input).toBeDefined();
    expect(input.classList.contains('input-text-sm')).toBe(true);
    expect(input.classList.contains('text-sm')).toBe(false);
  });

  it('has no a11y label violations', async () => {
    const { container } = render(<EditTemplateModal {...mockProps} />);
    await expectNoA11yViolationsForRules(container, ['label']);
  });

  it('mounts template-error live region empty while idle and retains same node on error (NEW-15)', () => {
    const { container } = render(<EditTemplateModal {...mockProps} />);

    // Live region exists and is empty while idle
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe('');

    // Trigger save with no exercises
    fireEvent.click(screen.getByTestId('save-template-btn'));

    expect(alert?.textContent).toBe('Please add at least one exercise to the template.');
    expect(screen.getByTestId('template-error')).toBeDefined();

    // Live region DOM node remains identical
    expect(container.querySelector('[role="alert"]')).toBe(alert);
  });

  describe('accessibility and focus management', () => {
    it('traps focus, restores focus on close, and closes on Escape', () => {
      function Wrapper() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button data-testid="opener-btn" onClick={() => setOpen(true)}>
              Open
            </button>
            <EditTemplateModal
              {...mockProps}
              isOpen={open}
              onClose={() => setOpen(false)}
            />
          </div>
        );
      }

      render(<Wrapper />);
      const opener = screen.getByTestId('opener-btn');
      opener.focus();
      fireEvent.click(opener);

      // 1. Dialog element exists with ARIA attributes
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'edit-template-modal-title');

      // 2. Focus moved into dialog
      const firstFocusable = screen.getByRole('button', { name: /close dialog/i });
      expect(document.activeElement).toBe(firstFocusable);

      // 3. Tab wraps from last focusable to first focusable
      const saveBtn = screen.getByTestId('save-template-btn');
      saveBtn.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(firstFocusable);

      // 4. Shift+Tab wraps from first focusable to last focusable
      firstFocusable.focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(saveBtn);

      // 5. Escape closes the modal and restores focus to the opener
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it('closes nested ExercisePickerSheet first on Escape, then closes modal on second Escape', () => {
      function Wrapper() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button data-testid="opener-btn" onClick={() => setOpen(true)}>
              Open
            </button>
            <EditTemplateModal
              {...mockProps}
              isOpen={open}
              onClose={() => setOpen(false)}
            />
          </div>
        );
      }

      render(<Wrapper />);
      fireEvent.click(screen.getByTestId('opener-btn'));
      expect(screen.getByRole('dialog')).toBeDefined();

      // Open exercise picker sheet
      fireEvent.click(screen.getByTestId('open-exercise-picker'));
      expect(screen.getByTestId('close-exercise-picker')).toBeDefined();

      // First Escape closes picker only
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('close-exercise-picker')).toBeNull();
      expect(screen.getByRole('dialog')).toBeDefined();

      // Second Escape closes modal
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});


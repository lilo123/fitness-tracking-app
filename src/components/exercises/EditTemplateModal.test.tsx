import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});

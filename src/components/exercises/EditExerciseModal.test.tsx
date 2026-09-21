import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditExerciseModal } from './EditExerciseModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expectNoA11yViolationsForRules } from '../../test/a11y';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

describe('EditExerciseModal', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mockProps = {
    isOpen: true,
    exercise: {
      id: 'ex-1',
      name: 'Bench Press',
      body_part: 'Chest',
      is_master: false,
    },
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  it('has accessible label association for Exercise Name and uses input-text-sm (NEW-18)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <EditExerciseModal {...mockProps} />
      </QueryClientProvider>
    );
    const input = screen.getByLabelText(/exercise name/i);
    expect(input).toBeDefined();
    expect(input.classList.contains('input-text-sm')).toBe(true);
    expect(input.classList.contains('text-sm')).toBe(false);
  });

  it('has no a11y label violations', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <EditExerciseModal {...mockProps} />
      </QueryClientProvider>
    );
    await expectNoA11yViolationsForRules(container, ['label']);
  });

  it('mounts edit-exercise-error live region empty while idle and retains same node on error (NEW-15)', async () => {
    (supabase.from as any).mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: new Error('Failed to update exercise in DB') }),
      }),
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <EditExerciseModal {...mockProps} />
      </QueryClientProvider>
    );

    // Live region exists and is empty while idle
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe('');

    // Trigger save failure
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(alert?.textContent).toBe('Failed to update exercise in DB');
      expect(screen.getByTestId('edit-exercise-error')).toBeDefined();
    });

    // Alert DOM node is identical
    expect(container.querySelector('[role="alert"]')).toBe(alert);
  });
});


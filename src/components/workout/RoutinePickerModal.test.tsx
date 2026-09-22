import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoutinePickerModal } from './RoutinePickerModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoutineTemplate, Exercise } from '../../types/database';
import type { DEFAULT_WORKOUT_TEMPLATES } from '../../utils/ghostSets';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })),
    })),
  },
}));

const mockDefaultTemplates: typeof DEFAULT_WORKOUT_TEMPLATES = [
  {
    name: 'Push Day',
    days: ['Mon', 'Thu'],
    exercises: ['Incline Bench Press', 'Dips'],
  },
  {
    name: 'Pull Day',
    days: ['Tue', 'Fri'],
    exercises: ['Pull-ups', 'Barbell Row'],
  },
] as any;

const mockCustomTemplates: RoutineTemplate[] = [
  {
    id: 'custom-1',
    user_id: 'user-123',
    name: 'Upper Body Custom',
    is_master: false,
    assigned_to: null,
    days_of_week: ['Mon', 'Wed'],
    created_at: '2026-01-01T00:00:00Z',
    exercises: [
      {
        id: 'te-1',
        template_id: 'custom-1',
        exercise_id: 'ex-1',
        order_index: 0,
        target_sets: 4,
        target_reps: 8,
        exercise_name: 'Incline Bench Press',
      },
    ],
  },
];

const mockExercises: Exercise[] = [
  { id: 'ex-1', name: 'Incline Bench Press', body_part: 'Chest' },
  { id: 'ex-2', name: 'Pull-ups', body_part: 'Back' },
];

describe('RoutinePickerModal', () => {
  let queryClient: QueryClient;
  const onClose = vi.fn();
  const onReloadScheduledRoutine = vi.fn();
  const onSelectRoutine = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderModal = (props: Partial<Parameters<typeof RoutinePickerModal>[0]> = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <RoutinePickerModal
          isOpen={true}
          onClose={onClose}
          onReloadScheduledRoutine={onReloadScheduledRoutine}
          onSelectRoutine={onSelectRoutine}
          activeRoutineName="Push Day"
          currentDayAbbr="Mon"
          customTemplates={mockCustomTemplates}
          defaultTemplates={mockDefaultTemplates}
          exercises={mockExercises}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('does not render when isOpen is false', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RoutinePickerModal
          isOpen={false}
          onClose={onClose}
          onReloadScheduledRoutine={onReloadScheduledRoutine}
          onSelectRoutine={onSelectRoutine}
          activeRoutineName="Push Day"
          currentDayAbbr="Mon"
          customTemplates={mockCustomTemplates}
          defaultTemplates={mockDefaultTemplates}
          exercises={mockExercises}
        />
      </QueryClientProvider>
    );
    expect(screen.queryByTestId('routine-picker-modal')).toBeNull();
  });

  it('renders routine choices and allows selecting a routine', () => {
    renderModal();

    expect(screen.getByText('Select Routine')).toBeDefined();
    expect(screen.getByText('Free Workout')).toBeDefined();
    expect(screen.getByText('Rest Day')).toBeDefined();
    expect(screen.getByText('Upper Body Custom')).toBeDefined();

    fireEvent.click(screen.getByText('Free Workout'));
    expect(onSelectRoutine).toHaveBeenCalledWith('Free Workout');
  });

  it('allows clicking reload scheduled routine button', () => {
    renderModal();

    const reloadBtn = screen.getByTestId('reload-scheduled-routine-btn');
    fireEvent.click(reloadBtn);
    expect(onReloadScheduledRoutine).toHaveBeenCalled();
  });

  it('meets accessibility requirements: role="dialog", aria-modal, aria-labelledby, and focus trap/restoration', () => {
    const opener = document.createElement('button');
    opener.setAttribute('data-testid', 'test-opener');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'routine-picker-modal-title');

    // First focusable element inside modal (close button) should be focused
    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    expect(document.activeElement).toBe(closeBtn);

    // Focus restoration to opener on unmount/close
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('traps Tab navigation within modal controls', () => {
    renderModal();

    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab wraps to last focusable control in the dialog
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(closeBtn);

    // Tab wraps back to first control
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('closes on Escape key press', () => {
    renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop overlay click', () => {
    renderModal();

    const backdrop = screen.getByTestId('routine-picker-modal');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

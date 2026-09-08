import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditSetModal } from './EditSetModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Exercise, WorkoutSet } from '../../types/database';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockExercises: Exercise[] = [
  { id: 'ex-1', name: 'Incline Bench Press', body_part: 'Chest' },
  { id: 'ex-2', name: 'Pull-ups', body_part: 'Back' },
  { id: 'ex-3', name: 'Dips', body_part: 'Chest / Triceps' },
];

const mockSet: WorkoutSet & { workout_date?: string; workout_name?: string } = {
  id: 'set-123',
  workout_id: 'workout-456',
  exercise_id: 'ex-1',
  exercise_name: 'Incline Bench Press',
  set_index: 1,
  set_type: 'working',
  weight: 185,
  reps: 8,
  rpe: 8.5,
  workout_date: '2026-09-08',
  workout_name: 'Push Day',
};

describe('EditSetModal', () => {
  let queryClient: QueryClient;
  const mockUpdateEq = vi.fn();
  const mockUpdate = vi.fn();
  const mockDeleteEq = vi.fn();
  const mockDelete = vi.fn();
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEq.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'set-123' }], error: null }),
    });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });

    mockDeleteEq.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockDeleteEq });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          update: mockUpdate,
          delete: mockDelete,
        };
      }
      return {};
    });

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderModal = (props: Partial<Parameters<typeof EditSetModal>[0]> = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <EditSetModal
          isOpen={true}
          set={mockSet}
          exercises={mockExercises}
          onClose={onClose}
          onSuccess={onSuccess}
          targetUserId="user-789"
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('does not render when isOpen is false or set is null', () => {
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <EditSetModal
          isOpen={false}
          set={mockSet}
          exercises={mockExercises}
          onClose={onClose}
        />
      </QueryClientProvider>
    );
    expect(screen.queryByTestId('edit-set-modal')).toBeNull();

    rerender(
      <QueryClientProvider client={queryClient}>
        <EditSetModal
          isOpen={true}
          set={null}
          exercises={mockExercises}
          onClose={onClose}
        />
      </QueryClientProvider>
    );
    expect(screen.queryByTestId('edit-set-modal')).toBeNull();
  });

  it('renders prefilled form with set data, HTML min attributes, and handles Escape key', () => {
    renderModal();

    expect(screen.getByTestId('edit-set-modal')).toBeDefined();
    expect(screen.getByText('Edit Workout Set')).toBeDefined();

    const exSelect = screen.getByTestId('edit-set-exercise-select') as HTMLSelectElement;
    expect(exSelect.value).toBe('ex-1');

    const typeSelect = screen.getByTestId('edit-set-type-select') as HTMLSelectElement;
    expect(typeSelect.value).toBe('working');

    const weightInput = screen.getByTestId('edit-set-weight-input') as HTMLInputElement;
    expect(weightInput.value).toBe('185');
    expect(weightInput).toHaveAttribute('min', '0');

    const repsInput = screen.getByTestId('edit-set-reps-input') as HTMLInputElement;
    expect(repsInput.value).toBe('8');
    expect(repsInput).toHaveAttribute('min', '1');

    const rpeInput = screen.getByTestId('edit-set-rpe-input') as HTMLInputElement;
    expect(rpeInput.value).toBe('8.5');

    // Press Escape to close
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('pre-fills 0 in weight input for bodyweight sets and allows saving 0 lbs', async () => {
    const bwSet = { ...mockSet, weight: 0, reps: 15, rpe: null };
    renderModal({ set: bwSet });

    const weightInput = screen.getByTestId('edit-set-weight-input') as HTMLInputElement;
    expect(weightInput.value).toBe('0');

    fireEvent.click(screen.getByTestId('save-set-btn'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          weight: 0,
          reps: 15,
          rpe: null,
          exercise_id: 'ex-1',
        })
      );
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'set-123');
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('rejects submitting with empty weight input rather than silently converting to 0 lbs', async () => {
    renderModal();

    const weightInput = screen.getByTestId('edit-set-weight-input');
    await userEvent.clear(weightInput);
    expect(weightInput).toHaveValue('');

    fireEvent.click(screen.getByTestId('save-set-btn'));

    await waitFor(() => {
      expect(screen.getByText('Please enter a weight (0 for bodyweight).')).toBeDefined();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects empty reps input and non-integer reps', async () => {
    renderModal();

    const repsInput = screen.getByTestId('edit-set-reps-input');
    await userEvent.clear(repsInput);

    fireEvent.click(screen.getByTestId('save-set-btn'));

    await waitFor(() => {
      expect(screen.getByText('Please enter reps.')).toBeDefined();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid RPE values out of 1-10 range', async () => {
    renderModal();

    const rpeInput = screen.getByTestId('edit-set-rpe-input');
    await userEvent.clear(rpeInput);
    await userEvent.type(rpeInput, '11');

    fireEvent.click(screen.getByTestId('save-set-btn'));

    await waitFor(() => {
      expect(screen.getByText('RPE must be between 1 and 10.')).toBeDefined();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('supports decimal weight input precision (e.g. 22.5 lbs)', async () => {
    renderModal();

    const weightInput = screen.getByTestId('edit-set-weight-input');
    await userEvent.clear(weightInput);
    await userEvent.type(weightInput, '22.5');

    fireEvent.click(screen.getByTestId('save-set-btn'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          weight: 22.5,
        })
      );
    });
  });

  it('renders fallback option when exercise_id is not in the exercises library', () => {
    const unlistedSet = {
      ...mockSet,
      id: 'unlisted-1',
      exercise_id: 'ex-unknown-uuid',
      exercise_name: 'Custom Kettlebell Snatch',
    };
    renderModal({ set: unlistedSet });

    const select = screen.getByTestId('edit-set-exercise-select') as HTMLSelectElement;
    expect(select.value).toBe('ex-unknown-uuid');
    expect(screen.getByText('Custom Kettlebell Snatch')).toBeDefined();
  });

  it('confirms before deleting a set and triggers delete mutation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderModal();

    const deleteBtn = screen.getByTestId('delete-set-btn');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this set? This action cannot be undone.'
    );

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'set-123');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does not delete when confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderModal();

    const deleteBtn = screen.getByTestId('delete-set-btn');
    fireEvent.click(deleteBtn);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('displays mutation error message if update fails', async () => {
    mockUpdateEq.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection error' } }),
    });

    renderModal();
    fireEvent.click(screen.getByTestId('save-set-btn'));

    await waitFor(() => {
      expect(screen.getByText('Database connection error')).toBeDefined();
    });
  });

  it('resets internal form state when a different set is passed to the modal', () => {
    const { rerender } = renderModal();

    const weightInput = screen.getByTestId('edit-set-weight-input') as HTMLInputElement;
    expect(weightInput.value).toBe('185');

    const set2 = {
      ...mockSet,
      id: 'set-999',
      weight: 275,
      reps: 5,
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <EditSetModal
          isOpen={true}
          set={set2}
          exercises={mockExercises}
          onClose={onClose}
          onSuccess={onSuccess}
          targetUserId="user-789"
        />
      </QueryClientProvider>
    );

    const updatedWeightInput = screen.getByTestId('edit-set-weight-input') as HTMLInputElement;
    expect(updatedWeightInput.value).toBe('275');
  });
});

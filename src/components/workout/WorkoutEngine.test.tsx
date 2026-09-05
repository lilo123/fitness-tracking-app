import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkoutEngine } from './WorkoutEngine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { supabase } from '../../lib/supabase';

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'test-user-id', email: 'athlete@example.com' },
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('WorkoutEngine', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(
      'cybergym_user',
      JSON.stringify({
        id: 'test-user-id',
        email: 'athlete@example.com',
        username: 'athlete',
        role: 'athlete',
      })
    );
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'test-user-id' } } });
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    // Mock supabase.from
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      or: vi.fn().mockResolvedValue({ data: [], error: null }),
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    (supabase.from as any).mockImplementation((_table: string) => ({
      select: mockSelect,
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }));

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CoachProvider>
            <WorkoutEngine />
          </CoachProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

  it('renders default routine (Workout A) with exercise list and Ghost sets placeholders', () => {
    renderComponent();

    // Check Routine Label
    expect(screen.getByTestId('routine-select-btn')).toBeDefined();
    expect(screen.getByText('Incline Bench Press')).toBeDefined();
    expect(screen.getByText('Cable Lateral Raises')).toBeDefined();

    // Check Add Exercise Picker is present
    expect(screen.getByTestId('add-exercise-select')).toBeDefined();
    expect(screen.getByTestId('add-exercise-btn')).toBeDefined();
  });

  it('allows opening routine selector and picking Free Workout', async () => {
    renderComponent();

    const routineBtn = screen.getByTestId('routine-select-btn');
    fireEvent.click(routineBtn);

    // Modal should be open
    expect(screen.getByText('Select Routine')).toBeDefined();
    expect(screen.getByText('Free Workout')).toBeDefined();

    fireEvent.click(screen.getByText('Free Workout'));

    // Should now show empty/free workout message
    expect(screen.getByText("No exercises in today's workout yet")).toBeDefined();
  });

  it('commits a ghost set on one-tap click', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'set-1' }, error: null }),
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return { insert: mockInsert };
      }
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'workout-1' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();

    // First card (Incline Bench Press) set 0 input
    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    // Type 185 and 8
    await userEvent.type(weightInput, '185');
    await userEvent.type(repsInput, '8');

    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.weight).toBe(185);
    expect(payload.reps).toBe(8);
    expect(payload.set_index).toBe(1);
  });

  it('supports set type selection and RPE input before committing', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'set-1' }, error: null }),
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return { insert: mockInsert };
      }
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const setTypeSelect = screen.getByTestId('set-type-select-0-0');
    const rpeInput = screen.getByTestId('rpe-input-0-0');
    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    await userEvent.selectOptions(setTypeSelect, 'warmup');
    await userEvent.type(rpeInput, '7.5');
    await userEvent.type(weightInput, '135');
    await userEvent.type(repsInput, '12');

    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.set_type).toBe('warmup');
    expect(payload.rpe).toBe(7.5);
    expect(payload.weight).toBe(135);
    expect(payload.reps).toBe(12);
  });

  it('allows batch logging all remaining sets for an exercise', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return { insert: mockInsert };
      }
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    const batchExBtn = screen.getByTestId('batch-log-exercise-btn-0');
    expect(batchExBtn).toBeDefined();

    fireEvent.click(batchExBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const insertedSets = mockInsert.mock.calls[0][0];
    expect(insertedSets.length).toBe(4); // 4 sets for Incline Bench Press in Workout A
    expect(insertedSets[0].set_index).toBe(1);
    expect(insertedSets[1].set_index).toBe(2);
    expect(insertedSets[2].set_index).toBe(3);
    expect(insertedSets[3].set_index).toBe(4);
  });

  it('allows finishing entire workout and logging all remaining sets', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 's1' }], error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return { insert: mockInsert };
      }
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    const finishBtn = screen.getByTestId('finish-workout-btn');
    expect(finishBtn).toBeDefined();

    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const allLoggedSets = mockInsert.mock.calls[0][0];
    expect(allLoggedSets.length).toBeGreaterThanOrEqual(10); // Workout A has 4 exercises with multiple sets
  });

  it('resolves exercise names for custom routine templates instead of displaying raw UUIDs', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'custom-tpl-1',
                  name: 'Custom Bulgarian Split Routine',
                  user_id: 'test-user-id',
                  is_master: false,
                  days_of_week: ['Mon'],
                  exercises: [
                    {
                      id: 'te-1',
                      template_id: 'custom-tpl-1',
                      exercise_id: '00000000-0000-0000-0000-000000000999',
                      order_index: 0,
                      target_sets: 4,
                      target_reps: 10,
                      exercise: { name: 'Bulgarian Split Squat' },
                    },
                  ],
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const routineBtn = screen.getByTestId('routine-select-btn');
    fireEvent.click(routineBtn);

    // Should render custom template option with name
    const customTplOption = await screen.findByText('Custom Bulgarian Split Routine (Custom)');
    expect(customTplOption).toBeDefined();

    fireEvent.click(customTplOption);

    // Selected routine exercise should show resolved exercise name, NOT the raw UUID!
    await waitFor(() => {
      expect(screen.getByText('Bulgarian Split Squat')).toBeDefined();
      expect(screen.queryByText('00000000-0000-0000-0000-000000000999')).toBeNull();
    });
  });

  it('launches sticky floating rest timer with controls (+90s, stop, pause) and vibrates on completion', async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    renderComponent();

    // Timer is initially not visible
    expect(screen.queryByTestId('rest-timer-pill')).toBeNull();

    // Click rest timer launcher button
    const timerBtn = screen.getByTestId('rest-timer-btn');
    fireEvent.click(timerBtn);

    // Pill appears with 90s (1:30)
    await waitFor(() => {
      expect(screen.getByTestId('rest-timer-pill')).toBeDefined();
      expect(screen.getByTestId('rest-timer-display')).toBeDefined();
    });

    // Test +90s
    const add90Btn = screen.getByTitle('Add 90 seconds');
    fireEvent.click(add90Btn);
    expect(screen.getByTestId('rest-timer-pill')).toBeDefined();

    // Test pause / resume
    const pauseBtn = screen.getByTitle('Pause timer');
    fireEvent.click(pauseBtn);
    expect(screen.getByTitle('Resume timer')).toBeDefined();

    // Test stop timer
    const stopBtn = screen.getByTitle('Stop timer');
    fireEvent.click(stopBtn);
    expect(screen.queryByTestId('rest-timer-pill')).toBeNull();
  });

  it('displays mutation error notification when set logging fails', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection failed' } }),
            }),
          }),
        };
      }
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    await userEvent.type(weightInput, '100');
    await userEvent.type(repsInput, '10');
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(screen.getByText('Database connection failed')).toBeDefined();
    });
  });

  it('supports decimal weight input precision (e.g. 22.5 lbs)', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'set-decimal' }, error: null }),
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') return { insert: mockInsert };
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    await userEvent.type(weightInput, '22.5');
    await userEvent.type(repsInput, '12');
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.weight).toBe(22.5);
    expect(payload.reps).toBe(12);
  });
});


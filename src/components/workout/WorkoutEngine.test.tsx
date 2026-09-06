import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkoutEngine } from './WorkoutEngine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { supabase } from '../../lib/supabase';
import { getLocalDateStr } from '../../utils/ghostSets';

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

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
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

  const selectWorkoutA = async () => {
    const routineBtn = screen.getByTestId('routine-select-btn');
    fireEvent.click(routineBtn);
    const workoutABtn = await screen.findByText('Workout A (Push, Quads & Core)');
    fireEvent.click(workoutABtn);
  };

  it('renders Sunday Rest Day card by default on Sunday when no routine is scheduled', () => {
    renderComponent();

    // Check Routine Label
    expect(screen.getByTestId('routine-select-btn')).toBeDefined();
    expect(screen.getAllByText('Rest Day').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Rest & Recovery')).toBeDefined();
    expect(screen.getByText('Choose Routine')).toBeDefined();
  });

  it('automatically schedules Push, Quads, & Core - Reduced on Monday', async () => {
    renderComponent();

    const dateInput = screen.getByTestId('workout-date-input');
    fireEvent.change(dateInput, { target: { value: '2026-09-07' } });

    await waitFor(() => {
      expect(screen.getByText('Push, Quads, & Core - Reduced')).toBeDefined();
      expect(screen.getByText('Incline Bench Press')).toBeDefined();
      expect(screen.getByText('Cable Lateral Raises')).toBeDefined();
      expect(screen.getByText('Dips')).toBeDefined();
      expect(screen.getByText('Leg Extension Machine')).toBeDefined();
      expect(screen.getByText('Overhead Tricep Cable Pull')).toBeDefined();
    });
  });

  it('renders streamlined 5-column grid headers and omits Type and RPE inputs', async () => {
    renderComponent();
    await selectWorkoutA();

    // Column headers
    expect(await screen.findByText('Set')).toBeDefined();
    expect(screen.getByText('Previous')).toBeDefined();
    expect(screen.getByText('Weight')).toBeDefined();
    expect(screen.getByText('Reps')).toBeDefined();
    expect(screen.getByText('Action')).toBeDefined();

    // Assert Type dropdown and RPE input are completely absent
    expect(screen.queryByTestId('set-type-select-0-0')).toBeNull();
    expect(screen.queryByPlaceholderText('RPE')).toBeNull();
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

  it('commits a ghost set on one-tap click with set_type: working and rpe: null', async () => {
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
    await selectWorkoutA();

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
    expect(payload.set_type).toBe('working');
    expect(payload.rpe).toBeNull();
  });

  it('allows batch logging all remaining sets for an exercise', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], error: null }),
    });

    const pastWorkoutSets = [
      {
        id: 'ps-1',
        workout_id: 'prev-w1',
        exercise_id: 'e0000000-0000-0000-0000-000000000001',
        set_index: 1,
        set_type: 'working',
        weight: 185,
        reps: 8,
        workouts: { date: '2026-08-30T10:00:00Z', name: 'Workout A' },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: pastWorkoutSets, error: null }),
            }),
          }),
        };
      }
      if (table === 'workouts') {
        const selectObj: any = {};
        selectObj.eq = vi.fn((field: string) => {
          if (field === 'user_id') {
            const userChain: any = Promise.resolve({ data: [{ id: 'prev-w1', date: '2026-08-30' }], error: null });
            userChain.eq = vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null });
            return userChain;
          }
          return Promise.resolve({ data: [], error: null });
        });
        return {
          select: vi.fn().mockReturnValue(selectObj),
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
    await selectWorkoutA();

    await waitFor(() => {
      expect(screen.getByTestId('ghost-weight-0-0')).toHaveAttribute('placeholder', '185');
    });

    const batchExBtn = screen.getByTestId('batch-log-exercise-btn-0');
    expect(batchExBtn).toBeDefined();

    fireEvent.click(batchExBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const insertedSets = mockInsert.mock.calls[0][0];
    expect(insertedSets.length).toBe(4); // 4 sets for Incline Bench Press in Workout A
    insertedSets.forEach((set: any, idx: number) => {
      expect(set.set_index).toBe(idx + 1);
      expect(set.weight).toBe(185);
      expect(set.reps).toBe(8);
      // Verify zero 100x10 fallbacks
      expect(set.weight).not.toBe(100);
      expect(set.reps).not.toBe(10);
    });
  });

  it('allows finishing entire workout and logging all remaining sets with zero 100x10 fallbacks', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 's1' }], error: null }),
    });

    const pastWorkoutSets = [
      { id: 'ps-1', workout_id: 'prev-w1', exercise_id: 'e0000000-0000-0000-0000-000000000001', set_index: 1, set_type: 'working', weight: 185, reps: 8, workouts: { date: '2026-08-30' } },
      { id: 'ps-2', workout_id: 'prev-w1', exercise_id: 'e0000000-0000-0000-0000-000000000002', set_index: 1, set_type: 'working', weight: 35, reps: 12, workouts: { date: '2026-08-30' } },
      { id: 'ps-3', workout_id: 'prev-w1', exercise_id: 'e0000000-0000-0000-0000-000000000003', set_index: 1, set_type: 'working', weight: 50, reps: 10, workouts: { date: '2026-08-30' } },
      { id: 'ps-4', workout_id: 'prev-w1', exercise_id: 'e0000000-0000-0000-0000-000000000004', set_index: 1, set_type: 'working', weight: 140, reps: 12, workouts: { date: '2026-08-30' } },
      { id: 'ps-5', workout_id: 'prev-w1', exercise_id: 'e0000000-0000-0000-0000-000000000005', set_index: 1, set_type: 'working', weight: 65, reps: 10, workouts: { date: '2026-08-30' } },
      { id: 'ps-6', workout_id: 'prev-w1', exercise_id: 'e0000000-0000-0000-0000-000000000006', set_index: 1, set_type: 'working', weight: 25, reps: 15, workouts: { date: '2026-08-30' } },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: pastWorkoutSets, error: null }),
            }),
          }),
        };
      }
      if (table === 'workouts') {
        const selectObj: any = {};
        selectObj.eq = vi.fn((field: string) => {
          if (field === 'user_id') {
            const userChain: any = Promise.resolve({ data: [{ id: 'prev-w1', date: '2026-08-30' }], error: null });
            userChain.eq = vi.fn().mockResolvedValue({ data: [{ id: 'workout-1' }], error: null });
            return userChain;
          }
          return Promise.resolve({ data: [], error: null });
        });
        return {
          select: vi.fn().mockReturnValue(selectObj),
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
    await selectWorkoutA();

    await waitFor(() => {
      expect(screen.getByTestId('ghost-weight-0-0')).toHaveAttribute('placeholder', '185');
    });

    const finishBtn = screen.getByTestId('finish-workout-btn');
    expect(finishBtn).toBeDefined();

    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const allLoggedSets = mockInsert.mock.calls[0][0];
    expect(allLoggedSets.length).toBeGreaterThanOrEqual(10); // Workout A has 6 exercises
    allLoggedSets.forEach((set: any) => {
      expect(set.weight).toBeGreaterThan(0);
      expect(set.reps).toBeGreaterThan(0);
      expect(set.weight === 100 && set.reps === 10).toBe(false);
    });
  });

  it('prunes unperformed / blank sets and does not commit 100x10 when no ghost sets or input exist', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    await selectWorkoutA();

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    const batchExBtn = screen.getByTestId('batch-log-exercise-btn-0');
    fireEvent.click(batchExBtn);

    // Unperformed sets must be pruned: mockInsert must NOT have been called
    expect(mockInsert).not.toHaveBeenCalled();
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
    const customTplOption = await screen.findByText('Custom Bulgarian Split Routine');
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
    await selectWorkoutA();

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
    await selectWorkoutA();

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

  it('rejects committing a set when reps is zero or blank without ghost values', async () => {
    const mockInsert = vi.fn();
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return { insert: mockInsert };
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
    await selectWorkoutA();

    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    // Only type weight, leave reps blank (0 reps)
    await userEvent.type(weightInput, '150');
    fireEvent.click(commitBtn);

    // Should NOT commit and show error
    expect(mockInsert).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter weight and reps or use previous set values.')).toBeDefined();
  });

  it('displays mutation error when batch logging an exercise that cannot be resolved to a UUID', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'custom-tpl-invalid',
                  name: 'Custom Broken Routine',
                  user_id: 'test-user-id',
                  is_master: false,
                  days_of_week: ['Mon'],
                  exercises: [
                    {
                      id: 'te-1',
                      template_id: 'custom-tpl-invalid',
                      exercise_id: 'invalid-non-uuid-exercise',
                      order_index: 0,
                      target_sets: 2,
                    },
                  ],
                },
              ],
              error: null,
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

    const routineBtn = screen.getByTestId('routine-select-btn');
    fireEvent.click(routineBtn);

    const customTplOption = await screen.findByText('Custom Broken Routine');
    fireEvent.click(customTplOption);

    // Type into draft for this exercise
    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    await userEvent.type(weightInput, '100');
    await userEvent.type(repsInput, '10');

    const batchBtn = screen.getByTestId('batch-log-exercise-btn-0');
    fireEvent.click(batchBtn);

    await waitFor(() => {
      expect(screen.getByText(/cannot be resolved to a valid UUID/i)).toBeDefined();
    });
  });

  it('preserves uncompleted exercises when existing logged sets exist for today', async () => {
    const today = getLocalDateStr(new Date());
    const loggedSetsToday = [
      {
        id: 's-today-1',
        workout_id: 'workout-today',
        exercise_id: 'e0000000-0000-0000-0000-000000000001',
        set_index: 1,
        set_type: 'working',
        weight: 185,
        reps: 8,
        rpe: null,
        created_at: `${today}T10:00:00Z`,
        workouts: { id: 'workout-today', date: today, name: 'Workout A (Push, Quads & Core)' },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: loggedSetsToday, error: null }),
            }),
            order: vi.fn().mockResolvedValue({ data: loggedSetsToday, error: null }),
          }),
        };
      }
      if (table === 'workouts') {
        const selectObj: any = {};
        selectObj.eq = vi.fn((field: string) => {
          if (field === 'user_id') {
            const userChain: any = Promise.resolve({
              data: [{ id: 'workout-today', date: today, name: 'Workout A (Push, Quads & Core)' }],
              error: null,
            });
            userChain.eq = vi.fn().mockResolvedValue({
              data: [{ id: 'workout-today', date: today, name: 'Workout A (Push, Quads & Core)' }],
              error: null,
            });
            return userChain;
          }
          return Promise.resolve({ data: [], error: null });
        });
        return {
          select: vi.fn().mockReturnValue(selectObj),
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

    // Incline Bench Press was logged, but all remaining exercises in Workout A should still be preserved
    await waitFor(() => {
      expect(screen.getByText('Incline Bench Press')).toBeDefined();
      expect(screen.getByText('Cable Lateral Raises')).toBeDefined();
      expect(screen.getByText('Dips')).toBeDefined();
      expect(screen.getByText('Leg Extension Machine')).toBeDefined();
    });
  });

  it('automatically transitions to Rest Day when user selects Sunday date', async () => {
    // Start on Monday
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
    renderComponent();

    const dateInput = screen.getByTestId('workout-date-input');
    // Change date to Sunday
    fireEvent.change(dateInput, { target: { value: '2026-09-06' } });

    await waitFor(() => {
      expect(screen.getAllByText('Rest Day').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Rest & Recovery')).toBeDefined();
      expect(screen.getByText('Choose Routine')).toBeDefined();
    });
  });

  it('prunes input drafts when batch logging an exercise', async () => {
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
    await selectWorkoutA();

    // Type drafts for row 0
    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    await userEvent.type(weightInput, '155');
    await userEvent.type(repsInput, '8');

    const batchBtn = screen.getByTestId('batch-log-exercise-btn-0');
    fireEvent.click(batchBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  it('populates targetSetCounts for logged workouts with unknown routine templates', async () => {
    const today = '2026-09-06';
    const loggedSets = [
      {
        id: 's-custom-1',
        workout_id: 'w-custom-1',
        exercise_id: 'e0000000-0000-0000-0000-000000000001',
        exercise_name: 'Incline Bench Press',
        set_index: 1,
        set_type: 'working',
        weight: 185,
        reps: 8,
        rpe: null,
        created_at: `${today}T10:00:00Z`,
        workouts: { id: 'w-custom-1', date: today, name: 'Ad-hoc Arm Blast' },
      },
      {
        id: 's-custom-2',
        workout_id: 'w-custom-1',
        exercise_id: 'e0000000-0000-0000-0000-000000000001',
        exercise_name: 'Incline Bench Press',
        set_index: 2,
        set_type: 'working',
        weight: 185,
        reps: 8,
        rpe: null,
        created_at: `${today}T10:05:00Z`,
        workouts: { id: 'w-custom-1', date: today, name: 'Ad-hoc Arm Blast' },
      },
      {
        id: 's-custom-3',
        workout_id: 'w-custom-1',
        exercise_id: 'e0000000-0000-0000-0000-000000000001',
        exercise_name: 'Incline Bench Press',
        set_index: 3,
        set_type: 'working',
        weight: 185,
        reps: 8,
        rpe: null,
        created_at: `${today}T10:10:00Z`,
        workouts: { id: 'w-custom-1', date: today, name: 'Ad-hoc Arm Blast' },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: loggedSets, error: null }),
            }),
            order: vi.fn().mockResolvedValue({ data: loggedSets, error: null }),
          }),
        };
      }
      if (table === 'workouts') {
        const selectObj: any = {};
        selectObj.eq = vi.fn((field: string) => {
          if (field === 'user_id') {
            const userChain: any = Promise.resolve({
              data: [{ id: 'w-custom-1', date: today, name: 'Ad-hoc Arm Blast' }],
              error: null,
            });
            userChain.eq = vi.fn().mockResolvedValue({
              data: [{ id: 'w-custom-1', date: today, name: 'Ad-hoc Arm Blast' }],
              error: null,
            });
            return userChain;
          }
          return Promise.resolve({ data: [], error: null });
        });
        return { select: vi.fn().mockReturnValue(selectObj) };
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
      expect(screen.getByText('Ad-hoc Arm Blast')).toBeDefined();
      expect(screen.getByText('Incline Bench Press')).toBeDefined();
      expect(screen.getByText('3/3 Sets')).toBeDefined();
    });
  });

  it('deduplicates custom and default templates in routine modal and prioritizes custom DB template without (Custom) suffix', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'tpl-custom-push',
                  name: 'Push, Quads, & Core - Reduced',
                  days_of_week: ['Mon', 'Thu'],
                  exercises: [
                    {
                      exercise_id: 'ex-bench',
                      order_index: 0,
                      target_sets: 4,
                      target_reps: 8,
                      exercise: { name: 'Incline Bench Press' },
                    },
                    {
                      exercise_id: 'ex-custom-ext',
                      order_index: 1,
                      target_sets: 3,
                      target_reps: 12,
                      exercise: { name: 'Custom Quad Destroyer' },
                    },
                  ],
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { id: 'ex-bench', name: 'Incline Bench Press', body_part: 'Chest' },
                { id: 'ex-custom-ext', name: 'Custom Quad Destroyer', body_part: 'Legs' },
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

    // Wait for custom template to load and render exercise subtitle
    await screen.findByText(/Custom Quad Destroyer/);

    // Verify template appears exactly once in modal list (deduplicated with default)
    const matchingRoutines = screen.getAllByText('Push, Quads, & Core - Reduced');
    expect(matchingRoutines.length).toBe(1);

    // Verify "(Custom)" suffix is NOT rendered
    expect(screen.queryByText(/Push, Quads, & Core - Reduced \(Custom\)/)).toBeNull();

    // Click template to load
    fireEvent.click(matchingRoutines[0]);

    // Verify custom DB exercises loaded (Database precedence)
    await waitFor(() => {
      expect(screen.getByText('Custom Quad Destroyer')).toBeDefined();
    });
  });

  it('respects auto_rest_timer=false preference: does not auto-start rest timer on set commit, but manual timer works', async () => {
    localStorage.setItem('cybergym_auto_rest_timer', 'false');

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'logged-set-notimer',
            set_index: 1,
            weight: 225,
            reps: 8,
          },
          error: null,
        }),
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    await selectWorkoutA();

    // Verify floating rest timer is initially NOT visible
    expect(screen.queryByTestId('rest-timer-pill')).toBeNull();

    // Find and commit a set with weight and reps
    const weightInput = await screen.findByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    await userEvent.type(weightInput, '185');
    await userEvent.type(repsInput, '8');
    fireEvent.click(commitBtn);

    // Set was logged
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    // Auto rest timer should NOT have started
    expect(screen.queryByTestId('rest-timer-pill')).toBeNull();

    // Clicking manual rest timer in header launches timer
    const manualRestBtn = screen.getByTestId('rest-timer-btn');
    fireEvent.click(manualRestBtn);

    // Timer is now active and pill displayed
    expect(screen.getByTestId('rest-timer-pill')).toBeDefined();
    expect(screen.getByTestId('rest-timer-display').textContent).toBe('1:30');
  });

  it('switches to custom routine with empty exercises and correctly clears active exercises without stale state', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'tpl-empty-custom',
                  name: 'Empty Custom Routine',
                  days_of_week: [],
                  exercises: [],
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
    // First select Workout A which has exercises
    await selectWorkoutA();
    expect(await screen.findByText('Incline Bench Press')).toBeDefined();

    // Now open routine modal and select Empty Custom Routine
    const routineBtn = screen.getByTestId('routine-select-btn');
    fireEvent.click(routineBtn);

    const emptyOption = await screen.findByText('Empty Custom Routine');
    fireEvent.click(emptyOption);

    // Active exercises from previous routine should be cleared
    await waitFor(() => {
      expect(screen.queryByText('Incline Bench Press')).toBeNull();
      expect(screen.getByText('Empty Custom Routine')).toBeDefined();
    });
  });
});


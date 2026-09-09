import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkoutEngine } from './WorkoutEngine';
import { HistoryView } from '../history/HistoryView';
import { GlobalRestTimerPill } from '../common/GlobalRestTimerPill';
import { restTimerStore } from '../../utils/restTimerStore';
import { workoutSessionStore } from '../../utils/workoutSessionStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { useCoach } from '../../hooks/useCoach';
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
    sessionStorage.clear();
    restTimerStore.resetForTesting();
    workoutSessionStore.resetForTesting();
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
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
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
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
            <GlobalRestTimerPill />
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

  it('rejects non-numeric NaN values in weight and reps to protect against corrupt mutations', async () => {
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
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    fireEvent.change(weightInput, { target: { value: 'abc' } });
    fireEvent.change(repsInput, { target: { value: 'xyz' } });
    fireEvent.click(commitBtn);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter weight and reps or use previous set values.')).toBeDefined();
  });

  it('clamps stepper decrement so target sets cannot drop below already logged sets count', async () => {
    const todaySets = [
      { id: 's1', workout_id: 'w1', exercise_id: 'e0000000-0000-0000-0000-000000000001', set_index: 1, weight: 185, reps: 8, set_type: 'working', workouts: { date: '2026-09-06', name: 'Workout A' } },
      { id: 's2', workout_id: 'w1', exercise_id: 'e0000000-0000-0000-0000-000000000001', set_index: 2, weight: 185, reps: 8, set_type: 'working', workouts: { date: '2026-09-06', name: 'Workout A' } },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sets') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: todaySets, error: null }),
            }),
          }),
        };
      }
      if (table === 'workouts') {
        const selectObj: any = {};
        selectObj.eq = vi.fn((field: string) => {
          if (field === 'user_id') {
            const userChain: any = Promise.resolve({ data: [{ id: 'w1', date: '2026-09-06' }], error: null });
            userChain.eq = vi.fn().mockResolvedValue({ data: [{ id: 'w1' }], error: null });
            return userChain;
          }
          return Promise.resolve({ data: [], error: null });
        });
        return {
          select: vi.fn().mockReturnValue(selectObj),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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

    // Wait for the query to resolve and display the initial 2/4 Sets badge
    expect(await screen.findByText('2/4 Sets')).toBeDefined();

    // Default target sets for Incline Bench Press in Workout A is 4
    const decreaseBtns = screen.getAllByTitle('Decrease target sets');
    const decreaseBtn = decreaseBtns[0];

    // Decrement from 4 to 3
    fireEvent.click(decreaseBtn);
    expect(screen.getByText('2/3 Sets')).toBeDefined();

    // Decrement from 3 to 2 (which equals setsToday.length)
    fireEvent.click(decreaseBtn);
    expect(screen.getByText('2/2 Sets')).toBeDefined();

    // Now decreaseBtn should be disabled because targetCount == setsToday.length
    expect(decreaseBtn).toBeDisabled();

    // Attempting to click again should not reduce below 2
    fireEvent.click(decreaseBtn);
    expect(screen.getByText('2/2 Sets')).toBeDefined();
  });

  it('toggles exercise accordion via keyboard Space and Enter keys on Line 1 title row', async () => {
    renderComponent();
    await selectWorkoutA();

    const titleButton = screen.getByLabelText(/Incline Bench Press, collapse exercise/i);
    expect(titleButton).toHaveAttribute('aria-expanded', 'true');

    // Press Enter to collapse
    fireEvent.keyDown(titleButton, { key: 'Enter', code: 'Enter' });
    expect(titleButton).toHaveAttribute('aria-expanded', 'false');

    // Press Space to re-expand
    fireEvent.keyDown(titleButton, { key: ' ', code: 'Space' });
    expect(titleButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('sanitizes comma decimal separator to dot in weight input', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
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
    await selectWorkoutA();

    const weightInput = screen.getByTestId('ghost-weight-0-0');
    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    // Type with comma
    await userEvent.type(weightInput, '45,5');
    await userEvent.type(repsInput, '10');
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.weight).toBe(45.5);
    expect(payload.reps).toBe(10);
  });

  it('allows logging 0 lbs bodyweight sets with positive reps', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
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

    await userEvent.type(weightInput, '0');
    await userEvent.type(repsInput, '15');
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.weight).toBe(0);
    expect(payload.reps).toBe(15);
  });

  it('rejects logging set when weight is negative or reps <= 0', async () => {
    const mockInsert = vi.fn();

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

    const repsInput = screen.getByTestId('ghost-reps-0-0');
    const commitBtn = screen.getByTestId('commit-set-btn-0-0');

    // reps 0
    await userEvent.type(repsInput, '0');
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(screen.getByText('Please enter weight and reps or use previous set values.')).toBeDefined();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('renders 0 instead of lbs in placeholder and BW in PR badge when ghost set weight is 0', async () => {
    const historicalSets = [
      {
        id: 'hist-1',
        workout_id: 'w-prev',
        exercise_id: 'Incline Bench Press',
        exercise_name: 'Incline Bench Press',
        weight: 0,
        reps: 12,
        set_index: 1,
        set_type: 'working',
        created_at: '2026-09-01T10:00:00Z',
        workout_date: '2026-09-01',
        workouts: { date: '2026-09-01', name: 'Workout A' },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [{ id: 'w-prev', date: '2026-09-01', name: 'Workout A' }], error: null }),
          }),
        };
      }
      if (table === 'sets') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: historicalSets, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();
    await selectWorkoutA();

    await waitFor(() => {
      const weightInput = screen.getByTestId('ghost-weight-0-0');
      expect(weightInput).toHaveAttribute('placeholder', '0');
      expect(screen.getByText('PR: BW×12')).toBeDefined();
    });
  });

  it('preserves ad-hoc added exercises in sessionStorage across remount (simulated tab switch)', async () => {
    sessionStorage.clear();
    const { unmount } = renderComponent();
    await selectWorkoutA();

    // Select and add an exercise
    const addSelect = screen.getByTestId('add-exercise-select');
    fireEvent.change(addSelect, { target: { value: 'Lat Pull Down' } });
    fireEvent.click(screen.getByTestId('add-exercise-btn'));

    await waitFor(() => {
      expect(screen.getByText('Lat Pull Down')).toBeDefined();
    });

    // Simulate tab switch by unmounting and remounting
    unmount();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Lat Pull Down')).toBeDefined();
    });
  });

  it('clears uncommitted ad-hoc drafts from sessionStorage when selecting a new routine', async () => {
    sessionStorage.clear();
    renderComponent();
    await selectWorkoutA();

    const addSelect = screen.getByTestId('add-exercise-select');
    fireEvent.change(addSelect, { target: { value: 'Lat Pull Down' } });
    fireEvent.click(screen.getByTestId('add-exercise-btn'));

    await waitFor(() => {
      expect(screen.getByText('Lat Pull Down')).toBeDefined();
    });

    const draftKey = 'cybergym_active_exercises_test-user-id_2026-09-06';
    expect(sessionStorage.getItem(draftKey)).toContain('Lat Pull Down');

    // Select Rest Day
    const routineBtn = screen.getByTestId('routine-select-btn');
    fireEvent.click(routineBtn);
    const restDayBtn = await screen.findByText('Rest Day');
    fireEvent.click(restDayBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Rest Day').length).toBeGreaterThan(0);
      // Lat Pull Down should NOT be in Rest Day since uncommitted drafts were cleared
      expect(screen.queryByText('Lat Pull Down')).toBeNull();
      expect(sessionStorage.getItem(draftKey)).toBeNull();
    });
  });

  it('persists cleared workout state (Free Workout) across unmount and remount', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    sessionStorage.clear();
    const { unmount } = renderComponent();
    await selectWorkoutA();

    // Verify Workout A exercises are present
    expect(screen.getByText('Incline Bench Press')).toBeDefined();

    // Click Clear Workout
    const clearBtn = screen.getByTitle('Clear Workout');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText("No exercises in today's workout yet")).toBeDefined();
    });

    const routineKey = 'cybergym_routine_test-user-id_2026-09-06';
    expect(sessionStorage.getItem(routineKey)).toBe('Free Workout');

    // Simulate tab switch by unmounting and remounting
    unmount();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("No exercises in today's workout yet")).toBeDefined();
      expect(screen.queryByText('Incline Bench Press')).toBeNull();
    });
  });

  it('persists reordered exercise list in sessionStorage across remount', async () => {
    sessionStorage.clear();
    const { unmount } = renderComponent();
    await selectWorkoutA();

    // Add another exercise so we have multiple
    const addSelect = screen.getByTestId('add-exercise-select');
    fireEvent.change(addSelect, { target: { value: 'Lat Pull Down' } });
    fireEvent.click(screen.getByTestId('add-exercise-btn'));

    await waitFor(() => {
      expect(screen.getByText('Lat Pull Down')).toBeDefined();
    });

    // Move Lat Pull Down (which is at the end) up
    const moveUpBtns = screen.getAllByTitle('Move up');
    const lastMoveUpBtn = moveUpBtns[moveUpBtns.length - 1];
    fireEvent.click(lastMoveUpBtn);

    const draftKey = 'cybergym_active_exercises_test-user-id_2026-09-06';
    const stored = JSON.parse(sessionStorage.getItem(draftKey) || '[]');
    expect(stored.indexOf('Lat Pull Down')).toBe(stored.length - 2);

    // Remount
    unmount();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Lat Pull Down')).toBeDefined();
    });
  });

  describe('Workout Session Store State-Loss Bug Resolution (7 Dedicated Integration Tests)', () => {
    it('persists target sets stepper changes across unmount and remount (Bug 1)', async () => {
      const { unmount } = renderComponent();
      await selectWorkoutA();

      // Workout A initially has Incline Bench Press with 4 target sets (0/4 Sets)
      expect(await screen.findByText('0/4 Sets')).toBeDefined();

      const incBtns = screen.getAllByTitle('Increase target sets');
      fireEvent.click(incBtns[0]);

      // Target sets incremented to 5
      expect(screen.getByText('0/5 Sets')).toBeDefined();

      // Unmount simulating tab change
      unmount();

      // Remount
      renderComponent();

      // Target sets should remain 5, not revert to 4
      expect(await screen.findByText('0/5 Sets')).toBeDefined();
    });

    it('persists exercise deletion with 0 logged sets across unmount and remount without resurrection (Bug 2)', async () => {
      const { unmount } = renderComponent();
      await selectWorkoutA();

      expect(await screen.findByText('Incline Bench Press')).toBeDefined();

      const removeBtn = screen.getByLabelText(/Remove Incline Bench Press from workout/i);
      fireEvent.click(removeBtn);

      expect(screen.queryByText('Incline Bench Press')).toBeNull();

      unmount();
      renderComponent();

      await waitFor(() => {
        expect(screen.queryByText('Incline Bench Press')).toBeNull();
        expect(screen.getByText('Cable Lateral Raises')).toBeDefined();
      });
    });

    it('persists exercise deletion when other exercises have logged sets today across unmount and remount (Bug 3)', async () => {
      const today = '2026-09-06';
      const loggedSetsToday = [
        {
          id: 's-today-1',
          workout_id: 'workout-today',
          exercise_id: 'e0000000-0000-0000-0000-000000000001',
          exercise_name: 'Incline Bench Press',
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
            }),
          };
        }
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'workout-today', date: today, name: 'Workout A (Push, Quads & Core)' }],
                error: null,
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      });

      const { unmount } = renderComponent();

      // Should automatically load Workout A because of logged sets
      expect(await screen.findByText('Incline Bench Press')).toBeDefined();
      expect(screen.getByText('Dips')).toBeDefined();

      // Delete Dips (which has 0 logged sets)
      const removeDipsBtn = screen.getByLabelText(/Remove Dips from workout/i);
      fireEvent.click(removeDipsBtn);

      expect(screen.queryByText('Dips')).toBeNull();

      unmount();
      renderComponent();

      // Dips should remain deleted and NOT resurrect despite todaySets > 0
      await waitFor(() => {
        expect(screen.queryByText('Dips')).toBeNull();
        expect(screen.getByText('Incline Bench Press')).toBeDefined();
      });
    });

    it('persists exercise reorder across unmount and remount (Bug 4)', async () => {
      const { unmount } = renderComponent();
      await selectWorkoutA();

      expect(await screen.findByText('Incline Bench Press')).toBeDefined();

      // Move Cable Lateral Raises (index 1) up to index 0
      const moveUpBtns = screen.getAllByTitle('Move up');
      fireEvent.click(moveUpBtns[0]);

      // Verify order updated in session store
      const session = workoutSessionStore.getActiveSession('test-user-id', '2026-09-06');
      expect(session?.exercises[0]).toBe('Cable Lateral Raises');
      expect(session?.exercises[1]).toBe('Incline Bench Press');

      unmount();
      renderComponent();

      await waitFor(() => {
        const sessionAfter = workoutSessionStore.getActiveSession('test-user-id', '2026-09-06');
        expect(sessionAfter?.exercises[0]).toBe('Cable Lateral Raises');
        expect(sessionAfter?.exercises[1]).toBe('Incline Bench Press');
      });
      const headings = screen.getAllByRole('button', { name: /collapse exercise|expand exercise/i });
      expect(headings[0].textContent).toContain('Cable Lateral Raises');
      expect(headings[1].textContent).toContain('Incline Bench Press');
    });

    it('persists uncommitted input drafts (weight and reps) across unmount and remount (Bug 5)', async () => {
      const { unmount } = renderComponent();
      await selectWorkoutA();

      const weightInput = await screen.findByTestId('ghost-weight-0-0');
      const repsInput = screen.getByTestId('ghost-reps-0-0');

      fireEvent.change(weightInput, { target: { value: '225' } });
      fireEvent.change(repsInput, { target: { value: '5' } });

      expect(weightInput).toHaveValue('225');
      expect(repsInput).toHaveValue('5');

      // Unmount triggers flushPendingWrites
      unmount();

      // Verify written to session store
      const session = workoutSessionStore.getActiveSession('test-user-id', '2026-09-06');
      expect(session?.inputDrafts['Incline Bench Press_1']).toEqual({ weight: '225', reps: '5' });

      // Remount
      renderComponent();

      // Input fields should restore the typed draft values
      await waitFor(() => {
        expect(screen.getByTestId('ghost-weight-0-0')).toHaveValue('225');
        expect(screen.getByTestId('ghost-reps-0-0')).toHaveValue('5');
      });
    });

    it('preserves active workout date across midnight rollover via pointer architecture (Bug 6)', async () => {
      // Set system clock to 23:50 on 2026-09-08
      vi.setSystemTime(new Date(2026, 8, 8, 23, 50, 0));

      const { unmount } = renderComponent();
      const dateInput = screen.getByTestId('workout-date-input') as HTMLInputElement;
      expect(dateInput.value).toBe('2026-09-08');

      await selectWorkoutA();

      expect(localStorage.getItem('cybergym_current_session_pointer_test-user-id')).toBe('2026-09-08');

      unmount();

      // Clock rolls over past midnight
      vi.setSystemTime(new Date(2026, 8, 9, 0, 10, 0));
      expect(getLocalDateStr(new Date())).toBe('2026-09-09');

      // Remount
      renderComponent();

      await waitFor(() => {
        const dateInputAfter = screen.getByTestId('workout-date-input') as HTMLInputElement;
        expect(dateInputAfter.value).toBe('2026-09-08');
        expect(screen.getByText('Workout A (Push, Quads & Core)')).toBeDefined();
      });
    });

    it('isolates personal workout session drafts strictly to authenticated user regardless of coach context athlete switching (Bug 7 reconciled)', async () => {
      const athleteAId = '11111111-1111-4111-8111-111111111111';
      const athleteBId = '22222222-2222-4222-8222-222222222222';

      localStorage.setItem(
        'cybergym_user',
        JSON.stringify({ id: 'coach-id', email: 'coach@example.com', role: 'coach', is_coach_mode: true })
      );
      localStorage.setItem('cybergym_view_mode', 'coach');
      localStorage.setItem(
        'cybergym_athletes',
        JSON.stringify([
          { id: athleteAId, name: 'Athlete A', email: 'a@example.com', status: 'Active' },
          { id: athleteBId, name: 'Athlete B', email: 'b@example.com', status: 'Active' },
        ])
      );
      localStorage.setItem('cybergym_selected_athlete', athleteAId);
      (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'coach-id' } } });
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: { user: { id: 'coach-id', email: 'coach@example.com' } } },
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn((col: string) => {
                if (col === 'id') {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'coach-id', email: 'coach@example.com', role: 'coach', is_coach_mode: true, auto_rest_timer: true },
                      error: null,
                    }),
                  };
                }
                return { order: vi.fn().mockResolvedValue({ data: [], error: null }) };
              }),
            }),
          };
        }
        if (table === 'coach_athlete_links') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        athlete_id: athleteAId,
                        status: 'active',
                        athlete: { id: athleteAId, username: 'Athlete A', email: 'a@example.com', role: 'athlete', created_at: '2026-09-01' },
                      },
                      {
                        athlete_id: athleteBId,
                        status: 'active',
                        athlete: { id: athleteBId, username: 'Athlete B', email: 'b@example.com', role: 'athlete', created_at: '2026-09-01' },
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      });

      const CoachTestHarness: React.FC = () => {
        const { switchAthlete, selectedAthleteId } = useCoach();
        return (
          <div>
            <div data-testid="current-selected-athlete">{selectedAthleteId}</div>
            <button onClick={() => switchAthlete(athleteBId)} data-testid="switch-to-b">
              Switch to B
            </button>
            <button onClick={() => switchAthlete(athleteAId)} data-testid="switch-to-a">
              Switch to A
            </button>
            <WorkoutEngine />
            <GlobalRestTimerPill />
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CoachProvider>
              <CoachTestHarness />
            </CoachProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-selected-athlete')).toHaveTextContent(athleteAId);
      });

      // Coach types personal draft 275 lbs x 8 reps
      await selectWorkoutA();
      const weightInputA = await screen.findByTestId('ghost-weight-0-0');
      const repsInputA = screen.getByTestId('ghost-reps-0-0');

      fireEvent.change(weightInputA, { target: { value: '275' } });
      fireEvent.change(repsInputA, { target: { value: '8' } });
      expect(weightInputA).toHaveValue('275');
      expect(repsInputA).toHaveValue('8');

      // Coach switches selected athlete in CoachContext to Athlete B
      fireEvent.click(screen.getByTestId('switch-to-b'));

      await waitFor(() => {
        expect(screen.getByTestId('current-selected-athlete')).toHaveTextContent(athleteBId);
      });

      // WorkoutEngine strictly maintains the coach's personal draft (isolated from athlete switcher)
      await waitFor(() => {
        expect(screen.getByTestId('ghost-weight-0-0')).toHaveValue('275');
        expect(screen.getByTestId('ghost-reps-0-0')).toHaveValue('8');
      });
    });

    it('discards local draft customizations and reloads scheduled template on "Reload Scheduled Routine" button click', async () => {
      // Set system clock to Monday (2026-09-07)
      vi.setSystemTime(new Date('2026-09-07T10:00:00Z'));

      renderComponent();

      // Wait for Monday default template to resolve and mount
      await waitFor(() => {
        expect(screen.getByText('Push, Quads, & Core - Reduced')).toBeDefined();
        expect(screen.getByText('Incline Bench Press')).toBeDefined();
        expect(screen.getByText('0/4 Sets')).toBeDefined();
      });

      // Modify target sets to 5
      const incBtns = screen.getAllByTitle('Increase target sets');
      fireEvent.click(incBtns[0]);
      await waitFor(() => {
        expect(screen.getByText('0/5 Sets')).toBeDefined();
      });

      // Delete an exercise (e.g. Cable Lateral Raises)
      const removeBtn = screen.getByLabelText(/Remove Cable Lateral Raises from workout/i);
      fireEvent.click(removeBtn);
      await waitFor(() => {
        expect(screen.queryByText('Cable Lateral Raises')).toBeNull();
      });

      // Open Routine Modal
      const routineSelectBtn = screen.getByTestId('routine-select-btn');
      fireEvent.click(routineSelectBtn);

      // Click "Reload Scheduled Routine"
      const reloadBtn = await screen.findByTestId('reload-scheduled-routine-btn');
      fireEvent.click(reloadBtn);

      // Verify that the virgin scheduled routine was restored (Cable Lateral Raises restored, target sets back to 4, NOT Free Workout)
      await waitFor(() => {
        expect(screen.getByText('Push, Quads, & Core - Reduced')).toBeDefined();
        expect(screen.getByText('Cable Lateral Raises')).toBeDefined();
        expect(screen.getByText('0/4 Sets')).toBeDefined();
        expect(screen.queryByText('Free Workout')).toBeNull();
      });
    });

    it('applies deterministic precedence sort where athlete custom template shadows master template with identical name', async () => {
      const masterTemplate = {
        id: 'tpl-master-push',
        user_id: 'coach-id-999',
        name: 'Master Hypertrophy Push',
        is_master: true,
        assigned_to: null,
        created_at: '2026-09-01T00:00:00Z',
        exercises: [
          {
            exercise_id: 'ex-bench',
            order_index: 0,
            target_sets: 3,
            target_reps: 10,
            exercise: { name: 'Incline Bench Press' },
          },
        ],
      };

      const athleteCustomTemplate = {
        id: 'tpl-custom-push',
        user_id: 'test-user-id',
        name: 'Master Hypertrophy Push',
        is_master: false,
        assigned_to: null,
        created_at: '2026-09-02T00:00:00Z',
        exercises: [
          {
            exercise_id: 'ex-custom-press',
            order_index: 0,
            target_sets: 5,
            target_reps: 8,
            exercise: { name: 'Personalized Heavy Press' },
          },
        ],
      };

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'routine_templates') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({
                // Deliberately return master FIRST to test that precedence sorting promotes custom
                data: [masterTemplate, athleteCustomTemplate],
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
                  { id: 'ex-custom-press', name: 'Personalized Heavy Press', body_part: 'Chest' },
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

      // Open routine selection modal
      const routineBtn = screen.getByTestId('routine-select-btn');
      fireEvent.click(routineBtn);

      // Wait for routine modal to populate with the custom exercise subtitle
      await screen.findByText(/Personalized Heavy Press/);

      // Routine appears exactly once in the list (deduplicated by name)
      const matchingRoutines = screen.getAllByText('Master Hypertrophy Push');
      expect(matchingRoutines.length).toBe(1);

      // Select the routine
      fireEvent.click(matchingRoutines[0]);

      // Verify that the athlete's custom routine was loaded (Personalized Heavy Press 0/5 Sets),
      // deterministically shadowing the master template (Incline Bench Press 0/3 Sets)
      await waitFor(() => {
        expect(screen.getByText('Personalized Heavy Press')).toBeDefined();
        expect(screen.getByText('0/5 Sets')).toBeDefined();
        expect(screen.queryByText('Incline Bench Press')).toBeNull();
      });
    });
  });

  describe('Cold-Load & PostgREST Relational Join Architecture (Tests 42-44)', () => {
    it('cold loads directly with real database UUIDs via PostgREST join without tab switch (Test 42)', async () => {
      const today = '2026-09-06';
      const realExerciseUUID = '8f2d91b4-1234-4567-89ab-cdef01234567';
      const workoutId = 'w-cold-load-1';

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: workoutId, date: today, name: 'Heavy Squat Day' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'sets') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 's-cold-1',
                      workout_id: workoutId,
                      exercise_id: realExerciseUUID,
                      set_index: 1,
                      set_type: 'working',
                      weight: 315,
                      reps: 5,
                      rpe: null,
                      created_at: `${today}T10:00:00Z`,
                      workouts: {
                        date: today,
                        name: 'Heavy Squat Day',
                      },
                      exercise: {
                        id: realExerciseUUID,
                        name: 'Barbell Back Squat',
                        body_part: 'Legs',
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'exercises') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'routine_templates') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
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
          }),
        };
      });

      renderComponent();

      // On cold load, the exercise card and routine name should render immediately
      await waitFor(() => {
        expect(screen.getByText('Barbell Back Squat')).toBeDefined();
        expect(screen.getByText('Heavy Squat Day')).toBeDefined();
      });

      // The raw UUID must NEVER be rendered as an accordion header
      expect(screen.queryByText(realExerciseUUID)).toBeNull();

      // Completed set checkmark and values render cleanly
      expect(screen.getByText('315')).toBeDefined();
      expect(screen.getByText('5')).toBeDefined();
      expect(screen.getByTestId('delete-set-btn-0-0')).toBeDefined();
    });

    it('auto-heals corrupted localStorage active session containing raw UUIDs without losing drafts (Test 43)', async () => {
      const today = '2026-09-06';
      const corruptedUUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab';
      const cleanExerciseName = 'Bulgarian Split Squat';

      // Pre-seed corrupted session into localStorage
      const corruptedSession = {
        schemaVersion: 1,
        sessionId: 'session_test-user-id_2026-09-06_12345',
        userId: 'test-user-id',
        workoutDate: today,
        routineName: 'Leg Destruction',
        exercises: [corruptedUUID],
        targetSetCounts: { [corruptedUUID]: 4 },
        targetRepCounts: { [corruptedUUID]: 12 },
        expandedExercises: [corruptedUUID],
        inputDrafts: {
          [`${corruptedUUID}_1`]: { weight: '135', reps: '10' },
        },
        startedAt: `${today}T10:00:00Z`,
        lastModifiedAt: `${today}T10:00:00Z`,
        completedAt: null,
      };
      localStorage.setItem(
        `cybergym_active_session_test-user-id_${today}`,
        JSON.stringify(corruptedSession)
      );

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'exercises') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: corruptedUUID, name: cleanExerciseName, body_part: 'Legs' },
                ],
                error: null,
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
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
          }),
        };
      });

      renderComponent();

      // Verify that after auto-healing, the clean exercise name is rendered
      await waitFor(() => {
        expect(screen.getByText('Bulgarian Split Squat')).toBeDefined();
      });

      // Verify raw UUID is not displayed
      expect(screen.queryByText(corruptedUUID)).toBeNull();

      // Verify input drafts were migrated to clean name: Bulgarian Split Squat
      const weightInput = screen.getByTestId('ghost-weight-0-0') as HTMLInputElement;
      expect(weightInput.value).toBe('135');
      const repsInput = screen.getByTestId('ghost-reps-0-0') as HTMLInputElement;
      expect(repsInput.value).toBe('10');

      // Verify localStorage was healed
      const healedSession = workoutSessionStore.getActiveSession('test-user-id', today);
      expect(healedSession).toBeDefined();
      expect(healedSession?.exercises).toEqual(['Bulgarian Split Squat']);
      expect(healedSession?.targetSetCounts['Bulgarian Split Squat']).toBe(4);
      expect(healedSession?.targetRepCounts['Bulgarian Split Squat']).toBe(12);
      expect(healedSession?.expandedExercises).toEqual(['Bulgarian Split Squat']);
      expect(healedSession?.inputDrafts['Bulgarian Split Squat_1']).toEqual({ weight: '135', reps: '10' });
      expect(healedSession?.inputDrafts[`${corruptedUUID}_1`]).toBeUndefined();
    });

    it('shares consistent PostgREST joined sets cache across tabs without UUID poisoning (Test 44)', async () => {
      const today = '2026-09-06';
      const realExerciseUUID = 'c9d8e7f6-5432-10fe-ba98-76543210fedc';
      const workoutId = 'w-cache-test-1';

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: workoutId, date: today, name: 'Cross-Tab Sync Workout' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'sets') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 's-sync-1',
                      workout_id: workoutId,
                      exercise_id: realExerciseUUID,
                      set_index: 1,
                      set_type: 'working',
                      weight: 225,
                      reps: 8,
                      rpe: null,
                      created_at: `${today}T10:00:00Z`,
                      workouts: {
                        date: today,
                        name: 'Cross-Tab Sync Workout',
                      },
                      exercise: {
                        id: realExerciseUUID,
                        name: 'Overhead Press',
                        body_part: 'Shoulders',
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'nutrition_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
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
          }),
        };
      });

      // Render WorkoutEngine
      const { unmount } = renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Overhead Press')).toBeDefined();
      });

      // Verify cached entry has clean exercise_name
      const cachedData = queryClient.getQueryData<any[]>(['workout_sets', 'test-user-id']);
      expect(cachedData).toBeDefined();
      expect(cachedData?.[0]?.exercise_name).toBe('Overhead Press');
      expect(cachedData?.[0]?.workout_name).toBe('Cross-Tab Sync Workout');

      unmount();

      // Mount HistoryView with the exact same shared queryClient
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CoachProvider>
              <HistoryView />
            </CoachProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Verify HistoryView renders the clean exercise from shared cache without lag or UUIDs
      await waitFor(() => {
        expect(screen.getByText('Overhead Press')).toBeDefined();
      });
      expect(screen.queryByText(realExerciseUUID)).toBeNull();
    });

    it('handles multi-tier auto-healing with partial unknown/deleted UUID fallback without crashing drafts (Test 45)', async () => {
      const today = '2026-09-06';
      const uuidCatalog = '11111111-2222-3333-4444-555555555555';
      const uuidSets = '66666666-7777-8888-9999-000000000000';
      const uuidDefault = 'e0000000-0000-0000-0000-000000000002'; // Cable Lateral Raises
      const uuidUnknown = 'deadbeef-dead-beef-dead-beefdeadbeef';

      const corruptedSession = {
        schemaVersion: 1,
        sessionId: 'session_test-user-id_2026-09-06_99999',
        userId: 'test-user-id',
        workoutDate: today,
        routineName: 'Mixed Tier Test',
        exercises: [uuidCatalog, uuidSets, uuidDefault, uuidUnknown],
        targetSetCounts: {
          [uuidCatalog]: 3,
          [uuidSets]: 4,
          [uuidDefault]: 3,
          [uuidUnknown]: 2,
        },
        targetRepCounts: {
          [uuidCatalog]: 10,
          [uuidSets]: 12,
          [uuidDefault]: 15,
          [uuidUnknown]: 8,
        },
        expandedExercises: [uuidCatalog, uuidSets, uuidUnknown],
        inputDrafts: {
          [`${uuidCatalog}_1`]: { weight: '225', reps: '10' },
          [`${uuidSets}_1`]: { weight: '65', reps: '12' },
          [`${uuidDefault}_1`]: { weight: '30', reps: '15' },
          [`${uuidUnknown}_1`]: { weight: '100', reps: '8' },
        },
        startedAt: `${today}T10:00:00Z`,
        lastModifiedAt: `${today}T10:00:00Z`,
        completedAt: null,
      };

      localStorage.setItem(
        `cybergym_active_session_test-user-id_${today}`,
        JSON.stringify(corruptedSession)
      );

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'exercises') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: uuidCatalog, name: 'Romanian Deadlift', body_part: 'Hamstrings' },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'sets') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 's-joined-1',
                      workout_id: 'w-1',
                      exercise_id: uuidSets,
                      set_index: 1,
                      set_type: 'working',
                      weight: 65,
                      reps: 12,
                      rpe: null,
                      created_at: `${today}T10:00:00Z`,
                      workouts: { date: today, name: 'Mixed Tier Test' },
                      exercise: {
                        id: uuidSets,
                        name: 'Cable Face Pulls',
                        body_part: 'Shoulders',
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'w-1', date: today, name: 'Mixed Tier Test' }],
                error: null,
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
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
          }),
        };
      });

      renderComponent();

      // Tier 1: DB Catalog resolved
      await waitFor(() => {
        expect(screen.getByText('Romanian Deadlift')).toBeDefined();
      });

      // Tier 2: Synthetic Default List resolved
      expect(screen.getByText('Cable Lateral Raises')).toBeDefined();

      // Tier 3: Today's joined sets resolved
      expect(screen.getByText('Cable Face Pulls')).toBeDefined();

      // Fallback: Unknown UUID safely displayed without crash
      expect(screen.getByText(uuidUnknown)).toBeDefined();

      // Verify healed session in store
      const healedSession = workoutSessionStore.getActiveSession('test-user-id', today);
      expect(healedSession).toBeDefined();
      expect(healedSession?.exercises).toEqual([
        'Romanian Deadlift',
        'Cable Face Pulls',
        'Cable Lateral Raises',
        uuidUnknown,
      ]);
      expect(healedSession?.inputDrafts['Romanian Deadlift_1']).toEqual({ weight: '225', reps: '10' });
      expect(healedSession?.inputDrafts['Cable Face Pulls_1']).toEqual({ weight: '65', reps: '12' });
      expect(healedSession?.inputDrafts['Cable Lateral Raises_1']).toEqual({ weight: '30', reps: '15' });
      expect(healedSession?.inputDrafts[`${uuidUnknown}_1`]).toEqual({ weight: '100', reps: '8' });
    });

    it('prioritizes coach-assigned routines (Score 3) over personal custom routines (Score 2) for scheduled workout days', async () => {
      // Wednesday: 2026-09-09
      vi.setSystemTime(new Date('2026-09-09T10:00:00Z'));

      const athleteId = 'test-user-id';
      const coachId = 'coach-999';

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'routine_templates') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tpl-personal',
                    user_id: athleteId,
                    assigned_to: null,
                    is_master: false,
                    name: 'Personal User Routine',
                    days_of_week: ['Wed'],
                    created_at: '2026-09-01T00:00:00Z',
                    exercises: [
                      {
                        exercise_id: 'ex-1',
                        exercise_name: 'Barbell Squat',
                        target_sets: 3,
                        target_reps: 10,
                        order_index: 0,
                      },
                    ],
                  },
                  {
                    id: 'tpl-coach-assigned',
                    user_id: coachId,
                    assigned_to: athleteId,
                    is_master: false,
                    name: 'Coach Assigned Priority Routine',
                    days_of_week: ['Wed'],
                    created_at: '2026-09-01T00:00:00Z',
                    exercises: [
                      {
                        exercise_id: 'ex-2',
                        exercise_name: 'Incline Dumbbell Press',
                        target_sets: 4,
                        target_reps: 8,
                        order_index: 0,
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
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      });

      renderComponent();

      // Assert that Coach Assigned Priority Routine resolves ahead of Personal User Routine
      await waitFor(() => {
        expect(screen.getByText('Coach Assigned Priority Routine')).toBeDefined();
        expect(screen.getByText('Incline Dumbbell Press')).toBeDefined();
        expect(screen.queryByText('Personal User Routine')).toBeNull();
      });
    });
  });
});





import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { HistoryView } from './HistoryView';
import { groupSessionSetsByExercise } from '../../utils/historyGrouping';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { supabase } from '../../lib/supabase';

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'test-athlete-id', email: 'athlete@example.com' },
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-athlete-id' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('HistoryView', () => {
  let queryClient: QueryClient;
  const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const mockUpdateEq = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
  const mockUpdate = vi.fn().mockReturnValue({
    eq: mockUpdateEq,
  });

  const mockNutritionLogs = [
    {
      id: 'log-1',
      user_id: 'test-athlete-id',
      food_name: 'Grilled Chicken & Rice',
      meal_type: 'lunch',
      calories: 550,
      protein: 45,
      carbs: 60,
      fat: 10,
      fiber: 5,
      logged_at: '2026-09-01T12:00:00Z',
    },
    {
      id: 'log-2',
      user_id: 'test-athlete-id',
      food_name: 'Protein Shake',
      meal_type: 'snack',
      calories: 200,
      protein: 30,
      carbs: 5,
      fat: 2,
      fiber: 3,
      logged_at: '2026-09-01T15:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'test-athlete-id' } } });
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    mockDeleteEq.mockResolvedValue({ error: null });
    mockUpdateEq.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockUpdate.mockReturnValue({
      eq: mockUpdateEq,
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockNutritionLogs, error: null }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: mockDeleteEq,
          }),
          update: mockUpdate,
        };
      }

      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'w1', date: '2026-09-01', name: 'Chest & Back' }],
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
                    id: 's1',
                    workout_id: 'w1',
                    exercise_id: 'Bench Press',
                    weight: 225,
                    reps: 8,
                    created_at: '2026-09-01T10:00:00Z',
                    workouts: { date: '2026-09-01', name: 'Chest & Back' },
                  },
                ],
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: mockDeleteEq,
          }),
          update: mockUpdate,
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CoachProvider>
            <HistoryView />
          </CoachProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

  it('renders workout history view by default and allows toggling between By Session and By Exercise', async () => {
    renderComponent();
    expect(screen.getByText('Workout History')).toBeDefined();
    expect(screen.getByText('By Session')).toBeDefined();
    expect(screen.getByText('By Exercise')).toBeDefined();

    // Toggle to By Exercise
    fireEvent.click(screen.getByText('By Exercise'));
    expect(screen.getByPlaceholderText('Search exercise library...')).toBeDefined();
  });

  it('toggles to nutrition history and displays date-grouped meals, totals, and distribution bar', async () => {
    renderComponent();

    // Switch to Nutrition tab
    const nutritionTab = screen.getByTestId('history-tab-nutrition');
    fireEvent.click(nutritionTab);

    // Verify Nutrition History header
    expect(screen.getByText('Nutrition History')).toBeDefined();

    // Verify meals and macro totals rendered
    await waitFor(() => {
      expect(screen.getByText('Grilled Chicken & Rice')).toBeDefined();
      expect(screen.getByText('Protein Shake')).toBeDefined();
      expect(screen.getByText('750 kcal')).toBeDefined();
      expect(screen.getByText('75g P')).toBeDefined();
      expect(screen.getByText('65g C')).toBeDefined();
      expect(screen.getByText('12g F')).toBeDefined();
      expect(screen.getByText('8g Fib')).toBeDefined();
    });

    // Verify Caloric Macro Distribution bar is displayed
    expect(screen.getByText('Caloric Macro Distribution')).toBeDefined();
    expect(screen.getByText(/45% P/)).toBeDefined();
    expect(screen.getByText(/39% C/)).toBeDefined();
    expect(screen.getByText(/16% F/)).toBeDefined();
  });

  it('allows 1-tap meal deletion directly from nutrition history timeline', async () => {
    renderComponent();

    // Switch to Nutrition tab
    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-meal-log-1')).toBeDefined();
    });

    // Click delete meal button
    const deleteBtn = screen.getByTestId('delete-meal-log-1');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'log-1');
    });
  });

  it('displays mutation error notification when meal deletion fails', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: { message: 'Database deletion failed' } });

    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-meal-log-1')).toBeDefined();
    });

    const deleteBtn = screen.getByTestId('delete-meal-log-1');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByTestId('history-mutation-error')).toBeDefined();
      expect(screen.getByText('Database deletion failed')).toBeDefined();
    });
  });

  it('opens Edit Meal modal pre-filled with meal values when Edit button is clicked in nutrition history', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-log-1')).toBeDefined();
    });

    // Click edit button for log-1
    fireEvent.click(screen.getByTestId('edit-meal-log-1'));

    // Modal opens
    expect(screen.getByTestId('edit-meal-modal')).toBeDefined();
    expect(screen.getByText('Edit Meal')).toBeDefined();

    // Fields are pre-filled
    expect(screen.getByTestId('edit-meal-name-input')).toHaveValue('Grilled Chicken & Rice');
    expect(screen.getByTestId('edit-meal-type-select')).toHaveValue('Lunch');
    expect(screen.getByTestId('edit-meal-calories-input')).toHaveValue(550);
    expect(screen.getByTestId('edit-meal-protein-input')).toHaveValue(45);
    expect(screen.getByTestId('edit-meal-carbs-input')).toHaveValue(60);
    expect(screen.getByTestId('edit-meal-fat-input')).toHaveValue(10);
    expect(screen.getByTestId('edit-meal-fiber-input')).toHaveValue(5);
  });

  it('submits updated meal changes and executes update mutation on supabase', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-log-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-meal-log-1'));

    // Modify values
    fireEvent.change(screen.getByTestId('edit-meal-name-input'), {
      target: { value: 'Grilled Lemon Herb Chicken & Rice' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-type-select'), {
      target: { value: 'Dinner' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-calories-input'), {
      target: { value: '620' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-protein-input'), {
      target: { value: '52' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-carbs-input'), {
      target: { value: '65' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-fat-input'), {
      target: { value: '14' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-fiber-input'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-serving-size-input'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-serving-unit-input'), {
      target: { value: 'bowls' },
    });

    // Save
    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        food_name: 'Grilled Lemon Herb Chicken & Rice',
        meal_type: 'Dinner',
        calories: 620,
        protein: 52,
        carbs: 65,
        fat: 14,
        fiber: 6,
        serving_size: 2,
        serving_unit: 'bowls',
      });
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'log-1');
    });

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });
  });

  it('displays error notification in Edit Meal modal when meal update fails', async () => {
    mockUpdateEq.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database update failed' } }),
    });

    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-log-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-meal-log-1'));

    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-error')).toBeDefined();
      expect(screen.getByText('Database update failed')).toBeDefined();
    });
  });

  it('allows canceling edit modal without submitting update', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-log-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-meal-log-1'));

    expect(screen.getByTestId('edit-meal-modal')).toBeDefined();

    fireEvent.click(screen.getByTestId('cancel-edit-meal-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('validates meal name is required before submitting update', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-log-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-meal-log-1'));

    // Clear food name
    fireEvent.change(screen.getByTestId('edit-meal-name-input'), {
      target: { value: '   ' },
    });

    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    expect(screen.getByTestId('edit-meal-error')).toBeDefined();
    expect(screen.getByText('Meal name is required')).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('clamps negative numbers and defaults invalid serving size when updating', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-log-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-meal-log-1'));

    // Enter negative and invalid values
    fireEvent.change(screen.getByTestId('edit-meal-calories-input'), {
      target: { value: '-50' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-protein-input'), {
      target: { value: '-10' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-serving-size-input'), {
      target: { value: '-2' },
    });

    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          calories: 0,
          protein: 0,
          serving_size: 1,
        })
      );
    });
  });

  it('dismisses edit modal on backdrop click and Escape key', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-log-1')).toBeDefined();
    });

    // 1. Open and dismiss with Escape
    fireEvent.click(screen.getByTestId('edit-meal-log-1'));
    expect(screen.getByTestId('edit-meal-modal')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });

    // 2. Open and dismiss with backdrop click
    fireEvent.click(screen.getByTestId('edit-meal-log-1'));
    const modalBackdrop = screen.getByTestId('edit-meal-modal');
    expect(modalBackdrop).toBeDefined();

    fireEvent.click(modalBackdrop);
    await waitFor(() => {
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });
  });

  describe('Exercise Grouping & Session Separation (Bug 3)', () => {
    it('groupSessionSetsByExercise groups alternating superset sets by exercise in chronological order', () => {
      const mockExercises = [
        { id: 'ex-row', name: 'Seated Cable Row', body_part: 'Back' },
        { id: 'ex-situp', name: 'Sit-Up', body_part: 'Core' },
      ];

      const supersetList = [
        {
          id: 'set-1',
          exercise_id: 'ex-row',
          weight: 180,
          reps: 10,
          set_index: 1,
          set_type: 'working' as const,
          workout_date: '2026-09-04',
          workout_name: 'Pull & Core',
        },
        {
          id: 'set-2',
          exercise_id: 'ex-situp',
          weight: 0,
          reps: 20,
          set_index: 1,
          set_type: 'working' as const,
          workout_date: '2026-09-04',
          workout_name: 'Pull & Core',
        },
        {
          id: 'set-3',
          exercise_id: 'ex-row',
          weight: 190,
          reps: 8,
          set_index: 2,
          set_type: 'working' as const,
          workout_date: '2026-09-04',
          workout_name: 'Pull & Core',
        },
        {
          id: 'set-4',
          exercise_id: 'ex-situp',
          weight: 0,
          reps: 20,
          set_index: 2,
          set_type: 'working' as const,
          workout_date: '2026-09-04',
          workout_name: 'Pull & Core',
        },
      ];

      const groups = groupSessionSetsByExercise(supersetList, mockExercises);

      expect(groups).toHaveLength(2);
      expect(groups[0].exerciseName).toBe('Seated Cable Row');
      expect(groups[0].bodyPart).toBe('Back');
      expect(groups[0].sets).toHaveLength(2);
      expect(groups[0].totalVolume).toBe(180 * 10 + 190 * 8); // 1800 + 1520 = 3320

      expect(groups[1].exerciseName).toBe('Sit-Up');
      expect(groups[1].bodyPart).toBe('Core');
      expect(groups[1].sets).toHaveLength(2);
      expect(groups[1].totalVolume).toBe(0);
    });

    it('renders workout session with exercise headers and nested numbered set rows', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'w-group-test', date: '2026-09-04', name: 'Pull & Core Session' }],
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
                      id: 'set-a1',
                      workout_id: 'w-group-test',
                      exercise_id: 'Seated Cable Row',
                      weight: 185,
                      reps: 8,
                      set_index: 1,
                      created_at: '2026-09-04T10:00:00Z',
                      workouts: { date: '2026-09-04', name: 'Pull & Core Session' },
                    },
                    {
                      id: 'set-a2',
                      workout_id: 'w-group-test',
                      exercise_id: 'Seated Cable Row',
                      weight: 185,
                      reps: 8,
                      set_index: 2,
                      created_at: '2026-09-04T10:05:00Z',
                      workouts: { date: '2026-09-04', name: 'Pull & Core Session' },
                    },
                  ],
                  error: null,
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
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Pull & Core Session')).toBeDefined();
        expect(screen.getByText('Seated Cable Row')).toBeDefined();
        expect(screen.getByText('SET 1')).toBeDefined();
        expect(screen.getByText('SET 2')).toBeDefined();
        expect(screen.getAllByText('185 lbs × 8 reps')).toHaveLength(2);
      });
    });

    it('maintains discrete session cards for multiple workouts logged on the same calendar date', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'w-morning', date: '2026-09-05', name: 'Morning Cardio' },
                  { id: 'w-evening', date: '2026-09-05', name: 'Evening Heavy Push' },
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
                      id: 's-m1',
                      workout_id: 'w-morning',
                      exercise_id: 'Sit-Up',
                      weight: 0,
                      reps: 25,
                      set_index: 1,
                      created_at: '2026-09-05T07:00:00Z',
                      workouts: { date: '2026-09-05', name: 'Morning Cardio' },
                    },
                    {
                      id: 's-e1',
                      workout_id: 'w-evening',
                      exercise_id: 'Incline Bench Press',
                      weight: 225,
                      reps: 6,
                      set_index: 1,
                      created_at: '2026-09-05T18:00:00Z',
                      workouts: { date: '2026-09-05', name: 'Evening Heavy Push' },
                    },
                  ],
                  error: null,
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
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Morning Cardio')).toBeDefined();
        expect(screen.getByText('Evening Heavy Push')).toBeDefined();
      });
    });

    it('handles undefined exercise_id and set_index zero gracefully in grouping and rendering', async () => {
      // Direct unit test of groupSessionSetsByExercise with edge cases
      const testSets = [
        {
          id: 'set-edge-1',
          workout_id: 'w-1',
          exercise_id: '',
          exercise_name: 'Dumbbell Fly',
          workout_date: '2026-09-06',
          workout_name: '',
          weight: 45,
          reps: 12,
          set_index: 0,
          created_at: '2026-09-06T10:00:00Z',
        },
        {
          id: 'set-edge-2',
          workout_id: 'w-1',
          exercise_id: 'unknown-uuid',
          exercise_name: 'Dumbbell Fly',
          workout_date: '2026-09-06',
          workout_name: '',
          weight: 50,
          reps: 10,
          set_index: 0,
          created_at: '2026-09-06T10:05:00Z',
        },
      ] as any;

      const exercises = [
        { id: 'ex-fly', name: 'Dumbbell Fly', body_part: 'Chest' },
      ] as any;

      const groups = groupSessionSetsByExercise(testSets, exercises);
      expect(groups.length).toBe(1);
      expect(groups[0].exerciseName).toBe('Dumbbell Fly');
      expect(groups[0].bodyPart).toBe('Chest');
      expect(groups[0].sets[0].id).toBe('set-edge-1');
      expect(groups[0].sets[1].id).toBe('set-edge-2');

      // Now test rendering in HistoryView with blank session name
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'w-1', date: '2026-09-06', name: '' }],
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
                      id: 'set-edge-1',
                      workout_id: 'w-1',
                      exercise_id: 'ex-fly',
                      exercise_name: 'Dumbbell Fly',
                      weight: 45,
                      reps: 12,
                      set_index: 0,
                      created_at: '2026-09-06T10:00:00Z',
                      workouts: { date: '2026-09-06', name: '' },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: exercises, error: null }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      });

      renderComponent();

      await waitFor(() => {
        // Fallback workout session title
        expect(screen.getByText('Workout Session')).toBeDefined();
        // Set index zero converted to 1-indexed SET 1
        expect(screen.getByText('SET 1')).toBeDefined();
        expect(screen.queryByText('SET 0')).toBeNull();
      });
    });

    it('displays 0 lbs (BW) session volume and PR: Bodyweight × reps for 0 lbs sets', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'w-bw', date: '2026-09-02', name: 'Calisthenics' }],
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
                      id: 'set-bw-1',
                      workout_id: 'w-bw',
                      exercise_id: 'Pull-ups',
                      weight: 0,
                      reps: 15,
                      set_index: 1,
                      created_at: '2026-09-02T10:00:00Z',
                      workouts: { date: '2026-09-02', name: 'Calisthenics' },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [{ id: 'ex-pullup', name: 'Pull-ups', body_part: 'Back' }], error: null }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      });

      renderComponent();

      // Session view volume
      await waitFor(() => {
        expect(screen.getAllByText('0 lbs (BW)').length).toBeGreaterThan(0);
      });

      // Switch to exercise view
      const exToggle = screen.getByText('By Exercise');
      fireEvent.click(exToggle);

      await waitFor(() => {
        expect(screen.getByText('PR: Bodyweight × 15')).toBeDefined();
      });
    });

    it('opens EditSetModal on set edit button click, edits set, and submits update mutation', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('edit-set-btn-s1')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('edit-set-btn-s1'));

      await waitFor(() => {
        expect(screen.getByTestId('edit-set-modal')).toBeDefined();
      });

      const weightInput = screen.getByTestId('edit-set-weight-input');
      const repsInput = screen.getByTestId('edit-set-reps-input');
      const saveBtn = screen.getByTestId('save-set-btn');

      fireEvent.change(weightInput, { target: { value: '235' } });
      fireEvent.change(repsInput, { target: { value: '9' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalled();
        expect(mockUpdateEq).toHaveBeenCalledWith('id', 's1');
      });
    });

    it('opens EditSetModal and deletes set when confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('edit-set-btn-s1')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('edit-set-btn-s1'));

      await waitFor(() => {
        expect(screen.getByTestId('delete-set-btn')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('delete-set-btn'));

      await waitFor(() => {
        expect(mockDeleteEq).toHaveBeenCalledWith('id', 's1');
      });
    });
  });

  describe('Coach Inspection Mode', () => {
    it('renders inspection banner and enforces read-only mode for athlete records', async () => {
      const coachSession = {
        user: { id: 'coach-id', email: 'coach@cybergym.io' },
      };

      (supabase.auth.getUser as any).mockResolvedValue({ data: { user: coachSession.user } });
      (supabase.auth.getSession as any).mockResolvedValue({ data: { session: coachSession } });

      const athleteLinksData = [
        {
          athlete_id: 'ath-1',
          status: 'active',
          linked_at: '2026-09-01T00:00:00Z',
          athlete: { id: 'ath-1', username: 'Alex Johnson', email: 'alex@example.com', role: 'athlete' },
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'coach_athlete_links') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: athleteLinksData, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'coach-id',
                    email: 'coach@cybergym.io',
                    username: 'Coach Duy',
                    role: 'coach',
                    is_coach_mode: true,
                  },
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
                data: [{ id: 'w1', date: '2026-09-01', name: 'Athlete Chest Session' }],
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
                      id: 's1',
                      workout_id: 'w1',
                      exercise_id: 'Bench Press',
                      weight: 225,
                      reps: 8,
                      created_at: '2026-09-01T10:00:00Z',
                      workouts: { date: '2026-09-01', name: 'Athlete Chest Session' },
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
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'log-1',
                      user_id: 'ath-1',
                      food_name: 'Athlete Chicken & Rice',
                      meal_type: 'lunch',
                      calories: 550,
                      protein: 45,
                      carbs: 60,
                      fat: 10,
                      fiber: 5,
                      logged_at: '2026-09-01T12:00:00Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      });

      renderComponent();

      // Wait for banner to appear
      await waitFor(() => {
        expect(screen.getByTestId('coach-inspection-banner')).toBeDefined();
      });

      const banner = screen.getByTestId('coach-inspection-banner');
      expect(within(banner).getByText(/Viewing Athlete:/i)).toBeDefined();
      expect(within(banner).getByText('Alex Johnson')).toBeDefined();
      expect(within(banner).getByText(/\(Read-Only\)/i)).toBeDefined();

      // In read-only mode, edit and delete buttons on athlete records must be hidden
      expect(screen.queryByTestId('edit-set-btn-s1')).toBeNull();

      // Switch to Nutrition tab
      fireEvent.click(screen.getByTestId('history-tab-nutrition'));
      await waitFor(() => {
        expect(screen.getByText('Athlete Chicken & Rice')).toBeDefined();
      });
      expect(screen.queryByTestId('edit-meal-log-1')).toBeNull();
      expect(screen.queryByTestId('delete-meal-log-1')).toBeNull();

      // Toggle inspection mode to personal history
      fireEvent.click(screen.getByTestId('toggle-inspect-mode-btn'));
      expect(await screen.findByText('Viewing My Personal History')).toBeDefined();
    });

    it('resets editingMealLog and editingSet when switching athletes or toggling inspect mode', async () => {
      const coachSession = {
        user: { id: 'coach-id', email: 'coach@cybergym.io' },
      };

      (supabase.auth.getUser as any).mockResolvedValue({ data: { user: coachSession.user } });
      (supabase.auth.getSession as any).mockResolvedValue({ data: { session: coachSession } });

      const athleteLinksData = [
        {
          athlete_id: 'ath-1',
          status: 'active',
          linked_at: '2026-09-01T00:00:00Z',
          athlete: { id: 'ath-1', username: 'Alex Johnson', email: 'alex@example.com', role: 'athlete' },
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'coach_athlete_links') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: athleteLinksData, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'coach-id',
                    email: 'coach@cybergym.io',
                    username: 'Coach Duy',
                    role: 'coach',
                    is_coach_mode: true,
                  },
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
                data: [{ id: 'w-coach-1', date: '2026-09-01', name: 'Coach Personal Session' }],
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
                      id: 's-coach-1',
                      workout_id: 'w-coach-1',
                      exercise_id: 'Deadlift',
                      weight: 405,
                      reps: 5,
                      created_at: '2026-09-01T10:00:00Z',
                      workouts: { date: '2026-09-01', name: 'Coach Personal Session' },
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
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'log-coach-1',
                      user_id: 'coach-id',
                      food_name: 'Coach Steak & Eggs',
                      meal_type: 'breakfast',
                      calories: 700,
                      protein: 60,
                      carbs: 10,
                      fat: 45,
                      fiber: 2,
                      logged_at: '2026-09-01T08:00:00Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CoachProvider>
              <HistoryView />
            </CoachProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Wait for inspection banner to appear
      await waitFor(() => {
        expect(screen.getByTestId('coach-inspection-banner')).toBeDefined();
      });

      // Switch to personal history so edit controls are visible
      fireEvent.click(screen.getByTestId('toggle-inspect-mode-btn'));
      expect(await screen.findByText('Viewing My Personal History')).toBeDefined();

      // Open Edit Set modal
      const editSetBtn = await screen.findByTestId('edit-set-btn-s-coach-1');
      fireEvent.click(editSetBtn);
      expect(await screen.findByTestId('edit-set-modal')).toBeDefined();

      // Now toggle inspect mode back to athlete -> edit modal must be dismissed
      fireEvent.click(screen.getByTestId('toggle-inspect-mode-btn'));
      expect(screen.queryByTestId('edit-set-modal')).toBeNull();

      // Switch to personal history again
      fireEvent.click(screen.getByTestId('toggle-inspect-mode-btn'));
      // Switch to nutrition tab
      fireEvent.click(screen.getByTestId('history-tab-nutrition'));
      const editMealBtn = await screen.findByTestId('edit-meal-log-coach-1');
      fireEvent.click(editMealBtn);
      expect(await screen.findByTestId('edit-meal-modal')).toBeDefined();

      // Toggle inspect mode back to athlete -> meal modal must be dismissed
      fireEvent.click(screen.getByTestId('toggle-inspect-mode-btn'));
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });
  });
});



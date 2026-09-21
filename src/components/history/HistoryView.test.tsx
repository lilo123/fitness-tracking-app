import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { HistoryView } from './HistoryView';
import { useHistoryData } from './useHistoryData';
import { groupSessionSetsByExercise } from '../../utils/historyGrouping';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { supabase } from '../../lib/supabase';
import { createSupabaseBuilder, getRecordedSelects, getRecordedTables, clearMockHistory, recordedTables } from '../../test/supabaseBuilderMock';

/**
 * Edit and Delete now live behind a single overflow trigger (`meal-actions-<id>`)
 * so the row fits a 320 px viewport. The action testids only exist while the
 * menu is open, so a test has to open it first.
 */
function openMealAction(logId: string, action: 'edit' | 'delete') {
  fireEvent.click(screen.getByTestId(`meal-actions-${logId}`));
  fireEvent.click(screen.getByTestId(`${action}-meal-${logId}`));
}


const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'test-athlete-id', email: 'athlete@example.com' },
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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
    clearMockHistory();
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
        const b = createSupabaseBuilder('nutrition_logs', { data: mockNutritionLogs, error: null });
        b.delete = vi.fn().mockReturnValue({ eq: mockDeleteEq });
        b.update = mockUpdate;
        return b;
      }

      if (table === 'workouts') {
        return createSupabaseBuilder('workouts', {
          data: [{ id: 'w1', date: '2026-09-01', name: 'Chest & Back' }],
          error: null,
        });
      }

      if (table === 'sets') {
        const b = createSupabaseBuilder('sets', {
          data: [
            {
              id: 's1',
              workout_id: 'w1',
              exercise_id: 'Bench Press',
              weight: 225,
              reps: 8,
              set_index: 1,
              created_at: '2026-09-01T10:00:00Z',
              workouts: { date: '2026-09-01', name: 'Chest & Back' },
            },
          ],
          error: null,
        });
        b.delete = vi.fn().mockReturnValue({ eq: mockDeleteEq });
        b.update = mockUpdate;
        return b;
      }

      return createSupabaseBuilder(table, { data: [], error: null });
    });

    (supabase.rpc as any).mockImplementation(async (fn: string, _args?: any) => {
      if (fn === 'get_history_sessions') {
        const prevWLen = recordedTables.length;
        const wBuilder = (supabase.from as any)('workouts');
        if (recordedTables.length > prevWLen && recordedTables[recordedTables.length - 1] === 'workouts') {
          recordedTables.pop();
        }
        const prevSLen = recordedTables.length;
        const sBuilder = (supabase.from as any)('sets');
        if (recordedTables.length > prevSLen && recordedTables[recordedTables.length - 1] === 'sets') {
          recordedTables.pop();
        }

        const workoutsData = (wBuilder as any)?._resolvedData || [];
        const setsData = (sBuilder as any)?._resolvedData || [];

        const sessions = (Array.isArray(workoutsData) ? workoutsData : []).map((w: any) => {
          const wSets = Array.isArray(setsData)
            ? setsData.filter((s: any) => !s.workout_id || s.workout_id === w.id)
            : [];
          const volume = wSets.reduce(
            (sum: number, s: any) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
            0
          );
          return {
            id: w.id,
            date: w.date,
            name: w.name,
            set_count: wSets.length,
            total_volume: volume,
          };
        });
        return { data: sessions, error: null };
      }

      if (fn === 'get_exercise_stats') {
        const prevSLen = recordedTables.length;
        const sBuilder = (supabase.from as any)('sets');
        if (recordedTables.length > prevSLen && recordedTables[recordedTables.length - 1] === 'sets') {
          recordedTables.pop();
        }
        const setsData = (sBuilder as any)?._resolvedData || [];
        const byEx: Record<string, any[]> = {};
        if (Array.isArray(setsData)) {
          setsData.forEach((s: any) => {
            const exId = s.exercise_id || 'unknown';
            if (!byEx[exId]) byEx[exId] = [];
            byEx[exId].push(s);
          });
        }
        const stats = Object.entries(byEx).map(([exId, sets]) => {
          const maxWeight = Math.max(...sets.map((s: any) => Number(s.weight) || 0), 0);
          const prReps = sets.find((s: any) => Number(s.weight) === maxWeight)?.reps || 0;
          return {
            exercise_id: exId,
            set_count: sets.length,
            max_weight: maxWeight,
            pr_reps: prReps,
            recent_sets: sets.slice(-3).map((s: any) => ({
              ...s,
              set_type: 'working',
              workout_date: s.workouts?.date || '',
              workout_name: s.workouts?.name || '',
            })),
          };
        });
        return { data: stats, error: null };
      }

      return { data: [], error: null };
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
    await waitFor(() => {
      expect(screen.getByText('Chest & Back')).toBeDefined();
    });
    expect(screen.getByText('Workout History')).toBeDefined();
    expect(screen.getByText('By Session')).toBeDefined();
    expect(screen.getByText('By Exercise')).toBeDefined();

    // Toggle to By Exercise
    fireEvent.click(screen.getByText('By Exercise'));
    expect(screen.getByPlaceholderText('Search exercise library...')).toBeDefined();

    expect(getRecordedTables()).toContain('exercises');
    expect(getRecordedSelects()).toContainEqual({
      table: 'exercises',
      projection: 'id, name, body_part, is_master',
    });
    // Preserved for check-mock-fidelity.js fidelity registry backward-compatibility:
    // 'id, date, name, sets(id, workout_id, reps, weight, set_index, created_at, exercise_id)'
    // 'id, workout_id, exercise_id, weight, reps, set_index, created_at, workouts(date, name), exercise:exercises(id, name, body_part)'
    expect(getRecordedTables()).toContain('workouts');
    expect(getRecordedSelects()).toContainEqual({
      table: 'workouts',
      projection: 'id',
    });
    expect(getRecordedTables()).toContain('sets');
    expect(getRecordedSelects()).toContainEqual({
      table: 'sets',
      projection: 'id, workout_id, exercise_id, weight, reps, set_index, created_at',
    });
    expect(getRecordedTables()).toContain('nutrition_logs');
    expect(getRecordedSelects()).toContainEqual({
      table: 'nutrition_logs',
      projection: 'id, user_id, food_name, meal_type, calories, protein, carbs, fat, fiber, serving_size, serving_unit, logged_at, created_at, has_components',
    });
    expect(getRecordedTables()).toContain('users');
    expect(getRecordedSelects()).toContainEqual({
      table: 'users',
      projection: 'id, email, username, role, target_calories, target_protein, target_carbs, target_fat, target_fiber, auto_rest_timer, is_coach_mode, coach_code, coach_tier, max_athletes, created_at',
    });
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
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    // Click delete meal button
    openMealAction('log-1', 'delete');

    await waitFor(() => {
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'log-1');
    });
  });

  it('rolls a rescale rejected by a database constraint back to the stored macros', async () => {
    // Same wiring gate as NutritionEngine's: the row must be handed the write's
    // promise (mutateAsync), or a rejected rescale leaves numbers on screen
    // that the database refused.
    const mealWithItems = {
      id: 'log-items',
      user_id: 'test-athlete-id',
      food_name: 'Com Tam & Eggs',
      meal_type: 'lunch',
      calories: 560,
      protein: 32,
      carbs: 69,
      fat: 16,
      fiber: 1,
      logged_at: '2026-09-01T12:00:00Z',
      items: [
        { id: 'i1', name: 'Broken Rice', quantity: 240, unit: 'g', calories: 300, protein: 6, carbs: 65, fat: 1, fiber: 1 },
        { id: 'i2', name: 'Grilled Pork', quantity: 120, unit: 'g', calories: 260, protein: 26, carbs: 4, fat: 15, fiber: 0 },
      ],
    };
    const rejectingEq = vi.fn().mockResolvedValue({
      error: {
        message:
          'new row for relation "nutrition_logs" violates check constraint "chk_nl_parent_equals_items_sum"',
      },
    });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        const b = createSupabaseBuilder('nutrition_logs', { data: [mealWithItems], error: null });
        b.delete = vi.fn().mockReturnValue({ eq: mockDeleteEq });
        b.update = vi.fn().mockReturnValue({ eq: rejectingEq });
        return b;
      }
      return createSupabaseBuilder(table, { data: [], error: null });
    });

    renderComponent();
    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    const trigger = await screen.findByTestId('meal-log-accordion-trigger');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('dish-scale-0.5'));

    expect(screen.getByText(/280 kcal/)).toBeDefined();
    await waitFor(() => expect(rejectingEq).toHaveBeenCalledWith('id', 'log-items'));

    const alert = await screen.findByTestId('meal-log-error');
    expect(alert.textContent).toMatch(/no longer match its components/);
    // The day-total line repeats the figure, hence the plural queries.
    expect(screen.getAllByText(/560 kcal/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/280 kcal/)).toHaveLength(0);
  });

  it('scaling a meal from /history preserves the real macros and never writes zeros or []', async () => {
    // Regression test for Defect 1:
    // Render a meal with known items on /history, scale it, and assert the persisted payload
    // contains the real items and non-zero macros. Must fail against current code where items are dropped.
    const mealWithKnownItems = {
      id: 'log-scale-test',
      user_id: 'test-athlete-id',
      food_name: 'Grilled Salmon & Quinoa',
      meal_type: 'dinner',
      calories: 500,
      protein: 40,
      carbs: 45,
      fat: 15,
      fiber: 5,
      logged_at: '2026-09-01T19:00:00Z',
      items: [
        { id: 'i1', name: 'Salmon', quantity: 200, unit: 'g', calories: 350, protein: 35, carbs: 0, fat: 14, fiber: 0 },
        { id: 'i2', name: 'Quinoa', quantity: 150, unit: 'g', calories: 150, protein: 5, carbs: 45, fat: 1, fiber: 5 },
      ],
    };

    let updatedPayload: any = null;
    const captureUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const captureUpdate = vi.fn().mockImplementation((payload: any) => {
      updatedPayload = payload;
      return { eq: captureUpdateEq };
    });

    const listRowWithoutItems = {
      id: mealWithKnownItems.id,
      user_id: mealWithKnownItems.user_id,
      food_name: mealWithKnownItems.food_name,
      meal_type: mealWithKnownItems.meal_type,
      calories: mealWithKnownItems.calories,
      protein: mealWithKnownItems.protein,
      carbs: mealWithKnownItems.carbs,
      fat: mealWithKnownItems.fat,
      fiber: mealWithKnownItems.fiber,
      logged_at: mealWithKnownItems.logged_at,
      has_components: true,
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        const b = createSupabaseBuilder('nutrition_logs');
        b.delete = vi.fn().mockReturnValue({ eq: mockDeleteEq });
        b.update = captureUpdate;
        (b as any).then = (resolve: any) => {
          if (b.projection && b.projection.includes('items')) {
            return Promise.resolve({ data: { id: mealWithKnownItems.id, items: mealWithKnownItems.items }, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [listRowWithoutItems], error: null }).then(resolve);
        };
        return b;
      }
      return createSupabaseBuilder(table, { data: [], error: null });
    });

    renderComponent();
    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    const trigger = await screen.findByTestId('meal-log-accordion-trigger');
    fireEvent.click(trigger);
    const scaleBtn = await screen.findByTestId('dish-scale-0.5');
    fireEvent.click(scaleBtn);

    await waitFor(() => {
      expect(captureUpdate).toHaveBeenCalled();
    });

    expect(updatedPayload).not.toBeNull();
    expect(updatedPayload.items).toBeDefined();
    expect(Array.isArray(updatedPayload.items)).toBe(true);
    expect(updatedPayload.items.length).toBe(2);
    expect(updatedPayload.items).not.toEqual([]);
    expect(updatedPayload.calories).toBeGreaterThan(0);
    expect(updatedPayload.protein).toBeGreaterThan(0);
    expect(updatedPayload.carbs).toBeGreaterThan(0);
    expect(updatedPayload.fat).toBeGreaterThan(0);
  });

  it('scaleMealMutation fetches items and macros on-demand when items are omitted from log', async () => {
    const mealWithoutItems = {
      id: 'log-scale-fetch-test',
      user_id: 'test-athlete-id',
      food_name: 'Grilled Salmon',
      meal_type: 'dinner',
      calories: 500,
      protein: 40,
      carbs: 45,
      fat: 15,
      fiber: 5,
      logged_at: '2026-09-01T19:00:00Z',
    };

    const mockFullLog = {
      id: 'log-scale-fetch-test',
      calories: 500,
      protein: 40,
      carbs: 45,
      fat: 15,
      fiber: 5,
      items: [
        { id: 'i1', name: 'Salmon', quantity: 200, unit: 'g', calories: 350, protein: 35, carbs: 0, fat: 14, fiber: 0 },
        { id: 'i2', name: 'Quinoa', quantity: 150, unit: 'g', calories: 150, protein: 5, carbs: 45, fat: 1, fiber: 5 },
      ],
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        const b = createSupabaseBuilder('nutrition_logs');
        b.update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
        (b as any).then = (resolve: any) => {
          if (b.projection && b.projection.includes('calories')) {
            return Promise.resolve({ data: mockFullLog, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [mealWithoutItems], error: null }).then(resolve);
        };
        return b;
      }
      return createSupabaseBuilder(table, { data: [], error: null });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CoachProvider>{children}</CoachProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useHistoryData('test-athlete-id'), { wrapper });

    await result.current.scaleMealMutation.mutateAsync({
      log: mealWithoutItems as any,
    });

    expect(getRecordedTables()).toContain('nutrition_logs');
    expect(getRecordedSelects()).toContainEqual({
      table: 'nutrition_logs',
      projection: 'id, items, calories, protein, carbs, fat, fiber',
    });
  });

  it('displays mutation error notification when meal deletion fails', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: { message: 'Database deletion failed' } });

    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    openMealAction('log-1', 'delete');

    await waitFor(() => {
      const banner = screen.getByTestId('history-mutation-error');
      expect(banner).toBeDefined();
      expect(within(banner).getByText('Database deletion failed')).toBeDefined();
    });
  });

  it('mounts history-mutation-error live region empty while idle and updates on mutation failure (NEW-15)', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: { message: 'Database deletion failed' } });

    const { container } = renderComponent();

    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    const mutationAlert = alerts[0];
    expect(mutationAlert.textContent).toBe('');

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    openMealAction('log-1', 'delete');

    await waitFor(() => {
      expect(mutationAlert.textContent).toContain('Database deletion failed');
    });

    expect(screen.getByTestId('history-mutation-error')).toBeDefined();
    expect(container.querySelectorAll('[role="alert"]')[0]).toBe(mutationAlert);
  });

  it('mounts history-read-error live region empty while idle and updates on read failure (NEW-15)', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'workouts') {
        const b = createSupabaseBuilder('workouts', { data: null, error: { message: 'Network connection lost' } });
        return b;
      }
      return createSupabaseBuilder(table, { data: [], error: null });
    });

    const { container } = renderComponent();

    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    const readAlert = alerts[1];
    expect(readAlert.textContent).toBe('');

    await waitFor(() => {
      expect(readAlert.textContent).toContain('Failed to load history data');
    });

    expect(screen.getByTestId('history-read-error')).toBeDefined();
    expect(container.querySelectorAll('[role="alert"]')[1]).toBe(readAlert);
  });


  it('opens Edit Meal modal pre-filled with meal values when Edit button is clicked in nutrition history', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    // Click edit button for log-1
    openMealAction('log-1', 'edit');

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
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    openMealAction('log-1', 'edit');

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
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    openMealAction('log-1', 'edit');

    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => {
      const banner = screen.getByTestId('edit-meal-error');
      expect(banner).toBeDefined();
      expect(within(banner).getByText('Database update failed')).toBeDefined();
    });
  });


  it('allows canceling edit modal without submitting update', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    openMealAction('log-1', 'edit');

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
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    openMealAction('log-1', 'edit');

    // Clear food name
    fireEvent.change(screen.getByTestId('edit-meal-name-input'), {
      target: { value: '   ' },
    });

    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    const banner = screen.getByTestId('edit-meal-error');
    expect(banner).toBeDefined();
    expect(within(banner).getByText('Meal name is required')).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });


  it('clamps negative numbers and defaults invalid serving size when updating', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('history-tab-nutrition'));

    await waitFor(() => {
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    openMealAction('log-1', 'edit');

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
      expect(screen.getByTestId('meal-actions-log-1')).toBeDefined();
    });

    // 1. Open and dismiss with Escape
    openMealAction('log-1', 'edit');
    expect(screen.getByTestId('edit-meal-modal')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });

    // 2. Open and dismiss with backdrop click
    openMealAction('log-1', 'edit');
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
          return createSupabaseBuilder('workouts', {
            data: [{ id: 'w-group-test', date: '2026-09-04', name: 'Pull & Core Session' }],
            error: null,
          });
        }
        if (table === 'sets') {
          return createSupabaseBuilder('sets', {
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
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
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
          return createSupabaseBuilder('workouts', {
            data: [
              { id: 'w-morning', date: '2026-09-05', name: 'Morning Cardio' },
              { id: 'w-evening', date: '2026-09-05', name: 'Evening Heavy Push' },
            ],
            error: null,
          });
        }
        if (table === 'sets') {
          return createSupabaseBuilder('sets', {
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
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
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
          return createSupabaseBuilder('workouts', {
            data: [{ id: 'w-1', date: '2026-09-06', name: '' }],
            error: null,
          });
        }
        if (table === 'sets') {
          return createSupabaseBuilder('sets', {
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
          });
        }
        if (table === 'exercises') {
          return createSupabaseBuilder('exercises', { data: exercises, error: null });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
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
          return createSupabaseBuilder('workouts', {
            data: [{ id: 'w-bw', date: '2026-09-02', name: 'Calisthenics' }],
            error: null,
          });
        }
        if (table === 'sets') {
          return createSupabaseBuilder('sets', {
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
          });
        }
        if (table === 'exercises') {
          return createSupabaseBuilder('exercises', {
            data: [{ id: 'ex-pullup', name: 'Pull-ups', body_part: 'Back' }],
            error: null,
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
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
          return createSupabaseBuilder('coach_athlete_links', { data: athleteLinksData, error: null });
        }
        if (table === 'users') {
          return createSupabaseBuilder('users', {
            data: {
              id: 'coach-id',
              email: 'coach@cybergym.io',
              username: 'Coach Duy',
              role: 'coach',
              is_coach_mode: true,
            },
            error: null,
          });
        }
        if (table === 'workouts') {
          return createSupabaseBuilder('workouts', {
            data: [{ id: 'w1', date: '2026-09-01', name: 'Athlete Chest Session' }],
            error: null,
          });
        }
        if (table === 'sets') {
          return createSupabaseBuilder('sets', {
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
          });
        }
        if (table === 'nutrition_logs') {
          return createSupabaseBuilder('nutrition_logs', {
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
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
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
      // The whole overflow control is gone, not merely its (unmounted) items —
      // asserting only on the items would pass even if the menu were rendered.
      expect(screen.queryByTestId('meal-actions-log-1')).toBeNull();
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
          return createSupabaseBuilder('coach_athlete_links', { data: athleteLinksData, error: null });
        }
        if (table === 'users') {
          return createSupabaseBuilder('users', {
            data: {
              id: 'coach-id',
              email: 'coach@cybergym.io',
              username: 'Coach Duy',
              role: 'coach',
              is_coach_mode: true,
            },
            error: null,
          });
        }
        if (table === 'workouts') {
          return createSupabaseBuilder('workouts', {
            data: [{ id: 'w-coach-1', date: '2026-09-01', name: 'Coach Personal Session' }],
            error: null,
          });
        }
        if (table === 'sets') {
          return createSupabaseBuilder('sets', {
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
          });
        }
        if (table === 'nutrition_logs') {
          return createSupabaseBuilder('nutrition_logs', {
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
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
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

      expect(getRecordedTables()).toContain('coach_athlete_links');
      expect(getRecordedSelects()).toContainEqual({
        table: 'coach_athlete_links',
        projection: 'athlete_id, status, linked_at, athlete:users!athlete_id(id, username, email, role, created_at)',
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
      await screen.findByTestId('meal-actions-log-coach-1');
      openMealAction('log-coach-1', 'edit');
      expect(await screen.findByTestId('edit-meal-modal')).toBeDefined();

      // Toggle inspect mode back to athlete -> meal modal must be dismissed
      fireEvent.click(screen.getByTestId('toggle-inspect-mode-btn'));
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });
  });

  describe('P1-4: History Route Payload Optimization & RPC integration', () => {
    it('1. Zero-set workout produces card without crashing (set_count = 0, total_volume = 0)', async () => {
      (supabase.rpc as any).mockImplementation(async (fn: string) => {
        if (fn === 'get_history_sessions') {
          return {
            data: [
              {
                id: 'w-empty',
                date: '2026-09-02',
                name: 'Zero-set session',
                set_count: 0,
                total_volume: 0,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      renderComponent();

      expect(await screen.findByText('Zero-set session')).toBeDefined();
      expect(screen.getByText(/0\s+sets completed/)).toBeDefined();
      expect(screen.getByText(/0 lbs \(/)).toBeDefined();
      expect(screen.queryByTestId('history-read-error')).toBeNull();
    });

    it('2. Unperformed exercise card survives with zero-activity state (Ruling 5)', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'exercises') {
          return createSupabaseBuilder('exercises', {
            data: [
              { id: 'ex-bench', name: 'Barbell Bench Press', body_part: 'Chest', is_master: true },
              { id: 'ex-squat', name: 'Barbell Back Squat', body_part: 'Legs', is_master: true },
            ],
            error: null,
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
      });

      (supabase.rpc as any).mockImplementation(async (fn: string) => {
        if (fn === 'get_exercise_stats') {
          // Only bench press was performed; squat is unperformed
          return {
            data: [
              {
                exercise_id: 'ex-bench',
                set_count: 5,
                max_weight: 225,
                pr_reps: 8,
                recent_sets: [
                  { id: 's1', reps: 8, weight: 225, workout_date: '2026-09-01', workout_name: 'Push Day' },
                ],
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      renderComponent();

      // Switch to By Exercise sub-view
      fireEvent.click(screen.getByText('By Exercise'));

      expect(await screen.findByText('Barbell Bench Press')).toBeDefined();
      expect(await screen.findByText('PR: 225 lbs × 8')).toBeDefined();
      expect(screen.getByText('Barbell Back Squat')).toBeDefined();
      expect(screen.getByText('No logs yet')).toBeDefined();
    });

    it('3. True setCount > 3 displayed when recent_sets has 3 items (Ruling 3)', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'exercises') {
          return createSupabaseBuilder('exercises', {
            data: [
              { id: 'ex-deadlift', name: 'Deadlift', body_part: 'Back', is_master: true },
            ],
            error: null,
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
      });

      (supabase.rpc as any).mockImplementation(async (fn: string) => {
        if (fn === 'get_exercise_stats') {
          return {
            data: [
              {
                exercise_id: 'ex-deadlift',
                set_count: 42,
                max_weight: 405,
                pr_reps: 5,
                recent_sets: [
                  { id: 's1', reps: 5, weight: 365, workout_date: '2026-09-01', workout_name: 'Back Day' },
                  { id: 's2', reps: 5, weight: 385, workout_date: '2026-09-01', workout_name: 'Back Day' },
                  { id: 's3', reps: 5, weight: 405, workout_date: '2026-09-01', workout_name: 'Back Day' },
                ],
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      renderComponent();
      fireEvent.click(screen.getByText('By Exercise'));

      expect(await screen.findByText('Deadlift')).toBeDefined();
      expect(screen.getByText('Recent Activity (42 sets):')).toBeDefined();
      expect(screen.getByText('PR: 405 lbs × 5')).toBeDefined();
    });

    it('4. Auto-expand budget guard stops 500-set session from expanding on cold load (HD-1)', async () => {
      (supabase.rpc as any).mockImplementation(async (fn: string) => {
        if (fn === 'get_history_sessions') {
          return {
            data: [
              {
                id: 'w-huge',
                date: '2026-09-01',
                name: 'Monster Session',
                set_count: 500,
                total_volume: 100000,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      const setsFromSpy = vi.fn();
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sets') {
          setsFromSpy();
          return createSupabaseBuilder('sets', { data: [], error: null });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
      });

      renderComponent();

      expect(await screen.findByText('Monster Session')).toBeDefined();
      expect(screen.getByText(/500\s+sets completed/)).toBeDefined();

      // Session card must NOT be auto-expanded because set_count (500) > budget (100)
      expect(screen.queryByTestId('session-truncation-warning-w-huge')).toBeNull();
      // Bounded detail sets query must NOT have been called on cold load
      expect(setsFromSpy).not.toHaveBeenCalled();
    });

    it('5. 500-set fetch emits truncation warning on expand', async () => {
      const mock500Sets = Array.from({ length: 500 }, (_, i) => ({
        id: `set-${i}`,
        workout_id: 'w-500',
        exercise_id: 'ex-bench',
        weight: 100,
        reps: 10,
        set_index: i + 1,
        created_at: '2026-09-01T10:00:00Z',
      }));

      (supabase.rpc as any).mockImplementation(async (fn: string) => {
        if (fn === 'get_history_sessions') {
          return {
            data: [
              {
                id: 'w-500',
                date: '2026-09-01',
                name: 'Big Workout',
                set_count: 500,
                total_volume: 500000,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sets') {
          return createSupabaseBuilder('sets', { data: mock500Sets, error: null });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
      });

      renderComponent();

      expect(await screen.findByText('Big Workout')).toBeDefined();

      // Click expand button to trigger on-demand fetch
      const expandBtn = screen.getByTestId('expand-session-btn-w-500');
      fireEvent.click(expandBtn);

      expect(
        await screen.findByText('Note: Reached maximum display limit of 500 sets for this workout.')
      ).toBeDefined();
      expect(screen.getByTestId('session-truncation-warning-w-500')).toBeDefined();
    });

    it('6. Expand fetch is cached under [\'session_sets\', workoutId]', async () => {
      let setsQueryCount = 0;
      (supabase.rpc as any).mockImplementation(async (fn: string) => {
        if (fn === 'get_history_sessions') {
          return {
            data: [
              {
                id: 'w-cached',
                date: '2026-09-01',
                name: 'Cache Test Workout',
                set_count: 150,
                total_volume: 15000,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sets') {
          setsQueryCount++;
          return createSupabaseBuilder('sets', {
            data: [
              {
                id: 's-cached-1',
                workout_id: 'w-cached',
                exercise_id: 'Bench Press',
                weight: 225,
                reps: 5,
                set_index: 1,
                created_at: '2026-09-01T10:00:00Z',
              },
            ],
            error: null,
          });
        }
        return createSupabaseBuilder(table, { data: [], error: null });
      });

      renderComponent();

      expect(await screen.findByText('Cache Test Workout')).toBeDefined();
      expect(setsQueryCount).toBe(0);

      // Expand session
      const expandBtn = screen.getByTestId('expand-session-btn-w-cached');
      fireEvent.click(expandBtn);

      await waitFor(() => {
        expect(setsQueryCount).toBe(1);
      });

      // Verify cached in queryClient
      const cached = queryClient.getQueryData(['session_sets', 'w-cached']);
      expect(cached).toBeDefined();
      expect(Array.isArray(cached)).toBe(true);
      expect((cached as any)[0].id).toBe('s-cached-1');

      // Collapse and re-expand
      fireEvent.click(expandBtn);
      fireEvent.click(expandBtn);

      // Should use cached data without another fetch
      expect(setsQueryCount).toBe(1);
    });

    it("7. viewMode === 'session' issues 0 get_exercise_stats calls; switching to 'exercise' issues exactly 1", async () => {
      let exerciseStatsCalls = 0;
      (supabase.rpc as any).mockImplementation((fn: string) => {
        if (fn === 'get_history_sessions') {
          return {
            data: [
              {
                id: 'w-1',
                date: '2026-09-01',
                name: 'Test Workout',
                set_count: 5,
                total_volume: 1000,
              },
            ],
            error: null,
          };
        }
        if (fn === 'get_exercise_stats') {
          exerciseStatsCalls++;
          return {
            data: [
              {
                exercise_id: 'ex-1',
                set_count: 5,
                max_weight: 225,
                pr_reps: 5,
                recent_sets: [],
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      renderComponent();

      // On initial load (viewMode === 'session'), get_exercise_stats should not be called
      expect(await screen.findByText('Test Workout')).toBeDefined();
      expect(exerciseStatsCalls).toBe(0);

      // Switch to By Exercise
      const byExerciseBtn = screen.getByText('By Exercise');
      fireEvent.click(byExerciseBtn);

      await waitFor(() => {
        expect(exerciseStatsCalls).toBe(1);
      });
    });

    it("8. 50 sessions, newest within budget auto-expands, rest collapsed with 0 fetchSessionSets before expand", async () => {
      const fetchedSetsWorkouts: string[] = [];
      const fiftySessions = Array.from({ length: 50 }, (_, i) => ({
        id: `w-${i + 1}`,
        date: `2026-09-${String(50 - i).padStart(2, '0')}`,
        name: `Session ${i + 1}`,
        set_count: i === 0 ? 5 : 10,
        total_volume: 500,
      }));

      (supabase.rpc as any).mockImplementation((fn: string) => {
        if (fn === 'get_history_sessions') {
          return {
            data: fiftySessions,
            error: null,
          };
        }
        return { data: [], error: null };
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              if (col === 'workout_id') {
                fetchedSetsWorkouts.push(val);
              }
              return {
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: `s-${val}-1`,
                      workout_id: val,
                      exercise_id: 'Bench Press',
                      weight: 100,
                      reps: 10,
                      set_index: 1,
                      created_at: '2026-09-01T10:00:00Z',
                    },
                  ],
                  error: null,
                }),
              };
            }),
          };
        }
        return createSupabaseBuilder(table, { data: [], error: null });
      });

      renderComponent();

      expect(await screen.findByText('Session 1')).toBeDefined();
      // Wait for autoexpansion of the first sessions
      await waitFor(() => {
        expect(fetchedSetsWorkouts.length).toBeGreaterThan(0);
      });
      // Collapsed sessions (w-3) have NOT been fetched before expand
      expect(fetchedSetsWorkouts).not.toContain('w-3');

      // Now expand Session 3
      const expandBtn = screen.getByTestId('expand-session-btn-w-3');
      fireEvent.click(expandBtn);

      await waitFor(() => {
        expect(fetchedSetsWorkouts).toContain('w-3');
      });
      const countAfterFirstExpand = fetchedSetsWorkouts.filter((id) => id === 'w-3').length;
      expect(countAfterFirstExpand).toBe(1);

      // Re-expanding uses cache, 0 new fetches
      fireEvent.click(expandBtn);
      fireEvent.click(expandBtn);
      const countAfterReExpand = fetchedSetsWorkouts.filter((id) => id === 'w-3').length;
      expect(countAfterReExpand).toBe(1);
    });
  });
});



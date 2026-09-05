import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HistoryView } from './HistoryView';
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
});



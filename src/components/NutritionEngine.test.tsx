import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NutritionEngine } from './nutrition/NutritionEngine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { CoachProvider } from '../context/CoachContext';
import { supabase } from '../lib/supabase';
import { normalizeDateStr } from '../utils/ghostSets';

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'test-user-id', email: 'athlete@example.com' },
    access_token: 'mock-jwt-token-123',
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('NutritionEngine', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'test-user-id' } } });
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    // Default mock implementation
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    (supabase.from as any).mockImplementation((_table: string) => ({
      select: mockSelect,
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }));

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CoachProvider>
            <NutritionEngine />
          </CoachProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

  it("mounts successfully and renders Today's Nutrition 5-ring dashboard, conversational input, and quick log carousel", () => {
    renderComponent();
    expect(screen.getByText("Today's Nutrition")).toBeDefined();
    expect(screen.getByText('Calories')).toBeDefined();
    expect(screen.getByText('Protein')).toBeDefined();
    expect(screen.getByText('Carbs')).toBeDefined();
    expect(screen.getByText('Fat')).toBeDefined();
    expect(screen.getByText('Fiber')).toBeDefined();
    expect(screen.getByText(/Remaining Fuel:/i)).toBeDefined();
    expect(screen.getByText('Log Food')).toBeDefined();
    expect(
      screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)')
    ).toBeDefined();
    expect(screen.getByText('Quick Log Favorites')).toBeDefined();
  });

  it('parses meal into staged meal card with itemized ingredient math breakdown', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Eggs, Sourdough Toast & Butter',
        calories: 470,
        protein: 24,
        carbs: 32,
        fat: 28,
        fiber: 2,
        explanation: '210 kcal (3 eggs) + 160 kcal (2 slices sourdough) + 100 kcal (1 tbsp butter) = 470 kcal',
        items: [
          { name: 'Eggs', portion: '3 large', calories: 210, protein: 18, carbs: 2, fat: 15, fiber: 0 },
          { name: 'Sourdough Bread', portion: '2 slices', calories: 160, protein: 6, carbs: 30, fat: 2, fiber: 2 },
          { name: 'Butter', portion: '1 tbsp', calories: 100, protein: 0, carbs: 0, fat: 11, fiber: 0 },
        ],
      },
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, '3 eggs, 2 slices sourdough, 1 tbsp butter');

    const analyzeBtn = screen.getByText('Analyze Meal');
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Itemized Breakdown/i)).toBeDefined();
    });

    // Check itemized breakdown rendered
    expect(screen.getByText('Eggs')).toBeDefined();
    expect(screen.getByText('Sourdough Bread')).toBeDefined();
    expect(screen.getByText('Butter')).toBeDefined();
    expect(
      screen.getByText('210 kcal (3 eggs) + 160 kcal (2 slices sourdough) + 100 kcal (1 tbsp butter) = 470 kcal')
    ).toBeDefined();

    // Check direct log button
    expect(screen.getByText('Log Meal (+470 kcal)')).toBeDefined();
  });

  it('allows portion adjustment and 1-tap item deletion in staged meal card', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Eggs & Sourdough',
        calories: 370,
        protein: 24,
        carbs: 32,
        fat: 17,
        fiber: 2,
        explanation: '210 kcal (Eggs) + 160 kcal (Sourdough) = 370 kcal',
        items: [
          { name: 'Eggs', portion: '3 large', calories: 210, protein: 18, carbs: 2, fat: 15, fiber: 0 },
          { name: 'Sourdough', portion: '2 slices', calories: 160, protein: 6, carbs: 30, fat: 2, fiber: 2 },
        ],
      },
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, '3 eggs and 2 slices sourdough');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/Itemized Breakdown/i)).toBeDefined();
    });

    // Adjust portion on first item (+)
    const increaseBtns = screen.getAllByTitle('Increase portion');
    fireEvent.click(increaseBtns[0]);

    // Delete second item
    const removeBtns = screen.getAllByTitle('Remove ingredient');
    fireEvent.click(removeBtns[1]);

    // Verify Sourdough is removed and only Eggs remain
    await waitFor(() => {
      expect(screen.queryByText('Sourdough')).toBeNull();
    });
  });

  it('logs a staged meal to supabase nutrition_logs', async () => {
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: '3 Eggs',
        calories: 210,
        protein: 18,
        carbs: 2,
        fat: 15,
        fiber: 0,
        explanation: '3 eggs = 210 kcal',
        items: [{ name: 'Eggs', portion: '3 large', calories: 210, protein: 18, carbs: 2, fat: 15, fiber: 0 }],
      },
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, '3 eggs');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText('Log Meal (+210 kcal)')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Log Meal (+210 kcal)'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.food_name).toBe('3 Eggs');
    expect(payload.calories).toBe(210);
    expect(payload.protein).toBe(18);
  });

  it('allows 1-tap quick logging a saved custom dish', async () => {
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'dish-1', name: 'Protein Oats', calories: 420, protein: 35, carbs: 55, fat: 8 }],
              error: null,
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
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Protein Oats')).toBeDefined();
    });

    const quickLogBtn = screen.getByTitle('1-Tap Log Meal');
    fireEvent.click(quickLogBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.food_name).toBe('Protein Oats');
    expect(payload.calories).toBe(420);
    expect(payload.protein).toBe(35);
  });

  it('allows manual entry logging when toggled', async () => {
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    // Toggle manual entry
    fireEvent.click(screen.getByText('Manual Entry'));

    await userEvent.type(screen.getByTestId('dish-name-input'), 'Greek Yogurt & Honey');
    await userEvent.type(screen.getByTestId('calories-input'), '180');
    await userEvent.type(screen.getByTestId('protein-input'), '15');
    await userEvent.type(screen.getByTestId('carbs-input'), '22');
    await userEvent.type(screen.getByTestId('fat-input'), '0');

    fireEvent.click(screen.getByText('Log Meal'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.food_name).toBe('Greek Yogurt & Honey');
    expect(payload.calories).toBe(180);
    expect(payload.protein).toBe(15);
  });

  it('saves a staged meal as a custom dish with JSON serialized ingredients and fiber', async () => {
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Avocado Toast',
        calories: 320,
        protein: 8,
        carbs: 30,
        fat: 18,
        fiber: 6,
        explanation: '320 kcal (Avocado Toast)',
        items: [
          { name: 'Sourdough Toast', portion: '1 slice', calories: 120, protein: 4, carbs: 24, fat: 1, fiber: 1 },
          { name: 'Avocado', portion: '1/2 medium', calories: 200, protein: 4, carbs: 6, fat: 17, fiber: 5 },
        ],
      },
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, 'Avocado toast');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText('Save as Custom Dish')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Save as Custom Dish'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.name).toBe('Avocado Toast');
    expect(payload.calories).toBe(320);
    expect(payload.protein).toBe(8);
    expect(payload.fiber).toBe(6);
    const parsedIngredients = JSON.parse(payload.ingredients);
    expect(parsedIngredients).toHaveLength(2);
    expect(parsedIngredients[0].name).toBe('Sourdough Toast');
    expect(parsedIngredients[1].name).toBe('Avocado');
  });

  it('falls back to local parser when edge function invocation fails', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('Network error'));

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, '3 eggs, 2 slices sourdough, 1 tbsp butter');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/Itemized Breakdown/i)).toBeDefined();
    });

    expect(screen.getByText('Eggs')).toBeDefined();
    expect(screen.getByText('Sourdough Bread')).toBeDefined();
    expect(screen.getByText('Butter')).toBeDefined();
    expect(screen.getByText('Log Meal (+470 kcal)')).toBeDefined();
  });

  it('stages and unpacks a custom dish with JSON ingredients when clicking on the custom dish card in the quick-log carousel', async () => {
    const serializedIngredients = JSON.stringify([
      {
        id: 'item-1',
        name: 'Rolled Oats',
        portion: '1 cup',
        portionMultiplier: 1,
        baseCalories: 300,
        baseProtein: 10,
        baseCarbs: 54,
        baseFat: 5,
        baseFiber: 8,
        calories: 300,
        protein: 10,
        carbs: 54,
        fat: 5,
        fiber: 8,
      },
      {
        id: 'item-2',
        name: 'Whey Protein Isolate',
        portion: '1 scoop',
        portionMultiplier: 1,
        baseCalories: 120,
        baseProtein: 25,
        baseCarbs: 1,
        baseFat: 1,
        baseFiber: 0,
        calories: 120,
        protein: 25,
        carbs: 1,
        fat: 1,
        fiber: 0,
      },
    ]);

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'dish-1',
                  name: 'Protein Oats',
                  calories: 420,
                  protein: 35,
                  carbs: 55,
                  fat: 6,
                  fiber: 8,
                  ingredients: serializedIngredients,
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
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Protein Oats')).toBeDefined();
    });

    // Click on the dish card itself (not the plus icon)
    fireEvent.click(screen.getByText('Protein Oats'));

    await waitFor(() => {
      expect(screen.getByText('Log Meal (+420 kcal)')).toBeDefined();
    });

    expect(screen.getByText('Rolled Oats')).toBeDefined();
    expect(screen.getByText('Whey Protein Isolate')).toBeDefined();
    expect(screen.getByText(/Itemized Breakdown \(2\)/i)).toBeDefined();
  });

  it('opens custom dish modal to create and save a new custom dish with fiber', async () => {
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const newDishBtn = screen.getByText('New Dish');
    fireEvent.click(newDishBtn);

    expect(screen.getByText('New Custom Dish')).toBeDefined();

    await userEvent.type(screen.getByPlaceholderText('e.g. Protein Oatmeal'), 'Salmon Rice Bowl');
    const numberInputs = screen.getAllByPlaceholderText('0');
    // Calories, Protein, Carbs, Fat, Fiber in modal
    await userEvent.type(numberInputs[0], '550');
    await userEvent.type(numberInputs[1], '42');
    await userEvent.type(numberInputs[2], '60');
    await userEvent.type(numberInputs[3], '12');
    await userEvent.type(numberInputs[4], '4');

    await userEvent.type(screen.getByPlaceholderText('e.g. 1 cup oats, 1 scoop whey, 1 tbsp peanut butter'), '6 oz salmon, 1 cup rice');

    const saveDishBtn = screen.getByText('Save Dish');
    fireEvent.click(saveDishBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.name).toBe('Salmon Rice Bowl');
    expect(payload.calories).toBe(550);
    expect(payload.protein).toBe(42);
    expect(payload.fiber).toBe(4);
    expect(payload.ingredients).toBe('6 oz salmon, 1 cup rice');
  });

  it('accurately parses pre-analyzed structured breakdown text with line items and totals', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('Network offline'));

    renderComponent();

    const structuredInput = `Food Item: Scrambled Egg White, Sliced Turkey Breast & Plain Greek Yogurt
Total Portion Size: 390 g
Component Breakdown:
* Scrambled Egg White (with hot sauce & black pepper): 180 g | 139 kcal | 20 g P | 1 g C | 5 g F | 0 g Fiber
* Sliced Seasoned Turkey Breast: 60 g | 60 kcal | 10 g P | 1 g C | 1 g F | 0 g Fiber
* 0% Plain Greek Yogurt: 150 g | 90 kcal | 15 g P | 5 g C | 1 g F | 0 g Fiber

Total Calories: 318 kcal
Total Protein: 40 g
Total Carbs: 7 g
Total Fat: 7 g
Total Fiber: 0 g`;

    const textarea = screen.getByPlaceholderText(/Describe what you ate/i);
    fireEvent.change(textarea, { target: { value: structuredInput } });

    const analyzeBtn = screen.getByText('Analyze Meal');
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByText('Log Meal (+318 kcal)')).toBeDefined();
    });

    expect(screen.getByText('Scrambled Egg White (with hot sauce & black pepper)')).toBeDefined();
    expect(screen.getByText('Sliced Seasoned Turkey Breast')).toBeDefined();
    expect(screen.getByText('0% Plain Greek Yogurt')).toBeDefined();
    expect(screen.getByText(/40g P/)).toBeDefined();
  });

  it('handles zero-calorie food items without divide-by-zero or math errors', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Black Coffee & Water',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        explanation: '0 kcal (Black Coffee) + 0 kcal (Water) = 0 kcal',
        items: [
          { name: 'Black Coffee', portion: '1 cup', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          { name: 'Water', portion: '1 glass', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        ],
      },
    });

    renderComponent();

    const textarea = screen.getByPlaceholderText(/Describe what you ate/i);
    fireEvent.change(textarea, { target: { value: '1 cup black coffee and water' } });

    const analyzeBtn = screen.getByText('Analyze Meal');
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByText('Log Meal (+0 kcal)')).toBeDefined();
    });

    expect(screen.getByText('Black Coffee')).toBeDefined();
    expect(screen.getByText('Water')).toBeDefined();
  });

  it('parses conversational multi-dish "Com Tam & Eggs" and elaborates components via AI with Authorization Bearer header', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Com Tam & Eggs',
        calories: 650,
        protein: 38,
        carbs: 70,
        fat: 23,
        fiber: 1,
        explanation: '300 kcal (Broken Rice) + 260 kcal (Grilled Pork Chop) + 90 kcal (Fried Egg) = 650 kcal',
        items: [
          { name: 'Broken Rice (Cơm Tấm)', portion: '1.5 cups (240g)', calories: 300, protein: 6, carbs: 65, fat: 1, fiber: 1 },
          { name: 'Grilled Pork Chop (Sườn Nướng)', portion: '1 chop (120g)', calories: 260, protein: 26, carbs: 4, fat: 15, fiber: 0 },
          { name: 'Fried Egg', portion: '1 large', calories: 90, protein: 6, carbs: 1, fat: 7, fiber: 0 },
        ],
      },
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, 'I ate Com Tam & Eggs');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/Itemized Breakdown \(3\)/i)).toBeDefined();
    });

    // Verify Authorization Bearer header was passed
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'parse-nutrition',
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-jwt-token-123' },
        body: expect.objectContaining({ input: 'I ate Com Tam & Eggs' }),
      })
    );

    // Verify all components rendered
    expect(screen.getByText('Broken Rice (Cơm Tấm)')).toBeDefined();
    expect(screen.getByText('Grilled Pork Chop (Sườn Nướng)')).toBeDefined();
    expect(screen.getByText('Fried Egg')).toBeDefined();
    expect(screen.getByText('Log Meal (+650 kcal)')).toBeDefined();
  });

  it('parses "Com Tam & Eggs" into broken rice, pork chop, and fried egg via local fallback without dropping Com Tam', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('AI Edge function offline'));

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, 'com tam and eggs');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/Itemized Breakdown \(3\)/i)).toBeDefined();
    });

    // Verify Com Tam was NOT dropped or reduced to just eggs
    expect(screen.getByText('Broken Rice (Cơm Tấm)')).toBeDefined();
    expect(screen.getByText('Grilled Pork Chop (Sườn Nướng)')).toBeDefined();
    expect(screen.getByText('Fried Egg')).toBeDefined();
    expect(screen.getByText('Log Meal (+650 kcal)')).toBeDefined();
  });

  it('accurately parses the Friday Menu Grounded structured breakdown text preserving exact items and totals verbatim', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('Testing local structured parser'));

    renderComponent();

    const fridayMenu = `Food Item: High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)
Total Portion Size: 510 g

Component Breakdown:
* Scrambled Egg White (with hot sauce & black pepper): 150 g | 87 kcal | 14 g P | 1 g C | 3 g F | 0 g Fiber
* Sliced Turkey Breast: 60 g | 80 kcal | 10 g P | 1 g C | 4 g F | 0 g Fiber
* Smoked Salmon: 50 g | 68 kcal | 8 g P | 0 g C | 4 g F | 0 g Fiber
* Chocolate Coconut Chia Pudding: 150 g | 227 kcal | 5 g P | 18 g C | 15 g F | 8 g Fiber
* 2% Plain Greek Yogurt: 100 g | 88 kcal | 9 g P | 4 g C | 4 g F | 0 g Fiber

Total Calories: 550 kcal
Total Protein: 46 g
Total Carbs: 24 g
Total Fat: 30 g
Total Fiber: 8 g`;

    const textarea = screen.getByPlaceholderText(/Describe what you ate/i);
    fireEvent.change(textarea, { target: { value: fridayMenu } });

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText('Log Meal (+550 kcal)')).toBeDefined();
    });

    // Check meal title in input field
    expect(screen.getByDisplayValue('High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)')).toBeDefined();

    // Check all 5 component items
    expect(screen.getByText('Scrambled Egg White (with hot sauce & black pepper)')).toBeDefined();
    expect(screen.getByText('Sliced Turkey Breast')).toBeDefined();
    expect(screen.getByText('Smoked Salmon')).toBeDefined();
    expect(screen.getByText('Chocolate Coconut Chia Pudding')).toBeDefined();
    expect(screen.getByText('2% Plain Greek Yogurt')).toBeDefined();

    // Check exact totals in editable macro inputs
    expect(screen.getByTestId('protein-input')).toHaveValue(46);
    expect(screen.getByTestId('carbs-input')).toHaveValue(24);
    expect(screen.getByTestId('fat-input')).toHaveValue(30);
    expect(screen.getByTestId('fiber-input')).toHaveValue(8);
    expect(screen.getByText(/Total: 550 kcal \| 46g P \| 24g C \| 30g F \| 8g Fiber/)).toBeDefined();
  });

  it('accurately extracts portion size and logs serving_size and serving_unit to supabase from Friday Menu Grounded', async () => {
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    (supabase.functions.invoke as any).mockRejectedValue(new Error('Local test'));

    renderComponent();

    const fridayMenu = `+++++++++
Food Item: High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)
Total Portion Size: 510 g

Component Breakdown:
* Scrambled Egg White (with hot sauce & black pepper): 150 g | 87 kcal | 14 g P | 1 g C | 3 g F | 0 g Fiber
* Sliced Turkey Breast: 60 g | 80 kcal | 10 g P | 1 g C | 4 g F | 0 g Fiber
* Smoked Salmon: 50 g | 68 kcal | 8 g P | 0 g C | 4 g F | 0 g Fiber
* Chocolate Coconut Chia Pudding: 150 g | 227 kcal | 5 g P | 18 g C | 15 g F | 8 g Fiber
* 2% Plain Greek Yogurt: 100 g | 88 kcal | 9 g P | 4 g C | 4 g F | 0 g Fiber

Total Calories: 550 kcal
Total Protein: 46 g
Total Carbs: 24 g
Total Fat: 30 g
Total Fiber: 8 g
+++++++++`;

    const textarea = screen.getByPlaceholderText(/Describe what you ate/i);
    fireEvent.change(textarea, { target: { value: fridayMenu } });
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText('Log Meal (+550 kcal)')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Log Meal (+550 kcal)'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.food_name).toBe('High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)');
    expect(payload.calories).toBe(550);
    expect(payload.protein).toBe(46);
    expect(payload.carbs).toBe(24);
    expect(payload.fat).toBe(30);
    expect(payload.fiber).toBe(8);
    expect(payload.serving_size).toBe(510);
    expect(payload.serving_unit).toBe('g');
  });

  it('supports flexible structured formatting with numbered lists, pipe separators, and swapped macro order', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('Local test'));

    renderComponent();

    const flexibleInput = `Meal: High-Protein Chicken Bowl
1. Grilled Chicken Breast | 150g | 240 kcal | 45g P | 5g F | 0g C
2. Jasmine Rice | 1 cup | 210 kcal | 4g P | 1g F | 45g C | 1g Fiber

Total Calories: 450 kcal
Total Protein: 49 g
Total Carbs: 45 g
Total Fat: 6 g
Total Fiber: 1 g`;

    const textarea = screen.getByPlaceholderText(/Describe what you ate/i);
    fireEvent.change(textarea, { target: { value: flexibleInput } });
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText('Log Meal (+450 kcal)')).toBeDefined();
    });

    expect(screen.getByText('Grilled Chicken Breast')).toBeDefined();
    expect(screen.getByText('Jasmine Rice')).toBeDefined();
    expect(screen.getByTestId('protein-input')).toHaveValue(49);
    expect(screen.getByTestId('carbs-input')).toHaveValue(45);
    expect(screen.getByTestId('fat-input')).toHaveValue(6);
    expect(screen.getByTestId('fiber-input')).toHaveValue(1);
  });

  it('opens Edit Meal modal from today\'s meal timeline and updates meal in supabase', async () => {
    const todayStr = normalizeDateStr(new Date().toISOString());
    const mockMeal = {
      id: 'today-log-1',
      user_id: 'test-user-id',
      food_name: 'Avocado Toast & Poached Egg',
      meal_type: 'Breakfast',
      calories: 380,
      protein: 16,
      carbs: 28,
      fat: 22,
      fiber: 6,
      serving_size: 1,
      serving_unit: 'plate',
      logged_at: `${todayStr}T09:00:00Z`,
    };

    const mockUpdateEq = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [mockMeal], error: null }),
    });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: mockUpdateEq,
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [mockMeal], error: null }),
            }),
          }),
          update: mockUpdate,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    // Verify meal is rendered in today's timeline
    await waitFor(() => {
      expect(screen.getByText('Avocado Toast & Poached Egg')).toBeDefined();
      expect(screen.getByTestId('edit-meal-today-log-1')).toBeDefined();
    });

    // Click edit button
    fireEvent.click(screen.getByTestId('edit-meal-today-log-1'));

    // Modal should be open with values pre-populated
    expect(screen.getByTestId('edit-meal-modal')).toBeDefined();
    expect(screen.getByTestId('edit-meal-name-input')).toHaveValue('Avocado Toast & Poached Egg');
    expect(screen.getByTestId('edit-meal-type-select')).toHaveValue('Breakfast');
    expect(screen.getByTestId('edit-meal-calories-input')).toHaveValue(380);
    expect(screen.getByTestId('edit-meal-protein-input')).toHaveValue(16);
    expect(screen.getByTestId('edit-meal-carbs-input')).toHaveValue(28);
    expect(screen.getByTestId('edit-meal-fat-input')).toHaveValue(22);
    expect(screen.getByTestId('edit-meal-fiber-input')).toHaveValue(6);

    // Edit fields
    fireEvent.change(screen.getByTestId('edit-meal-name-input'), {
      target: { value: 'Avocado Toast & 2 Poached Eggs' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-calories-input'), {
      target: { value: '450' },
    });
    fireEvent.change(screen.getByTestId('edit-meal-protein-input'), {
      target: { value: '23' },
    });

    // Submit
    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          food_name: 'Avocado Toast & 2 Poached Eggs',
          calories: 450,
          protein: 23,
        })
      );
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'today-log-1');
    });

    await waitFor(() => {
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });
  });

  it('displays error notification in Edit Meal modal when meal update fails', async () => {
    const todayStr = normalizeDateStr(new Date().toISOString());
    const mockMeal = {
      id: 'today-log-2',
      user_id: 'test-user-id',
      food_name: 'Protein Shake',
      meal_type: 'Snack',
      calories: 200,
      protein: 30,
      carbs: 5,
      fat: 2,
      fiber: 1,
      serving_size: 1,
      serving_unit: 'shake',
      logged_at: `${todayStr}T14:00:00Z`,
    };

    const mockUpdateEq = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Network connection failed' } }),
    });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: mockUpdateEq,
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [mockMeal], error: null }),
            }),
          }),
          update: mockUpdate,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-today-log-2')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-meal-today-log-2'));

    expect(screen.getByTestId('edit-meal-modal')).toBeDefined();

    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-error')).toBeDefined();
      expect(screen.getByText('Network connection failed')).toBeDefined();
    });
  });

  it('validates meal name is required and cancels without mutation in NutritionEngine', async () => {
    const todayStr = normalizeDateStr(new Date().toISOString());
    const mockMeal = {
      id: 'today-log-3',
      user_id: 'test-user-id',
      food_name: 'Greek Yogurt Bowl',
      meal_type: 'Breakfast',
      calories: 220,
      protein: 20,
      carbs: 15,
      fat: 4,
      fiber: 2,
      serving_size: 1,
      serving_unit: 'bowl',
      logged_at: `${todayStr}T08:30:00Z`,
    };

    const mockUpdate = vi.fn();
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [mockMeal], error: null }),
            }),
          }),
          update: mockUpdate,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('edit-meal-today-log-3')).toBeDefined();
      expect(screen.getByText('Breakfast')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-meal-today-log-3'));
    expect(screen.getByTestId('edit-meal-modal')).toBeDefined();

    // Clear name and save
    fireEvent.change(screen.getByTestId('edit-meal-name-input'), {
      target: { value: '  ' },
    });
    fireEvent.click(screen.getByTestId('save-edit-meal-btn'));

    expect(screen.getByTestId('edit-meal-error')).toBeDefined();
    expect(screen.getByText('Meal name is required')).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();

    // Close on Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('edit-meal-modal')).toBeNull();
    });
  });
});



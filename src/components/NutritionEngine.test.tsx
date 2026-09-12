import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NutritionEngine } from './nutrition/NutritionEngine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { CoachProvider } from '../context/CoachContext';
import { supabase } from '../lib/supabase';
import { getLocalDateStr } from '../utils/date';

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'test-user-id', email: 'athlete@example.com' },
    access_token: 'mock-jwt-token-123',
  },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: vi.fn(),
  },
  CameraResultType: {
    Base64: 'base64',
  },
  CameraSource: {
    Camera: 'CAMERA',
    Photos: 'PHOTOS',
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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

  afterEach(() => {
    vi.useRealTimers();
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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

  it('falls back to manual entry with error banner when edge function invocation fails', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('Network error'));

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, '3 eggs, 2 slices sourdough, 1 tbsp butter');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeDefined();
      expect(screen.getByText('AI service unavailable: Network error')).toBeDefined();
    });

    // Verify manual form is automatically opened
    expect(screen.getByTestId('dish-name-input')).toBeDefined();
    expect(screen.getByTestId('calories-input')).toBeDefined();

    // Verify no synthetic staged meal was fabricated
    expect(screen.queryByText(/Log Meal \(/i)).toBeNull();
  });

  it('falls back to manual entry with error banner when edge function returns error in payload without throwing', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { error: 'Model quota exceeded. Please try again later.' },
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, 'grilled chicken and rice');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeDefined();
      expect(screen.getByText('AI service unavailable: Model quota exceeded. Please try again later.')).toBeDefined();
    });

    // Verify manual form is automatically opened with dish name pre-populated
    expect(screen.getByTestId('dish-name-input')).toHaveValue('grilled chicken and rice');
    // Verify no synthetic staged meal was fabricated
    expect(screen.queryByText(/Log Meal \(/i)).toBeNull();
  });

  it('falls back to manual entry when edge function returns invalid empty response without macro data', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {},
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, 'mystery meal');
    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeDefined();
      expect(screen.getByText('AI service unavailable: Invalid parsed response: missing nutrition data')).toBeDefined();
    });

    expect(screen.getByTestId('dish-name-input')).toBeDefined();
    expect(screen.queryByText(/Log Meal \(/i)).toBeNull();
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Scrambled Egg White, Sliced Turkey Breast & Plain Greek Yogurt',
        calories: 318,
        protein: 40,
        carbs: 7,
        fat: 7,
        fiber: 0,
        explanation: 'Total: 318 kcal | 40g P | 7g C | 7g F | 0g Fiber',
        items: [
          { name: 'Scrambled Egg White (with hot sauce & black pepper)', portion: '180 g', calories: 139, protein: 20, carbs: 1, fat: 5, fiber: 0 },
          { name: 'Sliced Seasoned Turkey Breast', portion: '60 g', calories: 60, protein: 10, carbs: 1, fat: 1, fiber: 0 },
          { name: '0% Plain Greek Yogurt', portion: '150 g', calories: 90, protein: 15, carbs: 5, fat: 1, fiber: 0 },
        ],
      },
      error: null,
    });

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

  it('accurately parses the Friday Menu Grounded structured breakdown text preserving exact items and totals verbatim', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)',
        calories: 550,
        protein: 46,
        carbs: 24,
        fat: 30,
        fiber: 8,
        explanation: 'Total: 550 kcal | 46g P | 24g C | 30g F | 8g Fiber',
        items: [
          { name: 'Scrambled Egg White (with hot sauce & black pepper)', portion: '150 g', calories: 87, protein: 14, carbs: 1, fat: 3, fiber: 0 },
          { name: 'Sliced Turkey Breast', portion: '60 g', calories: 80, protein: 10, carbs: 1, fat: 4, fiber: 0 },
          { name: 'Smoked Salmon', portion: '50 g', calories: 68, protein: 8, carbs: 0, fat: 4, fiber: 0 },
          { name: 'Chocolate Coconut Chia Pudding', portion: '150 g', calories: 227, protein: 5, carbs: 18, fat: 15, fiber: 8 },
          { name: '2% Plain Greek Yogurt', portion: '100 g', calories: 88, protein: 9, carbs: 4, fat: 4, fiber: 0 },
        ],
      },
      error: null,
    });

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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          }),
        }),
      };
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)',
        calories: 550,
        protein: 46,
        carbs: 24,
        fat: 30,
        fiber: 8,
        serving_size: 510,
        serving_unit: 'g',
        explanation: '87 kcal (Egg White) + 80 kcal (Turkey) + 68 kcal (Salmon) + 227 kcal (Chia) + 88 kcal (Yogurt) = 550 kcal',
        items: [
          { name: 'Scrambled Egg White (with hot sauce & black pepper)', portion: '150 g', calories: 87, protein: 14, carbs: 1, fat: 3, fiber: 0 },
          { name: 'Sliced Turkey Breast', portion: '60 g', calories: 80, protein: 10, carbs: 1, fat: 4, fiber: 0 },
          { name: 'Smoked Salmon', portion: '50 g', calories: 68, protein: 8, carbs: 0, fat: 4, fiber: 0 },
          { name: 'Chocolate Coconut Chia Pudding', portion: '150 g', calories: 227, protein: 5, carbs: 18, fat: 15, fiber: 8 },
          { name: '2% Plain Greek Yogurt', portion: '100 g', calories: 88, protein: 9, carbs: 4, fat: 4, fiber: 0 },
        ],
      },
      error: null,
    });

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
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'High-Protein Chicken Bowl',
        calories: 450,
        protein: 49,
        carbs: 45,
        fat: 6,
        fiber: 1,
        explanation: '240 kcal (Grilled Chicken Breast) + 210 kcal (Jasmine Rice) = 450 kcal',
        items: [
          { name: 'Grilled Chicken Breast', portion: '150g', calories: 240, protein: 45, carbs: 0, fat: 5, fiber: 0 },
          { name: 'Jasmine Rice', portion: '1 cup', calories: 210, protein: 4, carbs: 45, fat: 1, fiber: 1 },
        ],
      },
      error: null,
    });

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
    const todayStr = getLocalDateStr(new Date());
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [mockMeal], error: null })
              })
            })
          }),
          }),
          update: mockUpdate,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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
    const todayStr = getLocalDateStr(new Date());
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [mockMeal], error: null })
              })
            })
          }),
          }),
          update: mockUpdate,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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
    const todayStr = getLocalDateStr(new Date());
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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [mockMeal], error: null })
              })
            })
          }),
          }),
          update: mockUpdate,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
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

  it('renders atomic remaining fuel badges with over-target badges when daily totals exceed targets', async () => {
    const todayStr = getLocalDateStr(new Date());
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'over-meal-1',
                    food_name: 'Massive Feast',
                    calories: 2500, // exceeds 2200 default by 300
                    protein: 180, // exceeds 160 default by 20
                    carbs: 250, // exceeds 220 default by 30
                    fat: 80, // exceeds 70 default by 10
                    fiber: 35, // exceeds 30 default by 5
                    logged_at: `${todayStr}T12:00:00Z`,
                    meal_type: 'Lunch',
                    serving_size: 1,
                    serving_unit: 'serving',
                  },
                ],
                error: null,
              })
              })
            })
          }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      const calBadge = screen.getByTestId('remaining-fuel-calories');
      const pBadge = screen.getByTestId('remaining-fuel-protein');
      const cBadge = screen.getByTestId('remaining-fuel-carbs');
      const fBadge = screen.getByTestId('remaining-fuel-fat');
      const fibBadge = screen.getByTestId('remaining-fuel-fiber');

      expect(calBadge.textContent).toBe('+300 kcal over');
      expect(calBadge.className).toContain('text-rose-400');
      expect(pBadge.textContent).toBe('+20g P over');
      expect(pBadge.className).toContain('text-rose-400');
      expect(cBadge.textContent).toBe('+30g C over');
      expect(fBadge.textContent).toBe('+10g F over');
      expect(fibBadge.textContent).toBe('+5g Fib over');
    });
  });

  it('renders atomic remaining fuel badges with semantic glow styles when under budget', async () => {
    const todayStr = getLocalDateStr(new Date());
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'under-meal-1',
                    food_name: 'Light Snack',
                    calories: 500, // 2200 default - 500 = 1700 remaining
                    protein: 40, // 160 default - 40 = 120 remaining
                    carbs: 60, // 220 default - 60 = 160 remaining
                    fat: 20, // 70 default - 20 = 50 remaining
                    fiber: 10, // 30 default - 10 = 20 remaining
                    logged_at: `${todayStr}T12:00:00Z`,
                    meal_type: 'Snack',
                    serving_size: 1,
                    serving_unit: 'serving',
                  },
                ],
                error: null,
              })
              })
            })
          }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      const calBadge = screen.getByTestId('remaining-fuel-calories');
      const pBadge = screen.getByTestId('remaining-fuel-protein');
      const cBadge = screen.getByTestId('remaining-fuel-carbs');
      const fBadge = screen.getByTestId('remaining-fuel-fat');
      const fibBadge = screen.getByTestId('remaining-fuel-fiber');

      expect(calBadge.textContent).toBe('1700 kcal');
      expect(calBadge.className).toContain('text-amber-400');
      expect(pBadge.textContent).toBe('120g P');
      expect(pBadge.className).toContain('text-cyan-400');
      expect(cBadge.textContent).toBe('160g C');
      expect(cBadge.className).toContain('text-emerald-400');
      expect(fBadge.textContent).toBe('50g F');
      expect(fBadge.className).toContain('text-violet-400');
      expect(fibBadge.textContent).toBe('20g Fib');
      expect(fibBadge.className).toContain('text-teal-400');
    });
  });

  it('initializes selectedDate to local solar date in evening hours without shifting to UTC tomorrow', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 8, 20, 30, 0));

    try {
      renderComponent();
      await waitFor(() => {
        const dateInput = screen.getByTestId('nutrition-date-input') as HTMLInputElement;
        expect(dateInput.value).toBe('2026-09-08');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('anchors logged meal timestamp to selectedDate and local evening time without manual date alteration', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 8, 20, 30, 0));

    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'dish-evening-1', name: 'Grilled Salmon Bowl', calories: 620, protein: 45, carbs: 50, fat: 20 }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          }),
        }),
      };
    });

    try {
      renderComponent();

      // Verify that without manual date alteration, selectedDate initializes to 2026-09-08 in evening hours
      await waitFor(() => {
        const dateInput = screen.getByTestId('nutrition-date-input') as HTMLInputElement;
        expect(dateInput.value).toBe('2026-09-08');
        expect(screen.getByText('Grilled Salmon Bowl')).toBeDefined();
      });

      const quickLogBtn = screen.getByTitle('1-Tap Log Meal');
      fireEvent.click(quickLogBtn);

      await waitFor(() => {
        expect(mockInsert).toHaveBeenCalled();
      });

      const payload = mockInsert.mock.calls[0][0][0];
      expect(payload.food_name).toBe('Grilled Salmon Bowl');
      expect(payload.logged_at).toBe('2026-09-08T20:30:00Z');
      expect(payload.logged_at.startsWith('2026-09-08')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('anchors logged meal timestamp to user-selected date when backfilling past dates', async () => {
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'dish-evening-2', name: 'Steak & Rice', calories: 750, protein: 55, carbs: 60, fat: 25 }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          }),
        }),
      };
    });

    renderComponent();

    // Select past date 2026-09-05
    const dateInput = screen.getByTestId('nutrition-date-input') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-05' } });
    expect(dateInput.value).toBe('2026-09-05');

    await waitFor(() => {
      expect(screen.getByText('Steak & Rice')).toBeDefined();
    });

    const quickLogBtn = screen.getByTitle('1-Tap Log Meal');
    fireEvent.click(quickLogBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const payload = mockInsert.mock.calls[0][0][0];
    expect(payload.food_name).toBe('Steak & Rice');
    expect(payload.logged_at).toMatch(/^2026-09-05T\d{2}:\d{2}:\d{2}Z$/);
    expect(payload.logged_at.startsWith('2026-09-05')).toBe(true);
  });

  it('renders camera and photo gallery triggers, and attaches a photo preview with size badge', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1tZWFsLXBob3RvLWRhdGE=',
      format: 'jpeg',
    });

    renderComponent();

    const cameraBtn = screen.getByTestId('camera-trigger');
    const galleryBtn = screen.getByTestId('gallery-trigger');
    const analyzeBtn = screen.getByTestId('analyze-meal-button');

    expect(cameraBtn).toBeDefined();
    expect(galleryBtn).toBeDefined();
    expect(analyzeBtn).toBeDisabled();

    // Click camera trigger
    fireEvent.click(cameraBtn);

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview-container')).toBeDefined();
    });

    expect(screen.getByTestId('photo-preview')).toBeDefined();
    expect(screen.getByTestId('photo-size-badge')).toBeDefined();

    // Relaxed guard: Analyze button is enabled because photo is attached, even without text
    expect(analyzeBtn).not.toBeDisabled();

    // 1-tap remove button
    const removeBtn = screen.getByTestId('remove-photo-button');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('photo-preview-container')).toBeNull();
    });

    // Disabled again after photo removed
    expect(analyzeBtn).toBeDisabled();
  });

  it('unwraps HTTP 429 from error.context and renders 15 RPM cooldown warning banner with switch to manual entry button', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 429,
          clone: () => ({
            json: async () => ({
              code: 'RATE_LIMITED',
              retryAfter: 15,
              error: 'Gemini rate limit exceeded (15 RPM). Please wait 15 seconds or switch to manual entry.',
            }),
          }),
          json: async () => ({
            code: 'RATE_LIMITED',
            retryAfter: 15,
            error: 'Gemini rate limit exceeded (15 RPM). Please wait 15 seconds or switch to manual entry.',
          }),
        },
      },
    });

    renderComponent();

    const input = screen.getByPlaceholderText(
      'Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)'
    );
    await userEvent.type(input, 'Chicken Salad');
    fireEvent.click(screen.getByTestId('analyze-meal-button'));

    await waitFor(() => {
      expect(screen.getByTestId('rate-limit-banner')).toBeDefined();
      expect(screen.getByText('Rate Limit Exceeded (15 RPM)')).toBeDefined();
    });

    const switchToManualBtn = screen.getByTestId('switch-to-manual-btn');
    expect(switchToManualBtn).toBeDefined();

    // Clicking switch to manual opens the manual form with dish name populated
    fireEvent.click(switchToManualBtn);

    await waitFor(() => {
      expect(screen.getByTestId('dish-name-input')).toHaveValue('Chicken Salad');
      expect(screen.getByTestId('calories-input')).toBeDefined();
    });
  });

  it('submits multimodal meal photo payload to edge function, displays laser scan loading animation, and retains 48x48 thumbnail on staged meal card', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1waG90by1iYXNlNjQ=',
      format: 'jpeg',
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Grilled Salmon Salad',
        calories: 450,
        protein: 40,
        carbs: 15,
        fat: 25,
        fiber: 6,
        explanation: '300 kcal (Salmon) + 150 kcal (Salad & Dressing) = 450 kcal',
        items: [
          { name: 'Salmon', portion: '1 fillet', calories: 300, protein: 35, carbs: 0, fat: 18, fiber: 0 },
          { name: 'Salad & Dressing', portion: '1 bowl', calories: 150, protein: 5, carbs: 15, fat: 7, fiber: 6 },
        ],
      },
      error: null,
    });

    renderComponent();

    // Attach photo via gallery trigger
    fireEvent.click(screen.getByTestId('gallery-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview')).toBeDefined();
    });

    const analyzeBtn = screen.getByTestId('analyze-meal-button');
    fireEvent.click(analyzeBtn);

    // Verify edge function was invoked with multimodal base64 payload
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'parse-nutrition',
        expect.objectContaining({
          body: expect.objectContaining({
            image_base64: 'dGVzdC1waG90by1iYXNlNjQ=',
            imageMimeType: 'image/jpeg',
          }),
        })
      );
    });

    // Verify staged meal card retains 48x48 thumbnail
    await waitFor(() => {
      expect(screen.getByTestId('staged-meal-card')).toBeDefined();
      expect(screen.getByTestId('staged-meal-photo-thumbnail')).toBeDefined();
    });

    expect(screen.getByTestId('dish-name-input')).toHaveValue('Grilled Salmon Salad');
  });

  it('keeps meal photo pinned at top when switching to manual entry', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1waG90by1waW5uZWQ=',
      format: 'jpeg',
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 429,
          json: async () => ({
            code: 'RATE_LIMITED',
            retryAfter: 15,
            error: 'Gemini rate limit exceeded (15 RPM). Please wait 15 seconds or switch to manual entry.',
          }),
        },
      },
    });

    renderComponent();

    // Attach photo
    fireEvent.click(screen.getByTestId('camera-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview')).toBeDefined();
    });

    // Trigger analysis which returns 429
    fireEvent.click(screen.getByTestId('analyze-meal-button'));

    await waitFor(() => {
      expect(screen.getByTestId('rate-limit-banner')).toBeDefined();
    });

    // Click Switch to Manual Entry
    fireEvent.click(screen.getByTestId('switch-to-manual-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pinned-photo-in-manual')).toBeDefined();
    });

    // Verify no contradictory green success message is displayed
    expect(screen.queryByTestId('status-message')).toBeNull();

    // Verify 1-tap removal of pinned photo in manual form
    const removePinnedBtn = screen.getByTestId('remove-pinned-photo-button');
    fireEvent.click(removePinnedBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('pinned-photo-in-manual')).toBeNull();
    });
  });

  it('pre-populates manual dish name with "Meal Photo" when switching to manual with photo and empty text', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1waG90by1tYW51YWw=',
      format: 'jpeg',
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 429,
          json: async () => ({
            code: 'RATE_LIMITED',
            retryAfter: 15,
            error: 'Gemini rate limit exceeded (15 RPM). Please wait 15 seconds or switch to manual entry.',
          }),
        },
      },
    });

    renderComponent();

    // Attach photo without typing text in nlInput
    fireEvent.click(screen.getByTestId('camera-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('analyze-meal-button'));

    await waitFor(() => {
      expect(screen.getByTestId('switch-to-manual-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('switch-to-manual-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('dish-name-input')).toHaveValue('Meal Photo');
    });
  });

  it('resets selectedPhoto and closes staged state when a meal is logged to database', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1waG90by1sb2dnZWQ=',
      format: 'jpeg',
    });

    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'nutrition_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          }),
        }),
      };
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        name: 'Avocado Toast & Egg',
        calories: 380,
        protein: 14,
        carbs: 30,
        fat: 22,
        fiber: 6,
        explanation: 'Avocado toast with fried egg',
        items: [
          { name: 'Avocado Toast', portion: '1 slice', calories: 290, protein: 8, carbs: 30, fat: 15, fiber: 6 },
          { name: 'Fried Egg', portion: '1 egg', calories: 90, protein: 6, carbs: 0, fat: 7, fiber: 0 },
        ],
      },
      error: null,
    });

    renderComponent();

    // Attach photo
    fireEvent.click(screen.getByTestId('gallery-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview-container')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('analyze-meal-button'));

    await waitFor(() => {
      expect(screen.getByTestId('staged-meal-card')).toBeDefined();
    });

    // Click Log Meal
    fireEvent.click(screen.getByText('Log Meal (+380 kcal)'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    // Verify photo preview is cleared and state reset
    await waitFor(() => {
      expect(screen.queryByTestId('photo-preview-container')).toBeNull();
      expect(screen.queryByTestId('staged-meal-card')).toBeNull();
      expect(screen.getByTestId('analyze-meal-button')).toBeDisabled();
    });
  });

  it('attaches a photo preview when an image is selected via the hidden file input', async () => {
    renderComponent();

    const hiddenFileInput = screen.getByTestId('hidden-file-input') as HTMLInputElement;
    expect(hiddenFileInput).toBeDefined();

    const file = new File(['mock-image-content'], 'meal.jpg', { type: 'image/jpeg' });
    fireEvent.change(hiddenFileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview-container')).toBeDefined();
      expect(screen.getByTestId('photo-preview')).toBeDefined();
    });

    expect(screen.getByTestId('analyze-meal-button')).not.toBeDisabled();
  });

  it('handles user cancellation of camera or gallery picker gracefully without showing an error banner', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockRejectedValue(new Error('User cancelled photos app'));

    renderComponent();

    const cameraBtn = screen.getByTestId('camera-trigger');
    fireEvent.click(cameraBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('status-message')).toBeNull();
      expect(screen.queryByText(/AI service unavailable/i)).toBeNull();
      expect(screen.queryByTestId('photo-preview-container')).toBeNull();
    });
  });

  it('complies with WCAG 2.5.5 touch target size (minimum 44x44px) and touch-manipulation on camera, gallery, remove, and manual buttons', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC10b3VjaC10YXJnZXQ=',
      format: 'jpeg',
    });

    renderComponent();

    const cameraBtn = screen.getByTestId('camera-trigger');
    const galleryBtn = screen.getByTestId('gallery-trigger');
    const manualToggleBtn = screen.getByText('Manual Entry').closest('button');

    expect(cameraBtn.className).toContain('min-h-[44px]');
    expect(cameraBtn.className).toContain('min-w-[44px]');
    expect(cameraBtn.className).toContain('touch-manipulation');

    expect(galleryBtn.className).toContain('min-h-[44px]');
    expect(galleryBtn.className).toContain('min-w-[44px]');
    expect(galleryBtn.className).toContain('touch-manipulation');

    expect(manualToggleBtn?.className).toContain('min-h-[44px]');
    expect(manualToggleBtn?.className).toContain('min-w-[44px]');
    expect(manualToggleBtn?.className).toContain('touch-manipulation');

    // Attach photo to check remove-photo-button
    fireEvent.click(cameraBtn);

    await waitFor(() => {
      expect(screen.getByTestId('remove-photo-button')).toBeDefined();
    });

    const removeBtn = screen.getByTestId('remove-photo-button');
    expect(removeBtn.className).toContain('min-h-[44px]');
    expect(removeBtn.className).toContain('min-w-[44px]');
    expect(removeBtn.className).toContain('touch-manipulation');

    const analyzeBtn = screen.getByTestId('analyze-meal-button');
    expect(analyzeBtn.className).toContain('min-h-[44px]');
    expect(analyzeBtn.className).toContain('min-w-[44px]');
    expect(analyzeBtn.className).toContain('touch-manipulation');
  });

  it('handles Android single "l" cancellation ("User canceled") without error or triggering file input click', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockRejectedValue(new Error('User canceled'));

    renderComponent();

    const hiddenFileInput = screen.getByTestId('hidden-file-input') as HTMLInputElement;
    const fileClickSpy = vi.spyOn(hiddenFileInput, 'click');

    const cameraBtn = screen.getByTestId('camera-trigger');
    fireEvent.click(cameraBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('status-message')).toBeNull();
      expect(screen.queryByText(/AI service unavailable/i)).toBeNull();
      expect(screen.queryByTestId('photo-preview-container')).toBeNull();
      expect(fileClickSpy).not.toHaveBeenCalled();
    });
  });

  it('displays error status when file input receives an unreadable/invalid image rather than attaching broken preview', async () => {
    renderComponent();

    const hiddenFileInput = screen.getByTestId('hidden-file-input') as HTMLInputElement;
    // An empty 0-byte file that resolves to empty base64
    const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' });
    fireEvent.change(hiddenFileInput, { target: { files: [emptyFile] } });

    await waitFor(() => {
      expect(screen.queryByTestId('photo-preview-container')).toBeNull();
      expect(screen.getByTestId('status-message')).toBeDefined();
      expect(screen.getByText(/Could not process selected image/i)).toBeDefined();
    });
  });

  it('unwraps Retry-After directly from error.context.headers when response body is plain text or empty', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 429,
          headers: new Headers({ 'Retry-After': '30' }),
          json: async () => {
            throw new Error('Unexpected token in JSON');
          },
        },
      },
    });

    renderComponent();

    // Attach photo
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1waG90bw==',
      format: 'jpeg',
    });
    fireEvent.click(screen.getByTestId('camera-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('analyze-meal-button'));

    await waitFor(() => {
      expect(screen.getByTestId('rate-limit-banner')).toBeDefined();
    });
  });

  it('unwraps HTTP 400 JSON error from error.context and replaces generic non-2xx status message', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 400,
          clone: () => ({
            json: async () => ({ error: 'Input text or meal photo is required for nutrition parsing.' }),
          }),
        },
      },
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, 'Something');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/Input text or meal photo is required for nutrition parsing/i)).toBeDefined();
    });

    expect(screen.queryByText(/non-2xx/i)).toBeNull();
  });

  it('unwraps HTTP 422 non-food error from error.context and displays descriptive warning banner', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 422,
          clone: () => ({
            json: async () => ({
              error: 'No food detected in input or image. Please provide a meal photo or food description.',
              code: 'NON_FOOD_DETECTED',
            }),
          }),
        },
      },
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, 'My mechanical keyboard');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/No food detected in input or image/i)).toBeDefined();
    });
  });

  it('unwraps HTTP 503 capacity overload from error.context and displays capacity message', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 503,
          clone: () => ({
            json: async () => ({
              error: 'AI model capacity is temporarily exhausted. Please try again in 5 seconds or switch to manual entry.',
              code: 'CAPACITY_EXHAUSTED',
              retryAfter: 5,
            }),
          }),
        },
      },
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, 'Steak and eggs');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/AI model capacity is temporarily exhausted/i)).toBeDefined();
    });
  });

  it('enforces adaptive timeouts of 30s for text-only input', async () => {
    (supabase.functions.invoke as any).mockImplementation(() => new Promise(() => {}));

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, 'Text meal');

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId('analyze-meal-button'));

      // Advance by 29 seconds (should not timeout yet)
      await act(async () => {
        vi.advanceTimersByTime(29000);
      });
      expect(screen.queryByText(/Edge function timeout/i)).toBeNull();

      // Advance past 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText(/Edge function timeout after 30s/i)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces 45s timeout boundary when photo is attached', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1waG90bw==',
      format: 'jpeg',
    });

    (supabase.functions.invoke as any).mockImplementation(() => new Promise(() => {}));

    renderComponent();

    fireEvent.click(screen.getByTestId('camera-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview')).toBeDefined();
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId('analyze-meal-button'));

      // Advance by 35 seconds (past the 30s text timeout, should NOT timeout yet because photo timeout is 45s)
      await act(async () => {
        vi.advanceTimersByTime(35000);
      });
      expect(screen.queryByText(/Edge function timeout/i)).toBeNull();

      // Advance past 45s
      await act(async () => {
        vi.advanceTimersByTime(11000);
      });
      expect(screen.getByText(/Edge function timeout after 45s/i)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves attached photo preview in DOM when edge function analysis fails', async () => {
    const { Camera } = await import('@capacitor/camera');
    (Camera.getPhoto as any).mockResolvedValue({
      base64String: 'dGVzdC1waG90bw==',
      format: 'jpeg',
    });

    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: new Error('Network error'),
    });

    renderComponent();

    fireEvent.click(screen.getByTestId('camera-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('photo-preview')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('analyze-meal-button'));

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeDefined();
    });

    // Photo preview must still be visible and preserved
    expect(screen.getByTestId('photo-preview')).toBeDefined();
  });

  it('displays Retry Analysis button in error banner and succeeds on retry', async () => {
    let callCount = 0;
    (supabase.functions.invoke as any).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: {
              status: 503,
              clone: () => ({
                json: async () => ({ error: 'AI model capacity is temporarily exhausted. Please try again in 5 seconds or switch to manual entry.' }),
              }),
            },
          },
        };
      }
      return {
        data: {
          name: 'Healthy Chicken Salad',
          calories: 350,
          protein: 40,
          carbs: 10,
          fat: 15,
          fiber: 5,
          explanation: 'Chicken and salad',
          items: [{ name: 'Chicken Salad', portion: '1 bowl', calories: 350, protein: 40, carbs: 10, fat: 15, fiber: 5 }],
        },
        error: null,
      };
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, 'Chicken Salad');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByTestId('retry-analysis-button')).toBeDefined();
    });

    // Click retry
    fireEvent.click(screen.getByTestId('retry-analysis-button'));

    await waitFor(() => {
      expect(screen.getByText(/Itemized Breakdown/i)).toBeDefined();
    });

    // Error banner and retry button should be cleared on success
    expect(screen.queryByTestId('retry-analysis-button')).toBeNull();
    expect(callCount).toBe(2);
  });

  it('complies with WCAG 2.5.5 touch target size (min 44x44px) and touch-manipulation on Retry Analysis button', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: new Error('AI failed'),
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, 'Lunch');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByTestId('retry-analysis-button')).toBeDefined();
    });

    const retryBtn = screen.getByTestId('retry-analysis-button');
    expect(retryBtn.className).toContain('min-h-[44px]');
    expect(retryBtn.className).toContain('min-w-[44px]');
    expect(retryBtn.className).toContain('touch-manipulation');
  });

  it('unwraps error from error.context when context is a plain object without .clone()', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 400,
          error: 'Direct context error message without clone',
          code: 'CUSTOM_ERROR',
        },
      },
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, 'Protein shake');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByText(/Direct context error message without clone/i)).toBeDefined();
    });
  });

  it('parses edge function response containing markdown json code fences', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: '```json\n{"name": "Fenced Omelette", "calories": 300, "protein": 24, "carbs": 2, "fat": 20, "fiber": 0, "items": [{"name": "Omelette", "portion": "3 eggs", "calories": 300, "protein": 24, "carbs": 2, "fat": 20, "fiber": 0}]}\n```',
      error: null,
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)');
    await userEvent.type(input, '3 egg omelette');

    fireEvent.click(screen.getByText('Analyze Meal'));

    await waitFor(() => {
      expect(screen.getByTestId('staged-meal-card')).toBeDefined();
      expect(screen.getByTestId('dish-name-input')).toHaveValue('Fenced Omelette');
    });

    expect(screen.getByText(/Itemized Breakdown/i)).toBeDefined();
  });

  it('opens custom dish edit modal when edit pencil button on carousel card is clicked', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'dish-edit-1', name: 'Macro Oats', calories: 350, protein: 30, carbs: 45, fat: 5, fiber: 6, ingredients: '' },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('edit-dish-btn-dish-edit-1')).toBeDefined();
    });

    const editBtn = screen.getByTestId('edit-dish-btn-dish-edit-1');
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText('Edit Custom Dish')).toBeDefined();
      expect(screen.getByDisplayValue('Macro Oats')).toBeDefined();
      expect(screen.getByDisplayValue('350')).toBeDefined();
    });
  });

  it('triggers deleteCustomDishMutation from inline Delete button inside edit modal and closes modal', async () => {
    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'dish-del-1', name: 'Delete Me Dish', calories: 200, protein: 10, carbs: 20, fat: 2, fiber: 1 },
                ],
                error: null,
              }),
            }),
          }),
          delete: mockDelete,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('edit-dish-btn-dish-del-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-dish-btn-dish-del-1'));

    await waitFor(() => {
      expect(screen.getByTestId('modal-delete-dish-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('modal-delete-dish-btn'));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Delete Me Dish'));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText('Edit Custom Dish')).toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it('renders floating Quick-Log Toast widget when 1-tap quick log button is clicked', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'dish-toast-1', name: 'Power Bowl', calories: 550, protein: 40, carbs: 60, fat: 12, fiber: 8 },
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
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
          insert: mockInsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('quick-log-btn-dish-toast-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('quick-log-btn-dish-toast-1'));

    await waitFor(() => {
      expect(screen.getByTestId('quick-log-toast')).toBeDefined();
    });

    const toast = screen.getByTestId('quick-log-toast');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(within(toast).getByText('Power Bowl')).toBeDefined();
    expect(within(toast).getByText('+550 kcal')).toBeDefined();
  });

  it('auto-dismisses floating Quick-Log Toast widget after 2.8s', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'dish-toast-2', name: 'Greek Yogurt Parfait', calories: 280, protein: 22, carbs: 35, fat: 4, fiber: 3 },
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
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('quick-log-btn-dish-toast-2')).toBeDefined();
    });

    vi.useFakeTimers();

    fireEvent.click(screen.getByTestId('quick-log-btn-dish-toast-2'));

    expect(screen.getByTestId('quick-log-toast')).toBeDefined();

    // Advance 2800ms
    await act(async () => {
      vi.advanceTimersByTime(2800);
    });

    expect(screen.queryByTestId('quick-log-toast')).toBeNull();
  });

  it('handles rapid multi-tap on quick-log button by updating toast content and resetting auto-dismiss timer', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'custom_dishes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'dish-a', name: 'Meal A', calories: 400, protein: 30, carbs: 40, fat: 10, fiber: 5 },
                  { id: 'dish-b', name: 'Meal B', calories: 250, protein: 20, carbs: 20, fat: 5, fiber: 2 },
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
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('quick-log-btn-dish-a')).toBeDefined();
      expect(screen.getByTestId('quick-log-btn-dish-b')).toBeDefined();
    });

    vi.useFakeTimers();

    // Click Dish A
    fireEvent.click(screen.getByTestId('quick-log-btn-dish-a'));
    expect(screen.getByTestId('quick-log-toast')).toBeDefined();
    expect(within(screen.getByTestId('quick-log-toast')).getByText('Meal A')).toBeDefined();
    expect(within(screen.getByTestId('quick-log-toast')).getByText('+400 kcal')).toBeDefined();

    // Advance 1500ms
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId('quick-log-toast')).toBeDefined();

    // Click Dish B before 2.8s timer finishes
    fireEvent.click(screen.getByTestId('quick-log-btn-dish-b'));
    expect(within(screen.getByTestId('quick-log-toast')).getByText('Meal B')).toBeDefined();
    expect(within(screen.getByTestId('quick-log-toast')).getByText('+250 kcal')).toBeDefined();

    // Advance 1500ms (total 3000ms from start, but only 1500ms since Dish B tap)
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // Toast must still be visible!
    expect(screen.getByTestId('quick-log-toast')).toBeDefined();

    // Advance remaining 1300ms (reaches 2800ms since Dish B tap)
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    // Toast should now be dismissed
    expect(screen.queryByTestId('quick-log-toast')).toBeNull();
  });
});




import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCustomDishActions } from './useCustomDishActions';
import type { CustomDish, CustomDishDetail } from '../../types/database';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('useCustomDishActions', () => {
  let queryClient: QueryClient;
  let mockUpdateEq: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();

    mockUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
    vi.mocked(supabase.from).mockReturnValue({
      update: mockUpdate,
    } as any);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('stages a single-component dish into a staged meal with calculated macros and updates use_count', async () => {
    const setStagedMeal = vi.fn();
    const setDishFetchError = vi.fn();
    const dish: CustomDish = {
      id: 'dish-single-1',
      user_id: 'user-123',
      name: 'Oatmeal',
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
      fiber: 4,
      kind: 'food',
      use_count: 3,
      notes: 'Steel cut oats',
    };

    const dishDetail: CustomDishDetail = {
      ...dish,
      items: [
        {
          id: 'item-1',
          name: 'Steel Cut Oats',
          quantity: 40,
          unit: 'g',
          displayPortion: '40g',
          calories: 150,
          protein: 5,
          carbs: 27,
          fat: 3,
          fiber: 4,
        },
      ],
    };

    const fetchDishDetail = vi.fn().mockResolvedValue(dishDetail);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useCustomDishActions({
          targetUserId: 'user-123',
          selectedDate: '2026-09-26',
          setStagedMeal,
          setDishFetchError,
          fetchDishDetail,
          mutation: { mutate: vi.fn() },
          triggerToast: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleStageCustomDish(dish);
    });

    expect(setDishFetchError).toHaveBeenCalledWith(null);
    expect(fetchDishDetail).toHaveBeenCalledWith('dish-single-1');
    expect(setStagedMeal).toHaveBeenCalledTimes(1);

    const stagedArg = setStagedMeal.mock.calls[0][0];
    expect(stagedArg.name).toBe('Oatmeal');
    expect(stagedArg.mealType).toBe('Breakfast');
    expect(stagedArg.items).toHaveLength(1);
    expect(stagedArg.items[0].name).toBe('Steel Cut Oats');
    expect(stagedArg.calories).toBe(150);
    expect(stagedArg.protein).toBe(5);
    expect(stagedArg.carbs).toBe(27);
    expect(stagedArg.fat).toBe(3);
    expect(stagedArg.fiber).toBe(4);
    expect(stagedArg.notes).toBe('Steel cut oats');
    expect(stagedArg.servingSize).toBe(1);
    expect(stagedArg.servingUnit).toBe('serving');

    // use_count update
    expect(supabase.from).toHaveBeenCalledWith('custom_dishes');
    expect(mockUpdate).toHaveBeenCalledWith({ use_count: 4 });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'dish-single-1');

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['custom_dishes', 'user-123'] });
    });
  });

  it('stages a multi-component dish preserving all components and total macros', async () => {
    const setStagedMeal = vi.fn();
    const dish: CustomDish = {
      id: 'dish-multi-1',
      user_id: 'user-123',
      name: 'Chicken Rice Bowl',
      calories: 550,
      protein: 45,
      carbs: 60,
      fat: 12,
      fiber: 5,
      kind: 'recipe',
      use_count: 10,
    };

    const dishDetail: CustomDishDetail = {
      ...dish,
      items: [
        {
          id: 'item-chicken',
          name: 'Chicken Breast',
          quantity: 200,
          unit: 'g',
          displayPortion: '200g',
          calories: 330,
          protein: 40,
          carbs: 0,
          fat: 7,
          fiber: 0,
        },
        {
          id: 'item-rice',
          name: 'Jasmine Rice',
          quantity: 150,
          unit: 'g',
          displayPortion: '150g',
          calories: 220,
          protein: 5,
          carbs: 60,
          fat: 5,
          fiber: 5,
        },
      ],
    };

    const fetchDishDetail = vi.fn().mockResolvedValue(dishDetail);

    const { result } = renderHook(
      () =>
        useCustomDishActions({
          targetUserId: 'user-123',
          selectedDate: '2026-09-26',
          setStagedMeal,
          fetchDishDetail,
          mutation: { mutate: vi.fn() },
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleStageCustomDish(dish);
    });

    expect(setStagedMeal).toHaveBeenCalledTimes(1);
    const stagedArg = setStagedMeal.mock.calls[0][0];
    expect(stagedArg.name).toBe('Chicken Rice Bowl');
    expect(stagedArg.items).toHaveLength(2);
    expect(stagedArg.calories).toBe(550);
    expect(stagedArg.protein).toBe(45);
    expect(stagedArg.carbs).toBe(60);
    expect(stagedArg.fat).toBe(12);
    expect(stagedArg.fiber).toBe(5);
    expect(stagedArg.explanation).toBeDefined();

    expect(mockUpdate).toHaveBeenCalledWith({ use_count: 11 });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'dish-multi-1');
  });

  it('stages a synthetic single serving when dish detail has no items or ingredients', async () => {
    const setStagedMeal = vi.fn();
    const dish: CustomDish = {
      id: 'dish-empty-1',
      user_id: 'user-123',
      name: 'Protein Shake',
      calories: 200,
      protein: 30,
      carbs: 5,
      fat: 3,
      fiber: 2,
      kind: 'food',
      use_count: 0,
    };

    const fetchDishDetail = vi.fn().mockResolvedValue({ ...dish, items: null, ingredients: null });

    const { result } = renderHook(
      () =>
        useCustomDishActions({
          targetUserId: 'user-123',
          selectedDate: '2026-09-26',
          setStagedMeal,
          fetchDishDetail,
          mutation: { mutate: vi.fn() },
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleStageCustomDish(dish);
    });

    expect(setStagedMeal).toHaveBeenCalledTimes(1);
    const stagedArg = setStagedMeal.mock.calls[0][0];
    expect(stagedArg.name).toBe('Protein Shake');
    expect(stagedArg.items).toHaveLength(1);
    expect(stagedArg.items[0].name).toBe('Protein Shake');
    expect(stagedArg.items[0].portion).toBe('1 serving');
    expect(stagedArg.calories).toBe(200);
    expect(stagedArg.protein).toBe(30);

    expect(mockUpdate).toHaveBeenCalledWith({ use_count: 1 });
  });

  it('directly quick-logs custom dish when nothing is staged with exact mutation payload, date, use_count and toast', async () => {
    const mutate = vi.fn();
    const triggerToast = vi.fn();
    const dish: CustomDish = {
      id: 'dish-quick-1',
      user_id: 'user-123',
      name: 'Greek Yogurt Cup',
      calories: 130.4,
      protein: 15.2,
      carbs: 8.7,
      fat: 2.1,
      fiber: 0,
      kind: 'food',
      notes: 'Vanilla flavor',
      use_count: 7,
    };

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useCustomDishActions({
          targetUserId: 'user-123',
          selectedDate: '2026-09-26',
          setStagedMeal: vi.fn(),
          mutation: { mutate },
          triggerToast,
        }),
      { wrapper }
    );

    const stopPropagation = vi.fn();
    const mockEvent = { stopPropagation } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleQuickLogCustomDishDirect(dish, mockEvent);
    });

    expect(stopPropagation).toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      food_name: 'Greek Yogurt Cup',
      calories: 130.4,
      protein: 15.2,
      carbs: 8.7,
      fat: 2.1,
      fiber: 0,
      meal_type: 'Breakfast',
      serving_size: 1,
      serving_unit: 'serving',
      logged_at: expect.stringMatching(/^2026-09-26T/),
      logged_date: '2026-09-26',
      notes: 'Vanilla flavor',
    });

    expect(supabase.from).toHaveBeenCalledWith('custom_dishes');
    expect(mockUpdate).toHaveBeenCalledWith({ use_count: 8 });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'dish-quick-1');

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['custom_dishes', 'user-123'] });
    });

    expect(triggerToast).toHaveBeenCalledWith(dish);
  });

  it('sets dish fetch error with retry callback when detail fetching fails and clears error on next attempt', async () => {
    const setDishFetchError = vi.fn();
    const setStagedMeal = vi.fn();
    const dish: CustomDish = {
      id: 'dish-fail-1',
      user_id: 'user-123',
      name: 'Failing Dish',
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 2,
      fiber: 1,
      kind: 'food',
      use_count: 0,
    };

    const fetchDishDetail = vi.fn().mockRejectedValueOnce(new Error('Network error loading details'));

    const { result } = renderHook(
      () =>
        useCustomDishActions({
          targetUserId: 'user-123',
          selectedDate: '2026-09-26',
          setStagedMeal,
          setDishFetchError,
          fetchDishDetail,
          mutation: { mutate: vi.fn() },
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleStageCustomDish(dish);
    });

    expect(setDishFetchError).toHaveBeenNthCalledWith(1, null);
    expect(setDishFetchError).toHaveBeenNthCalledWith(2, {
      message: 'Network error loading details',
      retry: expect.any(Function),
    });
    expect(setStagedMeal).not.toHaveBeenCalled();

    // Now retry after successful fetch
    fetchDishDetail.mockResolvedValueOnce(null);
    const retryFn = setDishFetchError.mock.calls[1][0].retry;

    await act(async () => {
      retryFn();
    });

    expect(fetchDishDetail).toHaveBeenCalledTimes(2);
    expect(setStagedMeal).toHaveBeenCalledTimes(1);
  });
});

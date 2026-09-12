import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from './lib/supabase';
import { restTimerStore } from './utils/restTimerStore';

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'test-user-id', email: 'coach@cybergym.io' },
  },
}));

vi.mock('./lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

describe('App Shell & Navigation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'test-user-id' } } });
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'test-user-id',
            email: 'coach@cybergym.io',
            username: 'Coach Duy',
            role: 'coach',
            target_calories: 2400,
            target_protein: 180,
            target_carbs: 240,
            target_fat: 70,
            target_fiber: 30,
          },
          error: null,
        }),
      }),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      or: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    (supabase.from as any).mockImplementation(() => ({
      select: mockSelect,
    }));

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('renders top Header and bottom navigation tabs', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    // Wait for auth initialization and header render
    await waitFor(() => {
      expect(screen.getByText('CyberGym')).toBeDefined();
      expect(screen.getByText('Fitness & Nutrition')).toBeDefined();
      expect(screen.getByTestId('nav-workout')).toBeDefined();
      expect(screen.getByTestId('nav-nutrition')).toBeDefined();
      expect(screen.getByTestId('nav-history')).toBeDefined();
    });
  });

  it('navigates to Nutrition tab when bottom nav item is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('nav-nutrition')).toBeDefined();
    });

    const nutritionTab = screen.getByTestId('nav-nutrition');
    fireEvent.click(nutritionTab);

    await waitFor(() => {
      expect(screen.getByText("Today's Nutrition")).toBeDefined();
    });
  });

  it('redirects to /login when session expires (SIGNED_OUT event)', async () => {
    let authCallback: any = null;
    (supabase.auth.onAuthStateChange as any).mockImplementation((cb: any) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('CyberGym')).toBeDefined();
    });

    // Trigger SIGNED_OUT
    if (authCallback) {
      act(() => {
        authCallback('SIGNED_OUT', null);
      });
    }

    await waitFor(() => {
      expect(screen.getAllByText('Sign In').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByPlaceholderText('athlete@cybergym.io')).toBeDefined();
    });
  });

  it('persists global rest timer pill across /workout, /nutrition, and /history navigation', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('CyberGym')).toBeDefined();
    });

    // Start timer globally
    act(() => {
      restTimerStore.start(90);
    });

    // Pill is visible on /workout
    await waitFor(() => {
      expect(screen.getByTestId('rest-timer-pill')).toBeDefined();
      expect(screen.getByTestId('rest-timer-display').textContent).toBe('1:30');
    });

    // Navigate to /nutrition
    const nutritionTab = screen.getByTestId('nav-nutrition');
    fireEvent.click(nutritionTab);

    await waitFor(() => {
      expect(screen.getByText("Today's Nutrition")).toBeDefined();
      expect(screen.getByTestId('rest-timer-pill')).toBeDefined();
      expect(screen.getByTestId('rest-timer-display')).toBeDefined();
    });

    // Navigate to /history
    const historyTab = screen.getByTestId('nav-history');
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByTestId('history-tab-workouts')).toBeDefined();
      expect(screen.getByTestId('rest-timer-pill')).toBeDefined();
      expect(screen.getByTestId('rest-timer-display')).toBeDefined();
    });
  });

  it('renders Cyberpunk pulse spinner and retry button in ProtectedRoute when loading exceeds 2s', async () => {
    vi.useFakeTimers();
    (supabase.auth.getSession as any).mockImplementation(() => new Promise(() => {}));
    localStorage.clear();

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    expect(screen.getByText('Connecting to CyberGym...')).toBeDefined();
    expect(screen.queryByTestId('auth-retry-button')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId('auth-retry-button')).toBeDefined();
    expect(screen.getByText('Connecting to CyberGym... Tap to Retry')).toBeDefined();
    vi.useRealTimers();
  });
});


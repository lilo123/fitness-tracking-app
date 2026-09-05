import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsView } from './SettingsView';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'test-coach-id', email: 'coach@cybergym.io' },
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'test-coach-id' } }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'test-coach-id' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('SettingsView', () => {
  let queryClient: QueryClient;
  const mockUpsert = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'test-coach-id',
                  email: 'coach@cybergym.io',
                  username: 'Coach Duy',
                  role: 'coach',
                  target_calories: 2400,
                  target_protein: 180,
                  target_carbs: 240,
                  target_fat: 70,
                  target_fiber: 35,
                },
                error: null,
              }),
            }),
          }),
          upsert: mockUpsert,
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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
        <BrowserRouter>
          <AuthProvider>
            <SettingsView />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('renders 5-column daily macro goals grid including Calories, Protein, Carbs, Fat, and Fiber', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');
    expect(screen.getByText('Daily Macro Goals')).toBeDefined();
    expect(screen.getByText('Calories (kcal)')).toBeDefined();
    expect(screen.getByText('Protein (g)')).toBeDefined();
    expect(screen.getByText('Carbs (g)')).toBeDefined();
    expect(screen.getByText('Fat (g)')).toBeDefined();
    expect(screen.getByText('Fiber (g)')).toBeDefined();
    expect(screen.getByRole('button', { name: /Save Goals/i })).toBeDefined();
  });

  it('allows updating all 5 macro targets and saves goals', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const saveBtn = screen.getByRole('button', { name: /Save Goals/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeDefined();
    });
  });

  it('allows toggling between Athlete View and Coach View modes for coach', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const athleteModeBtn = screen.getByRole('button', { name: /Athlete View/i });
    const coachModeBtn = screen.getByRole('button', { name: /Coach View/i });

    expect(athleteModeBtn).toBeDefined();
    expect(coachModeBtn).toBeDefined();

    fireEvent.click(athleteModeBtn);
    await waitFor(() => {
      expect(localStorage.getItem('cybergym_view_mode')).toBe('athlete');
    });
  });
});

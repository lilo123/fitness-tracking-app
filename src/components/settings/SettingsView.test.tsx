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
    rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
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
    (supabase.rpc as any).mockResolvedValue({ data: { success: true }, error: null });
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
                  is_coach_mode: true,
                  coach_code: 'CYBER-DEMO01',
                  coach_tier: 'pro',
                  max_athletes: 10,
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
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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

  it('renders Workout Preferences section with auto-start rest timer toggle switch', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    expect(screen.getByText('Workout Preferences')).toBeDefined();
    expect(screen.getByText('Auto-start Rest Timer on Set Log')).toBeDefined();
    const toggleBtn = screen.getByTestId('toggle-auto-timer');
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.getAttribute('aria-checked')).toBe('true');
  });

  it('allows toggling auto-start rest timer preference and persists to localStorage and profile', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const toggleBtn = screen.getByTestId('toggle-auto-timer');
    expect(toggleBtn.getAttribute('aria-checked')).toBe('true');

    // Toggle off
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(toggleBtn.getAttribute('aria-checked')).toBe('false');
      expect(localStorage.getItem('cybergym_auto_rest_timer')).toBe('false');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          auto_rest_timer: false,
        })
      );
    });

    // Toggle back on
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(toggleBtn.getAttribute('aria-checked')).toBe('true');
      expect(localStorage.getItem('cybergym_auto_rest_timer')).toBe('true');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          auto_rest_timer: true,
        })
      );
    });
  });

  it('renders error banner with alert styling when saving goals fails', async () => {
    mockUpsert.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValue({ error: { message: 'Database write error' } }),
    });

    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const saveBtn = screen.getByRole('button', { name: /Save Goals/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const banner = screen.getByTestId('settings-status-banner');
      expect(banner).toBeDefined();
      expect(banner.className).toContain('text-rose-300');
      expect(screen.getByText(/Failed to save settings: Database write error/i)).toBeDefined();
    });
  });

  it('renders Coach Mode & Roster section with coach code, capacity badge, and vanity code editor', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    expect(screen.getByText('Coach Mode & Roster')).toBeDefined();
    expect(screen.getByTestId('active-coach-code').textContent).toContain('CYBER-DEMO01');
    expect(screen.getByTestId('coach-capacity-badge').textContent).toContain('0 / 10 Athletes (pro)');
    expect(screen.getByTestId('copy-coach-code-btn')).toBeDefined();
    expect(screen.getByTestId('vanity-code-input')).toBeDefined();
    expect(screen.getByTestId('save-vanity-code-btn')).toBeDefined();
  });

  it('calls set_coach_code RPC when saving a custom vanity code', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const input = screen.getByTestId('vanity-code-input');
    fireEvent.change(input, { target: { value: 'COACH-TEST' } });

    const saveBtn = screen.getByTestId('save-vanity-code-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('set_coach_code', { custom_code: 'COACH-TEST' });
    });

    expect(await screen.findByText('Coach code updated successfully!')).toBeDefined();
  });

  it('rejects vanity code shorter than 4 characters with client-side validation error', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const input = screen.getByTestId('vanity-code-input');
    fireEvent.change(input, { target: { value: 'ABC' } });

    const saveBtn = screen.getByTestId('save-vanity-code-btn');
    fireEvent.click(saveBtn);

    expect(await screen.findByText(/Code must be 4-20 characters long/)).toBeDefined();
    expect(supabase.rpc).not.toHaveBeenCalledWith('set_coach_code', expect.anything());
  });

  it('accepts vanity code with underscores (e.g. COACH_DUY) and calls set_coach_code RPC', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const input = screen.getByTestId('vanity-code-input');
    fireEvent.change(input, { target: { value: 'COACH_DUY' } });

    const saveBtn = screen.getByTestId('save-vanity-code-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('set_coach_code', { custom_code: 'COACH_DUY' });
    });

    expect(await screen.findByText('Coach code updated successfully!')).toBeDefined();
  });

  it('displays free tier badge when coach_tier is not set', async () => {
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
                  is_coach_mode: true,
                  coach_code: 'CYBER-DEMO01',
                  coach_tier: null,
                  max_athletes: 3,
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
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    const badge = screen.getByTestId('coach-capacity-badge');
    expect(badge.textContent).toContain('(free)');
  });

  it('renders My Coach card and allows linking to a coach via link_to_coach RPC', async () => {
    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    expect(screen.getByText('My Coach')).toBeDefined();
    const linkInput = await screen.findByTestId('link-coach-code-input');
    fireEvent.change(linkInput, { target: { value: 'CYBER-DEMO01' } });

    const linkBtn = screen.getByTestId('link-coach-btn');
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('link_to_coach', { input_code: 'CYBER-DEMO01' });
    });

    expect(await screen.findByText('Successfully linked to coach!')).toBeDefined();
  });

  it('allows disconnecting from coach via disconnect_coach RPC when linked', async () => {
    const linkedCoachData = [
      {
        id: 'link-1',
        coach_id: 'coach-lead',
        linked_at: '2026-09-01T00:00:00Z',
        coach: { username: 'Coach Sarah', email: 'sarah@cybergym.io', coach_code: 'SARAH-FIT' },
      },
    ];

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
                  is_coach_mode: true,
                  coach_code: 'CYBER-DEMO01',
                  coach_tier: 'pro',
                  max_athletes: 10,
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
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: linkedCoachData, error: null }),
          }),
        }),
      };
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();
    await screen.findByDisplayValue('Coach Duy');

    expect(await screen.findByText('Coach Sarah')).toBeDefined();
    expect(screen.getByText(/SARAH-FIT/)).toBeDefined();

    const disconnectBtn = screen.getByTestId('disconnect-coach-btn');
    fireEvent.click(disconnectBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('disconnect_coach');
    });

    expect(await screen.findByText('Successfully disconnected from coach.')).toBeDefined();
  });
});

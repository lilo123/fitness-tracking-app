import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoachCockpit } from './CoachCockpit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { supabase } from '../../lib/supabase';

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'coach-id', email: 'coach@cybergym.io' },
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-id' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('CoachCockpit', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'coach-id' } } });
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'ath-1', username: 'Alex Johnson', email: 'alex@example.com', role: 'athlete' }],
          error: null,
        }),
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'ath-1', username: 'Alex Johnson', email: 'alex@example.com', role: 'athlete' }],
          error: null,
        }),
        single: vi.fn().mockResolvedValue({
          data: { id: 'coach-id', email: 'coach@cybergym.io', username: 'Coach Duy', role: 'coach' },
          error: null,
        }),
      }),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'ex-1', name: 'Leg Extension Machine', body_part: 'Legs', is_master: true },
          { id: 'ex-2', name: 'Incline Bench Press', body_part: 'Chest', is_master: true },
        ],
        error: null,
      }),
    });

    (supabase.from as any).mockImplementation(() => ({
      select: mockSelect,
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'tpl-1' }, error: null }),
        }),
      }),
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
            <CoachCockpit />
          </CoachProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

  it('renders Coach Dashboard and Athlete Switcher correctly', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Coach Dashboard')).toBeDefined();
    });
    expect(screen.getByText('Workout Template Builder')).toBeDefined();
  });

  it('allows adding exercises and customizing target sets and reps in template builder', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'tpl-1' }, error: null }),
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates' || table === 'template_exercises') {
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'ex-1', name: 'Leg Extension Machine', body_part: 'Legs', is_master: true },
                  { id: 'ex-2', name: 'Incline Bench Press', body_part: 'Chest', is_master: true },
                ],
                error: null,
              }),
            }),
            order: vi.fn().mockResolvedValue({
              data: [
                { id: 'ex-1', name: 'Leg Extension Machine', body_part: 'Legs', is_master: true },
                { id: 'ex-2', name: 'Incline Bench Press', body_part: 'Chest', is_master: true },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'ath-1', username: 'Alex Johnson', email: 'alex@example.com', role: 'athlete' }],
              error: null,
            }),
            order: vi.fn().mockResolvedValue({
              data: [{ id: 'ath-1', username: 'Alex Johnson', email: 'alex@example.com', role: 'athlete' }],
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: { id: 'coach-id', email: 'coach@cybergym.io', username: 'Coach Duy', role: 'coach' },
              error: null,
            }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    renderComponent();

    // Wait for coach session and athlete to load
    await screen.findByText('Workout Template Builder');

    const nameInput = screen.getByPlaceholderText('e.g. Hypertrophy Upper Body A');
    fireEvent.change(nameInput, { target: { value: 'Hypertrophy Legs' } });

    // Pick an exercise to add
    const addSelect = await screen.findByTestId('template-exercise-select');
    fireEvent.change(addSelect, { target: { value: 'Leg Extension Machine' } });

    const addBtn = screen.getByTestId('add-template-exercise-btn');
    fireEvent.click(addBtn);

    // Verify exercise row was added
    expect(await screen.findByText('Leg Extension Machine')).toBeDefined();

    // Customize target sets and reps
    const targetSetsInput = screen.getByTestId('template-target-sets-0');
    const targetRepsInput = screen.getByTestId('template-target-reps-0');
    fireEvent.change(targetSetsInput, { target: { value: '4' } });
    fireEvent.change(targetRepsInput, { target: { value: '15' } });

    const saveBtn = screen.getByTestId('save-template-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });
  });
});

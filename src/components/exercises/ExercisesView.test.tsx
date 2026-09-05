import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExercisesView } from './ExercisesView';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { supabase } from '../../lib/supabase';

const { mockAthleteSession } = vi.hoisted(() => ({
  mockAthleteSession: {
    user: { id: 'athlete-123', email: 'athlete@example.com' },
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'athlete-123' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: mockAthleteSession } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('ExercisesView - Exercise Isolation & Schedule Days', () => {
  let queryClient: QueryClient;
  const mockInsertExercise = vi.fn().mockResolvedValue({ error: null });
  const mockInsertTemplate = vi.fn();
  const mockUpdateExercise = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    const sampleExercises = [
      { id: 'ex-master-1', name: 'Barbell Squat', body_part: 'Legs', is_master: true, user_id: null, is_archived: false },
      { id: 'ex-custom-1', name: 'My Athlete Curl', body_part: 'Arms', is_master: false, user_id: 'athlete-123', is_archived: false },
    ];

    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockAthleteSession } });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: sampleExercises, error: null }),
              }),
              order: vi.fn().mockResolvedValue({ data: sampleExercises, error: null }),
            }),
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: sampleExercises, error: null }),
            }),
          }),
          insert: mockInsertExercise,
          update: mockUpdateExercise,
        };
      }
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tpl-1',
                    user_id: 'athlete-123',
                    name: 'Leg Blast',
                    is_master: false,
                    days_of_week: ['Mon', 'Thu'],
                    exercises: [{ id: 'te-1', exercise_id: 'ex-master-1' }],
                  },
                ],
                error: null,
              }),
            }),
          }),
          insert: mockInsertTemplate.mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'new-tpl-id', name: 'Push Routine', days_of_week: ['Mon', 'Wed'] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'template_exercises') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'athlete-123', role: 'athlete', username: 'TestAthlete' },
                error: null,
              }),
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
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
            <CoachProvider>
              <ExercisesView />
            </CoachProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('renders exercise library with Master badges and isolates delete permission', async () => {
    renderComponent();

    // Both master exercise and custom exercise should appear in library
    expect(await screen.findByText('Barbell Squat')).toBeDefined();
    expect(screen.getByText('Master')).toBeDefined();
    expect(screen.getByText('My Athlete Curl')).toBeDefined();

    // Verify delete button: athlete has 1 custom exercise, so only 1 delete button should be rendered
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete');
      expect(deleteButtons.length).toBe(1);
    });
  });

  it('creates custom exercise scoped to the athlete', async () => {
    renderComponent();

    const nameInput = await screen.findByPlaceholderText('e.g. Incline Bench Press');
    fireEvent.change(nameInput, { target: { value: 'Dumbbell Hammer Curl' } });

    const armsBtn = screen.getByRole('button', { name: 'Arms' });
    fireEvent.click(armsBtn);

    const saveBtn = screen.getByRole('button', { name: 'Save to Library' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockInsertExercise).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Dumbbell Hammer Curl',
          body_part: 'Arms',
          is_master: false,
          is_archived: false,
          user_id: 'athlete-123',
        }),
      ]);
    });
  });

  it('renders saved routine templates with scheduled days of week badges', async () => {
    renderComponent();

    // Switch to Templates tab
    const templatesTab = screen.getByRole('button', { name: /Templates/i });
    fireEvent.click(templatesTab);

    // Verify saved template and day badges
    expect(await screen.findByText('Leg Blast')).toBeDefined();
    expect(screen.getAllByText('Mon').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Thu').length).toBeGreaterThanOrEqual(2);
  });
});

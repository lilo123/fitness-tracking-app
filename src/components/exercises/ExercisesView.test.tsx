import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ExercisesView } from './ExercisesView';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';
import { supabase } from '../../lib/supabase';
import { workoutSessionStore } from '../../utils/workoutSessionStore';

const { mockAthleteSession, mockCoachState } = vi.hoisted(() => ({
  mockAthleteSession: {
    user: { id: 'athlete-123', email: 'athlete@example.com' },
  },
  mockCoachState: {
    isCoach: false,
    selectedAthleteId: 'athlete-123',
  },
}));

vi.mock('../../hooks/useCoach', () => ({
  useCoach: () => mockCoachState,
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
    rpc: vi.fn(),
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
  const mockUpdateTemplate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const mockDeleteTemplate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const mockRpc = vi.fn().mockResolvedValue({ error: null });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    workoutSessionStore.resetForTesting();
    mockCoachState.isCoach = false;
    mockCoachState.selectedAthleteId = 'athlete-123';
    (supabase.rpc as any) = mockRpc;

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
        const templatesData = [
          {
            id: 'tpl-1',
            user_id: 'athlete-123',
            name: 'Leg Blast',
            is_master: false,
            days_of_week: ['Mon', 'Thu'],
            exercises: [{ id: 'te-1', exercise_id: 'ex-master-1' }],
          },
        ];
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: templatesData,
                error: null,
              }),
            }),
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: templatesData,
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
          update: mockUpdateTemplate,
          delete: mockDeleteTemplate,
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

  it('opens EditTemplateModal when Edit button is clicked on user template, edits details, and saves', async () => {
    renderComponent();

    const templatesTab = screen.getByRole('button', { name: /Templates/i });
    fireEvent.click(templatesTab);

    expect(await screen.findByText('Leg Blast')).toBeDefined();

    const editBtn = screen.getByTestId('edit-template-tpl-1');
    expect(editBtn).toBeDefined();
    fireEvent.click(editBtn);

    // Modal opens prefilled
    expect(screen.getByTestId('edit-template-modal')).toBeDefined();
    const nameInput = screen.getByTestId('template-name-input');
    expect(nameInput).toHaveValue('Leg Blast');

    // Modify name
    fireEvent.change(nameInput, { target: { value: 'Leg Blast Ultra' } });

    // Toggle Wednesday day pill
    const wedPill = screen.getByTestId('day-pill-Wed');
    fireEvent.click(wedPill);

    // Update target sets using touch stepper inc button
    const incSetsBtn = screen.getByTestId('inc-sets-0');
    fireEvent.click(incSetsBtn);
    const setsInput = screen.getByTestId('sets-input-0');
    expect(setsInput).toHaveValue(4);

    // Save template
    const saveBtn = screen.getByTestId('save-template-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('save_routine_template', {
        p_template_id: 'tpl-1',
        p_name: 'Leg Blast Ultra',
        p_days_of_week: ['Mon', 'Thu', 'Wed'],
        p_exercises: [
          expect.objectContaining({
            exercise_id: 'ex-master-1',
            target_sets: 4,
          }),
        ],
        p_user_id: 'athlete-123',
      });
      expect(screen.queryByTestId('edit-template-modal')).toBeNull();
    });
  });

  it('renders Duplicate & Customize button for master routines and allows forking into a personal template', async () => {
    // Add master template to mock
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tpl-master-1',
                    user_id: 'coach-999',
                    name: 'Master Hypertrophy Push',
                    is_master: true,
                    days_of_week: ['Tue', 'Fri'],
                    exercises: [{ id: 'te-m1', exercise_id: 'ex-master-1', target_sets: 4, target_reps: 8 }],
                  },
                ],
                error: null,
              }),
            }),
          }),
          insert: mockInsertTemplate,
        };
      }
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'ex-master-1', name: 'Barbell Squat', body_part: 'Legs' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'athlete-123' }, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const templatesTab = screen.getByRole('button', { name: /Templates/i });
    fireEvent.click(templatesTab);

    expect(await screen.findByText('Master Hypertrophy Push')).toBeDefined();
    expect(screen.getByText('Master')).toBeDefined();

    // Verify Fork button is rendered
    const forkBtn = screen.getByTestId('fork-template-tpl-master-1');
    expect(forkBtn).toBeDefined();

    // Click fork
    fireEvent.click(forkBtn);

    // Modal opens with copy title and prefilled clean name without (Copy)
    expect(screen.getByTestId('edit-template-modal')).toBeDefined();
    expect(screen.getByText('Duplicate & Customize Template')).toBeDefined();
    const nameInput = screen.getByTestId('template-name-input');
    expect(nameInput).toHaveValue('Master Hypertrophy Push');

    // Save forked template
    const saveBtn = screen.getByTestId('save-template-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('save_routine_template', {
        p_template_id: null, // Null template id means insert a new routine
        p_name: 'Master Hypertrophy Push',
        p_days_of_week: ['Tue', 'Fri'],
        p_exercises: [
          expect.objectContaining({
            exercise_id: 'ex-master-1',
            target_sets: 4,
            target_reps: 8,
          }),
        ],
        p_user_id: 'athlete-123',
      });
    });
  });

  it('performs transactional rollback deleting newly created template if exercise insertion fails during fork', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'Function not found' } });

    const mockDeleteTplEq = vi.fn().mockResolvedValue({ error: null });
    const mockDeleteTpl = vi.fn().mockReturnValue({ eq: mockDeleteTplEq });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tpl-master-err',
                    user_id: 'coach-999',
                    name: 'Master Routine',
                    is_master: true,
                    days_of_week: ['Mon'],
                    exercises: [{ id: 'te-1', exercise_id: 'ex-master-1', target_sets: 3, target_reps: 10 }],
                  },
                ],
                error: null,
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'tpl-new-failed-fork', name: 'Master Routine (Copy)' },
                error: null,
              }),
            }),
          }),
          delete: mockDeleteTpl,
        };
      }
      if (table === 'template_exercises') {
        return {
          insert: vi.fn().mockResolvedValue({ error: { message: 'Network insertion timeout' } }),
        };
      }
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'ex-master-1', name: 'Barbell Squat', body_part: 'Legs' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'athlete-123' }, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const templatesTab = screen.getByRole('button', { name: /Templates/i });
    fireEvent.click(templatesTab);

    const forkBtn = await screen.findByTestId('fork-template-tpl-master-err');
    fireEvent.click(forkBtn);

    const saveBtn = screen.getByTestId('save-template-btn');
    fireEvent.click(saveBtn);

    // Should display error banner and execute rollback deletion of orphaned template
    await waitFor(() => {
      expect(screen.getByTestId('template-error')).toBeDefined();
      expect(mockDeleteTpl).toHaveBeenCalled();
      expect(mockDeleteTplEq).toHaveBeenCalledWith('id', 'tpl-new-failed-fork');
    });
  });

  it('updates exercise in library and synchronizes active workout session drafts via renameExercise', async () => {
    // Initialize active session in workoutSessionStore with old exercise name
    workoutSessionStore.getOrInitSession('athlete-123', '2026-09-08', {
      routineName: 'Arm Day',
      exercises: ['My Athlete Curl'],
      targetSetCounts: { 'My Athlete Curl': 3 },
      targetRepCounts: { 'My Athlete Curl': 10 },
    });
    workoutSessionStore.setDraftInput('athlete-123', '2026-09-08', 'My Athlete Curl', 0, { weight: '35', reps: '10' });
    workoutSessionStore.flushPendingWrites();

    renderComponent();

    // Verify custom exercise is rendered in library with Edit button
    expect(await screen.findByText('My Athlete Curl')).toBeDefined();
    const editBtn = screen.getByTestId('edit-exercise-ex-custom-1');
    expect(editBtn).toBeDefined();

    // Click edit button
    fireEvent.click(editBtn);

    // Modal opens with existing name
    expect(screen.getByTestId('edit-exercise-modal')).toBeDefined();
    const nameInput = screen.getByTestId('edit-exercise-name-input');
    expect(nameInput).toHaveValue('My Athlete Curl');

    // Update name to 'Bicep Cable Curl'
    fireEvent.change(nameInput, { target: { value: 'Bicep Cable Curl' } });

    // Toggle Core muscle chip in modal
    const modal = screen.getByTestId('edit-exercise-modal');
    const coreChip = within(modal).getByRole('button', { name: /^Core$/i });
    fireEvent.click(coreChip);

    // Save changes
    const saveBtn = screen.getByTestId('save-exercise-btn');
    fireEvent.click(saveBtn);

    // Verify Supabase update call
    await waitFor(() => {
      expect(mockUpdateExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bicep Cable Curl',
          body_part: expect.stringContaining('Arms'),
        })
      );
    });

    // Verify active workout session was synchronized via workoutSessionStore.renameExercise
    const session = workoutSessionStore.getSession('athlete-123', '2026-09-08');
    expect(session?.exercises).toEqual(['Bicep Cable Curl']);
    expect(session?.targetSetCounts['Bicep Cable Curl']).toBe(3);
    expect(session?.targetSetCounts['My Athlete Curl']).toBeUndefined();
    expect(session?.inputDrafts['Bicep Cable Curl_0']).toEqual({ weight: '35', reps: '10' });
    expect(session?.inputDrafts['My Athlete Curl_0']).toBeUndefined();

    // Modal is closed
    await waitFor(() => {
      expect(screen.queryByTestId('edit-exercise-modal')).toBeNull();
    });
  });

  it('enforces comprehensive permission matrix: coach edits master (with warning banner) vs athlete fork vs coach impersonation', async () => {
    const masterTpl = {
      id: 'tpl-master-matrix',
      user_id: 'coach-999',
      name: 'Master Power Clean',
      is_master: true,
      days_of_week: ['Tue', 'Thu'],
      exercises: [{ id: 'te-m1', exercise_id: 'ex-master-1', target_sets: 4, target_reps: 6 }],
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [masterTpl],
                error: null,
              }),
            }),
          }),
          update: mockUpdateTemplate,
          delete: mockDeleteTemplate,
        };
      }
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'ex-master-1', name: 'Barbell Squat', body_part: 'Legs' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'athlete-123' }, error: null }),
          }),
        }),
      };
    });

    // 1. Scenario A: Coach in Catalog Mode (isCoach = true, selectedAthleteId = '')
    mockCoachState.isCoach = true;
    mockCoachState.selectedAthleteId = '';

    const { unmount: unmountA } = renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }));

    expect(await screen.findByText('Master Power Clean')).toBeDefined();
    // Coach can edit master directly
    const coachEditBtn = screen.getByTestId('edit-template-tpl-master-matrix');
    expect(coachEditBtn).toBeDefined();
    // Coach does NOT see duplicate Fork button in catalog mode
    expect(screen.queryByTestId('fork-template-tpl-master-matrix')).toBeNull();

    // Click Edit button: opens modal showing safety warning banner
    fireEvent.click(coachEditBtn);
    expect(screen.getByTestId('edit-template-modal')).toBeDefined();
    expect(screen.getByText(/Editing Master Routine — changes will apply to all athletes/i)).toBeDefined();

    // Close modal and unmount
    fireEvent.click(screen.getByTestId('cancel-template-btn'));
    unmountA();

    // 2. Scenario B: Coach Impersonating an Athlete (isCoach = true, selectedAthleteId = 'athlete-123')
    mockCoachState.isCoach = true;
    mockCoachState.selectedAthleteId = 'athlete-123';

    const { unmount: unmountB } = renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }));

    expect(await screen.findByText('Master Power Clean')).toBeDefined();
    // Coach cannot directly edit master while impersonating an athlete
    expect(screen.queryByTestId('edit-template-tpl-master-matrix')).toBeNull();
    // Coach CAN customize/fork master for this specific athlete
    expect(screen.getByTestId('fork-template-tpl-master-matrix')).toBeDefined();
    unmountB();

    // 3. Scenario C: Athlete Mode (isCoach = false, selectedAthleteId = '')
    mockCoachState.isCoach = false;
    mockCoachState.selectedAthleteId = '';

    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }));

    expect(await screen.findByText('Master Power Clean')).toBeDefined();
    // Athlete cannot edit master
    expect(screen.queryByTestId('edit-template-tpl-master-matrix')).toBeNull();
    // Athlete CAN customize/fork master
    const athleteForkBtn = screen.getByTestId('fork-template-tpl-master-matrix');
    expect(athleteForkBtn).toBeDefined();

    // Opening fork modal does NOT display the coach master warning banner
    fireEvent.click(athleteForkBtn);
    expect(screen.getByTestId('edit-template-modal')).toBeDefined();
    expect(screen.queryByText(/Editing Master Routine — changes will apply to all athletes/i)).toBeNull();
  });

  it('provides list-first template layout with day filter toolbar and + New Routine create mode trigger', async () => {
    const mondayTemplate = {
      id: 'tpl-mon',
      user_id: 'athlete-123',
      name: 'Monday Heavy Push',
      is_master: false,
      days_of_week: ['Mon'],
      exercises: [{ id: 'te-1', exercise_id: 'ex-master-1', target_sets: 3, target_reps: 10 }],
    };

    const fridayTemplate = {
      id: 'tpl-fri',
      user_id: 'athlete-123',
      name: 'Friday Heavy Pull',
      is_master: false,
      days_of_week: ['Fri'],
      exercises: [{ id: 'te-2', exercise_id: 'ex-custom-1', target_sets: 4, target_reps: 8 }],
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'routine_templates') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [mondayTemplate, fridayTemplate],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'exercises') {
        const sampleEx = [
          { id: 'ex-master-1', name: 'Barbell Squat', body_part: 'Legs' },
          { id: 'ex-custom-1', name: 'My Athlete Curl', body_part: 'Arms' },
        ];
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: sampleEx, error: null }),
              }),
              order: vi.fn().mockResolvedValue({ data: sampleEx, error: null }),
            }),
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: sampleEx, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'athlete-123' }, error: null }),
          }),
        }),
      };
    });

    renderComponent();

    const templatesTab = screen.getByRole('button', { name: /Templates/i });
    fireEvent.click(templatesTab);

    // 1. Saved templates appear immediately at the top (list-first layout)
    expect(await screen.findByText('Monday Heavy Push')).toBeDefined();
    expect(screen.getByText('Friday Heavy Pull')).toBeDefined();

    // 2. Day Filter toolbar filtering
    const monFilterBtn = screen.getByTestId('day-filter-Mon');
    const friFilterBtn = screen.getByTestId('day-filter-Fri');
    const allFilterBtn = screen.getByTestId('day-filter-All');

    // Filter by Mon
    fireEvent.click(monFilterBtn);
    expect(screen.getByText('Monday Heavy Push')).toBeDefined();
    expect(screen.queryByText('Friday Heavy Pull')).toBeNull();

    // Filter by Fri
    fireEvent.click(friFilterBtn);
    expect(screen.queryByText('Monday Heavy Push')).toBeNull();
    expect(screen.getByText('Friday Heavy Pull')).toBeDefined();

    // Reset filter to All
    fireEvent.click(allFilterBtn);
    expect(screen.getByText('Monday Heavy Push')).toBeDefined();
    expect(screen.getByText('Friday Heavy Pull')).toBeDefined();

    // 3. Trigger + New Routine button to open modal in create mode
    const newRoutineBtn = screen.getByTestId('new-template-btn');
    fireEvent.click(newRoutineBtn);

    expect(screen.getByTestId('edit-template-modal')).toBeDefined();
    expect(screen.getByText('Create Routine Template')).toBeDefined();

    const nameInput = screen.getByTestId('template-name-input');
    expect(nameInput).toHaveValue('');

    // Fill in name
    fireEvent.change(nameInput, { target: { value: 'Saturday Arms Blast' } });

    // Select Saturday day pill
    const satPill = screen.getByTestId('day-pill-Sat');
    fireEvent.click(satPill);

    // Open Exercise Picker drawer
    const openPickerBtn = screen.getByTestId('open-exercise-picker');
    fireEvent.click(openPickerBtn);

    // Add Barbell Squat to routine
    const addSquatBtn = screen.getByTestId('add-exercise-btn-ex-master-1');
    fireEvent.click(addSquatBtn);

    // Click Done to return to routine editor
    const donePickerBtn = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(donePickerBtn);

    // Exercise now visible in routine list
    expect(screen.getByText('Barbell Squat')).toBeDefined();

    // Save Routine
    const saveBtn = screen.getByTestId('save-template-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('save_routine_template', {
        p_template_id: null,
        p_name: 'Saturday Arms Blast',
        p_days_of_week: ['Sat'],
        p_exercises: [
          expect.objectContaining({
            exercise_id: 'ex-master-1',
            target_sets: 3,
            target_reps: 10,
          }),
        ],
        p_user_id: 'athlete-123',
      });
      expect(screen.queryByTestId('edit-template-modal')).toBeNull();
    });
  });
});

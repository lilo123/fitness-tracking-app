import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { DEFAULT_EXERCISES_LIST, normalizeDateStr } from '../../utils/ghostSets';
import { getDayBounds, getLocalDateStr } from '../../utils/date';
import { WORKOUT_WITH_SETS_PROJECTION, COACH_SETS_PER_WORKOUT_LIMIT, warnIfCoachSetsTruncated } from '../workout/useWorkoutQueries';
import { Shield, AlertCircle, RotateCcw } from 'lucide-react';
import { CoachAthleteSwitcher } from './CoachAthleteSwitcher';
import { CoachAthleteTimeline, type TimelineDay, type CoachWorkoutSet } from './CoachAthleteTimeline';
import { CoachAthleteMacros } from './CoachAthleteMacros';
import { CoachTemplateBuilder } from './CoachTemplateBuilder';
import { StatusBanner } from '../common/StatusBanner';

const SETS_PAGE_LIMIT = 500;

export const CoachCockpit: React.FC = () => {
  const { user } = useAuth();
  const { selectedAthleteId, selectedAthlete, athletes, switchAthlete } = useCoach();

  const queryClient = useQueryClient();

  // Mobile segmented tabs
  type CoachMobileTab = 'activity' | 'macros' | 'templates';
  const [coachTab, setCoachTab] = useState<CoachMobileTab>('activity');

  // Timeline days range and exercise drilldown state
  const [daysRange, setDaysRange] = useState(14);
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});

  const toggleExercise = (key: string) => {
    setExpandedExercises((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const daysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - daysRange);
    return getLocalDateStr(d);
  }, [daysRange]);

  // Template Builder State
  const [templateName, setTemplateName] = useState('');
  const [isMaster, setIsMaster] = useState(false);
  const [selectedExercises, setSelectedExercises] = useState<
    { exerciseId: string; exerciseName: string; targetSets: number; targetReps: number }[]
  >([]);
  const [exerciseToAdd, setExerciseToAdd] = useState('');
  const [status, setStatus] = useState('');

  // Fetch exercises library
  const {
    data: exercises = DEFAULT_EXERCISES_LIST,
    isError: isExercisesError,
    error: exercisesError,
    refetch: refetchExercises,
  } = useQuery({
    queryKey: ['exercises', 'coach'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, body_part, is_master')
        .order('name')
        .limit(200);
      if (error) throw error;
      if (!data || data.length === 0) return DEFAULT_EXERCISES_LIST;
      return data as Exercise[];
    },
  });

  // Fetch routine templates created by coach
  const {
    data: templates = [],
    isError: isTemplatesError,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['routine_templates', user?.id, 'coach'],
    queryFn: async () => {
      // payload-gate: accepted-list — standing watch item W-1, measured 54223 B on /coach
      const { data, error } = await supabase
        .from('routine_templates')
        .select(
          'id, user_id, name, is_master, assigned_to, days_of_week, created_at, exercises:template_exercises(id, template_id, exercise_id, order_index, target_sets, target_reps)'
        )
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data) return [];
      return data as RoutineTemplate[];
    },
  });

  // Fetch athlete workouts with sets (single round-trip PostgREST resource embedding DIR-B3, bounded to daysRange)
  const {
    data: athleteWorkoutsWithSets = [],
    isError: isWorkoutsError,
    error: workoutsError,
    refetch: refetchWorkouts,
  } = useQuery({
    queryKey: ['coach_athlete_timeline_workouts', selectedAthleteId, daysRange],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      if (!selectedAthleteId) return [];
      // payload-gate: accepted-list — athlete workout detail in cockpit, measured 682 B on /coach (source: docs/evidence/perf-trace-results.json, route /coach, the workouts query). Cite that retained path, never a runId — this file is in scripts/perf-payload-sources.json, so editing this comment retires the run whose id was written here. W-10 CAPPED: the sets embed is bounded per workout by COACH_SETS_PER_WORKOUT_LIMIT with a truncation warning. PostgREST applies an embedded limit per parent row, so a generous cap is inert: measured against the bench-athlete fixture, caps of 500 and 2000 return byte-identical responses to no cap at all (119,655 B embed, /coach 176,395 B, OVER the 153,600 B ceiling), while cap 200 gives 62,475 B and /coach 119,215 B. See the cap table in useWorkoutQueries.ts. W-10b OPEN: this bounds the tail, not the worst case; the structural fix is lazy-loading sets on expand like /history. Do not insert lines between this comment and the query: Gate A resolves annotations by proximity, and this file is at its 600-line budget.
      const { data: workoutsData, error: wErr } = await supabase
        .from('workouts')
        .select(WORKOUT_WITH_SETS_PROJECTION)
        .eq('user_id', selectedAthleteId)
        .gte('date', daysAgoStr)
        .order('date', { ascending: false })
        .limit(100)
        .limit(COACH_SETS_PER_WORKOUT_LIMIT, { referencedTable: 'sets' });
      if (wErr) throw wErr;
      if (!workoutsData || workoutsData.length === 0) return [];
      warnIfCoachSetsTruncated(workoutsData);

      const hasEmbeddedSets = workoutsData.some((w) => Array.isArray(w.sets));
      if (hasEmbeddedSets || workoutsData.every((w) => w.sets !== undefined)) {
        return workoutsData.map((w) => ({
          ...w,
          sets: (w.sets || [])
            .map((s) => ({
              ...s,
              // W-5: workout_id left the projection; these sets are embedded under `w`, so `w.id` IS their workout id by construction (not a fallback). See tier3_close_out.md §8.
              workout_id: w.id,
              workout_date: normalizeDateStr(w.date || s.created_at),
              workout_name: w.name || 'Workout Session',
              exercise_name:
                (s as any).exercise?.name ||
                exercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
                DEFAULT_EXERCISES_LIST.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
                (s as { exercise_name?: string }).exercise_name ||
                s.exercise_id,
              weight: s.weight ?? 0,
            }))
            .sort(
              (a, b) =>
                (a.set_index ?? 0) - (b.set_index ?? 0) ||
                (a.created_at || '').localeCompare(b.created_at || '')
            ),
        }));
      }

      // Defensive fallback for legacy test mocks where workouts and sets are mocked in separate tables
      const workoutIds = workoutsData.map((w) => w.id);
      if (workoutIds.length === 0) return workoutsData.map((w) => ({ ...w, sets: [] }));

      const { data: setsData, error } = await supabase
        .from('sets')
        .select('id, workout_id, reps, weight, set_index, exercise_id, exercise:exercises(id, name, body_part)')
        .in('workout_id', workoutIds)
        .order('created_at', { ascending: false })
        .limit(SETS_PAGE_LIMIT);

      if (error) throw error;
      if (!setsData) return workoutsData.map((w) => ({ ...w, sets: [] }));

      if (setsData.length === SETS_PAGE_LIMIT) {
        console.warn(
          `[CoachCockpit] athlete sets query reached cap of ${SETS_PAGE_LIMIT} rows; older historical sets may be truncated.`
        );
      }

      const sortedSets = [...setsData].sort(
        (a, b) =>
          (a.set_index ?? 0) - (b.set_index ?? 0) ||
          ((a as { created_at?: string }).created_at || '').localeCompare(
            (b as { created_at?: string }).created_at || ''
          )
      );

      const setsByWorkout = sortedSets.reduce<Record<string, CoachWorkoutSet[]>>((acc, s) => {
        acc[s.workout_id] = acc[s.workout_id] || [];
        acc[s.workout_id].push({
          ...s,
          set_type: 'working',
          workout_id: s.workout_id,
          workout_date: '',
          workout_name: '',
          weight: s.weight ?? 0,
        });
        return acc;
      }, {});

      return workoutsData.map((w) => ({
        ...w,
        sets: setsByWorkout[w.id] || [],
      }));
    },
  });

  // Defensive Nutrition Logs Query bounded to daysRange
  const {
    data: athleteNutrition = [],
    isError: isAthleteNutritionError,
    error: athleteNutritionError,
    refetch: refetchAthleteNutrition,
  } = useQuery({
    queryKey: ['coach_athlete_timeline_nutrition', selectedAthleteId, daysRange],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      if (!selectedAthleteId) return [];
      const { startOfDay } = getDayBounds(daysAgoStr);
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('id, user_id, food_name, calories, protein, carbs, fat, fiber, logged_at')
        .eq('user_id', selectedAthleteId)
        .gte('logged_at', startOfDay)
        .order('logged_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!data) return [];
      return data;
    },
  });

  // Timeline day grouping
  const timelineDays = useMemo(() => {
    const dayMap = new Map<string, TimelineDay>();

    athleteWorkoutsWithSets.forEach((w) => {
      const d = normalizeDateStr(w.date) || (w.date ? String(w.date).slice(0, 10) : '');
      if (!d) return;
      if (!dayMap.has(d)) {
        dayMap.set(d, { date: d, workouts: [], nutrition: [] });
      }
      dayMap.get(d)!.workouts.push(w);
    });

    athleteNutrition.forEach((n) => {
      const d = normalizeDateStr(n.logged_at) || (n.logged_at ? String(n.logged_at).slice(0, 10) : '');
      if (!d) return;
      if (!dayMap.has(d)) {
        dayMap.set(d, { date: d, workouts: [], nutrition: [] });
      }
      dayMap.get(d)!.nutrition.push(n);
    });

    return Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [athleteWorkoutsWithSets, athleteNutrition]);

  // Athlete Macro Targets State & Query
  const [athleteCal, setAthleteCal] = useState<number | string>('');
  const [athletePro, setAthletePro] = useState<number | string>('');
  const [athleteCarb, setAthleteCarb] = useState<number | string>('');
  const [athleteFat, setAthleteFat] = useState<number | string>('');
  const [athleteFiber, setAthleteFiber] = useState<number | string>('');
  const [macroStatus, setMacroStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isUpdatingMacros, setIsUpdatingMacros] = useState(false);
  const editedFieldsRef = React.useRef<Set<string>>(new Set());
  const loadedAthleteIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    loadedAthleteIdRef.current = null;
    editedFieldsRef.current.clear();
  }, [selectedAthleteId]);

  const {
    data: athleteProfile, isError: isAthleteProfileError,
    error: athleteProfileError, refetch: refetchAthleteProfile,
  } = useQuery({
    queryKey: ['athlete_profile', selectedAthleteId],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, target_calories, target_protein, target_carbs, target_fat, target_fiber')
        .eq('id', selectedAthleteId).single();
      if (error) throw error;
      return data || null;
    },
  });

  /* oxlint-disable react/set-state-in-effect */
  React.useEffect(() => {
    if (athleteProfile && loadedAthleteIdRef.current !== selectedAthleteId) {
      loadedAthleteIdRef.current = selectedAthleteId;
      if (!editedFieldsRef.current.has('cal')) setAthleteCal(athleteProfile.target_calories ?? 2200);
      if (!editedFieldsRef.current.has('pro')) setAthletePro(athleteProfile.target_protein ?? 160);
      if (!editedFieldsRef.current.has('carb')) setAthleteCarb(athleteProfile.target_carbs ?? 220);
      if (!editedFieldsRef.current.has('fat')) setAthleteFat(athleteProfile.target_fat ?? 70);
      if (!editedFieldsRef.current.has('fiber')) setAthleteFiber(athleteProfile.target_fiber ?? 30);
    }
  }, [athleteProfile, selectedAthleteId]);

  const setCal = (v: string) => { editedFieldsRef.current.add('cal'); setAthleteCal(v); };
  const setPro = (v: string) => { editedFieldsRef.current.add('pro'); setAthletePro(v); };
  const setCarb = (v: string) => { editedFieldsRef.current.add('carb'); setAthleteCarb(v); };
  const setFat = (v: string) => { editedFieldsRef.current.add('fat'); setAthleteFat(v); };
  const setFiber = (v: string) => { editedFieldsRef.current.add('fiber'); setAthleteFiber(v); };

  const handleUpdateAthleteMacros = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAthleteId) return;
    setIsUpdatingMacros(true);
    setMacroStatus(null);
    try {
      const { error } = await supabase.rpc('update_athlete_macros', {
        p_athlete_id: selectedAthleteId, p_calories: Number(athleteCal),
        p_protein: Number(athletePro), p_carbs: Number(athleteCarb),
        p_fat: Number(athleteFat), p_fiber: Number(athleteFiber),
      });
      if (error) throw error;
      setMacroStatus({ type: 'success', message: 'Athlete nutrition targets updated!' });
      editedFieldsRef.current.clear();
      refetchAthleteProfile();
      queryClient.invalidateQueries({ queryKey: ['athlete_profile', selectedAthleteId] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to update targets';
      setMacroStatus({ type: 'error', message });
    } finally {
      setIsUpdatingMacros(false);
    }
  };

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!templateName.trim()) throw new Error('Template name is required');
      if (!user?.id) throw new Error('Authenticated coach required');

      // 1. Insert template via RPC
      const { data: tplId, error: tplErr } = await supabase.rpc('save_routine_template', {
        p_name: templateName.trim(),
        p_is_master: isMaster,
        p_assigned_to: isMaster || !selectedAthleteId ? undefined : selectedAthleteId,
      });

      if (tplErr || !tplId) throw new Error(tplErr?.message || 'Failed to create template');

      // 2. Insert exercises
      const tplRecord = typeof tplId === 'object' && tplId !== null ? (tplId as Record<string, unknown>) : null;
      const actualTemplateId =
        (tplRecord && ('template_id' in tplRecord || 'id' in tplRecord)
          ? String(tplRecord.template_id || tplRecord.id)
          : null) || (typeof tplId === 'string' ? tplId : null);

      if (!actualTemplateId) {
        throw new Error('Failed to resolve template ID');
      }

      const exPayloads = selectedExercises.map((ex, idx) => {
        const matched = exercises.find((e) => e.name === ex.exerciseName || e.id === ex.exerciseId);
        const resolvedId = matched ? matched.id : ex.exerciseId;
        return {
          template_id: actualTemplateId,
          exercise_id: resolvedId,
          order_index: idx,
          target_sets: ex.targetSets,
          target_reps: ex.targetReps,
        };
      });

      const { error: exErr } = await supabase.from('template_exercises').insert(exPayloads);
      if (exErr) throw exErr;

      return { id: actualTemplateId };
    },
    onSuccess: () => {
      setStatus('Template saved');
      queryClient.invalidateQueries({ queryKey: ['coach_templates'] });
      queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
      // Reset
      setTemplateName('');
      setSelectedExercises([]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to create template';
      setStatus('Error: ' + message);
    },
  });

  const handleAddExerciseToTemplate = () => {
    if (!exerciseToAdd) return;
    const ex = exercises.find((e) => e.name === exerciseToAdd || e.id === exerciseToAdd);
    if (!ex) return;

    setSelectedExercises((prev) => [
      ...prev,
      {
        exerciseId: ex.id,
        exerciseName: ex.name,
        targetSets: 3,
        targetReps: 10,
      },
    ]);
    setExerciseToAdd('');
  };

  const removeExerciseFromTemplate = (idx: number) => {
    setSelectedExercises((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTargetSets = (idx: number, val: number) => {
    setSelectedExercises((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, targetSets: val } : item))
    );
  };

  const updateTargetReps = (idx: number, val: number) => {
    setSelectedExercises((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, targetReps: val } : item))
    );
  };

  const handleDisconnectAthlete = async () => {
    if (window.confirm(`Disconnect athlete "${selectedAthlete?.name || 'this athlete'}"?`)) {
      try {
        const { error } = await supabase.rpc('disconnect_coach', { target_athlete_id: selectedAthleteId });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['coach_athletes'] });
        switchAthlete('');
      } catch (err: unknown) {
        console.error('Failed to disconnect athlete:', err);
        const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to disconnect athlete';
        alert(message);
      }
    }
  };

  const isCoachReadError = isExercisesError || isTemplatesError || isAthleteNutritionError || isAthleteProfileError;
  const coachReadError = exercisesError || templatesError || athleteNutritionError || athleteProfileError;
  const coachReadErrorMessage = coachReadError instanceof Error
    ? coachReadError.message
    : typeof coachReadError === 'string'
    ? coachReadError
    : (coachReadError as unknown as { message?: string })?.message || 'Unable to load coach data. Please try again.';
  const handleRetryCoachRead = () => {
    void refetchExercises();
    void refetchTemplates();
    void refetchAthleteNutrition();
    void refetchAthleteProfile();
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Coach Header */}
      <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/20 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">
            Coach Dashboard
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          Manage athletes, track training progress & nutrition compliance, and build workout templates.
        </p>

        {/* Responsive Athlete Switcher Card */}
        <CoachAthleteSwitcher
          selectedAthleteId={selectedAthleteId}
          selectedAthlete={selectedAthlete}
          athletes={athletes}
          onSwitchAthlete={switchAthlete}
          onDisconnectAthlete={handleDisconnectAthlete}
        />
      </div>

      {/* Coach Read Error Banner */}
      <StatusBanner
        title={isCoachReadError ? 'Failed to load coach dashboard data' : null}
        message={isCoachReadError ? coachReadErrorMessage : null}
        tone="error"
        testId="coach-read-error"
        className="mb-4"
        icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button
            type="button"
            onClick={handleRetryCoachRead}
            data-testid="retry-coach-btn"
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Retry</span>
          </button>
        }
      />

      {/* Segmented Tab Controls (Visible only on mobile <640px) */}
      <div className="flex sm:hidden bg-zinc-900 p-1 rounded-2xl border border-zinc-800 gap-1">
        <button
          type="button"
          onClick={() => setCoachTab('activity')}
          data-testid="coach-tab-activity"
          aria-label="Activity & Progress"
          className={`flex-1 min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition touch-manipulation flex items-center justify-center ${
            coachTab === 'activity'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span className="hidden min-[420px]:inline">Activity & Progress</span>
          <span className="min-[420px]:hidden">Activity</span>
        </button>
        <button
          type="button"
          onClick={() => setCoachTab('macros')}
          data-testid="coach-tab-macros"
          aria-label="Macro Targets"
          className={`flex-1 min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition touch-manipulation flex items-center justify-center ${
            coachTab === 'macros'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span className="hidden min-[420px]:inline">Macro Targets</span>
          <span className="min-[420px]:hidden">Macros</span>
        </button>
        <button
          type="button"
          onClick={() => setCoachTab('templates')}
          data-testid="coach-tab-templates"
          aria-label="Workout Templates"
          className={`flex-1 min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition touch-manipulation flex items-center justify-center ${
            coachTab === 'templates'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span className="hidden min-[420px]:inline">Workout Templates</span>
          <span className="min-[420px]:hidden">Templates</span>
        </button>
      </div>

      {/* Section 1: Athlete Activity & Progress Timeline */}
      <div className={`${coachTab === 'activity' ? 'block' : 'hidden'} sm:block space-y-4`}>
        <CoachAthleteTimeline
          selectedAthleteId={selectedAthleteId}
          selectedAthlete={selectedAthlete}
          timelineDays={timelineDays}
          athleteWorkoutsWithSets={athleteWorkoutsWithSets}
          athleteProfile={athleteProfile}
          exercises={exercises}
          expandedExercises={expandedExercises}
          onToggleExercise={toggleExercise}
          onLoadOlderDays={() => setDaysRange((prev) => prev + 14)}
          isWorkoutsError={isWorkoutsError}
          workoutsError={workoutsError}
          onRetryWorkouts={() => refetchWorkouts()}
        />
      </div>

      {/* Section 2: Selected Athlete Nutrition Targets Form */}
      {selectedAthleteId && (
        <div className={`${coachTab === 'macros' ? 'block' : 'hidden'} sm:block`}>
          <CoachAthleteMacros
            selectedAthlete={selectedAthlete}
            athleteCal={athleteCal}
            setAthleteCal={setCal}
            athletePro={athletePro}
            setAthletePro={setPro}
            athleteCarb={athleteCarb}
            setAthleteCarb={setCarb}
            athleteFat={athleteFat}
            setAthleteFat={setFat}
            athleteFiber={athleteFiber}
            setAthleteFiber={setFiber}
            isUpdatingMacros={isUpdatingMacros}
            macroStatus={macroStatus}
            onUpdateAthleteMacros={handleUpdateAthleteMacros}
          />
        </div>
      )}

      {/* Section 3: Routine Template Builder & Library */}
      <div className={`${coachTab === 'templates' ? 'block' : 'hidden'} sm:block space-y-6 min-w-0`}>
        <CoachTemplateBuilder
          templateName={templateName}
          setTemplateName={setTemplateName}
          isMaster={isMaster}
          setIsMaster={setIsMaster}
          exerciseToAdd={exerciseToAdd}
          setExerciseToAdd={setExerciseToAdd}
          selectedExercises={selectedExercises}
          exercises={exercises}
          templates={templates}
          isTemplatesError={isTemplatesError}
          status={status}
          isSaving={createTemplateMutation.isPending}
          onAddExercise={handleAddExerciseToTemplate}
          onRemoveExercise={removeExerciseFromTemplate}
          onUpdateTargetSets={updateTargetSets}
          onUpdateTargetReps={updateTargetReps}
          onSaveTemplate={() => createTemplateMutation.mutate()}
        />
      </div>
    </div>
  );
};

export default CoachCockpit;

import React, { useState, useMemo, useId, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate, UserProfile } from '../../types/database';
import { DEFAULT_EXERCISES_LIST, normalizeDateStr } from '../../utils/ghostSets';
import { getDayBounds } from '../../utils/date';
import { WORKOUT_WITH_SETS_PROJECTION, COACH_SETS_PER_WORKOUT_LIMIT, warnIfCoachSetsTruncated } from '../workout/useWorkoutQueries';
import { Shield, AlertCircle, RotateCcw, Layers, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { CoachAthleteSwitcher } from './CoachAthleteSwitcher';
import { CoachAthleteTimeline, type CoachWorkoutSet } from './CoachAthleteTimeline';
import { CoachAthleteMacros } from './CoachAthleteMacros';
import { EditTemplateSheet } from '../exercises/EditTemplateSheet';
import { StatusBanner } from '../common/StatusBanner';
import { groupTimelineDays, resolveAthleteTimeZone, getTimelineDaysAgoStr } from '../../utils/timelineGrouping';
import { nutritionRowLimitForRange } from '../../utils/coachQueryBounds';
import { resolveExerciseLabel } from '../../utils/exerciseLabel';
import { invalidateExerciseDomain } from '../../lib/invalidate';
import { queryKeys } from '../../lib/queryKeys';

const SETS_PAGE_LIMIT = 500;

export const CoachCockpit: React.FC = () => {
  const { user } = useAuth();
  const { selectedAthleteId, selectedAthlete, athletes, switchAthlete } = useCoach();
  const queryClient = useQueryClient();

  const {
    data: athleteProfile, isError: isAthleteProfileError,
    error: athleteProfileError, refetch: refetchAthleteProfile,
  } = useQuery({
    queryKey: ['athlete_profile', selectedAthleteId],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from('users') as any)
        .select('id, username, email, target_calories, target_protein, target_carbs, target_fat, target_fiber, timezone')
        .eq('id', selectedAthleteId).single();
      if (error) throw error;
      return (data as UserProfile | null) || null;
    },
  });

  const athleteTimeZone = resolveAthleteTimeZone(athleteProfile, selectedAthlete);
  type CoachMobileTab = 'activity' | 'macros' | 'templates';
  const [coachTab, setCoachTab] = useState<CoachMobileTab>('activity');
  const [daysRange, setDaysRange] = useState(14);
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const toggleExercise = (key: string) => setExpandedExercises((prev) => ({ ...prev, [key]: !prev[key] }));
  const daysAgoStr = useMemo(() => getTimelineDaysAgoStr(daysRange, athleteTimeZone), [daysRange, athleteTimeZone]);

  // Template Builder State & EditTemplateSheet
  const [templateName, setTemplateName] = useState('');
  const [isMaster, setIsMaster] = useState(false);
  const [selectedExercises, setSelectedExercises] = useState<{ exerciseId: string; exerciseName: string; targetSets: number; targetReps: number }[]>([]);
  const [exerciseToAdd, setExerciseToAdd] = useState('');
  const [status, setStatus] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RoutineTemplate | null>(null);
  const templateNameId = useId();

  // Fetch exercises library (P7b Conductor Addendum: body_parts)
  const {
    data: exercises = DEFAULT_EXERCISES_LIST, isError: isExercisesError,
    error: exercisesError, refetch: refetchExercises,
  } = useQuery({
    queryKey: ['exercises', 'coach'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('exercises') as any).select('id, name, body_parts, is_master').order('name').limit(200);
      if (error) throw error;
      return (data && data.length > 0 ? data : DEFAULT_EXERCISES_LIST) as Exercise[];
    },
  });

  // Fetch routine templates created by coach
  const {
    data: templates = [], isError: isTemplatesError,
    error: templatesError, refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['routine_templates', user?.id, 'coach'],
    queryFn: async () => {
      // payload-gate: accepted-list — standing watch item W-1, measured 54223 B on /coach
      const { data, error } = await supabase.from('routine_templates')
        .select('id, user_id, name, is_master, assigned_to, days_of_week, created_at, exercises:template_exercises(id, template_id, exercise_id, order_index, target_sets, target_reps)')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as RoutineTemplate[];
    },
  });

  // Fetch athlete workouts with sets (single round-trip PostgREST resource embedding DIR-B3, bounded to daysRange)
  const {
    data: athleteWorkoutsWithSets = [], isError: isWorkoutsError,
    error: workoutsError, refetch: refetchWorkouts,
  } = useQuery({
    queryKey: ['coach_athlete_timeline_workouts', selectedAthleteId, daysRange, athleteTimeZone],
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
          sets: (w.sets || []).map((s) => ({
            ...s,
            workout_id: w.id,
            workout_date: normalizeDateStr(w.date || s.created_at),
            workout_name: w.name || 'Workout Session',
            exercise_name: resolveExerciseLabel((s as any).exercise?.name || exercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name || DEFAULT_EXERCISES_LIST.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name || (s as { exercise_name?: string }).exercise_name || s.exercise_id),
            weight: s.weight ?? 0,
          })).sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0) || (a.created_at || '').localeCompare(b.created_at || '')),
        }));
      }

      // Defensive fallback for legacy test mocks where workouts and sets are mocked in separate tables
      const workoutIds = workoutsData.map((w) => w.id);
      if (workoutIds.length === 0) return workoutsData.map((w) => ({ ...w, sets: [] }));

      const { data: setsData, error } = await (supabase.from('sets') as any)
        .select('id, workout_id, reps, weight, set_index, exercise_id, exercise:exercises(id, name, body_parts)')
        .in('workout_id', workoutIds).order('created_at', { ascending: false }).limit(SETS_PAGE_LIMIT);
      if (error) throw error;
      if (!setsData) return workoutsData.map((w) => ({ ...w, sets: [] }));
      if (setsData.length === SETS_PAGE_LIMIT) {
        console.warn(`[CoachCockpit] athlete sets query reached cap of ${SETS_PAGE_LIMIT} rows; older historical sets may be truncated.`);
      }
      const sortedSets = [...setsData].sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0) || ((a as any).created_at || '').localeCompare((b as any).created_at || ''));
      const setsByWorkout = sortedSets.reduce<Record<string, CoachWorkoutSet[]>>((acc, s) => {
        acc[s.workout_id] = acc[s.workout_id] || [];
        acc[s.workout_id].push({ ...s, set_type: 'working', workout_id: s.workout_id, workout_date: '', workout_name: '', weight: s.weight ?? 0 });
        return acc;
      }, {});
      return workoutsData.map((w) => ({ ...w, sets: setsByWorkout[w.id] || [] }));
    },
  });

  // Defensive Nutrition Logs Query bounded to daysRange
  const {
    data: athleteNutrition = [], isError: isAthleteNutritionError,
    error: athleteNutritionError, refetch: refetchAthleteNutrition,
  } = useQuery({
    queryKey: ['coach_athlete_timeline_nutrition', selectedAthleteId, daysRange, athleteTimeZone],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      if (!selectedAthleteId) return [];
      const { startOfDay } = getDayBounds(daysAgoStr, athleteTimeZone);
      const rowLimit = nutritionRowLimitForRange(daysRange);
      const { data, error } = await supabase.from('nutrition_logs')
        .select('id, user_id, food_name, calories, protein, carbs, fat, fiber, logged_at, logged_date')
        .eq('user_id', selectedAthleteId).gte('logged_at', startOfDay).order('logged_at', { ascending: false }).limit(rowLimit);
      if (error) throw error;
      return data || [];
    },
  });

  const timelineDays = useMemo(() => groupTimelineDays(athleteWorkoutsWithSets, athleteNutrition, athleteTimeZone), [athleteWorkoutsWithSets, athleteNutrition, athleteTimeZone]);

  // Athlete Macro Targets State & Query
  const [athleteCal, setAthleteCal] = useState<number | string>('');
  const [athletePro, setAthletePro] = useState<number | string>('');
  const [athleteCarb, setAthleteCarb] = useState<number | string>('');
  const [athleteFat, setAthleteFat] = useState<number | string>('');
  const [athleteFiber, setAthleteFiber] = useState<number | string>('');
  const [macroStatus, setMacroStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isUpdatingMacros, setIsUpdatingMacros] = useState(false);
  const editedFieldsRef = useRef<Set<string>>(new Set());
  const loadedAthleteIdRef = useRef<string | null>(null);

  useEffect(() => { loadedAthleteIdRef.current = null; editedFieldsRef.current.clear(); }, [selectedAthleteId]);

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
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

  // Create template mutation: single atomic save_routine_template RPC call with p_assigned_to (Item 1 / L9)
  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!templateName.trim()) throw new Error('Template name is required');
      if (!user?.id) throw new Error('Authenticated coach required');

      const exPayloads = selectedExercises.map((ex, idx) => {
        const matched = exercises.find((e) => e.name === ex.exerciseName || e.id === ex.exerciseId);
        return {
          exercise_id: matched ? matched.id : ex.exerciseId,
          order_index: idx,
          target_sets: ex.targetSets,
          target_reps: ex.targetReps,
        };
      });

      const { data: tplId, error: tplErr } = await supabase.rpc('save_routine_template', {
        p_name: templateName.trim(),
        p_is_master: isMaster,
        p_assigned_to: isMaster || !selectedAthleteId ? undefined : selectedAthleteId,
        p_days_of_week: [],
        p_exercises: exPayloads,
      });

      if (tplErr || !tplId) throw new Error(tplErr?.message || 'Failed to create template');
      return tplId;
    },
    onSuccess: () => {
      setStatus('Template saved');
      void invalidateExerciseDomain(queryClient, user?.id);
      queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.routineCatalog.all });
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
    setSelectedExercises((prev) => [...prev, { exerciseId: ex.id, exerciseName: ex.name, targetSets: 3, targetReps: 10 }]);
    setExerciseToAdd('');
  };

  const removeExerciseFromTemplate = (idx: number) => setSelectedExercises((prev) => prev.filter((_, i) => i !== idx));
  const updateTargetSets = (idx: number, val: number) => setSelectedExercises((prev) => prev.map((item, i) => (i === idx ? { ...item, targetSets: val } : item)));
  const updateTargetReps = (idx: number, val: number) => setSelectedExercises((prev) => prev.map((item, i) => (i === idx ? { ...item, targetReps: val } : item)));

  const handleDisconnectAthlete = async () => {
    /* oxlint-disable no-alert */
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
    /* oxlint-enable no-alert */
  };

  const isCoachReadError = isExercisesError || isTemplatesError || isAthleteNutritionError || isAthleteProfileError;
  const coachReadError = exercisesError || templatesError || athleteNutritionError || athleteProfileError;
  const coachReadErrorMessage = coachReadError instanceof Error ? coachReadError.message : typeof coachReadError === 'string' ? coachReadError : (coachReadError as any)?.message || 'Unable to load coach data. Please try again.';
  const handleRetryCoachRead = () => { void refetchExercises(); void refetchTemplates(); void refetchAthleteNutrition(); void refetchAthleteProfile(); };

  return (
    <div className="space-y-6 min-w-0">
      {/* Coach Header */}
      <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/20 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">Coach Dashboard</h2>
        </div>
        <p className="text-xs text-zinc-400">Manage athletes, track training progress & nutrition compliance, and build workout templates.</p>
        <CoachAthleteSwitcher selectedAthleteId={selectedAthleteId} selectedAthlete={selectedAthlete} athletes={athletes} onSwitchAthlete={switchAthlete} onDisconnectAthlete={handleDisconnectAthlete} />
      </div>

      {/* Coach Read Error Banner */}
      <StatusBanner
        title={isCoachReadError ? 'Failed to load coach dashboard data' : null}
        message={isCoachReadError ? coachReadErrorMessage : null}
        tone="error" testId="coach-read-error" className="mb-4"
        icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button type="button" onClick={handleRetryCoachRead} data-testid="retry-coach-btn" className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer">
            <RotateCcw className="w-4 h-4 shrink-0" /><span>Retry</span>
          </button>
        }
      />

      {/* Segmented Tab Controls (Visible only on mobile <640px) */}
      <div className="flex sm:hidden bg-zinc-900 p-1 rounded-2xl border border-zinc-800 gap-1">
        {(['activity', 'macros', 'templates'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setCoachTab(tab)}
            data-testid={`coach-tab-${tab}`}
            aria-label={tab === 'activity' ? 'Activity & Progress' : tab === 'macros' ? 'Macro Targets' : 'Workout Templates'}
            className={`flex-1 min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition touch-manipulation flex items-center justify-center ${coachTab === tab ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-zinc-400 hover:text-white'}`}
          >
            <span className="hidden min-[420px]:inline">{tab === 'activity' ? 'Activity & Progress' : tab === 'macros' ? 'Macro Targets' : 'Workout Templates'}</span>
            <span className="min-[420px]:hidden capitalize">{tab}</span>
          </button>
        ))}
      </div>

      {/* Section 1: Athlete Activity & Progress Timeline */}
      <div className={`${coachTab === 'activity' ? 'block' : 'hidden'} sm:block space-y-4`}>
        <CoachAthleteTimeline
          selectedAthleteId={selectedAthleteId} selectedAthlete={selectedAthlete} timelineDays={timelineDays}
          athleteWorkoutsWithSets={athleteWorkoutsWithSets} athleteProfile={athleteProfile} exercises={exercises}
          expandedExercises={expandedExercises} onToggleExercise={toggleExercise} onLoadOlderDays={() => setDaysRange((prev) => prev + 14)}
          isWorkoutsError={isWorkoutsError} workoutsError={workoutsError} onRetryWorkouts={() => refetchWorkouts()}
        />
      </div>

      {/* Section 2: Selected Athlete Nutrition Targets Form */}
      {selectedAthleteId && (
        <div className={`${coachTab === 'macros' ? 'block' : 'hidden'} sm:block`}>
          <CoachAthleteMacros
            selectedAthlete={selectedAthlete} athleteCal={athleteCal} setAthleteCal={setCal} athletePro={athletePro}
            setAthletePro={setPro} athleteCarb={athleteCarb} setAthleteCarb={setCarb} athleteFat={athleteFat}
            setAthleteFat={setFat} athleteFiber={athleteFiber} setAthleteFiber={setFiber} isUpdatingMacros={isUpdatingMacros}
            macroStatus={macroStatus} onUpdateAthleteMacros={handleUpdateAthleteMacros}
          />
        </div>
      )}

      {/* Section 3: Routine Template Builder & Library (Item 1 & Conductor Addendum) */}
      <div className={`${coachTab === 'templates' ? 'block' : 'hidden'} sm:block space-y-6 min-w-0`}>
        {/* Routine Template Builder */}
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4 min-w-0">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider truncate">Workout Template Builder</h3>
            </div>
            <button
              type="button"
              onClick={() => { setEditingTemplate(null); setIsSheetOpen(true); }}
              data-testid="coach-open-new-template-sheet-btn"
              className="px-3 py-1.5 min-h-[36px] bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-neon-cyan transition active:scale-95 flex items-center gap-1.5 touch-manipulation cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /><span>+ New Template</span>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor={templateNameId} className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Template Name</label>
              <input
                id={templateNameId}
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Hypertrophy Upper Body A"
                className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none"
              />
            </div>

            <label htmlFor="isMasterCheckbox" className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                id="isMasterCheckbox"
                checked={isMaster}
                onChange={(e) => setIsMaster(e.target.checked)}
                className="rounded bg-zinc-950 border-border-interactive text-cyan-500 focus:ring-0 w-5 h-5 shrink-0"
              />
              <span className="text-xs text-zinc-300 font-bold select-none">Master Template (Available to all athletes)</span>
            </label>

            {/* Exercise Add Selector */}
            <div className="flex gap-2 w-full min-w-0">
              <select
                value={exerciseToAdd}
                onChange={(e) => setExerciseToAdd(e.target.value)}
                aria-label="Choose exercise to add"
                className="flex-1 min-w-0 max-w-full truncate cursor-pointer bg-zinc-950 border border-border-interactive text-white rounded-xl px-3 py-2 text-base sm:text-xs font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none min-h-[44px]"
                data-testid="template-exercise-select"
              >
                <option value="">-- Choose Exercise to Add --</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.name}>{ex.name} ({(ex as any).body_parts?.[0] || 'Body'})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddExerciseToTemplate}
                disabled={!exerciseToAdd}
                className="bg-zinc-800 hover:bg-zinc-700 text-cyan-300 font-bold px-4 py-2 min-h-[44px] rounded-xl text-xs flex items-center gap-1 border border-border-interactive disabled:opacity-50 touch-manipulation shrink-0"
                data-testid="add-template-exercise-btn"
              >
                <Plus className="w-4 h-4 shrink-0" /><span className="shrink-0">Add</span>
              </button>
            </div>

            {/* Added Exercises List */}
            {selectedExercises.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold uppercase text-zinc-400 tracking-wider block">
                  Exercise Sequence ({selectedExercises.length}):
                </span>
                {selectedExercises.map((ex, idx) => (
                  <div key={idx} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                      <span className="w-5 h-5 rounded-md bg-zinc-800 text-cyan-400 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                      <span className="text-xs font-bold text-white truncate min-w-0 flex-1">{ex.exerciseName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="20"
                            value={ex.targetSets}
                            onChange={(e) => updateTargetSets(idx, Number(e.target.value) || 1)}
                            className="w-12 min-h-[44px] bg-zinc-900 border border-border-interactive text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold shrink-0"
                            title="Target Sets"
                            data-testid={`template-target-sets-${idx}`}
                          />
                          <span className="text-xs shrink-0 text-zinc-400">sets</span>
                        </div>
                        <span className="shrink-0">×</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="100"
                            value={ex.targetReps}
                            onChange={(e) => updateTargetReps(idx, Number(e.target.value) || 1)}
                            className="w-14 min-h-[44px] bg-zinc-900 border border-border-interactive text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold shrink-0"
                            title="Target Reps"
                            data-testid={`template-target-reps-${idx}`}
                          />
                          <span className="text-xs shrink-0 text-zinc-400">reps</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExerciseFromTemplate(idx)}
                        className="text-zinc-400 hover:text-rose-400 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation shrink-0"
                        title="Remove exercise"
                        data-testid={`template-remove-ex-${idx}`}
                      >
                        <Trash2 className="w-4 h-4 shrink-0" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => createTemplateMutation.mutate()}
              disabled={createTemplateMutation.isPending || !templateName.trim() || selectedExercises.length === 0}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan active:scale-95 transition disabled:opacity-50"
              data-testid="save-template-btn"
            >
              {createTemplateMutation.isPending ? 'Saving Template...' : 'Save Template'}
            </button>

            <StatusBanner
              message={status || null}
              tone={status.startsWith('Error:') ? 'error' : 'success'}
              icon={status.startsWith('Error:') ? undefined : <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />}
            />
          </div>
        </div>

        {/* Existing Routine Templates */}
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3 min-w-0">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 min-w-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Workout Templates ({templates.length})</span>
            </h3>
          </div>

          {isTemplatesError ? null : templates.length === 0 ? (
            <div className="p-4 text-center text-zinc-400 text-xs">No workout templates created yet. Use the builder above to create one.</div>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => (
                <div key={tpl.id} className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between shadow-sm gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-white text-xs flex items-center gap-2 min-w-0">
                      <span className="truncate">{tpl.name}</span>
                      {tpl.is_master && <span className="bg-cyan-500/20 text-cyan-300 text-xs px-1.5 py-0.5 rounded font-bold shrink-0">Master</span>}
                    </div>
                    {tpl.exercises && <div className="text-xs text-zinc-400 mt-0.5 truncate">{tpl.exercises.length} exercises configured</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingTemplate(tpl); setIsSheetOpen(true); }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 px-2.5 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 min-h-[36px] font-bold touch-manipulation shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit / New Template Sheet */}
        <EditTemplateSheet
          isOpen={isSheetOpen}
          onClose={() => { setIsSheetOpen(false); setEditingTemplate(null); }}
          template={editingTemplate}
          assignToAthleteId={selectedAthleteId || undefined}
        />
      </div>
    </div>
  );
};

export default CoachCockpit;

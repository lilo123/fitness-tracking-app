import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { DEFAULT_EXERCISES_LIST, normalizeDateStr } from '../../utils/ghostSets';
import { formatShortDate } from '../../utils/date';
import { groupSessionSetsByExercise } from '../../utils/historyGrouping';
import {
  Users,
  Shield,
  Plus,
  Trash2,
  CheckCircle2,
  Calendar,
  Layers,
  Target,
  AlertCircle,
  Activity,
  Dumbbell,
  Flame,
  ChevronDown,
} from 'lucide-react';

export const CoachCockpit: React.FC = () => {
  const { user } = useAuth();
  const {
    selectedAthleteId,
    selectedAthlete,
    athletes,
    switchAthlete,
  } = useCoach();

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
    return d.toISOString().split('T')[0];
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
  const { data: exercises = DEFAULT_EXERCISES_LIST } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('exercises').select('*').order('name');
        if (error || !data || data.length === 0) return DEFAULT_EXERCISES_LIST;
        return data as Exercise[];
      } catch {
        return DEFAULT_EXERCISES_LIST;
      }
    },
  });

  // Fetch routine templates created by coach
  const { data: templates = [] } = useQuery({
    queryKey: ['coach_templates', user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('routine_templates')
          .select('*, exercises:template_exercises(*)');
        if (error || !data) return [];
        return data as RoutineTemplate[];
      } catch {
        return [];
      }
    },
  });

  // Fetch athlete workouts with sets (defensive chaining for test stubs, bounded to daysRange)
  const { data: athleteWorkoutsWithSets = [] } = useQuery({
    queryKey: ['coach_athlete_timeline_workouts', selectedAthleteId, daysRange],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      if (!selectedAthleteId) return [];
      try {
        let workoutsQuery = supabase
          .from('workouts')
          .select('id, date, name')
          .eq('user_id', selectedAthleteId);

        if (typeof (workoutsQuery as any)?.gte === 'function') {
          workoutsQuery = (workoutsQuery as any).gte('date', daysAgoStr);
        }
        if (typeof (workoutsQuery as any)?.order === 'function') {
          workoutsQuery = (workoutsQuery as any).order('date', { ascending: false });
        }

        const { data: workoutsData, error: wErr } = await workoutsQuery;

        if (wErr || !workoutsData) return [];
        const workoutIds = workoutsData.map((w: any) => w.id);
        if (workoutIds.length === 0) return workoutsData.map((w: any) => ({ ...w, sets: [] }));

        const setsQuery = supabase
          .from('sets')
          .select('id, workout_id, reps, weight_lbs, weight, set_order, set_index, exercise_id, exercise:exercises(id, name, body_part)');

        let setsData: any[] | null = null;
        if (typeof (setsQuery as any)?.in === 'function') {
          const { data, error } = await (setsQuery as any).in('workout_id', workoutIds).order('created_at', { ascending: true });
          if (!error && data) setsData = data;
        }

        const setsByWorkout = (setsData || []).reduce((acc: any, s: any) => {
          acc[s.workout_id] = acc[s.workout_id] || [];
          acc[s.workout_id].push({
            ...s,
            weight: s.weight ?? s.weight_lbs ?? 0,
          });
          return acc;
        }, {});

        return workoutsData.map((w: any) => ({
          ...w,
          sets: setsByWorkout[w.id] || [],
        }));
      } catch {
        return [];
      }
    },
  });

  // Defensive Nutrition Logs Query bounded to daysRange
  const { data: athleteNutrition = [] } = useQuery({
    queryKey: ['coach_athlete_timeline_nutrition', selectedAthleteId, daysRange],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      if (!selectedAthleteId) return [];
      try {
        let nQuery = supabase
          .from('nutrition_logs')
          .select('id, user_id, food_name, calories, protein, carbs, fat, fiber, logged_at')
          .eq('user_id', selectedAthleteId);

        if (typeof (nQuery as any)?.gte === 'function') {
          nQuery = (nQuery as any).gte('logged_at', daysAgoStr);
        }
        if (typeof (nQuery as any)?.order === 'function') {
          nQuery = (nQuery as any).order('logged_at', { ascending: false });
        }

        const res: any = await nQuery;
        if (res?.error || !res?.data) return [];
        return res.data;
      } catch {
        return [];
      }
    },
  });

  // Timeline day grouping
  const timelineDays = useMemo(() => {
    const dayMap = new Map<string, { date: string; workouts: any[]; nutrition: any[] }>();

    athleteWorkoutsWithSets.forEach((w: any) => {
      const d = normalizeDateStr(w.date) || (w.date ? String(w.date).slice(0, 10) : '');
      if (!d) return;
      if (!dayMap.has(d)) {
        dayMap.set(d, { date: d, workouts: [], nutrition: [] });
      }
      dayMap.get(d)!.workouts.push(w);
    });

    athleteNutrition.forEach((n: any) => {
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

  const { data: athleteProfile, refetch: refetchAthleteProfile } = useQuery({
    queryKey: ['athlete_profile', selectedAthleteId],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, username, email, target_calories, target_protein, target_carbs, target_fat, target_fiber')
          .eq('id', selectedAthleteId)
          .single();
        if (error || !data) return null;
        return data;
      } catch {
        return null;
      }
    },
  });

  /* oxlint-disable react/set-state-in-effect */
  React.useEffect(() => {
    if (athleteProfile) {
      setAthleteCal(athleteProfile.target_calories ?? 2200);
      setAthletePro(athleteProfile.target_protein ?? 160);
      setAthleteCarb(athleteProfile.target_carbs ?? 220);
      setAthleteFat(athleteProfile.target_fat ?? 70);
      setAthleteFiber(athleteProfile.target_fiber ?? 30);
    }
  }, [athleteProfile]);

  const handleUpdateAthleteMacros = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAthleteId) return;
    setIsUpdatingMacros(true);
    setMacroStatus(null);
    try {
      const { error } = await supabase.rpc('update_athlete_macros', {
        p_athlete_id: selectedAthleteId,
        p_calories: Number(athleteCal),
        p_protein: Number(athletePro),
        p_carbs: Number(athleteCarb),
        p_fat: Number(athleteFat),
        p_fiber: Number(athleteFiber),
      });
      if (error) throw error;
      setMacroStatus({ type: 'success', message: 'Athlete nutrition targets updated!' });
      refetchAthleteProfile();
      queryClient.invalidateQueries({ queryKey: ['athlete_profile', selectedAthleteId] });
    } catch (err: any) {
      setMacroStatus({ type: 'error', message: err?.message || 'Failed to update targets' });
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
        p_assigned_to: isMaster || !selectedAthleteId ? null : selectedAthleteId,
      });

      if (tplErr || !tplId) throw new Error(tplErr?.message || 'Failed to create template');

      // 2. Insert exercises
      const actualTemplateId = tplId?.template_id || tplId?.id || (typeof tplId === 'string' ? tplId : null);
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
    onError: (err: any) => {
      setStatus('Error: ' + err.message);
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
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Active Athlete</div>
                <div className="text-sm font-black text-white truncate max-w-[200px] sm:max-w-xs">
                  {selectedAthlete?.name || 'None'}
                </div>
              </div>
            </div>

            <div className="w-full sm:w-auto min-w-0">
              <select
                value={selectedAthleteId}
                onChange={(e) => switchAthlete(e.target.value)}
                data-testid="coach-athlete-select"
                className="w-full sm:w-64 max-w-full truncate bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-base sm:text-xs font-bold focus:border-cyan-500 outline-none cursor-pointer min-h-[44px]"
              >
                <option value="">-- None --</option>
                {athletes.map((ath) => (
                  <option key={ath.id} value={ath.id}>
                    {ath.name} ({ath.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedAthleteId && (
            <div className="flex justify-end pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm(`Disconnect athlete "${selectedAthlete?.name || 'this athlete'}"?`)) {
                    try {
                      const { error } = await supabase.rpc('disconnect_coach', { target_athlete_id: selectedAthleteId });
                      if (error) throw error;
                      queryClient.invalidateQueries({ queryKey: ['coach_athletes'] });
                      switchAthlete('');
                    } catch (err: any) {
                      console.error('Failed to disconnect athlete:', err);
                      alert(err?.message || 'Failed to disconnect athlete');
                    }
                  }
                }}
                data-testid="disconnect-athlete-btn"
                className="text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 min-h-[44px] rounded-xl border border-rose-500/30 transition flex items-center gap-1.5 touch-manipulation"
                title="Disconnect Athlete"
              >
                <Trash2 className="w-4 h-4" />
                <span>Disconnect Athlete</span>
              </button>
            </div>
          )}
        </div>
      </div>

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
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Activity Timeline: {selectedAthlete?.name || 'None'}
            </h3>
            {selectedAthleteId && (
              <span className="text-xs font-mono font-bold text-amber-400">
                {athleteWorkoutsWithSets.length} Workouts Logged
              </span>
            )}
          </div>

          {!selectedAthleteId ? (
            <div className="p-6 text-center text-zinc-400 text-xs">
              Select an athlete above to view their training history and nutrition timeline.
            </div>
          ) : timelineDays.length === 0 ? (
            <div className="p-6 text-center text-zinc-400 text-xs">
              No workouts or nutrition logged for this athlete yet.
            </div>
          ) : (
            <div className="space-y-4">
              {timelineDays.map((day) => {
                const dayCal = day.nutrition.reduce((s, n) => s + (Number(n.calories) || 0), 0);
                const dayPro = day.nutrition.reduce((s, n) => s + (Number(n.protein) || 0), 0);
                const dayCarb = day.nutrition.reduce((s, n) => s + (Number(n.carbs) || 0), 0);
                const dayFat = day.nutrition.reduce((s, n) => s + (Number(n.fat) || 0), 0);
                const targetCal = Number(athleteProfile?.target_calories) || 2200;
                const calDiffRatio = targetCal > 0 ? (dayCal - targetCal) / targetCal : 0;
                const isCompliant = Math.abs(calDiffRatio) <= 0.1;
                const isUnder = calDiffRatio < -0.1;

                return (
                  <div
                    key={day.date}
                    className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-3.5 space-y-3"
                  >
                    {/* Day Group Header */}
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-black text-white uppercase tracking-wider font-mono">
                          {formatShortDate(day.date)}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {day.workouts.length > 0 && `${day.workouts.length} ${day.workouts.length === 1 ? 'workout' : 'workouts'}`}
                        {day.workouts.length > 0 && day.nutrition.length > 0 && ' • '}
                        {day.nutrition.length > 0 && `${day.nutrition.length} ${day.nutrition.length === 1 ? 'meal' : 'meals'}`}
                      </span>
                    </div>

                    {/* Workouts in Day */}
                    {day.workouts.map((w: any) => {
                      const totalVol = (w.sets || []).reduce(
                        (acc: number, s: any) => acc + (Number(s.weight) || 0) * (Number(s.reps) || 0),
                        0
                      );
                      const exerciseGroups = groupSessionSetsByExercise(w.sets || [], exercises);

                      return (
                        <div
                          key={w.id}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                                <Dumbbell className="w-3 h-3 text-cyan-400" />
                              </div>
                              <span className="font-extrabold text-white text-xs truncate">
                                {w.name || 'Workout Session'}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono shrink-0">
                              {w.sets && w.sets.length > 0 ? (
                                <span>
                                  {w.sets.length} sets • {totalVol.toLocaleString()} lbs vol
                                </span>
                              ) : (
                                <span>Logged</span>
                              )}
                            </div>
                          </div>

                          {/* Exercise groups */}
                          {exerciseGroups.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
                              {exerciseGroups.map((g) => {
                                const exKey = `${w.id}-${g.exerciseId}`;
                                const isExpanded = Boolean(expandedExercises[exKey]);
                                return (
                                  <div
                                    key={g.exerciseId}
                                    className="bg-zinc-950/80 rounded-xl p-2 text-[11px] border border-zinc-850/60 space-y-1.5"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleExercise(exKey)}
                                      data-testid={`toggle-exercise-${g.exerciseId}`}
                                      aria-expanded={isExpanded}
                                      className="w-full flex items-center justify-between font-bold text-zinc-300 hover:text-white transition cursor-pointer text-left touch-manipulation"
                                    >
                                      <span className="truncate max-w-[160px] sm:max-w-xs">
                                        {g.exerciseName}
                                      </span>
                                      <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px] shrink-0">
                                        <span>
                                          {g.sets.length} sets • {g.totalVolume.toLocaleString()} lbs
                                        </span>
                                        <ChevronDown
                                          className={`w-3.5 h-3.5 text-cyan-400 transition-transform duration-200 ${
                                            isExpanded ? 'rotate-180' : ''
                                          }`}
                                        />
                                      </div>
                                    </button>
                                    {isExpanded && (
                                      <div
                                        className="pt-1.5 border-t border-zinc-800/80 space-y-1"
                                        data-testid={`exercise-sets-${g.exerciseId}`}
                                      >
                                        {g.sets.map((s: any, sIdx: number) => (
                                          <div
                                            key={s.id || sIdx}
                                            className="flex items-center justify-between text-[10px] text-zinc-400 font-mono px-2 py-1 bg-zinc-900/60 rounded-lg"
                                          >
                                            <span className="text-zinc-500 font-medium">
                                              Set {s.set_order ?? s.set_index ?? sIdx + 1}
                                            </span>
                                            <span className="text-cyan-300 font-bold">
                                              {Number(s.reps) || 0} reps × {Number(s.weight ?? s.weight_lbs ?? 0)} lbs
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Nutrition in Day */}
                    {day.nutrition.length > 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                              <Flame className="w-3 h-3 text-amber-400" />
                            </div>
                            <span className="font-extrabold text-white text-xs truncate">
                              Nutrition ({dayCal} kcal)
                            </span>
                          </div>
                          <div>
                            {isCompliant ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                                On Target
                              </span>
                            ) : isUnder ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400">
                                Under Target
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-400">
                                Over Target
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-2">
                          <span className="text-cyan-400 font-bold">{dayPro}g P</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold">{dayCarb}g C</span>
                          <span>•</span>
                          <span className="text-violet-400 font-bold">{dayFat}g F</span>
                        </div>

                        <div className="space-y-1 pt-1 border-t border-zinc-800/60">
                          {day.nutrition.map((n: any) => (
                            <div
                              key={n.id}
                              className="bg-zinc-950/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px]"
                            >
                              <span className="text-zinc-300 font-medium truncate max-w-[160px] sm:max-w-xs">
                                {n.food_name}
                              </span>
                              <span className="text-amber-400 font-mono text-[10px] font-bold shrink-0">
                                {n.calories} kcal
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Load Older Days Button */}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setDaysRange((prev) => prev + 14)}
                  data-testid="load-older-days-btn"
                  className="w-full sm:w-auto px-6 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition shadow-sm active:scale-95 touch-manipulation flex items-center justify-center gap-2"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Load Older Days</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Selected Athlete Nutrition Targets Form */}
      {selectedAthleteId && (
        <div className={`${coachTab === 'macros' ? 'block' : 'hidden'} sm:block`}>
          <form
            onSubmit={handleUpdateAthleteMacros}
            className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" />
                Athlete Nutrition Targets: {selectedAthlete?.name}
              </h3>
              <span className="text-[10px] uppercase font-bold text-zinc-400">Coach Override</span>
            </div>

            <p className="text-xs text-zinc-400">
              Set daily caloric and macronutrient goals for this athlete. Changes update their dashboard in real time.
            </p>

            <div className="space-y-3">
              {/* Tier 1: Full-Width Hero Daily Calorie Target */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="block text-[11px] font-black text-amber-400 uppercase tracking-wider mb-0.5">
                    Daily Calorie Target
                  </label>
                  <p className="text-[11px] text-zinc-400 font-medium">Total caloric energy ceiling per day</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="10000"
                    value={athleteCal}
                    onChange={(e) => setAthleteCal(e.target.value)}
                    data-testid="athlete-macro-cal"
                    className="w-full sm:w-36 min-h-[44px] bg-zinc-900 border border-zinc-700 text-amber-400 rounded-xl p-2.5 text-lg font-mono font-black focus:border-amber-500 outline-none text-center shadow-inner"
                    required
                  />
                  <span className="text-xs font-mono font-bold text-zinc-400">kcal</span>
                </div>
              </div>

              {/* Tier 2: Sub-Macro 2x2 Grid (Mobile) / 4-Col Grid (Desktop) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {/* Protein */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">Protein</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={athletePro}
                    onChange={(e) => setAthletePro(e.target.value)}
                    data-testid="athlete-macro-pro"
                    className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                    required
                  />
                </div>

                {/* Carbs */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Carbs</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={athleteCarb}
                    onChange={(e) => setAthleteCarb(e.target.value)}
                    data-testid="athlete-macro-carb"
                    className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-emerald-500 outline-none text-center"
                    required
                  />
                </div>

                {/* Fat */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-violet-400 uppercase tracking-wider">Fat</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={athleteFat}
                    onChange={(e) => setAthleteFat(e.target.value)}
                    data-testid="athlete-macro-fat"
                    className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-violet-500 outline-none text-center"
                    required
                  />
                </div>

                {/* Fiber */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-teal-400 uppercase tracking-wider">Fiber</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={athleteFiber}
                    onChange={(e) => setAthleteFiber(e.target.value)}
                    data-testid="athlete-macro-fiber"
                    className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-teal-500 outline-none text-center"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdatingMacros}
              className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan transition disabled:opacity-50 touch-manipulation flex items-center justify-center gap-2"
              data-testid="update-athlete-macros-btn"
            >
              <Target className="w-4 h-4" />
              {isUpdatingMacros ? 'Updating Targets...' : 'Update Athlete Targets'}
            </button>

            {macroStatus && (
              <div
                data-testid="athlete-macro-status"
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  macroStatus.type === 'error'
                    ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                    : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
                }`}
              >
                {macroStatus.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{macroStatus.message}</span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Section 3: Routine Template Builder & Library */}
      <div className={`${coachTab === 'templates' ? 'block' : 'hidden'} sm:block space-y-6 min-w-0`}>
        {/* Routine Template Builder */}
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4 min-w-0">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 min-w-0">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider truncate">
              Workout Template Builder
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Hypertrophy Upper Body A"
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isMasterCheckbox"
                checked={isMaster}
                onChange={(e) => setIsMaster(e.target.checked)}
                className="rounded bg-zinc-950 border-zinc-800 text-cyan-500 focus:ring-0 w-4 h-4 shrink-0"
              />
              <label htmlFor="isMasterCheckbox" className="text-xs text-zinc-300 font-bold select-none cursor-pointer">
                Master Template (Available to all athletes)
              </label>
            </div>

            {/* Exercise Add Selector */}
            <div className="flex gap-2 w-full min-w-0">
              <select
                value={exerciseToAdd}
                onChange={(e) => setExerciseToAdd(e.target.value)}
                className="flex-1 min-w-0 max-w-full truncate cursor-pointer bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none min-h-[44px]"
                data-testid="template-exercise-select"
              >
                <option value="">-- Choose Exercise to Add --</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.name}>
                    {ex.name} ({ex.body_part || 'Body'})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddExerciseToTemplate}
                disabled={!exerciseToAdd}
                className="bg-zinc-800 hover:bg-zinc-700 text-cyan-300 font-bold px-4 py-2 min-h-[44px] rounded-xl text-xs flex items-center gap-1 border border-zinc-700 disabled:opacity-50 touch-manipulation shrink-0"
                data-testid="add-template-exercise-btn"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="shrink-0">Add</span>
              </button>
            </div>

            {/* Added Exercises List */}
            {selectedExercises.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider block">
                  Exercise Sequence ({selectedExercises.length}):
                </span>
                {selectedExercises.map((ex, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 min-w-0"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                      <span className="w-5 h-5 rounded-md bg-zinc-800 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-white truncate min-w-0 flex-1">{ex.exerciseName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="20"
                            value={ex.targetSets}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 1;
                              setSelectedExercises((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, targetSets: val } : item))
                              );
                            }}
                            className="w-12 min-h-[36px] bg-zinc-900 border border-zinc-750 text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold shrink-0"
                            title="Target Sets"
                            data-testid={`template-target-sets-${idx}`}
                          />
                          <span className="text-[10px] shrink-0">sets</span>
                        </div>
                        <span className="shrink-0">×</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="100"
                            value={ex.targetReps}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 1;
                              setSelectedExercises((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, targetReps: val } : item))
                              );
                            }}
                            className="w-14 min-h-[36px] bg-zinc-900 border border-zinc-750 text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold shrink-0"
                            title="Target Reps"
                            data-testid={`template-target-reps-${idx}`}
                          />
                          <span className="text-[10px] shrink-0">reps</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExerciseFromTemplate(idx)}
                        className="text-zinc-500 hover:text-rose-400 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation shrink-0"
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
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan active:scale-95 transition disabled:opacity-50"
              data-testid="save-template-btn"
            >
              {createTemplateMutation.isPending ? 'Saving Template...' : 'Save Template'}
            </button>

            {status && (
              <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="min-w-0 flex-1 break-words">{status}</span>
              </div>
            )}
          </div>
        </div>

        {/* Existing Routine Templates */}
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3 min-w-0">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 min-w-0">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Workout Templates ({templates.length})</span>
            </h3>
          </div>

          {templates.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-xs">
              No workout templates created yet. Use the builder above to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between shadow-sm gap-2 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-white text-xs flex items-center gap-2 min-w-0">
                      <span className="truncate">{tpl.name}</span>
                      {tpl.is_master && (
                        <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0">
                          Master
                        </span>
                      )}
                    </div>
                    {tpl.exercises && (
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                        {tpl.exercises.length} exercises configured
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoachCockpit;

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { DEFAULT_EXERCISES_LIST } from '../../utils/ghostSets';
import { formatShortDate } from '../../utils/date';
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

  // Fetch athlete summary (recent workouts count)
  const { data: athleteWorkouts = [] } = useQuery({
    queryKey: ['athlete_workouts_summary', selectedAthleteId],
    enabled: Boolean(selectedAthleteId) && selectedAthleteId.length > 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('workouts')
          .select('id, date, name')
          .eq('user_id', selectedAthleteId)
          .order('date', { ascending: false });
        if (error || !data) return [];
        return data;
      } catch {
        return [];
      }
    },
  });

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
      const userId = user.id;

      // 1. Insert template
      const { data: tpl, error: tplErr } = await supabase
        .from('routine_templates')
        .insert([
          {
            user_id: userId,
            name: templateName.trim(),
            is_master: isMaster,
            assigned_to: isMaster ? null : selectedAthleteId,
          },
        ])
        .select()
        .single();

      if (tplErr || !tpl) throw new Error(tplErr?.message || 'Failed to create template');

      // 2. Insert exercises
      const exPayloads = selectedExercises.map((ex, idx) => {
        const matched = exercises.find((e) => e.name === ex.exerciseName || e.id === ex.exerciseId);
        const resolvedId = matched ? matched.id : ex.exerciseId;
        return {
          template_id: tpl.id,
          exercise_id: resolvedId,
          order_index: idx,
          target_sets: ex.targetSets,
          target_reps: ex.targetReps,
        };
      });

      const { error: exErr } = await supabase.from('template_exercises').insert(exPayloads);
      if (exErr) throw exErr;

      return tpl;
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
    <div className="space-y-6">
      {/* Coach Header */}
      <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/20 rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">
            Coach Dashboard
          </h2>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          Manage athletes, build workout templates, and track training progress.
        </p>

        {/* Athlete Switcher Card */}
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-400">Selected Athlete</div>
              <div className="text-sm font-black text-white">{selectedAthlete?.name || 'None'}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedAthleteId}
              onChange={(e) => switchAthlete(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-bold focus:border-cyan-500 outline-none cursor-pointer min-h-[44px]"
            >
              {athletes.map((ath) => (
                <option key={ath.id} value={ath.id}>
                  {ath.name} ({ath.email})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Selected Athlete Activity Card */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            Recent Workouts: {selectedAthlete?.name}
          </h3>
          <span className="text-xs font-mono font-bold text-amber-400">
            {athleteWorkouts.length} Workouts Logged
          </span>
        </div>

        {athleteWorkouts.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-xs">
            No workouts logged for this athlete yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {athleteWorkouts.slice(0, 5).map((w: any) => (
              <div
                key={w.id}
                className="bg-zinc-950 border border-zinc-800/60 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono"
              >
                <span className="font-bold text-white">{w.name || 'Workout'}</span>
                <span className="text-cyan-400">{formatShortDate(w.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Athlete Nutrition Targets Card */}
      {selectedAthleteId && (
        <form
          onSubmit={handleUpdateAthleteMacros}
          className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              Athlete Nutrition Targets: {selectedAthlete?.name}
            </h3>
            <span className="text-[10px] uppercase font-bold text-zinc-500">Coach Override</span>
          </div>

          <p className="text-xs text-zinc-400">
            Set daily caloric and macronutrient goals for this athlete. Changes update their dashboard in real time.
          </p>

          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            <div>
              <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                Calories
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={athleteCal}
                onChange={(e) => setAthleteCal(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                data-testid="athlete-macro-cal"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                Protein (g)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={athletePro}
                onChange={(e) => setAthletePro(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                data-testid="athlete-macro-pro"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                Carbs (g)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={athleteCarb}
                onChange={(e) => setAthleteCarb(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                data-testid="athlete-macro-carb"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
                Fat (g)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={athleteFat}
                onChange={(e) => setAthleteFat(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                data-testid="athlete-macro-fat"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                Fiber (g)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={athleteFiber}
                onChange={(e) => setAthleteFiber(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                data-testid="athlete-macro-fiber"
                required
              />
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
      )}

      {/* Routine Template Builder */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
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
              className="rounded bg-zinc-950 border-zinc-800 text-cyan-500 focus:ring-0 w-4 h-4"
            />
            <label htmlFor="isMasterCheckbox" className="text-xs text-zinc-300 font-bold">
              Master Template (Available to all athletes)
            </label>
          </div>

          {/* Exercise Add Selector */}
          <div className="flex gap-2">
            <select
              value={exerciseToAdd}
              onChange={(e) => setExerciseToAdd(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none min-h-[44px]"
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
              className="bg-zinc-800 hover:bg-zinc-700 text-cyan-300 font-bold px-4 py-2 min-h-[44px] rounded-xl text-xs flex items-center gap-1 border border-zinc-700 disabled:opacity-50 touch-manipulation"
              data-testid="add-template-exercise-btn"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
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
                  className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-zinc-800 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-white truncate">{ex.exerciseName}</span>
                  </div>
                  <div className="flex items-center gap-2">
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
                          className="w-12 min-h-[36px] bg-zinc-900 border border-zinc-750 text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold"
                          title="Target Sets"
                          data-testid={`template-target-sets-${idx}`}
                        />
                        <span className="text-[10px]">sets</span>
                      </div>
                      <span>×</span>
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
                          className="w-14 min-h-[36px] bg-zinc-900 border border-zinc-750 text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold"
                          title="Target Reps"
                          data-testid={`template-target-reps-${idx}`}
                        />
                        <span className="text-[10px]">reps</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExerciseFromTemplate(idx)}
                      className="text-zinc-500 hover:text-rose-400 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                      title="Remove exercise"
                      data-testid={`template-remove-ex-${idx}`}
                    >
                      <Trash2 className="w-4 h-4" />
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
            <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{status}</span>
            </div>
          )}
        </div>
      </div>

      {/* Existing Routine Templates */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Workout Templates ({templates.length})
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
                className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between shadow-sm"
              >
                <div>
                  <div className="font-extrabold text-white text-xs flex items-center gap-2">
                    <span>{tpl.name}</span>
                    {tpl.is_master && (
                      <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                        Master
                      </span>
                    )}
                  </div>
                  {tpl.exercises && (
                    <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
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
  );
};

export default CoachCockpit;

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { WorkoutSet, Exercise, NutritionLog } from '../../types/database';
import {
  normalizeDateStr,
  formatShortDate,
  DEFAULT_EXERCISES_LIST,
} from '../../utils/ghostSets';
import { getDishIcon } from '../../utils/dishIcons';
import { Calendar, Dumbbell, Trophy, Search, Activity, Utensils, Trash2, AlertCircle, Edit2 } from 'lucide-react';
import { EditMealModal } from '../nutrition/EditMealModal';

const CATEGORIES = ['All', 'Chest', 'Back', 'Arms', 'Shoulders', 'Legs', 'Core'];

export const HistoryView: React.FC = () => {
  const { user } = useAuth();
  const { selectedAthleteId } = useCoach();
  const queryClient = useQueryClient();

  const targetUserId = selectedAthleteId || user?.id || '';

  const [historyDomain, setHistoryDomain] = useState<'workouts' | 'nutrition'>('workouts');
  const [viewMode, setViewMode] = useState<'session' | 'exercise'>('session');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [editingMealLog, setEditingMealLog] = useState<NutritionLog | null>(null);

  // Fetch exercises
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

  // Fetch all sets for user
  const { data: allSets = [] } = useQuery({
    queryKey: ['workout_sets', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      try {
        const { data: workoutsData } = await supabase
          .from('workouts')
          .select('id, date, name')
          .eq('user_id', targetUserId);

        if (!workoutsData || workoutsData.length === 0) return [];
        const workoutIds = workoutsData.map((w: any) => w.id);

        const { data: setsData } = await supabase
          .from('sets')
          .select('*, workouts(date, name)')
          .in('workout_id', workoutIds)
          .order('created_at', { ascending: true });

        if (!setsData) return [];

        return setsData.map((s: any) => {
          const matched = exercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id);
          return {
            ...s,
            workout_date: normalizeDateStr(s.workouts?.date || s.created_at),
            workout_name: s.workouts?.name || 'Workout Session',
            exercise_name: matched ? matched.name : s.exercise_id,
          };
        }) as (WorkoutSet & { workout_date: string; workout_name: string })[];
      } catch {
        return [];
      }
    },
  });

  // Fetch nutrition logs for target user
  const { data: nutritionLogs = [] } = useQuery({
    queryKey: ['nutrition_logs', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      try {
        const { data, error } = await supabase
          .from('nutrition_logs')
          .select('*')
          .eq('user_id', targetUserId)
          .order('logged_at', { ascending: false });

        if (error || !data) return [];
        return data as NutritionLog[];
      } catch {
        return [];
      }
    },
  });

  // Delete nutrition log mutation
  const deleteMealMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase.from('nutrition_logs').delete().eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
    },
    onError: (err: any) => {
      setMutationError(err?.message || 'Failed to delete meal log. Please try again.');
    },
  });

  // Group by session (date) for workouts
  const sessions = useMemo(() => {
    const map = new Map<string, { date: string; name: string; sets: any[] }>();

    allSets.forEach((set) => {
      const date = normalizeDateStr(set.workout_date);
      if (!date) return;
      if (!map.has(date)) {
        map.set(date, {
          date,
          name: set.workout_name,
          sets: [],
        });
      }
      map.get(date)!.sets.push(set);
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [allSets]);

  // Group by exercise for workouts
  const exerciseStats = useMemo(() => {
    const stats: Record<string, { exercise: Exercise; sets: any[]; maxWeight: number; prReps: number }> = {};

    exercises.forEach((ex) => {
      stats[ex.name] = {
        exercise: ex,
        sets: [],
        maxWeight: 0,
        prReps: 0,
      };
    });

    allSets.forEach((s) => {
      const ex = exercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id);
      const exName = ex ? ex.name : s.exercise_id;

      if (!stats[exName]) {
        stats[exName] = {
          exercise: { id: s.exercise_id, name: exName, body_part: 'Other' },
          sets: [],
          maxWeight: 0,
          prReps: 0,
        };
      }

      stats[exName].sets.push(s);
      const w = Number(s.weight) || 0;
      const r = Number(s.reps) || 0;
      if (w > stats[exName].maxWeight || (w === stats[exName].maxWeight && r > stats[exName].prReps)) {
        stats[exName].maxWeight = w;
        stats[exName].prReps = r;
      }
    });

    return Object.values(stats).filter((stat) => {
      if (selectedCategory !== 'All') {
        const bp = stat.exercise.body_part || '';
        if (!bp.toLowerCase().includes(selectedCategory.toLowerCase())) return false;
      }
      if (searchQuery.trim()) {
        if (!stat.exercise.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [exercises, allSets, selectedCategory, searchQuery]);

  // Group nutrition logs by date with macro distributions
  const nutritionDays = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        meals: NutritionLog[];
        totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
        macroCalories: { protein: number; carbs: number; fat: number; total: number };
        percentages: { protein: number; carbs: number; fat: number };
      }
    >();

    nutritionLogs.forEach((log) => {
      const date = normalizeDateStr(log.logged_at);
      if (!date) return;
      if (!map.has(date)) {
        map.set(date, {
          date,
          meals: [],
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          macroCalories: { protein: 0, carbs: 0, fat: 0, total: 0 },
          percentages: { protein: 0, carbs: 0, fat: 0 },
        });
      }
      const entry = map.get(date)!;
      entry.meals.push(log);
      const cal = Number(log.calories) || 0;
      const p = Number(log.protein) || 0;
      const c = Number(log.carbs) || 0;
      const f = Number(log.fat) || 0;
      const fib = Number(log.fiber) || 0;

      entry.totals.calories += cal;
      entry.totals.protein += p;
      entry.totals.carbs += c;
      entry.totals.fat += f;
      entry.totals.fiber += fib;
    });

    // Calculate caloric ratio distribution for each day
    map.forEach((day) => {
      const pCal = day.totals.protein * 4;
      const cCal = day.totals.carbs * 4;
      const fCal = day.totals.fat * 9;
      const totalMacroCal = pCal + cCal + fCal;

      day.macroCalories = {
        protein: pCal,
        carbs: cCal,
        fat: fCal,
        total: totalMacroCal,
      };

      if (totalMacroCal > 0) {
        const pPct = Math.round((pCal / totalMacroCal) * 100);
        const cPct = Math.round((cCal / totalMacroCal) * 100);
        const fPct = Math.max(0, 100 - pPct - cPct);
        day.percentages = {
          protein: pPct,
          carbs: cPct,
          fat: fPct,
        };
      }
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [nutritionLogs]);

  return (
    <div className="space-y-5">
      {/* Mutation Error Notification */}
      {mutationError && (
        <div
          className="bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded-2xl p-3 flex items-center justify-between text-xs"
          data-testid="history-mutation-error"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{mutationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            className="p-1 min-w-[32px] min-h-[32px] text-rose-400 hover:text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner & Dual Domain Switcher */}
      <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/20 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">
            {historyDomain === 'workouts' ? 'Workout History' : 'Nutrition History'}
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          {historyDomain === 'workouts'
            ? 'Review past workout sessions, personal records, and volume.'
            : 'Review daily caloric distribution, macronutrient breakdowns, and logged meals.'}
        </p>

        {/* Top-Level Domain Segmented Control */}
        <div className="bg-zinc-950/90 p-1.5 rounded-2xl border border-zinc-800 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setHistoryDomain('workouts')}
            className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition ${
              historyDomain === 'workouts'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-neon-cyan'
                : 'text-zinc-400 hover:text-white bg-transparent'
            }`}
            data-testid="history-tab-workouts"
          >
            <Dumbbell className="w-4 h-4" />
            <span>Workouts</span>
          </button>
          <button
            type="button"
            onClick={() => setHistoryDomain('nutrition')}
            className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition ${
              historyDomain === 'nutrition'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'text-zinc-400 hover:text-white bg-transparent'
            }`}
            data-testid="history-tab-nutrition"
          >
            <Utensils className="w-4 h-4" />
            <span>Nutrition</span>
          </button>
        </div>

        {/* Sub-view switcher for Workouts */}
        {historyDomain === 'workouts' && (
          <div className="bg-zinc-950/60 p-1 rounded-xl border border-zinc-800/80 flex gap-1">
            <button
              onClick={() => setViewMode('session')}
              className={`flex-1 py-2 px-3 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition ${
                viewMode === 'session'
                  ? 'bg-zinc-800 text-cyan-300 border border-zinc-700'
                  : 'text-zinc-400 hover:text-white bg-transparent'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>By Session</span>
            </button>
            <button
              onClick={() => setViewMode('exercise')}
              className={`flex-1 py-2 px-3 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition ${
                viewMode === 'exercise'
                  ? 'bg-zinc-800 text-cyan-300 border border-zinc-700'
                  : 'text-zinc-400 hover:text-white bg-transparent'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>By Exercise</span>
            </button>
          </div>
        )}
      </div>

      {/* History Domain Content */}
      {historyDomain === 'nutrition' ? (
        <div className="space-y-4">
          {nutritionDays.length === 0 ? (
            <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 text-center text-zinc-500 text-xs">
              No nutrition logs recorded yet.
            </div>
          ) : (
            nutritionDays.map((day) => (
              <div
                key={day.date}
                className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4"
              >
                {/* Date Header & Macro Summary Pills */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-400" />
                      <span>{formatShortDate(day.date)}</span>
                    </h3>
                    <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
                      {day.date} • {day.meals.length} {day.meals.length === 1 ? 'meal' : 'meals'} logged
                    </div>
                  </div>

                  {/* Daily Macro Summary Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs font-bold">
                    <span className="bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-xl">
                      {day.totals.calories} kcal
                    </span>
                    <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-xl text-[11px]">
                      {day.totals.protein}g P
                    </span>
                    <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-xl text-[11px]">
                      {day.totals.carbs}g C
                    </span>
                    <span className="bg-violet-500/15 text-violet-400 border border-violet-500/30 px-2 py-1 rounded-xl text-[11px]">
                      {day.totals.fat}g F
                    </span>
                    <span className="bg-teal-500/15 text-teal-400 border border-teal-500/30 px-2 py-1 rounded-xl text-[11px]">
                      {day.totals.fiber}g Fib
                    </span>
                  </div>
                </div>

                {/* Proportional Caloric Macro Distribution Bar */}
                {day.macroCalories.total > 0 && (
                  <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-zinc-400 tracking-wider">
                      <span>Caloric Macro Distribution</span>
                      <span className="text-zinc-500 font-mono font-normal text-[10px]">
                        {day.macroCalories.total} macro kcal
                      </span>
                    </div>

                    {/* Multi-segment ratio bar */}
                    <div className="h-2.5 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden flex shadow-inner">
                      {day.percentages.protein > 0 && (
                        <div
                          style={{ width: `${day.percentages.protein}%` }}
                          className="bg-cyan-400 transition-all duration-500"
                          title={`Protein: ${day.percentages.protein}% (${day.macroCalories.protein} kcal)`}
                        />
                      )}
                      {day.percentages.carbs > 0 && (
                        <div
                          style={{ width: `${day.percentages.carbs}%` }}
                          className="bg-emerald-400 transition-all duration-500"
                          title={`Carbs: ${day.percentages.carbs}% (${day.macroCalories.carbs} kcal)`}
                        />
                      )}
                      {day.percentages.fat > 0 && (
                        <div
                          style={{ width: `${day.percentages.fat}%` }}
                          className="bg-violet-400 transition-all duration-500"
                          title={`Fat: ${day.percentages.fat}% (${day.macroCalories.fat} kcal)`}
                        />
                      )}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span>
                        <span className="text-cyan-300 font-bold">{day.percentages.protein}% P</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                        <span className="text-emerald-300 font-bold">{day.percentages.carbs}% C</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-violet-400 inline-block"></span>
                        <span className="text-violet-300 font-bold">{day.percentages.fat}% F</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Meals timeline for this day */}
                <div className="space-y-2 pt-1">
                  {day.meals.map((meal) => (
                    <div
                      key={meal.id}
                      data-testid="meal-log-item"
                      className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between shadow-sm group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-extrabold text-white text-xs truncate flex items-center gap-2">
                          <div className="w-6 h-6 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                            {getDishIcon(meal.food_name)}
                          </div>
                          <span>{meal.food_name}</span>
                          {meal.meal_type && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded-lg">
                              {meal.meal_type}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] font-mono mt-1 text-zinc-400 flex-wrap">
                          <span className="text-amber-400 font-bold">{meal.calories} kcal</span>
                          <span>•</span>
                          <span>P: {meal.protein || 0}g</span>
                          <span>•</span>
                          <span>C: {meal.carbs || 0}g</span>
                          <span>•</span>
                          <span>F: {meal.fat || 0}g</span>
                          <span>•</span>
                          <span className="text-teal-400">Fib: {meal.fiber || 0}g</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingMealLog(meal)}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition touch-manipulation"
                          title="Edit meal"
                          data-testid={`edit-meal-${meal.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {/* 1-Tap Meal Deletion */}
                        <button
                          type="button"
                          onClick={() => deleteMealMutation.mutate(meal.id)}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition touch-manipulation"
                          title="Delete meal"
                          data-testid={`delete-meal-${meal.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : viewMode === 'session' ? (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 text-center text-zinc-500 text-xs">
              No workout sessions recorded yet.
            </div>
          ) : (
            sessions.map((session) => {
              const totalVolume = session.sets.reduce(
                (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
                0
              );

              return (
                <div
                  key={session.date}
                  className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div>
                      <h3 className="text-sm font-black text-white">{session.name}</h3>
                      <div className="text-[11px] font-mono text-cyan-400 mt-0.5">
                        {formatShortDate(session.date)} ({session.date})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-amber-400">
                        {totalVolume.toLocaleString()} lbs volume
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {session.sets.length} sets completed
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {session.sets.map((set, idx) => {
                      const ex = exercises.find((e) => e.id === set.exercise_id);
                      const exName = ex ? ex.name : set.exercise_id;
                      return (
                        <div
                          key={set.id || idx}
                          className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs"
                        >
                          <div className="font-extrabold text-white truncate">{exName}</div>
                          <div className="font-mono font-bold text-cyan-300">
                            {set.weight} lbs × {set.reps} reps
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Exercise Filter Bar */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search exercise library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-2xl pl-10 pr-4 py-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-[11px] font-bold px-3 py-1.5 min-h-[36px] flex items-center justify-center rounded-full whitespace-nowrap transition touch-manipulation ${
                    selectedCategory === cat
                      ? 'bg-cyan-500 text-black shadow-neon-cyan'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise Cards */}
          <div className="space-y-3">
            {exerciseStats.map((stat) => (
              <div
                key={stat.exercise.name}
                className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-white">{stat.exercise.name}</h3>
                    <span className="text-[10px] bg-zinc-800 text-cyan-400 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">
                      {stat.exercise.body_part || 'Full Body'}
                    </span>
                  </div>
                  {stat.maxWeight > 0 ? (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-2xl text-amber-400 text-xs font-black font-mono">
                      <Trophy className="w-3.5 h-3.5" />
                      <span>
                        PR: {stat.maxWeight} lbs × {stat.prReps}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-mono">No logs yet</span>
                  )}
                </div>

                {stat.sets.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider block mb-1">
                      Recent Activity ({stat.sets.length} sets):
                    </span>
                    <div className="space-y-1">
                      {stat.sets.slice(-3).map((s, idx) => (
                        <div
                          key={s.id || idx}
                          className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs font-mono"
                        >
                          <span className="text-zinc-400">{formatShortDate(s.workout_date)}</span>
                          <span className="text-cyan-300 font-bold">
                            {s.weight} lbs × {s.reps} reps
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Meal Modal */}
      <EditMealModal
        isOpen={!!editingMealLog}
        meal={editingMealLog}
        onClose={() => setEditingMealLog(null)}
        targetUserId={targetUserId}
      />
    </div>
  );
};

export default HistoryView;

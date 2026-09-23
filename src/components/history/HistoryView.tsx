import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import type { WorkoutSet, NutritionLog } from '../../types/database';
import { normalizeDateStr } from '../../utils/ghostSets';
import { Calendar, Dumbbell, Activity, Utensils, AlertCircle, Shield, RotateCcw } from 'lucide-react';
import { EditMealModal } from '../nutrition/EditMealModal';
import { EditSetModal } from '../workout/EditSetModal';
import { CoachContext } from '../../context/CoachContextTypes';
import { NutritionHistoryTimeline, type NutritionDaySummary } from './NutritionHistoryTimeline';
import { WorkoutSessionHistory } from './WorkoutSessionHistory';
import { WorkoutExerciseHistory, type ExerciseStat } from './WorkoutExerciseHistory';
import { useHistoryData, useExerciseStats, fetchSessionSets, type HistorySet } from './useHistoryData';
import { StatusBanner } from '../common/StatusBanner';
import { resolveExerciseLabel } from '../../utils/exerciseLabel';
import { groupNutritionDays } from '../../utils/nutritionDayGrouping';

export const HistoryView: React.FC = () => {
  const { user, isCoachMode } = useAuth();
  const coachCtx = React.useContext(CoachContext);
  const selectedAthleteId = coachCtx?.selectedAthleteId || '';
  const selectedAthlete = coachCtx?.selectedAthlete || null;
  const queryClient = useQueryClient();

  const [inspectMode, setInspectMode] = useState<'athlete' | 'coach'>(() => {
    return isCoachMode && selectedAthleteId ? 'athlete' : 'coach';
  });
  const [historyDomain, setHistoryDomain] = useState<'workouts' | 'nutrition'>('workouts');
  const [viewMode, setViewMode] = useState<'session' | 'exercise'>('session');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [editingMealLog, setEditingMealLog] = useState<NutritionLog | null>(null);
  const [editingSet, setEditingSet] = useState<(WorkoutSet & { workout_date?: string; workout_name?: string }) | null>(null);
  const [timeRange, setTimeRange] = useState<'all' | '90d' | '30d' | '1y'>('all');

  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [loadingSessionIds, setLoadingSessionIds] = useState<Set<string>>(new Set());
  const [sessionSetsMap, setSessionSetsMap] = useState<Record<string, HistorySet[]>>({});
  const hasAutoExpandedRef = React.useRef(false);

  /* oxlint-disable react/set-state-in-effect */
  React.useEffect(() => {
    if (isCoachMode && selectedAthleteId) {
      setInspectMode('athlete');
    }
    setEditingMealLog(null);
    setEditingSet(null);
  }, [isCoachMode, selectedAthleteId]);

  const isInspectingAthlete = Boolean(isCoachMode && inspectMode === 'athlete' && selectedAthleteId);
  const targetUserId = isInspectingAthlete ? selectedAthleteId : (user?.id || '');

  const {
    exercises, sessions, nutritionLogs, deleteMealMutation, scaleMealMutation,
    hasMoreWorkouts, loadMoreWorkouts, isLoadingMore, isWorkoutsError,
    workoutsError, refetchWorkouts, isNutritionLogsError, nutritionLogsError,
    refetchNutritionLogs, refetchExercises,
  } = useHistoryData(targetUserId, setMutationError);

  const isExerciseView = historyDomain === 'workouts' && viewMode === 'exercise';
  const {
    data: rawExerciseStats = [],
    isError: isExerciseStatsError,
    error: exerciseStatsError,
    refetch: refetchExerciseStats,
  } = useExerciseStats(targetUserId, isExerciseView);

  const isReadError =
    historyDomain === 'nutrition'
      ? isNutritionLogsError
      : isExerciseView
      ? (isWorkoutsError || isExerciseStatsError)
      : isWorkoutsError;

  const readErrorMessage =
    (historyDomain === 'nutrition'
      ? nutritionLogsError
      : isExerciseView
      ? (workoutsError || exerciseStatsError)
      : workoutsError) instanceof Error
      ? (historyDomain === 'nutrition'
          ? nutritionLogsError
          : isExerciseView
          ? (workoutsError || exerciseStatsError)
          : workoutsError)?.message
      : 'Unable to load history data. Please try again.';

  const handleRetryHistory = () => {
    if (historyDomain === 'nutrition') {
      void refetchNutritionLogs();
    } else {
      void refetchWorkouts();
      void refetchExercises();
      if (isExerciseView) {
        void refetchExerciseStats();
      }
    }
  };

  const loadSetsForSession = React.useCallback(async (sessionId: string) => {
    if (sessionSetsMap[sessionId]) return;

    setLoadingSessionIds((prev) => new Set(prev).add(sessionId));
    try {
      const sets = await queryClient.fetchQuery({
        queryKey: ['session_sets', sessionId],
        queryFn: () => fetchSessionSets(sessionId),
        staleTime: 1000 * 60 * 5,
      });
      const session = sessions.find((s) => s.id === sessionId);
      const enrichedSets: HistorySet[] = sets.map((s) => {
        let exName = s.exercise_name || (s as any).exercise?.name;
        if (!exName && s.exercise_id && targetUserId) {
          const ninetySets = queryClient.getQueryData<any[]>(['workout_sets', targetUserId, '90d']);
          const cached = ninetySets?.find((c) => c.exercise_id === s.exercise_id || c.id === s.id);
          if (cached?.exercise_name) {
            exName = cached.exercise_name;
          }
        }
        return {
          ...s,
          exercise_name: exName,
          workout_date: session?.date || '',
          workout_name: session?.name || 'Workout Session',
        };
      });
      setSessionSetsMap((prev) => ({ ...prev, [sessionId]: enrichedSets }));
    } catch (err) {
      console.error('Failed to load sets for session:', err);
    } finally {
      setLoadingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, [queryClient, sessionSetsMap, sessions, targetUserId]);

  const handleToggleExpand = React.useCallback((sessionId: string) => {
    const willExpand = !expandedSessionIds.has(sessionId);
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
    if (willExpand) {
      void loadSetsForSession(sessionId);
    }
  }, [expandedSessionIds, loadSetsForSession]);

  // Auto-expand budget logic (HD-1):
  // Walk sessions from newest backwards, auto-expand while sessions <= 2 AND running sets <= 100
  React.useEffect(() => {
    if (hasAutoExpandedRef.current || !sessions || sessions.length === 0) return;
    hasAutoExpandedRef.current = true;

    const toExpand: string[] = [];
    let accumulatedSets = 0;

    for (const session of sessions) {
      if (toExpand.length >= 2) break;
      const count = session.set_count ?? session.sets?.length ?? 0;
      if (accumulatedSets + count <= 100) {
        toExpand.push(session.id);
        accumulatedSets += count;
      } else {
        break;
      }
    }

    if (toExpand.length > 0) {
      setExpandedSessionIds(new Set(toExpand));
      toExpand.forEach((sessionId) => {
        void loadSetsForSession(sessionId);
      });
    }
  }, [sessions, loadSetsForSession]);

  // Group by exercise for workouts using RPC + catalog merge (Ruling 5)
  const exerciseStats = useMemo<ExerciseStat[]>(() => {
    const stats: Record<string, ExerciseStat> = {};

    // Seed from exercises catalog so unperformed exercises stay visible (Ruling 5)
    exercises.forEach((ex) => {
      stats[ex.id] = {
        exercise: ex,
        sets: [],
        maxWeight: 0,
        prReps: 0,
        setCount: 0,
      };
    });

    // Merge RPC rows onto the exercises catalog
    rawExerciseStats.forEach((row) => {
      let match: ExerciseStat | undefined = stats[row.exercise_id];
      if (!match) {
        match = Object.values(stats).find((s) => s.exercise.name === row.exercise_id);
      }
      if (match) {
        match.setCount = Number(row.set_count) || 0;
        match.maxWeight = Number(row.max_weight) || 0;
        match.prReps = Number(row.pr_reps) || 0;
        match.sets = Array.isArray(row.recent_sets) ? row.recent_sets : [];
      } else {
        stats[row.exercise_id] = {
          exercise: { id: row.exercise_id, name: resolveExerciseLabel(row.exercise_id), body_part: 'Other' },
          sets: Array.isArray(row.recent_sets) ? row.recent_sets : [],
          maxWeight: Number(row.max_weight) || 0,
          prReps: Number(row.pr_reps) || 0,
          setCount: Number(row.set_count) || 0,
        };
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
  }, [exercises, rawExerciseStats, selectedCategory, searchQuery]);

  // Group nutrition logs by date with macro distributions
  const nutritionDays = useMemo<NutritionDaySummary[]>(() => {
    return groupNutritionDays(nutritionLogs);
  }, [nutritionLogs]);

  // Bounded window & pagination navigation for HistoryView (DIR-B1)
  const filteredSessions = useMemo(() => {
    if (timeRange === 'all') return sessions;
    const now = new Date();
    const days = timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = normalizeDateStr(cutoff);
    return sessions.filter((s) => s.date >= cutoffStr);
  }, [sessions, timeRange]);

  const displayedSessions = filteredSessions;

  const displayedSessionsWithSets = useMemo(() => {
    return displayedSessions.map((s) => ({
      ...s,
      sets: sessionSetsMap[s.id] || s.sets || [],
    }));
  }, [displayedSessions, sessionSetsMap]);

  const filteredNutritionDays = useMemo(() => {
    if (timeRange === 'all') return nutritionDays;
    const now = new Date();
    const days = timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = normalizeDateStr(cutoff);
    return nutritionDays.filter((d) => d.date >= cutoffStr);
  }, [nutritionDays, timeRange]);

  return (
    <div className="space-y-5">
      {/* Mutation Error Notification */}
      <StatusBanner
        message={mutationError}
        tone="error"
        testId="history-mutation-error"
        icon={<AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button
            type="button"
            onClick={() => setMutationError(null)}
            className="p-1 min-w-[44px] min-h-[44px] text-rose-400 hover:text-white flex items-center justify-center"
          >
            ✕
          </button>
        }
      />


      {isCoachMode && selectedAthleteId && (
        <div
          data-testid="coach-inspection-banner"
          className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="truncate min-w-0">
              <div className="text-[10px] uppercase font-bold text-zinc-400">Coach Inspection Mode</div>
              <div className="text-xs font-bold text-white truncate">
                {inspectMode === 'athlete' ? (
                  <>
                    Viewing Athlete: <span className="text-cyan-300 font-extrabold">{selectedAthlete?.name}</span> (Read-Only)
                  </>
                ) : (
                  <span className="text-zinc-400">Viewing My Personal History</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingMealLog(null);
              setEditingSet(null);
              setInspectMode((prev) => (prev === 'athlete' ? 'coach' : 'athlete'));
            }}
            data-testid="toggle-inspect-mode-btn"
            className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition touch-manipulation flex items-center justify-center shrink-0"
          >
            {inspectMode === 'athlete' ? 'Switch to My History' : 'Switch to Athlete'}
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

        {/* Time Window Range Navigation (DIR-B1: allows navigating full history beyond 90 days) */}
        <div className="bg-zinc-950/70 p-1 rounded-2xl border border-zinc-800/80 flex gap-1 overflow-x-auto text-[11px]">
          <button
            type="button"
            onClick={() => setTimeRange('all')}
            data-testid="history-range-all"
            className={`flex-1 py-1.5 px-3 min-h-[44px] rounded-xl font-bold transition whitespace-nowrap ${
              timeRange === 'all'
                ? 'bg-zinc-800 text-cyan-300 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white bg-transparent'
            }`}
          >
            All History
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('90d')}
            data-testid="history-range-90d"
            className={`flex-1 py-1.5 px-3 min-h-[44px] rounded-xl font-bold transition whitespace-nowrap ${
              timeRange === '90d'
                ? 'bg-zinc-800 text-cyan-300 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white bg-transparent'
            }`}
          >
            Past 90 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('30d')}
            data-testid="history-range-30d"
            className={`flex-1 py-1.5 px-3 min-h-[44px] rounded-xl font-bold transition whitespace-nowrap ${
              timeRange === '30d'
                ? 'bg-zinc-800 text-cyan-300 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white bg-transparent'
            }`}
          >
            Past 30 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('1y')}
            data-testid="history-range-1y"
            className={`flex-1 py-1.5 px-3 min-h-[44px] rounded-xl font-bold transition whitespace-nowrap ${
              timeRange === '1y'
                ? 'bg-zinc-800 text-cyan-300 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white bg-transparent'
            }`}
          >
            Past Year
          </button>
        </div>
      </div>

      {/* History Domain Content */}
      <StatusBanner
        title={isReadError ? 'Failed to load history data' : null}
        message={isReadError ? readErrorMessage : null}
        tone="error"
        testId="history-read-error"
        className="mb-4"
        icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button
            type="button"
            onClick={handleRetryHistory}
            data-testid="retry-history-btn"
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Retry</span>
          </button>
        }
      />
      {!isReadError && (
        historyDomain === 'nutrition' ? (
          <NutritionHistoryTimeline
            filteredNutritionDays={filteredNutritionDays}
            timeRange={timeRange}
            isInspectingAthlete={isInspectingAthlete}
            onEditMeal={setEditingMealLog}
            onDeleteMeal={(id) => deleteMealMutation.mutate(id)}
            onScaleMeal={(m, items) => scaleMealMutation.mutateAsync({ log: m, items })}
          />
        ) : viewMode === 'session' ? (
          <WorkoutSessionHistory
            displayedSessions={displayedSessionsWithSets}
            filteredSessionsCount={filteredSessions.length}
            exercises={exercises}
            timeRange={timeRange}
            isInspectingAthlete={isInspectingAthlete}
            onEditSet={setEditingSet}
            onLoadMore={loadMoreWorkouts}
            hasMore={hasMoreWorkouts}
            isLoadingMore={isLoadingMore}
            expandedSessionIds={expandedSessionIds}
            onToggleExpand={handleToggleExpand}
            loadingSessionIds={loadingSessionIds}
          />
        ) : (
          <WorkoutExerciseHistory
            exerciseStats={exerciseStats}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onSelectedCategoryChange={setSelectedCategory}
            isInspectingAthlete={isInspectingAthlete}
            onEditSet={setEditingSet}
          />
        )
      )}


      {/* Edit Meal Modal */}
      <EditMealModal
        isOpen={!!editingMealLog}
        meal={editingMealLog}
        onClose={() => setEditingMealLog(null)}
        targetUserId={targetUserId}
      />

      {/* Edit Set Modal */}
      <EditSetModal
        isOpen={!!editingSet}
        set={editingSet}
        exercises={exercises}
        onClose={() => {
          const workoutId = editingSet?.workout_id;
          if (workoutId) {
            setSessionSetsMap((prev) => {
              const next = { ...prev };
              delete next[workoutId];
              return next;
            });
          }
          setEditingSet(null);
        }}
        targetUserId={targetUserId}
      />
    </div>
  );
};

export default HistoryView;

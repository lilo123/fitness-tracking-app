import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import type { WorkoutSet, NutritionLog, Exercise } from '../../types/database';
import { Calendar, Dumbbell, Activity, Utensils, AlertCircle, Shield, RotateCcw } from 'lucide-react';
import { EditMealSheet } from '../nutrition/EditMealSheet';
import { EditSetSheet } from '../sets/EditSetSheet';
import { UndoToast } from '../common/UndoToast';
import { useHistorySetDeferredDelete } from './useHistorySetDeferredDelete';
import { CoachContext } from '../../context/CoachContextTypes';
import { NutritionHistoryTimeline, type NutritionDaySummary } from './NutritionHistoryTimeline';
import { WorkoutSessionHistory } from './WorkoutSessionHistory';
import { ExerciseStatsList } from './ExerciseStatsList';
import { useHistoryData } from './useHistoryData';
import {
  useWorkoutHistory,
  useExerciseStats,
  fetchSessionSets,
  type HistorySet,
  type HistoryRange,
} from './useWorkoutHistory';
import { StatusBanner } from '../common/StatusBanner';
import { SegmentedTabs } from '../common/SegmentedTabs';
import { groupNutritionDays } from '../../utils/nutritionDayGrouping';
import { DEFAULT_EXERCISES_LIST } from '../../utils/ghostSets';
import { supabase } from '../../lib/supabase';
import { normalizeDateStr } from '../../utils/ghostSets';

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
  const [timeRange, setTimeRange] = useState<HistoryRange>('all');

  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [loadingSessionIds, setLoadingSessionIds] = useState<Set<string>>(new Set());
  const [sessionErrorIds, setSessionErrorIds] = useState<Set<string>>(new Set());
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

  const effectiveTimeZone = isInspectingAthlete
    ? selectedAthlete?.timezone || undefined
    : undefined;

  // H3: Reset expansion/sets maps and auto-expand ref when targetUserId changes
  React.useEffect(() => {
    setSessionSetsMap({});
    setExpandedSessionIds(new Set());
    setLoadingSessionIds(new Set());
    setSessionErrorIds(new Set());
    hasAutoExpandedRef.current = false;
  }, [targetUserId]);

  // Workout History hook (v2 RPC, keyset pagination, range filtering)
  const {
    sessions,
    totalCount,
    hasMore,
    loadMore,
    isLoadingMore,
    loadMoreError,
    isSessionsPending,
    isSessionsError,
    sessionsError,
    refetchSessions,
    deleteSession,
    isDeletingSession,
  } = useWorkoutHistory(targetUserId, timeRange, effectiveTimeZone);

  // Nutrition Data hook (retains only nutrition fields)
  const {
    nutritionLogs,
    deleteMealMutation,
    scaleMealMutation,
    isNutritionLogsError,
    nutritionLogsError,
    refetchNutritionLogs,
  } = useHistoryData(targetUserId, setMutationError);

  // Fetch exercises catalog
  const {
    data: exercises = DEFAULT_EXERCISES_LIST,
    refetch: refetchExercises,
  } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, body_part, is_master')
        .order('name')
        .limit(1000);
      if (error) throw error;
      if (!data || data.length === 0) return DEFAULT_EXERCISES_LIST;
      return data as Exercise[];
    },
    staleTime: 5 * 60 * 1000,
  });

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
      ? (isSessionsError || isExerciseStatsError)
      : isSessionsError;

  const activeError =
    historyDomain === 'nutrition'
      ? nutritionLogsError
      : isExerciseView
      ? (sessionsError || exerciseStatsError)
      : sessionsError;

  const readErrorMessage =
    activeError instanceof Error
      ? activeError.message
      : 'Unable to load history data. Please try again.';

  const handleRetryHistory = () => {
    if (historyDomain === 'nutrition') {
      void refetchNutritionLogs();
    } else {
      void refetchSessions();
      void refetchExercises();
      if (isExerciseView) {
        void refetchExerciseStats();
      }
    }
  };

  // H6: Per-session set-fetch error handling
  const loadSetsForSession = React.useCallback(async (sessionId: string) => {
    setSessionErrorIds((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
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
          workout_date: session?.civil_date || session?.date || '',
          workout_name: session?.name || 'Workout Session',
        };
      });
      setSessionSetsMap((prev) => ({ ...prev, [sessionId]: enrichedSets }));
    } catch (err) {
      console.error('Failed to load sets for session:', err);
      setSessionErrorIds((prev) => new Set(prev).add(sessionId));
    } finally {
      setLoadingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, [queryClient, sessions, targetUserId]);

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

  // Auto-expand budget logic (HD-1)
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

  const nutritionDays = useMemo<NutritionDaySummary[]>(() => {
    return groupNutritionDays(nutritionLogs, effectiveTimeZone);
  }, [nutritionLogs, effectiveTimeZone]);

  // H9: sessions is server-filtered; no client-side date filtering!
  const {
    handleDeleteSetRequested,
    handleSetSaved,
    displayedSessionsWithSets,
    flushDelete: flushSetDelete,
    toastItem: setDeleteToastItem,
  } = useHistorySetDeferredDelete({
    targetUserId,
    exercises,
    sessions,
    displayedSessions: sessions,
    sessionSetsMap,
    setSessionSetsMap,
    setEditingSet,
    setMutationError,
  });

  const filteredNutritionDays = useMemo(() => {
    if (timeRange === 'all') return nutritionDays;
    const now = new Date();
    const days = timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = normalizeDateStr(cutoff, effectiveTimeZone);
    return nutritionDays.filter((d) => d.date >= cutoffStr);
  }, [nutritionDays, timeRange, effectiveTimeZone]);

  return (
    <div className="space-y-5">
      {/* Mutation Error Notification (H33: Dismiss aria-label) */}
      <StatusBanner
        message={mutationError}
        tone="error"
        testId="history-mutation-error"
        icon={<AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button
            type="button"
            onClick={() => setMutationError(null)}
            aria-label="Dismiss"
            className="p-1 min-w-[44px] min-h-[44px] text-rose-400 hover:text-white flex items-center justify-center cursor-pointer"
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
              <div className="text-xs uppercase font-bold text-zinc-400">Coach Inspection Mode</div>
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
            className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition touch-manipulation flex items-center justify-center shrink-0 cursor-pointer"
          >
            {inspectMode === 'athlete' ? 'Switch to My History' : 'Switch to Athlete'}
          </button>
        </div>
      )}

      {/* Header Banner & Dual Domain Switcher */}
      <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/20 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          {/* H33: Exactly one h1 heading on the page */}
          <h1 className="text-base font-black text-white uppercase tracking-wider">
            {historyDomain === 'workouts' ? 'Workout History' : 'Nutrition History'}
          </h1>
        </div>
        <p className="text-xs text-zinc-400">
          {historyDomain === 'workouts'
            ? 'Review past workout sessions, personal records, and volume.'
            : 'Review daily caloric distribution, macronutrient breakdowns, and logged meals.'}
        </p>

        {/* H12: Top-Level Domain Segmented Control via SegmentedTabs */}
        <SegmentedTabs
          ariaLabel="History domain"
          tabs={[
            {
              id: 'workouts',
              label: 'Workouts',
              icon: <Dumbbell className="w-4 h-4" />,
              testId: 'history-tab-workouts',
              activeClassName: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-neon-cyan',
            },
            {
              id: 'nutrition',
              label: 'Nutrition',
              icon: <Utensils className="w-4 h-4" />,
              testId: 'history-tab-nutrition',
              activeClassName: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-neon-emerald',
            },
          ]}
          activeTab={historyDomain}
          onChange={(tab) => setHistoryDomain(tab as 'workouts' | 'nutrition')}
        />

        {/* H12: Sub-view switcher for Workouts via SegmentedTabs */}
        {historyDomain === 'workouts' && (
          <SegmentedTabs
            ariaLabel="Workout view mode"
            size="sm"
            className="bg-zinc-950/60 p-1 rounded-xl border border-zinc-800/80"
            tabs={[
              {
                id: 'session',
                label: 'By Session',
                icon: <Calendar className="w-3.5 h-3.5" />,
                testId: 'history-subview-session',
                activeClassName: 'bg-zinc-800 text-cyan-300 border border-border-interactive',
              },
              {
                id: 'exercise',
                label: 'By Exercise',
                icon: <Dumbbell className="w-3.5 h-3.5" />,
                testId: 'history-subview-exercise',
                activeClassName: 'bg-zinc-800 text-cyan-300 border border-border-interactive',
              },
            ]}
            activeTab={viewMode}
            onChange={(tab) => setViewMode(tab as 'session' | 'exercise')}
          />
        )}

        {/* H5 & H34: Date chips fit 320px width; hidden in By-Exercise with 'All-time stats' caption */}
        {isExerciseView ? (
          <div data-testid="all-time-stats-caption" className="text-xs font-bold text-zinc-400 tracking-wider uppercase py-1">
            All-time stats
          </div>
        ) : (
          <div className="bg-zinc-950/70 p-1 rounded-2xl border border-zinc-800/80 flex gap-1 overflow-x-auto text-xs no-scrollbar">
            {(
              [
                { id: 'all', label: 'All' },
                { id: '1y', label: '1Y' },
                { id: '90d', label: '90D' },
                { id: '30d', label: '30D' },
              ] as const
            ).map((range) => {
              const isSelected = timeRange === range.id;
              return (
                <button
                  key={range.id}
                  type="button"
                  onClick={() => setTimeRange(range.id)}
                  aria-pressed={isSelected}
                  data-testid={`history-range-${range.id}`}
                  className={`flex-1 py-1.5 px-3 min-h-[44px] rounded-xl font-bold transition whitespace-nowrap touch-manipulation cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-800 text-cyan-300 border border-border-interactive shadow-sm'
                      : 'text-zinc-400 hover:text-white bg-transparent'
                  }`}
                >
                  {range.label}
                </button>
              );
            })}
          </div>
        )}
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
            filteredSessionsCount={sessions.length}
            totalCount={totalCount}
            exercises={exercises}
            timeRange={timeRange}
            isInspectingAthlete={isInspectingAthlete}
            isSessionsPending={isSessionsPending}
            onEditSet={setEditingSet}
            onLoadMore={loadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            loadMoreError={loadMoreError}
            expandedSessionIds={expandedSessionIds}
            onToggleExpand={handleToggleExpand}
            loadingSessionIds={loadingSessionIds}
            sessionErrorIds={sessionErrorIds}
            onRetrySessionSets={loadSetsForSession}
            onDeleteSession={deleteSession}
            isDeletingSession={isDeletingSession}
            onClearFilters={() => setTimeRange('all')}
          />
        ) : (
          <ExerciseStatsList
            exercises={exercises}
            rawExerciseStats={rawExerciseStats}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onSelectedCategoryChange={setSelectedCategory}
            isInspectingAthlete={isInspectingAthlete}
            onEditSet={setEditingSet}
          />
        )
      )}

      {/* Edit Meal Sheet */}
      <EditMealSheet
        isOpen={!!editingMealLog}
        meal={editingMealLog}
        onClose={() => setEditingMealLog(null)}
        targetUserId={targetUserId}
        nutritionLogs={nutritionLogs}
        timeZone={effectiveTimeZone}
      />

      {/* Undo Toast for deferred set deletion */}
      <UndoToast
        toast={setDeleteToastItem}
        onDismiss={flushSetDelete}
      />

      {/* Edit Set Sheet */}
      <EditSetSheet
        isOpen={!!editingSet}
        set={editingSet}
        exercises={exercises}
        onClose={() => setEditingSet(null)}
        onSaved={handleSetSaved}
        onDeleteRequested={handleDeleteSetRequested}
        targetUserId={targetUserId}
      />
    </div>
  );
};

export default HistoryView;

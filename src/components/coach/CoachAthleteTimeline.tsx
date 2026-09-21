import React from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Exercise, SetType } from '../../types/database';
import { formatShortDate } from '../../utils/date';
import { groupSessionSetsByExercise } from '../../utils/historyGrouping';
import {
  Activity,
  Calendar,
  Dumbbell,
  ChevronDown,
  Flame,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';
import { FALLBACK_WINDOW } from '../history/virtualizationConstants';

export interface CoachWorkoutSet {
  id?: string;
  workout_id?: string;
  workout_date?: string;
  workout_name?: string;
  exercise_name?: string;
  exercise_id?: string;
  set_type?: SetType;
  set_index?: number | null;
  set_order?: number;
  weight?: number;
  weight_lbs?: number;
  reps?: number;
  created_at?: string;
  exercise?: { id?: string; name: string; body_part?: string | null } | null;
}

export interface CoachWorkoutSession {
  id: string;
  date?: string;
  name?: string | null;
  sets?: CoachWorkoutSet[];
}

export interface CoachNutritionLog {
  id: string;
  user_id?: string;
  food_name: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  logged_at?: string;
}

export interface TimelineDay {
  date: string;
  workouts: CoachWorkoutSession[];
  nutrition: CoachNutritionLog[];
}

export interface CoachAthleteProfile {
  id?: string;
  username?: string | null;
  email?: string | null;
  target_calories?: number | null;
  target_protein?: number | null;
  target_carbs?: number | null;
  target_fat?: number | null;
  target_fiber?: number | null;
}

export interface CoachAthleteTimelineProps {
  selectedAthleteId: string;
  selectedAthlete: { name?: string } | null;
  timelineDays: TimelineDay[];
  athleteWorkoutsWithSets: CoachWorkoutSession[];
  athleteProfile?: CoachAthleteProfile | null;
  exercises: Exercise[];
  expandedExercises: Record<string, boolean>;
  onToggleExercise: (key: string) => void;
  onLoadOlderDays: () => void;
  isWorkoutsError?: boolean;
  workoutsError?: unknown;
  onRetryWorkouts?: () => void;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

export const CoachAthleteTimeline: React.FC<CoachAthleteTimelineProps> = ({
  selectedAthleteId,
  selectedAthlete,
  timelineDays,
  athleteWorkoutsWithSets,
  athleteProfile,
  exercises,
  expandedExercises,
  onToggleExercise,
  onLoadOlderDays,
  isWorkoutsError,
  workoutsError,
  onRetryWorkouts,
  isError,
  error,
  onRetry,
}) => {
  const hasError = Boolean(isWorkoutsError ?? isError);
  const activeError = workoutsError ?? error;
  const handleRetry = onRetryWorkouts ?? onRetry;

  const parentRef = React.useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);

  React.useLayoutEffect(() => {
    if (parentRef.current) {
      setScrollMargin(parentRef.current.offsetTop);
    }
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: timelineDays.length,
    estimateSize: (index) => {
      const day = timelineDays[index];
      const workoutsCount = day?.workouts?.length ?? 1;
      const nutritionCount = day?.nutrition?.length ?? 0;
      return 100 + workoutsCount * 140 + nutritionCount * 80;
    },
    overscan: 0,
    gap: 16,
    scrollMargin,
    measureElement: (element, entry) => {
      if (entry?.borderBoxSize?.[0]?.blockSize) {
        return Math.round(entry.borderBoxSize[0].blockSize);
      }
      const measured = element?.getBoundingClientRect?.()?.height;
      if (measured && measured > 0) {
        return Math.round(measured);
      }
      const index = Number(element?.getAttribute('data-index'));
      const day = timelineDays[index];
      const workoutsCount = day?.workouts?.length ?? 1;
      const nutritionCount = day?.nutrition?.length ?? 0;
      return 100 + workoutsCount * 140 + nutritionCount * 80;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();
  const isVirtual = virtualItems.length > 0;

  const renderTimelineDay = (day: TimelineDay) => {
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
                {day.workouts.map((w: CoachWorkoutSession) => {
                  const totalVol = (w.sets || []).reduce(
                    (acc: number, s: CoachWorkoutSet) => acc + (Number(s.weight) || 0) * (Number(s.reps) || 0),
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
                                  onClick={() => onToggleExercise(exKey)}
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
                                    {g.sets.map((s, sIdx: number) => (
                                      <div
                                        key={s.id || sIdx}
                                        className="flex items-center justify-between text-[10px] text-zinc-400 font-mono px-2 py-1 bg-zinc-900/60 rounded-lg"
                                      >
                                        <span className="text-zinc-500 font-medium">
                                          Set {s.set_index ?? s.set_order ?? sIdx + 1}
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
                      {day.nutrition.map((n: CoachNutritionLog) => (
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
  };

  const athleteErrorMessage = activeError instanceof Error
    ? activeError.message
    : typeof activeError === 'string'
    ? activeError
    : (activeError as unknown as { message?: string })?.message || 'Unable to load athlete workout history. Please try again.';
  const showTimelineError = Boolean(selectedAthleteId && hasError);

  return (
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

      <StatusBanner
        title={showTimelineError ? 'Failed to load athlete workouts' : null}
        message={showTimelineError ? athleteErrorMessage : null}
        tone="error"
        testId="coach-timeline-error"
        icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          handleRetry ? (
            <button
              type="button"
              onClick={handleRetry}
              data-testid="retry-athlete-workouts-btn"
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Retry</span>
            </button>
          ) : undefined
        }
      />

      {!selectedAthleteId ? (
        <div className="p-6 text-center text-zinc-400 text-xs">
          Select an athlete above to view their training history and nutrition timeline.
        </div>
      ) : hasError ? null : timelineDays.length === 0 ? (
        <div className="p-6 text-center text-zinc-400 text-xs">
          No workouts or nutrition logged for this athlete yet.
        </div>
      ) : (
        <div className="space-y-4">
          {!isVirtual ? (
            <div ref={parentRef} className="space-y-4">
              {timelineDays.length > FALLBACK_WINDOW && (
                <div
                  data-testid="virtualizer-fallback-notice"
                  className="text-xs text-zinc-500 text-center py-2 font-mono"
                >
                  Showing first {FALLBACK_WINDOW} of {timelineDays.length} (virtualization disabled)
                </div>
              )}
              {timelineDays.slice(0, FALLBACK_WINDOW).map((day) => (
                <div key={day.date}>
                  {renderTimelineDay(day)}
                </div>
              ))}
            </div>
          ) : (
            <div
              ref={parentRef}
              style={{
                position: 'relative',
                width: '100%',
                height: `${virtualizer.getTotalSize()}px`,
              }}
            >
              {virtualItems.map((virtualRow) => {
                const day = timelineDays[virtualRow.index];
                if (!day) return null;
                return (
                  <div
                    key={day.date || virtualRow.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                    }}
                  >
                    {renderTimelineDay(day)}
                  </div>
                );
              })}
            </div>
          )}

          {/* Load Older Days Button */}
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={onLoadOlderDays}
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
  );
};

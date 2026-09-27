import React, { useState, useMemo } from 'react';
import type { Exercise, WorkoutSet } from '../../types/database';
import { Search, Trophy } from 'lucide-react';
import { formatShortDate, normalizeDateStr } from '../../utils/date';
import { normalizeSearch } from '../../utils/normalizeSearch';
import { resolveExerciseLabel } from '../../utils/exerciseLabel';
import { useAuth } from '../../hooks/useAuth';
import { Tag } from '../common/Tag';
import { ExerciseSparkline } from './ExerciseSparkline';
import { ExerciseHistorySheet } from './ExerciseHistorySheet';
import type { RawExerciseStat } from './useWorkoutHistory';

const CATEGORIES = ['All', 'Chest', 'Back', 'Arms', 'Shoulders', 'Legs', 'Core'];

export interface ExerciseStat {
  exercise: Exercise;
  sets: any[];
  maxWeight: number;
  prReps: number;
  setCount?: number;
  prDate?: string | null;
}

export interface ExerciseStatsListProps {
  exerciseStats?: ExerciseStat[];
  exercises?: Exercise[];
  rawExerciseStats?: RawExerciseStat[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  selectedCategory: string;
  onSelectedCategoryChange: (cat: string) => void;
  isInspectingAthlete: boolean;
  onEditSet: (set: WorkoutSet & { workout_date?: string; workout_name?: string }) => void;
  userId?: string;
  timeZone?: string;
  isReadOnly?: boolean;
}

function formatExerciseSetDate(dateStr: string): string {
  if (!dateStr) return '';
  const norm = normalizeDateStr(dateStr);
  const parts = norm.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const currentYear = new Date().getFullYear();
  const shortDate = formatShortDate(norm);
  if (!isNaN(year) && year !== currentYear) {
    return `${shortDate}, ${year}`;
  }
  return shortDate;
}

export const ExerciseStatsList: React.FC<ExerciseStatsListProps> = ({
  exerciseStats: initialStats,
  exercises = [],
  rawExerciseStats = [],
  searchQuery,
  onSearchQueryChange,
  selectedCategory,
  onSelectedCategoryChange,
  isInspectingAthlete,
  onEditSet,
  userId,
  timeZone,
  isReadOnly,
}) => {
  const { user } = useAuth();
  const effectiveUserId = userId || user?.id || '';
  const effectiveReadOnly = isReadOnly ?? isInspectingAthlete;

  const [showUnlogged, setShowUnlogged] = useState(false);
  const [selectedStatForSheet, setSelectedStatForSheet] = useState<ExerciseStat | null>(null);

  // Group by exercise for workouts using RPC + catalog merge
  const computedStats = useMemo<ExerciseStat[]>(() => {
    if (initialStats) return initialStats;

    const stats: Record<string, ExerciseStat> = {};

    exercises.forEach((ex) => {
      stats[ex.id] = {
        exercise: ex,
        sets: [],
        maxWeight: 0,
        prReps: 0,
        setCount: 0,
      };
    });

    rawExerciseStats.forEach((row) => {
      let match: ExerciseStat | undefined = stats[row.exercise_id];
      if (!match) {
        match = Object.values(stats).find((s) => s.exercise.name === row.exercise_id);
      }
      if (match) {
        match.setCount = Number(row.set_count) || 0;
        match.maxWeight = Number(row.max_weight) || 0;
        match.prReps = Number(row.pr_reps) || 0;
        match.prDate = row.pr_date || null;
        match.sets = Array.isArray(row.recent_sets) ? row.recent_sets : [];
        if (row.exercise_name && (!match.exercise.name || match.exercise.name === match.exercise.id)) {
          match.exercise.name = row.exercise_name;
        }
      } else {
        const name = row.exercise_name || resolveExerciseLabel(row.exercise_id);
        stats[row.exercise_id] = {
          exercise: { id: row.exercise_id, name, body_part: 'Other' },
          sets: Array.isArray(row.recent_sets) ? row.recent_sets : [],
          maxWeight: Number(row.max_weight) || 0,
          prReps: Number(row.pr_reps) || 0,
          prDate: row.pr_date || null,
          setCount: Number(row.set_count) || 0,
        };
      }
    });

    return Object.values(stats);
  }, [initialStats, exercises, rawExerciseStats]);

  const isLogged = (stat: ExerciseStat) =>
    (stat.setCount != null && stat.setCount > 0) || (stat.sets && stat.sets.length > 0);

  const getLastPerformedDate = (stat: ExerciseStat): string => {
    if (stat.sets && stat.sets.length > 0) {
      const last = stat.sets[stat.sets.length - 1];
      return last.workout_date || '';
    }
    return stat.prDate || '';
  };

  // Filter stats by category and normalized search
  const filteredStats = computedStats.filter((stat) => {
    if (selectedCategory !== 'All') {
      const bp = stat.exercise.body_part || '';
      if (!bp.toLowerCase().includes(selectedCategory.toLowerCase())) return false;
    }
    if (searchQuery.trim()) {
      const normalizedQuery = normalizeSearch(searchQuery);
      const normalizedName = normalizeSearch(stat.exercise.name);
      if (!normalizedName.includes(normalizedQuery)) return false;
    }
    return true;
  });

  const loggedExercises = filteredStats
    .filter((s) => isLogged(s))
    .sort((a, b) => {
      const dateA = getLastPerformedDate(a);
      const dateB = getLastPerformedDate(b);
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return a.exercise.name.localeCompare(b.exercise.name);
    });

  const unloggedExercises = filteredStats.filter((s) => !isLogged(s));
  const isSearching = Boolean(searchQuery.trim());

  const getSparklinePoints = (stat: ExerciseStat): number[] => {
    if (!stat.sets || stat.sets.length < 2) return [];
    const sessionBestMap = new Map<string, number>();
    for (const s of stat.sets) {
      const key = s.workout_date || s.id || '';
      const w = Number(s.weight) || 0;
      const cur = sessionBestMap.get(key) ?? 0;
      if (w > cur) sessionBestMap.set(key, w);
    }
    if (sessionBestMap.size >= 2) {
      return Array.from(sessionBestMap.values());
    }
    return [];
  };

  const renderExerciseCard = (stat: ExerciseStat, idx: number) => {
    const totalSets = stat.setCount ?? stat.sets.length;
    const sparklinePoints = getSparklinePoints(stat);

    return (
      <div
        key={stat.exercise.id || stat.exercise.name || idx}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={() => setSelectedStatForSheet(stat)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedStatForSheet(stat);
          }
        }}
        className="w-full text-left bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/80 rounded-3xl p-5 shadow-2xl space-y-3 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-cyan-500/50 touch-manipulation"
        data-testid={`exercise-card-${stat.exercise.id || stat.exercise.name || idx}`}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 gap-2">
          {/* H21-ex: min-w-0 truncate + title, H51: body part via Tag */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3
              className="text-sm font-bold text-white truncate"
              title={stat.exercise.name}
            >
              {stat.exercise.name}
            </h3>
            <div>
              <Tag
                label={stat.exercise.body_part || 'Full Body'}
                tone="info"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* H42: sparkline on card when >=2 points */}
            {sparklinePoints.length >= 2 && (
              <ExerciseSparkline
                points={sparklinePoints}
                width={60}
                height={22}
                className="text-cyan-400 shrink-0"
              />
            )}

            {/* H47: PR line shows formatted pr_date */}
            {totalSets > 0 ? (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-2xl text-amber-400 text-xs font-bold shrink-0">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span>
                  PR: {stat.maxWeight > 0 ? `${stat.maxWeight} lbs` : 'Bodyweight'} × {stat.prReps}
                  {stat.prDate ? ` · ${formatExerciseSetDate(stat.prDate)}` : ''}
                </span>
              </div>
            ) : (
              <span className="text-xs text-zinc-400 shrink-0">No logs yet</span>
            )}
          </div>
        </div>

        {/* H37: 'All-time: N sets · Last 3:' + year when not current year */}
        {totalSets > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-extrabold uppercase text-zinc-400 tracking-wider block mb-1">
              All-time: {totalSets} sets · Last 3:
            </span>
            <div className="space-y-1">
              {stat.sets.slice(-3).map((s, sIdx) => (
                <div
                  key={s.id || sIdx}
                  className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="text-zinc-400">{formatExerciseSetDate(s.workout_date)}</span>
                  <span className="text-cyan-300 font-bold tabular-nums">
                    {s.weight} lbs × {s.reps} reps
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Exercise Filter Bar */}
      <div className="space-y-2">
        {/* H36: search input text-base min-h-[44px] bg-zinc-950 cyan focus ring */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search exercise library..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-2xl pl-10 pr-4 py-2.5 text-base min-h-[44px] font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectedCategoryChange(cat)}
              aria-pressed={selectedCategory === cat}
              className={`px-3.5 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-bold shrink-0 transition touch-manipulation cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-cyan-500 text-black shadow-neon-cyan'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-border-interactive'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise Cards */}
      {filteredStats.length === 0 ? (
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 text-center text-zinc-400 text-xs">
          No exercises found.
        </div>
      ) : isSearching ? (
        // When searching, render all matching exercises directly
        <div className="space-y-3">
          {filteredStats.map((stat, idx) => renderExerciseCard(stat, idx))}
        </div>
      ) : (
        // Logged exercises first, unlogged behind divider toggle
        <div className="space-y-3">
          {loggedExercises.map((stat, idx) => renderExerciseCard(stat, idx))}

          {unloggedExercises.length > 0 && (
            <div className="pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowUnlogged((prev) => !prev)}
                aria-expanded={showUnlogged}
                data-testid="toggle-unlogged-exercises"
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900/60 hover:bg-zinc-800/60 border border-zinc-800 flex items-center justify-between transition touch-manipulation cursor-pointer"
              >
                <span>Unlogged Exercises ({unloggedExercises.length})</span>
                <span className="text-xs text-zinc-400">
                  {showUnlogged ? 'Hide' : 'Show'}
                </span>
              </button>

              {showUnlogged && (
                <div className="space-y-3 mt-3">
                  {unloggedExercises.map((stat, idx) => renderExerciseCard(stat, idx))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Exercise History Drill-Down Sheet (H8) */}
      <ExerciseHistorySheet
        open={Boolean(selectedStatForSheet)}
        onClose={() => setSelectedStatForSheet(null)}
        userId={effectiveUserId}
        exercise={selectedStatForSheet ? selectedStatForSheet.exercise : null}
        prDate={selectedStatForSheet?.prDate}
        prWeight={selectedStatForSheet?.maxWeight}
        prReps={selectedStatForSheet?.prReps}
        isReadOnly={effectiveReadOnly}
        timeZone={timeZone}
        onEditSet={onEditSet}
      />
    </div>
  );
};

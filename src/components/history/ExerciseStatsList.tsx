import React, { useState, useMemo } from 'react';
import type { Exercise, WorkoutSet } from '../../types/database';
import { Search, Trophy, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { formatShortDate } from '../../utils/ghostSets';
import { normalizeSearch } from '../../utils/normalizeSearch';
import { resolveExerciseLabel } from '../../utils/exerciseLabel';
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
}) => {
  const [showUnlogged, setShowUnlogged] = useState(false);

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

  const renderExerciseCard = (stat: ExerciseStat, idx: number) => {
    const totalSets = stat.setCount ?? stat.sets.length;
    return (
      <div
        key={stat.exercise.id || stat.exercise.name || idx}
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">{stat.exercise.name}</h3>
            <span className="text-xs bg-zinc-800 text-cyan-400 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">
              {stat.exercise.body_part || 'Full Body'}
            </span>
          </div>
          {totalSets > 0 ? (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-2xl text-amber-400 text-xs font-bold">
              <Trophy className="w-3.5 h-3.5" />
              <span>
                PR: {stat.maxWeight > 0 ? `${stat.maxWeight} lbs` : 'Bodyweight'} × {stat.prReps}
              </span>
            </div>
          ) : (
            <span className="text-xs text-zinc-400">No logs yet</span>
          )}
        </div>

        {totalSets > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-extrabold uppercase text-zinc-400 tracking-wider block mb-1">
              Recent Activity ({totalSets} sets):
            </span>
            <div className="space-y-1">
              {stat.sets.slice(-3).map((s, sIdx) => (
                <div
                  key={s.id || sIdx}
                  className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="text-zinc-400">{formatShortDate(s.workout_date)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-300 font-bold">
                      {s.weight} lbs × {s.reps} reps
                    </span>
                    {!isInspectingAthlete && (
                      <button
                        type="button"
                        onClick={() => onEditSet(s)}
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800/70 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation cursor-pointer"
                        title="Edit set"
                        aria-label={`Edit recent set of ${stat.exercise.name}`}
                        data-testid={`edit-recent-set-btn-${s.id || sIdx}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search exercise library..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full bg-zinc-900 border border-border-interactive text-white rounded-2xl pl-10 pr-4 py-2.5 text-xs font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none"
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
                <span>
                  {showUnlogged
                    ? 'Hide unlogged exercises'
                    : `Show ${unloggedExercises.length} unlogged exercises`}
                </span>
                {showUnlogged ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showUnlogged && (
                <div className="mt-3 space-y-3">
                  {unloggedExercises.map((stat, idx) => renderExerciseCard(stat, idx))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Exercise, WorkoutSet } from '../../types/database';
import { Search, Trophy, Edit2 } from 'lucide-react';
import { formatShortDate } from '../../utils/ghostSets';
import { FALLBACK_WINDOW } from './virtualizationConstants';

const CATEGORIES = ['All', 'Chest', 'Back', 'Arms', 'Shoulders', 'Legs', 'Core'];

export interface ExerciseStat {
  exercise: Exercise;
  sets: any[];
  maxWeight: number;
  prReps: number;
  setCount?: number;
}

interface WorkoutExerciseHistoryProps {
  exerciseStats: ExerciseStat[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  selectedCategory: string;
  onSelectedCategoryChange: (cat: string) => void;
  isInspectingAthlete: boolean;
  onEditSet: (set: WorkoutSet & { workout_date?: string; workout_name?: string }) => void;
}

export const WorkoutExerciseHistory: React.FC<WorkoutExerciseHistoryProps> = ({
  exerciseStats,
  searchQuery,
  onSearchQueryChange,
  selectedCategory,
  onSelectedCategoryChange,
  isInspectingAthlete,
  onEditSet,
}) => {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);

  React.useLayoutEffect(() => {
    if (parentRef.current) {
      setScrollMargin(parentRef.current.offsetTop);
    }
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: exerciseStats.length,
    estimateSize: () => 140,
    overscan: 1,
    gap: 12,
    scrollMargin,
    measureElement: (element, entry) => {
      if (entry?.borderBoxSize?.[0]?.blockSize) {
        return Math.round(entry.borderBoxSize[0].blockSize);
      }
      const measured = element?.getBoundingClientRect?.()?.height;
      return (measured && measured > 0) ? Math.round(measured) : 140;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();
  const isVirtual = virtualItems.length > 0;

  const renderExerciseCard = (stat: ExerciseStat, idx: number) => {
    const totalSets = stat.setCount ?? stat.sets.length;
    return (
    <div
      key={stat.exercise.name || idx}
      className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h3 className="text-sm font-black text-white">{stat.exercise.name}</h3>
          <span className="text-[10px] bg-zinc-800 text-cyan-400 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">
            {stat.exercise.body_part || 'Full Body'}
          </span>
        </div>
        {totalSets > 0 ? (
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-2xl text-amber-400 text-xs font-black font-mono">
            <Trophy className="w-3.5 h-3.5" />
            <span>
              PR: {stat.maxWeight > 0 ? `${stat.maxWeight} lbs` : 'Bodyweight'} × {stat.prReps}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-zinc-500 font-mono">No logs yet</span>
        )}
      </div>

      {totalSets > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider block mb-1">
            Recent Activity ({totalSets} sets):
          </span>
          <div className="space-y-1">
            {stat.sets.slice(-3).map((s, sIdx) => (
              <div
                key={s.id || sIdx}
                className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs font-mono"
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
                      className="min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800/70 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation"
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
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search exercise library..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-2xl pl-10 pr-4 py-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectedCategoryChange(cat)}
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
      {exerciseStats.length === 0 ? (
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 text-center text-zinc-500 text-xs">
          No exercises found.
        </div>
      ) : !isVirtual ? (
        <div ref={parentRef} className="space-y-3">
          {exerciseStats.length > FALLBACK_WINDOW && (
            <div
              data-testid="virtualizer-fallback-notice"
              className="text-xs text-zinc-500 text-center py-2 font-mono"
            >
              Showing first {FALLBACK_WINDOW} of {exerciseStats.length} (virtualization disabled)
            </div>
          )}
          {exerciseStats.slice(0, FALLBACK_WINDOW).map((stat, idx) => renderExerciseCard(stat, idx))}
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
            const stat = exerciseStats[virtualRow.index];
            if (!stat) return null;
            return (
              <div
                key={stat.exercise.id || stat.exercise.name || virtualRow.key}
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
                {renderExerciseCard(stat, virtualRow.index)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

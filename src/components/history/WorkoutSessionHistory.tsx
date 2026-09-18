import React from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { WorkoutSet, Exercise } from '../../types/database';
import { formatShortDate } from '../../utils/ghostSets';
import { groupSessionSetsByExercise } from '../../utils/historyGrouping';
import { Dumbbell, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { FALLBACK_WINDOW } from './virtualizationConstants';

export interface HistorySession {
  id: string;
  date: string;
  name: string;
  set_count?: number;
  total_volume?: number;
  sets?: (WorkoutSet & { workout_date: string; workout_name: string })[];
}

interface WorkoutSessionHistoryProps {
  displayedSessions: HistorySession[];
  filteredSessionsCount: number;
  exercises: Exercise[];
  timeRange: 'all' | '90d' | '30d' | '1y';
  isInspectingAthlete: boolean;
  onEditSet: (set: WorkoutSet & { workout_date?: string; workout_name?: string }) => void;
  onLoadMore: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  expandedSessionIds?: Set<string>;
  onToggleExpand?: (sessionId: string) => void;
  loadingSessionIds?: Set<string>;
}

export const WorkoutSessionHistory: React.FC<WorkoutSessionHistoryProps> = ({
  displayedSessions,
  filteredSessionsCount,
  exercises,
  timeRange,
  isInspectingAthlete,
  onEditSet,
  onLoadMore,
  hasMore,
  isLoadingMore,
  expandedSessionIds,
  onToggleExpand,
  loadingSessionIds,
}) => {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);
  const [internalExpandedIds, setInternalExpandedIds] = React.useState<Set<string>>(() => {
    if (expandedSessionIds !== undefined) return new Set();
    return new Set(displayedSessions.filter((s) => s.sets && s.sets.length > 0).map((s) => s.id));
  });

  const isSessionExpanded = (id: string) => {
    if (expandedSessionIds !== undefined) {
      return expandedSessionIds.has(id);
    }
    return internalExpandedIds.has(id);
  };

  const handleToggle = (id: string) => {
    if (onToggleExpand) {
      onToggleExpand(id);
    } else {
      setInternalExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  React.useLayoutEffect(() => {
    if (parentRef.current) {
      setScrollMargin(parentRef.current.offsetTop);
    }
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: displayedSessions.length,
    estimateSize: (index) => {
      const session = displayedSessions[index];
      if (!session) return 96;
      const isExpanded = isSessionExpanded(session.id);
      if (!isExpanded) return 96;
      const setsCount = session.sets?.length ?? session.set_count ?? 1;
      return 150 + setsCount * 48;
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
      const session = displayedSessions[index];
      if (!session) return 96;
      const isExpanded = isSessionExpanded(session.id);
      if (!isExpanded) return 96;
      const setsCount = session.sets?.length ?? session.set_count ?? 1;
      return 150 + setsCount * 48;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();
  const isVirtual = virtualItems.length > 0;

  if (displayedSessions.length === 0) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 text-center text-zinc-500 text-xs">
        {timeRange === 'all'
          ? 'No workout sessions recorded yet.'
          : 'No workout sessions recorded in this time range.'}
      </div>
    );
  }

  const renderSessionCard = (session: HistorySession) => {
    const isExpanded = isSessionExpanded(session.id);
    const isLoadingSets = loadingSessionIds?.has(session.id);
    const setCount = session.set_count ?? session.sets?.length ?? 0;
    const totalVolume =
      session.total_volume ??
      session.sets?.reduce(
        (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
        0
      ) ??
      0;
    const sets = session.sets || [];

    return (
      <div
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-sm font-black text-white">{session.name || 'Workout Session'}</h3>
            <div className="text-[11px] font-mono text-cyan-400 mt-0.5">
              {formatShortDate(session.date)} ({session.date})
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-amber-400">
                {totalVolume > 0 ? `${totalVolume.toLocaleString()} lbs volume` : '0 lbs (BW)'}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                {setCount} sets completed
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggle(session.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? `Collapse ${session.name || 'workout'}` : `Expand ${session.name || 'workout'}`}
              data-testid={`expand-session-btn-${session.id}`}
              className="min-w-[36px] min-h-[36px] rounded-xl bg-zinc-800/60 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-3 pt-1">
            {isLoadingSets ? (
              <div className="py-4 text-center text-xs text-zinc-500 animate-pulse">
                Loading sets...
              </div>
            ) : sets.length === 0 ? (
              <div className="py-3 text-center text-xs text-zinc-500">
                No sets recorded for this workout.
              </div>
            ) : (
              <>
                {sets.length >= 500 && (
                  <div
                    data-testid={`session-truncation-warning-${session.id}`}
                    className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-400 text-xs font-mono"
                  >
                    Note: Reached maximum display limit of 500 sets for this workout.
                  </div>
                )}
                {groupSessionSetsByExercise(sets, exercises).map((group) => (
                  <div
                    key={group.exerciseName}
                    className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Dumbbell className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-extrabold text-white text-xs truncate">
                          {group.exerciseName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800/90 text-zinc-300 border border-zinc-700/60 shrink-0">
                          {group.bodyPart}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono font-bold text-amber-400/90 shrink-0 ml-2">
                        {group.totalVolume > 0 ? `${group.totalVolume.toLocaleString()} lbs` : '0 lbs (BW)'}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {group.sets.map((set, sIdx) => {
                        const setNumber = (set.set_index != null && set.set_index > 0) ? set.set_index : (sIdx + 1);
                        return (
                          <div
                            key={set.id || sIdx}
                            className="bg-zinc-900/90 border border-zinc-800/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs"
                          >
                            <div className="font-mono text-[11px] text-zinc-400 font-bold">
                              SET {setNumber}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="font-mono font-bold text-cyan-300">
                                {set.weight} lbs × {set.reps} reps
                                {set.rpe != null && (
                                  <span className="text-zinc-500 ml-1 text-[10px]">@{set.rpe}</span>
                                )}
                              </div>
                              {!isInspectingAthlete && (
                                <button
                                  type="button"
                                  onClick={() => onEditSet(set)}
                                  className="min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800/70 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation"
                                  title="Edit set"
                                  aria-label={`Edit set ${setNumber} of ${group.exerciseName}`}
                                  data-testid={`edit-set-btn-${set.id || sIdx}`}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {!isVirtual ? (
        <div ref={parentRef} className="space-y-4">
          {displayedSessions.length > FALLBACK_WINDOW && (
            <div
              data-testid="virtualizer-fallback-notice"
              className="text-xs text-zinc-500 text-center py-2 font-mono"
            >
              Showing first {FALLBACK_WINDOW} of {displayedSessions.length} (virtualization disabled)
            </div>
          )}
          {displayedSessions.slice(0, FALLBACK_WINDOW).map((session) => (
            <div key={session.id}>
              {renderSessionCard(session)}
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
            const session = displayedSessions[virtualRow.index];
            if (!session) return null;
            return (
              <div
                key={session.id || virtualRow.key}
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
                {renderSessionCard(session)}
              </div>
            );
          })}
        </div>
      )}
      {Boolean(hasMore ?? (filteredSessionsCount > displayedSessions.length)) && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            data-testid="load-more-sessions-btn"
            className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-zinc-800/80 hover:bg-zinc-700 text-cyan-300 border border-zinc-700/80 transition touch-manipulation disabled:opacity-50"
          >
            {isLoadingMore
              ? 'Loading...'
              : `Load More Sessions (${displayedSessions.length}${hasMore ? '+' : ''})`}
          </button>
        </div>
      )}
    </div>
  );
};

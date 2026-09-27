import React, { useState } from 'react';
import { useNavigate, useInRouterContext } from 'react-router-dom';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { WorkoutSet, Exercise } from '../../types/database';
import { formatShortDate } from '../../utils/ghostSets';
import { groupSessionSetsByExercise } from '../../utils/historyGrouping';
import { Dumbbell, Edit2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { FALLBACK_WINDOW, HISTORY_OVERSCAN } from './virtualizationConstants';
import { Card } from '../common/Card';
import { Skeleton } from '../common/Skeleton';
import { StatusBanner } from '../common/StatusBanner';
import { OverflowMenu, type OverflowMenuItem } from '../common/OverflowMenu';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { HistorySession } from './useWorkoutHistory';

export type { HistorySession };

export interface WorkoutSessionHistoryProps {
  displayedSessions: HistorySession[];
  filteredSessionsCount?: number;
  totalCount?: number | null;
  exercises: Exercise[];
  timeRange: 'all' | '90d' | '30d' | '1y';
  isInspectingAthlete: boolean;
  isSessionsPending?: boolean;
  onEditSet: (set: WorkoutSet & { workout_date?: string; workout_name?: string }) => void;
  onLoadMore: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  expandedSessionIds?: Set<string>;
  onToggleExpand?: (sessionId: string) => void;
  loadingSessionIds?: Set<string>;
  sessionErrorIds?: Set<string>;
  onRetrySessionSets?: (sessionId: string) => void;
  onDeleteSession?: (workoutId: string) => Promise<void>;
  isDeletingSession?: boolean;
  onClearFilters?: () => void;
  onNavigate?: (path: string) => void;
}

const RouterNavigateBridge = React.forwardRef<((to: string) => void) | null>((_, ref) => {
  const navigate = useNavigate();
  React.useImperativeHandle(ref, () => navigate);
  return null;
});

export const WorkoutSessionHistory: React.FC<WorkoutSessionHistoryProps> = ({
  displayedSessions,
  totalCount,
  exercises,
  timeRange,
  isInspectingAthlete,
  isSessionsPending = false,
  onEditSet,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  loadMoreError = null,
  expandedSessionIds,
  onToggleExpand,
  loadingSessionIds,
  sessionErrorIds,
  onRetrySessionSets,
  onDeleteSession,
  isDeletingSession = false,
  onClearFilters,
  onNavigate,
}) => {
  const inRouter = useInRouterContext();
  const navigateRef = React.useRef<((to: string) => void) | null>(null);
  const navigate = React.useCallback(
    (to: string) => {
      if (onNavigate) {
        onNavigate(to);
      } else if (navigateRef.current) {
        navigateRef.current(to);
      } else if (typeof window !== 'undefined') {
        window.location.assign(to);
      }
    },
    [onNavigate]
  );

  const parentRef = React.useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);
  const [sessionToDelete, setSessionToDelete] = useState<HistorySession | null>(null);

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

  const measureScrollMargin = React.useCallback(() => {
    if (parentRef.current) {
      const offsetTop = parentRef.current.offsetTop;
      setScrollMargin((prev) => (prev !== offsetTop ? offsetTop : prev));
    }
  }, []);

  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    parentRef.current = node;
    if (node) {
      const offsetTop = node.offsetTop;
      setScrollMargin((prev) => (prev !== offsetTop ? offsetTop : prev));
    }
  }, []);

  React.useLayoutEffect(() => {
    measureScrollMargin();
  });

  React.useEffect(() => {
    measureScrollMargin();
    window.addEventListener('resize', measureScrollMargin);
    if (typeof ResizeObserver !== 'undefined' && document.body) {
      const observer = new ResizeObserver(() => {
        measureScrollMargin();
      });
      observer.observe(document.body);
      return () => {
        window.removeEventListener('resize', measureScrollMargin);
        observer.disconnect();
      };
    }
    return () => {
      window.removeEventListener('resize', measureScrollMargin);
    };
  }, [measureScrollMargin]);

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
    overscan: HISTORY_OVERSCAN,
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

  // H7: 3 Skeleton cards while initial fetch is pending
  if (isSessionsPending) {
    return (
      <div data-testid="history-sessions-skeleton" className="space-y-4">
        <Skeleton variant="card" count={3} />
      </div>
    );
  }

  // H20 & H18: Empty state only when settled and totalCount / displayed is 0
  if (displayedSessions.length === 0) {
    const isFiltered = timeRange !== 'all';
    return (
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 text-center space-y-4">
        {inRouter && <RouterNavigateBridge ref={navigateRef} />}
        <p className="text-zinc-400 text-xs">
          {isFiltered
            ? 'No workout sessions recorded in this time range.'
            : 'No workout sessions recorded yet.'}
        </p>
        {isFiltered ? (
          <button
            type="button"
            onClick={onClearFilters}
            data-testid="clear-filters-btn"
            className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-border-interactive transition touch-manipulation cursor-pointer"
          >
            Clear filters
          </button>
        ) : !isInspectingAthlete ? (
          <button
            type="button"
            onClick={() => navigate('/workout')}
            data-testid="start-workout-cta"
            className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-neon-cyan transition touch-manipulation cursor-pointer"
          >
            Start a workout
          </button>
        ) : null}
      </div>
    );
  }

  const renderSessionCard = (session: HistorySession) => {
    const isExpanded = isSessionExpanded(session.id);
    const isLoadingSets = loadingSessionIds?.has(session.id);
    const isErrorSets = sessionErrorIds?.has(session.id);
    const setCount = session.set_count ?? session.sets?.length ?? 0;
    const totalVolume =
      session.total_volume ??
      session.sets?.reduce(
        (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
        0
      ) ??
      0;
    const sets = session.sets || [];

    const civilDate = session.civil_date || session.workout_date || (session.date ? String(session.date).split('T')[0] : '');

    const overflowItems: OverflowMenuItem[] = [
      {
        label: 'Edit in Workout',
        onSelect: () => navigate(`/workout?date=${civilDate}`),
        testId: `edit-session-${session.id}`,
      },
      {
        label: 'Delete session',
        onSelect: () => setSessionToDelete(session),
        tone: 'danger',
        testId: `delete-session-${session.id}`,
      },
    ];

    return (
      <Card
        className="rounded-3xl p-5 shadow-2xl space-y-3"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 gap-2">
          {/* H21: min-w-0 flex-1 truncate session title at 320px */}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-white truncate">{session.name || 'Workout Session'}</h3>
            <div className="text-xs font-mono text-cyan-400 mt-0.5">
              {formatShortDate(civilDate)}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-amber-400">
                {totalVolume > 0 ? `${totalVolume.toLocaleString()} lbs volume` : '0 lbs (BW)'}
              </div>
              <div className="text-xs text-zinc-400 font-mono">
                {setCount} sets completed
              </div>
            </div>

            {/* H45: Session overflow menu, hidden when isInspectingAthlete */}
            {!isInspectingAthlete && (
              <OverflowMenu
                ariaLabel={`Session actions for ${session.name || 'workout'}`}
                items={overflowItems}
                testId={`session-actions-${session.id}`}
              />
            )}

            {/* H33: Session expander with aria-controls */}
            <button
              type="button"
              onClick={() => handleToggle(session.id)}
              aria-expanded={isExpanded}
              aria-controls={`session-details-${session.id}`}
              aria-label={isExpanded ? `Collapse ${session.name || 'workout'}` : `Expand ${session.name || 'workout'}`}
              data-testid={`expand-session-btn-${session.id}`}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-800/60 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div id={`session-details-${session.id}`} className="space-y-3 pt-1">
            {isLoadingSets ? (
              <div className="py-4 text-center text-xs text-zinc-400 animate-pulse">
                Loading sets...
              </div>
            ) : isErrorSets ? (
              /* H6: Per-session set-fetch error + Retry */
              <div className="py-3 px-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
                <span>Failed to load sets for this workout.</span>
                <button
                  type="button"
                  onClick={() => onRetrySessionSets?.(session.id)}
                  data-testid={`retry-session-sets-btn-${session.id}`}
                  className="px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold flex items-center gap-1.5 transition touch-manipulation cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            ) : sets.length === 0 ? (
              <div className="py-3 text-center text-xs text-zinc-400">
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
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-zinc-800/90 text-zinc-300 border border-zinc-700/60 shrink-0">
                          {group.bodyPart}
                        </span>
                      </div>
                      <div className="text-xs font-mono font-bold text-amber-400/90 shrink-0 ml-2">
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
                            <div className="font-mono text-xs text-zinc-400 font-bold">
                              SET {setNumber}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="font-mono font-bold text-cyan-300">
                                {set.weight} lbs × {set.reps} reps
                                {set.rpe != null && (
                                  <span className="text-zinc-400 ml-1 text-xs">@{set.rpe}</span>
                                )}
                              </div>
                              {!isInspectingAthlete && (
                                <button
                                  type="button"
                                  onClick={() => onEditSet(set)}
                                  className="min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800/70 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation cursor-pointer"
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
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {inRouter && <RouterNavigateBridge ref={navigateRef} />}
      {/* H6: Surface load-more errors in StatusBanner */}
      {loadMoreError && (
        <StatusBanner
          title="Failed to load more sessions"
          message={loadMoreError.message}
          tone="error"
          testId="history-load-more-error"
          action={
            <button
              type="button"
              onClick={onLoadMore}
              data-testid="retry-load-more-btn"
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Retry</span>
            </button>
          }
        />
      )}

      {/* H31: Showing N of M sessions counter */}
      <div data-testid="showing-sessions-count" className="text-xs text-zinc-400 text-center">
        {totalCount != null
          ? `Showing ${displayedSessions.length} of ${totalCount} sessions`
          : `Showing ${displayedSessions.length} sessions`}
      </div>

      {!isVirtual ? (
        <div ref={containerRef} className="space-y-4">
          {displayedSessions.length > FALLBACK_WINDOW && (
            <div
              data-testid="virtualizer-fallback-notice"
              className="text-xs text-zinc-400 text-center py-2 font-mono"
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
          ref={containerRef}
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

      {/* H9, H31: Load More button ONLY while hasMore */}
      {hasMore && displayedSessions.length > 0 && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            data-testid="load-more-sessions-btn"
            className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-zinc-800/80 hover:bg-zinc-700 text-cyan-300 border border-border-interactive transition touch-manipulation disabled:opacity-50 cursor-pointer"
          >
            {isLoadingMore
              ? 'Loading...'
              : `Load More Sessions (${displayedSessions.length}${totalCount != null ? ` of ${totalCount}` : '+'})`}
          </button>
        </div>
      )}

      {/* H45: Session delete confirmation dialog */}
      <ConfirmDialog
        isOpen={Boolean(sessionToDelete)}
        title="Delete Workout Session"
        consequence={`Are you sure you want to delete "${sessionToDelete?.name || 'Workout Session'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        isLoading={isDeletingSession}
        onConfirm={async () => {
          if (sessionToDelete && onDeleteSession) {
            await onDeleteSession(sessionToDelete.id);
            setSessionToDelete(null);
          }
        }}
        onCancel={() => setSessionToDelete(null)}
        testId="delete-session-confirm-dialog"
      />
    </div>
  );
};

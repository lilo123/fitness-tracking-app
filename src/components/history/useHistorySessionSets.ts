import { useState, useEffect, useCallback, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { fetchSessionSets, type HistorySession, type HistorySet } from './useWorkoutHistory';

export interface UseHistorySessionSetsOptions {
  targetUserId: string;
  sessions: HistorySession[];
  queryClient: QueryClient;
}

export function useHistorySessionSets({
  targetUserId,
  sessions,
  queryClient,
}: UseHistorySessionSetsOptions) {
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [loadingSessionIds, setLoadingSessionIds] = useState<Set<string>>(new Set());
  const [sessionErrorIds, setSessionErrorIds] = useState<Set<string>>(new Set());
  const [sessionSetsMap, setSessionSetsMap] = useState<Record<string, HistorySet[]>>({});
  const lastAutoExpandedUserIdRef = useRef<string | null>(null);

  // H3: Reset expansion/sets maps when targetUserId changes
  const [prevUserId, setPrevUserId] = useState(targetUserId);
  if (prevUserId !== targetUserId) {
    setPrevUserId(targetUserId);
    setSessionSetsMap({});
    setExpandedSessionIds(new Set());
    setLoadingSessionIds(new Set());
    setSessionErrorIds(new Set());
  }

  // H6: Per-session set-fetch error handling
  const loadSetsForSession = useCallback(async (sessionId: string) => {
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
        let exName = s.exercise_name || (s as { exercise?: { name?: string } }).exercise?.name;
        if (!exName && s.exercise_id && targetUserId) {
          const ninetySets = queryClient.getQueryData<Array<{ id?: string; exercise_id?: string; exercise_name?: string }>>(['workout_sets', targetUserId, '90d']);
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

  const handleToggleExpand = useCallback((sessionId: string) => {
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
  useEffect(() => {
    if (lastAutoExpandedUserIdRef.current === targetUserId || !sessions || sessions.length === 0) return;
    lastAutoExpandedUserIdRef.current = targetUserId;

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
      queueMicrotask(() => {
        setExpandedSessionIds(new Set(toExpand));
        toExpand.forEach((sessionId) => {
          void loadSetsForSession(sessionId);
        });
      });
    }
  }, [targetUserId, sessions, loadSetsForSession]);

  return {
    expandedSessionIds,
    loadingSessionIds,
    sessionErrorIds,
    sessionSetsMap,
    setSessionSetsMap,
    loadSetsForSession,
    handleToggleExpand,
  };
}

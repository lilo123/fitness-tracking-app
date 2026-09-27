import React, { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { WorkoutSet, Exercise } from "../../types/database";
import { useDeferredDelete } from "../common/useDeferredDelete";
import type { UndoToastItem } from "../common/UndoToast";
import type { HistorySet } from "./useHistoryData";

export interface UseHistorySetDeferredDeleteOptions {
  targetUserId?: string;
  exercises: Exercise[];
  sessions: any[];
  displayedSessions: any[];
  sessionSetsMap: Record<string, HistorySet[]>;
  setSessionSetsMap: React.Dispatch<React.SetStateAction<Record<string, HistorySet[]>>>;
  setEditingSet: (set: (WorkoutSet & { workout_date?: string; workout_name?: string }) | null) => void;
  setMutationError: (msg: string | null) => void;
}

export function useHistorySetDeferredDelete({
  targetUserId,
  exercises,
  sessions,
  displayedSessions,
  sessionSetsMap,
  setSessionSetsMap,
  setEditingSet,
  setMutationError,
}: UseHistorySetDeferredDeleteOptions) {
  const queryClient = useQueryClient();

  const { pending, schedule, undo, flush } = useDeferredDelete<WorkoutSet>({
    commit: async (item) => {
      if (!item.id) return;
      const { error } = await supabase.from("sets").delete().eq("id", item.id);
      if (error) {
        setMutationError(error.message || "Failed to delete set.");
        throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["workout_sets"] });
      queryClient.invalidateQueries({ queryKey: ["history_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["exercise_stats"] });
      queryClient.invalidateQueries({ queryKey: ["session_sets"] });
      if (targetUserId) {
        queryClient.invalidateQueries({ queryKey: ["workout_sets", targetUserId] });
        queryClient.invalidateQueries({ queryKey: ["history_sessions", targetUserId] });
        queryClient.invalidateQueries({ queryKey: ["exercise_stats", targetUserId] });
      }
      const workoutId = item.workout_id;
      if (workoutId) {
        setSessionSetsMap((prev) => {
          if (!prev[workoutId]) return prev;
          return {
            ...prev,
            [workoutId]: prev[workoutId].filter((s) => s.id !== item.id),
          };
        });
      }
    },
    durationMs: 6000,
  });

  const handleDeleteSetRequested = useCallback(
    (set: WorkoutSet) => {
      setEditingSet(null);
      const label = set.exercise_name || "Workout set";
      schedule(set, label);
    },
    [schedule, setEditingSet]
  );

  const handleSetSaved = useCallback(
    (updated: WorkoutSet) => {
      const workoutId = updated.workout_id;
      if (workoutId) {
        setSessionSetsMap((prev) => {
          const existing = prev[workoutId] || sessions.find((s) => s.id === workoutId)?.sets || [];
          const nextSets = existing.map((s) =>
            s.id === updated.id
              ? {
                  ...s,
                  ...updated,
                  exercise_name:
                    exercises.find((e) => e.id === updated.exercise_id)?.name ||
                    s.exercise_name,
                }
              : s
          );
          return { ...prev, [workoutId]: nextSets };
        });
      }
      setEditingSet(null);
    },
    [exercises, sessions, setEditingSet, setSessionSetsMap]
  );

  const displayedSessionsWithSets = useMemo(() => {
    const pendingId = pending?.item.id;
    return displayedSessions.map((s) => {
      const rawSets = sessionSetsMap[s.id] || s.sets || [];
      const sets = pendingId ? rawSets.filter((item) => item.id !== pendingId) : rawSets;
      return {
        ...s,
        sets,
      };
    });
  }, [displayedSessions, sessionSetsMap, pending]);

  const toastItem: UndoToastItem | null = useMemo(() => {
    if (!pending) return null;
    const set = pending.item;
    const name = set.exercise_name || "Workout set";
    const detail =
      set.weight !== undefined && set.weight !== null && Number(set.weight) > 0
        ? `${set.weight} lbs × ${set.reps}`
        : `${set.reps} reps`;
    return {
      verb: "Set deleted",
      subject: name,
      detail,
      onUndo: undo,
      undoAriaLabel: `Undo delete ${name}`,
    };
  }, [pending, undo]);

  return {
    pendingDelete: pending,
    handleDeleteSetRequested,
    handleSetSaved,
    displayedSessionsWithSets,
    flushDelete: flush,
    toastItem,
  };
}

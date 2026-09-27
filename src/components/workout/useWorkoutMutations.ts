import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Exercise } from '../../types/database';
import { restTimerStore } from '../../utils/restTimerStore';
import { workoutSessionStore } from '../../utils/workoutSessionStore';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateWorkoutDerived } from '../../lib/invalidate';
import {
  getOrCreateWorkout,
  insertSet,
  batchInsertSets,
  deleteSet,
} from '../../lib/sets';
import { isUUID } from './workoutEngineHelpers';

export interface UseWorkoutMutationsOptions {
  targetUserId: string;
  workoutDate: string;
  activeRoutineName: string;
  exercises: Exercise[];
  autoRestTimer: boolean;
  setMutationError: (err: string | null) => void;
  onDraftSuccess?: (variables: {
    exerciseName?: string;
    exerciseId?: string;
    setIndex: number;
  }) => void;
}

export function useWorkoutMutations({
  targetUserId,
  workoutDate,
  activeRoutineName,
  exercises,
  autoRestTimer,
  setMutationError,
  onDraftSuccess,
}: UseWorkoutMutationsOptions) {
  const queryClient = useQueryClient();

  const resolveUserId = async (): Promise<string> => {
    if (targetUserId) return targetUserId;
    const { data: authData } = await supabase.auth.getUser();
    const resolved = authData?.user?.id || '';
    if (!resolved) throw new Error('Authenticated user required to log workout');
    return resolved;
  };

  const resolveExerciseId = (exerciseIdentifier: string): string => {
    if (!exerciseIdentifier) {
      throw new Error('Exercise identifier required');
    }
    const matchedEx = exercises.find(
      (e) =>
        e.id === exerciseIdentifier ||
        e.name.toLowerCase() === exerciseIdentifier.toLowerCase()
    );
    const exerciseId = matchedEx ? matchedEx.id : isUUID(exerciseIdentifier) ? exerciseIdentifier : null;
    if (!exerciseId) {
      throw new Error(`Exercise "${exerciseIdentifier}" cannot be resolved to a valid UUID.`);
    }
    return exerciseId;
  };

  const logSetMutation = useMutation({
    mutationFn: async (payload: {
      exerciseName?: string;
      exerciseId?: string;
      weight: number;
      reps: number;
      setIndex: number;
      setType?: 'working' | 'warmup' | 'drop';
      rpe?: number | null;
    }) => {
      const effectiveUserId = await resolveUserId();
      const exerciseId = payload.exerciseId
        ? payload.exerciseId
        : resolveExerciseId(payload.exerciseName || '');

      const workoutId = await getOrCreateWorkout(
        supabase,
        effectiveUserId,
        workoutDate,
        activeRoutineName
      );

      const loggedSet = await insertSet(supabase, workoutId, {
        exerciseId,
        weight: payload.weight,
        reps: payload.reps,
        setIndex: payload.setIndex,
        setType: payload.setType || 'working',
        rpe: payload.rpe ?? null,
      });

      return loggedSet;
    },
    onMutate: async (newSetPayload) => {
      const effectiveUserId = targetUserId || '';
      const dateKey = queryKeys.workoutSets.byDate(effectiveUserId, workoutDate);
      const ninetyKey = queryKeys.workoutSets.recent90d(effectiveUserId);
      const workoutsKey = queryKeys.workouts.byDate(effectiveUserId, workoutDate);

      await queryClient.cancelQueries({ queryKey: dateKey });
      await queryClient.cancelQueries({ queryKey: ninetyKey });
      await queryClient.cancelQueries({ queryKey: workoutsKey });

      const prevDateData = queryClient.getQueryData(dateKey);
      const prevNinetyData = queryClient.getQueryData(ninetyKey);
      const prevWorkoutsData = queryClient.getQueryData(workoutsKey);

      let resolvedExId = newSetPayload.exerciseId;
      if (!resolvedExId && newSetPayload.exerciseName) {
        try {
          resolvedExId = resolveExerciseId(newSetPayload.exerciseName);
        } catch {
          resolvedExId = '';
        }
      }

      const optimisticRow = {
        id: `optimistic-${Date.now()}`,
        workout_id: 'pending',
        exercise_id: resolvedExId || '',
        exercise_name: newSetPayload.exerciseName || '',
        weight: newSetPayload.weight,
        reps: newSetPayload.reps,
        set_index: newSetPayload.setIndex,
        set_type: newSetPayload.setType || 'working',
        rpe: newSetPayload.rpe ?? null,
        created_at: new Date().toISOString(),
        workout_date: workoutDate,
        civil_date: workoutDate,
      };

      if (prevDateData && Array.isArray(prevDateData)) {
        queryClient.setQueryData(dateKey, [...prevDateData, optimisticRow]);
      }
      if (prevNinetyData && Array.isArray(prevNinetyData)) {
        queryClient.setQueryData(ninetyKey, [...prevNinetyData, optimisticRow]);
      }
      if (prevWorkoutsData && Array.isArray(prevWorkoutsData)) {
        queryClient.setQueryData(workoutsKey, [...prevWorkoutsData, optimisticRow]);
      }

      return { prevDateData, prevNinetyData, prevWorkoutsData, dateKey, ninetyKey, workoutsKey };
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.dateKey && context.prevDateData !== undefined) {
        queryClient.setQueryData(context.dateKey, context.prevDateData);
      }
      if (context?.ninetyKey && context.prevNinetyData !== undefined) {
        queryClient.setQueryData(context.ninetyKey, context.prevNinetyData);
      }
      if (context?.workoutsKey && context.prevWorkoutsData !== undefined) {
        queryClient.setQueryData(context.workoutsKey, context.prevWorkoutsData);
      }
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to log set. Please try again.';
      setMutationError(message);
    },
    onSuccess: (_data, variables) => {
      const effectiveUserId = targetUserId || '';
      const exId = variables.exerciseId || (variables.exerciseName ? exercises.find(e => e.name.toLowerCase() === variables.exerciseName?.toLowerCase())?.id : '');
      if (exId) {
        workoutSessionStore.clearDraft(effectiveUserId, workoutDate, exId, variables.setIndex);
      }
      if (variables.exerciseName) {
        workoutSessionStore.clearDraft(effectiveUserId, workoutDate, variables.exerciseName, variables.setIndex);
      }
      if (onDraftSuccess) {
        onDraftSuccess(variables);
      }
      if (autoRestTimer) {
        restTimerStore.start(90);
      }
    },
    onSettled: async () => {
      await invalidateWorkoutDerived(queryClient, targetUserId);
    },
  });

  const batchLogSetsMutation = useMutation({
    mutationFn: async (
      setsToLog: {
        exerciseName?: string;
        exerciseId?: string;
        weight: number;
        reps: number;
        setIndex: number;
        setType?: 'working' | 'warmup' | 'drop';
        rpe?: number | null;
      }[]
    ) => {
      if (setsToLog.length === 0) return [];
      const effectiveUserId = await resolveUserId();

      const workoutId = await getOrCreateWorkout(
        supabase,
        effectiveUserId,
        workoutDate,
        activeRoutineName
      );

      const payloads = setsToLog.map((s) => {
        const exerciseId = s.exerciseId || resolveExerciseId(s.exerciseName || '');
        return {
          exerciseId,
          weight: s.weight,
          reps: s.reps,
          setIndex: s.setIndex,
          setType: s.setType || 'working',
          rpe: s.rpe ?? null,
        };
      });

      return await batchInsertSets(supabase, workoutId, payloads);
    },
    onSuccess: (_data, variables) => {
      const effectiveUserId = targetUserId || '';
      for (const s of variables) {
        const exId = s.exerciseId || (s.exerciseName ? exercises.find(e => e.name.toLowerCase() === s.exerciseName?.toLowerCase())?.id : '');
        if (exId) {
          workoutSessionStore.clearDraft(effectiveUserId, workoutDate, exId, s.setIndex);
        }
        if (s.exerciseName) {
          workoutSessionStore.clearDraft(effectiveUserId, workoutDate, s.exerciseName, s.setIndex);
        }
        if (onDraftSuccess) {
          onDraftSuccess(s);
        }
      }
      if (autoRestTimer) {
        restTimerStore.start(90);
      }
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to log sets. Please try again.';
      setMutationError(message);
    },
    onSettled: async () => {
      await invalidateWorkoutDerived(queryClient, targetUserId);
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      await deleteSet(supabase, setId);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to delete set. Please try again.';
      setMutationError(message);
    },
    onSettled: async () => {
      await invalidateWorkoutDerived(queryClient, targetUserId);
    },
  });

  return {
    logSetMutation,
    batchLogSetsMutation,
    deleteSetMutation,
  };
}

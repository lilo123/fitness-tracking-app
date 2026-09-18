import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Exercise } from '../../types/database';
import { restTimerStore } from '../../utils/restTimerStore';
import { isUUID } from './workoutEngineHelpers';

export interface UseWorkoutMutationsOptions {
  targetUserId: string;
  workoutDate: string;
  activeRoutineName: string;
  exercises: Exercise[];
  autoRestTimer: boolean;
  setMutationError: (err: string | null) => void;
}

export function useWorkoutMutations({
  targetUserId,
  workoutDate,
  activeRoutineName,
  exercises,
  autoRestTimer,
  setMutationError,
}: UseWorkoutMutationsOptions) {
  const queryClient = useQueryClient();

  const getOrCreateWorkout = async (): Promise<string> => {
    let effectiveUserId = targetUserId;
    if (!effectiveUserId) {
      const { data: authData } = await supabase.auth.getUser();
      effectiveUserId = authData?.user?.id || '';
    }
    if (!effectiveUserId) throw new Error('Authenticated user required to log workout');

    const startOfDay = `${workoutDate}T00:00:00.000Z`;
    const endOfDay = `${workoutDate}T23:59:59.999Z`;

    const workoutQuery = supabase
      .from('workouts')
      .select('id')
      .eq('user_id', effectiveUserId)
      .limit(1);

    const res = await workoutQuery.gte('date', startOfDay).lte('date', endOfDay);
    const existingWorkouts = res?.data;

    if (existingWorkouts && existingWorkouts.length > 0) {
      return existingWorkouts[0].id;
    }

    const { data: newWorkout, error: nwErr } = await supabase
      .from('workouts')
      .insert([
        {
          user_id: effectiveUserId,
          name: activeRoutineName,
          date: workoutDate,
        },
      ])
      .select('id')
      .single();

    if (nwErr || !newWorkout) {
      throw new Error(nwErr?.message || 'Failed to create workout');
    }
    return newWorkout.id;
  };

  const logSetMutation = useMutation({
    mutationFn: async (payload: {
      exerciseName: string;
      weight: number;
      reps: number;
      setIndex: number;
    }) => {
      const workoutId = await getOrCreateWorkout();

      const matchedEx = exercises.find(
        (e) => e.name.toLowerCase() === payload.exerciseName.toLowerCase() || e.id === payload.exerciseName
      );
      const exerciseId = matchedEx ? matchedEx.id : (isUUID(payload.exerciseName) ? payload.exerciseName : null);
      if (!exerciseId) {
        throw new Error(`Exercise "${payload.exerciseName}" cannot be resolved to a valid UUID.`);
      }

      const { data: loggedSet, error: sErr } = await supabase
        .from('sets')
        .insert([
          {
            workout_id: workoutId,
            exercise_id: exerciseId,
            set_index: payload.setIndex,
            set_type: 'working',
            weight: payload.weight,
            reps: payload.reps,
            rpe: null,
          },
        ])
        .select()
        .single();

      if (sErr) throw sErr;
      return loggedSet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      if (autoRestTimer) {
        restTimerStore.start(90);
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to log set. Please try again.';
      setMutationError(message);
    },
  });

  const batchLogSetsMutation = useMutation({
    mutationFn: async (
      setsToLog: {
        exerciseName: string;
        weight: number;
        reps: number;
        setIndex: number;
      }[]
    ) => {
      if (setsToLog.length === 0) return [];
      const workoutId = await getOrCreateWorkout();

      const payloads = setsToLog
        .map((s) => {
          const matchedEx = exercises.find(
            (e) => e.name.toLowerCase() === s.exerciseName.toLowerCase() || e.id === s.exerciseName
          );
          const exerciseId = matchedEx ? matchedEx.id : (isUUID(s.exerciseName) ? s.exerciseName : null);
          if (!exerciseId) return null;
          return {
            workout_id: workoutId,
            exercise_id: exerciseId,
            set_index: s.setIndex,
            set_type: 'working',
            weight: s.weight,
            reps: s.reps,
            rpe: null,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (payloads.length === 0) {
        if (setsToLog.length > 0) {
          throw new Error(`Exercise "${setsToLog[0].exerciseName}" cannot be resolved to a valid UUID.`);
        }
        return [];
      }
      if (payloads.length < setsToLog.length) {
        const unresolvable = setsToLog.find((s) => {
          const matchedEx = exercises.find(
            (e) => e.name.toLowerCase() === s.exerciseName.toLowerCase() || e.id === s.exerciseName
          );
          return !(matchedEx || isUUID(s.exerciseName));
        });
        if (unresolvable) {
          throw new Error(`Exercise "${unresolvable.exerciseName}" cannot be resolved to a valid UUID.`);
        }
      }

      const { data, error } = await supabase.from('sets').insert(payloads).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      if (autoRestTimer) {
        restTimerStore.start(90);
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to log sets. Please try again.';
      setMutationError(message);
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      const { error } = await supabase.from('sets').delete().eq('id', setId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to delete set. Please try again.';
      setMutationError(message);
    },
  });

  return {
    logSetMutation,
    batchLogSetsMutation,
    deleteSetMutation,
  };
}

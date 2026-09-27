import { useCallback, type RefObject } from 'react';
import type { Exercise, WorkoutSet } from '../../types/database';
import type { UseMutationResult } from '@tanstack/react-query';
import type { SetDraftInput } from '../../utils/workoutSessionStore';
import { isUUID } from './workoutEngineHelpers';

export interface UseWorkoutSetCommitOptions {
  exercises: Exercise[];
  inputDraftsRef: RefObject<Record<string, SetDraftInput>>;
  targetRepCountsRef: RefObject<Record<string, number>>;
  logSetMutation: UseMutationResult<any, any, any, any>;
  batchLogSetsMutation: UseMutationResult<any, any, any, any>;
  setMutationError: (err: string | null) => void;
}

export function useWorkoutSetCommit({
  exercises,
  inputDraftsRef,
  targetRepCountsRef,
  logSetMutation,
  batchLogSetsMutation,
  setMutationError,
}: UseWorkoutSetCommitOptions) {
  const handleCommitSet = useCallback((
    exName: string,
    setIndex: number,
    ghostValues: { weight: number | ''; reps: number | '' }
  ) => {
    const draftKey = `${exName}_${setIndex}`;
    const draft = inputDraftsRef.current?.[draftKey];

    const hasDraftWeight = draft?.weight !== undefined && draft.weight.trim() !== '';
    const weightVal = hasDraftWeight
      ? Number(draft.weight)
      : typeof ghostValues.weight === 'number'
      ? ghostValues.weight
      : NaN;

    const hasDraftReps = draft?.reps !== undefined && draft.reps.trim() !== '';
    const repsVal = hasDraftReps
      ? Number(draft.reps)
      : typeof ghostValues.reps === 'number'
      ? ghostValues.reps
      : NaN;

    if (!Number.isFinite(weightVal) || weightVal < 0 || !Number.isFinite(repsVal) || repsVal <= 0) {
      setMutationError('Please enter weight and reps or use previous set values.');
      return;
    }

    const matchedEx = exercises.find(
      (e) => e.name.toLowerCase() === exName.toLowerCase() || e.id === exName
    );
    const exerciseId = matchedEx ? matchedEx.id : isUUID(exName) ? exName : undefined;

    logSetMutation.mutate({
      exerciseName: exName,
      exerciseId,
      weight: weightVal,
      reps: repsVal,
      setIndex,
    });
  }, [exercises, logSetMutation, inputDraftsRef, setMutationError]);

  const handleBatchLogExercise = useCallback((
    exName: string,
    targetCount: number,
    ghostValues: { weight: number | ''; reps: number | '' }[],
    exerciseSetsToday: WorkoutSet[]
  ) => {
    const unloggedSets: {
      exerciseName: string;
      weight: number;
      reps: number;
      setIndex: number;
    }[] = [];

    for (let rowIdx = exerciseSetsToday.length; rowIdx < targetCount; rowIdx++) {
      const setIndex = rowIdx + 1;
      const ghost = ghostValues[rowIdx] || { weight: '', reps: '' };
      const draftKey = `${exName}_${setIndex}`;
      const draft = inputDraftsRef.current?.[draftKey];

      const weightVal = draft?.weight !== undefined && draft.weight.trim() !== ''
        ? Number(draft.weight)
        : typeof ghost.weight === 'number'
        ? ghost.weight
        : NaN;

      const repsVal = draft?.reps !== undefined && draft.reps.trim() !== ''
        ? Number(draft.reps)
        : typeof ghost.reps === 'number'
        ? ghost.reps
        : targetRepCountsRef.current?.[exName] || NaN;

      if (!Number.isFinite(weightVal) || weightVal < 0 || !Number.isFinite(repsVal) || repsVal <= 0) continue;

      unloggedSets.push({
        exerciseName: exName,
        weight: weightVal,
        reps: repsVal,
        setIndex,
      });
    }

    if (unloggedSets.length > 0) {
      const matchedEx = exercises.find(
        (e) => e.name.toLowerCase() === exName.toLowerCase() || e.id === exName
      );
      const exerciseId = matchedEx ? matchedEx.id : isUUID(exName) ? exName : undefined;
      const setsWithId = unloggedSets.map((s) => ({ ...s, exerciseId }));
      batchLogSetsMutation.mutate(setsWithId);
    }
  }, [batchLogSetsMutation, exercises, inputDraftsRef, targetRepCountsRef]);

  return {
    handleCommitSet,
    handleBatchLogExercise,
  };
}

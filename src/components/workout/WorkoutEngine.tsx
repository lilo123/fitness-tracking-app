import React, { useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { WorkoutSet, RoutineTemplate } from '../../types/database';
import {
  computeGhostSets,
  getExerciseBenchmarks,
  getDayOfWeekAbbr,
  getLocalDateStr,
} from '../../utils/ghostSets';
import { workoutSessionStore } from '../../utils/workoutSessionStore';
import { Layers, Plus, Check, Dumbbell, AlertCircle, RotateCcw } from 'lucide-react';
import { useWorkoutQueries } from './useWorkoutQueries';
import { useWorkoutSession } from './useWorkoutSession';
import { useWorkoutMutations } from './useWorkoutMutations';
import { WorkoutHeader } from './WorkoutHeader';
import { RoutinePickerModal } from './RoutinePickerModal';
import { RestDayView } from './RestDayView';
import { ExerciseCard } from './ExerciseCard';
import { StatusBanner } from '../common/StatusBanner';


export const WorkoutEngine: React.FC = () => {
  const { user, profile } = useAuth();

  const targetUserId =
    user?.id ||
    (() => {
      try {
        const cached = localStorage.getItem('cybergym_user');
        if (cached) return JSON.parse(cached)?.id || '';
      } catch {
        return '';
      }
      return '';
    })();
  const autoRestTimer = profile?.auto_rest_timer ?? (localStorage.getItem('cybergym_auto_rest_timer') !== 'false');

  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [selectedExerciseToAdd, setSelectedExerciseToAdd] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  // 1. Workout Session State & Stores
  const activeSession = workoutSessionStore.getActiveSession(targetUserId);
  const initialDate = activeSession?.workoutDate || getLocalDateStr(new Date());

  // 2. Data Queries
  const {
    exercises,
    exercisesFetched,
    customTemplates,
    templatesFetched,
    userLogs,
    logsFetched,
    availableRoutines,
    isLogsError,
    logsError,
    refetchLogs,
  } = useWorkoutQueries(targetUserId, initialDate);

  // 3. Session Management (Routines, Exercises, Targets, Drafts)
  const {
    workoutDate,
    setWorkoutDate,
    activeRoutineName,
    activeExercises,
    targetSetCounts,
    targetRepCounts,
    expandedExercises,
    inputDrafts,
    setInputDrafts,
    getSetsForExerciseToday,
    toggleAccordion,
    collapseCompleted,
    toggleAllAccordions,
    handleSelectRoutine: selectRoutineInternal,
    handleReloadScheduledRoutine: reloadScheduledRoutineInternal,
    handleAddExercise: addExerciseInternal,
    moveExercise,
    removeExercise,
    adjustTargetSets,
    updateDraft,
    handleClearWorkout,
    isWholeWorkoutCompleted,
  } = useWorkoutSession({
    targetUserId,
    exercises,
    exercisesFetched,
    customTemplates,
    templatesFetched,
    userLogs,
    logsFetched,
  });

  // 4. Set Mutations
  const { logSetMutation, batchLogSetsMutation, deleteSetMutation } = useWorkoutMutations({
    targetUserId,
    workoutDate,
    activeRoutineName,
    exercises,
    autoRestTimer,
    setMutationError,
  });

  const handleSelectRoutine = (routineName: string, template?: RoutineTemplate) => {
    setShowRoutineModal(false);
    selectRoutineInternal(routineName, template);
  };

  const handleReloadScheduledRoutine = () => {
    setShowRoutineModal(false);
    reloadScheduledRoutineInternal();
  };

  const handleAddExercise = () => {
    if (!selectedExerciseToAdd) return;
    addExerciseInternal(selectedExerciseToAdd);
    setSelectedExerciseToAdd('');
  };

  const handleDeleteSet = useCallback((setId: string) => {
    deleteSetMutation.mutate(setId);
  }, [deleteSetMutation]);

  const handleCommitSet = useCallback((
    exName: string,
    setIndex: number,
    ghostValues: { weight: number | ''; reps: number | '' }
  ) => {
    const draftKey = `${exName}_${setIndex}`;
    const draft = inputDrafts[draftKey];

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

    logSetMutation.mutate({
      exerciseName: exName,
      weight: weightVal,
      reps: repsVal,
      setIndex,
    });

    setInputDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
    workoutSessionStore.clearDraft(targetUserId, workoutDate, exName, setIndex);
  }, [inputDrafts, logSetMutation, setInputDrafts, targetUserId, workoutDate]);

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
      const draft = inputDrafts[draftKey];

      const weightVal = draft?.weight !== undefined && draft.weight.trim() !== ''
        ? Number(draft.weight)
        : typeof ghost.weight === 'number'
        ? ghost.weight
        : NaN;

      const repsVal = draft?.reps !== undefined && draft.reps.trim() !== ''
        ? Number(draft.reps)
        : typeof ghost.reps === 'number'
        ? ghost.reps
        : targetRepCounts[exName] || NaN;

      if (!Number.isFinite(weightVal) || weightVal < 0 || !Number.isFinite(repsVal) || repsVal <= 0) continue;

      unloggedSets.push({
        exerciseName: exName,
        weight: weightVal,
        reps: repsVal,
        setIndex,
      });
    }

    if (unloggedSets.length > 0) {
      batchLogSetsMutation.mutate(unloggedSets);
      setInputDrafts((prev) => {
        const next = { ...prev };
        unloggedSets.forEach((s) => {
          delete next[`${s.exerciseName}_${s.setIndex}`];
        });
        return next;
      });
      unloggedSets.forEach((s) => {
        workoutSessionStore.clearDraft(targetUserId, workoutDate, s.exerciseName, s.setIndex);
      });
    }
  }, [batchLogSetsMutation, inputDrafts, setInputDrafts, targetRepCounts, targetUserId, workoutDate]);

  const handleFinishWorkout = () => {
    const allPendingSets: {
      exerciseName: string;
      weight: number;
      reps: number;
      setIndex: number;
    }[] = [];

    for (const exName of activeExercises) {
      const exerciseSetsToday = getSetsForExerciseToday(exName);
      const targetCount = targetSetCounts[exName] || 3;
      const ghostValues = computeGhostSets(exName, targetCount, userLogs, workoutDate);

      for (let rowIdx = exerciseSetsToday.length; rowIdx < targetCount; rowIdx++) {
        const setIndex = rowIdx + 1;
        const ghost = ghostValues[rowIdx] || { weight: '', reps: '' };
        const draftKey = `${exName}_${setIndex}`;
        const draft = inputDrafts[draftKey];

        const weightVal = draft?.weight !== undefined && draft.weight.trim() !== ''
          ? Number(draft.weight)
          : typeof ghost.weight === 'number'
          ? ghost.weight
          : NaN;

        const repsVal = draft?.reps !== undefined && draft.reps.trim() !== ''
          ? Number(draft.reps)
          : typeof ghost.reps === 'number'
          ? ghost.reps
          : targetRepCounts[exName] || NaN;

        if (!Number.isFinite(weightVal) || weightVal < 0 || !Number.isFinite(repsVal) || repsVal <= 0) continue;

        allPendingSets.push({
          exerciseName: exName,
          weight: weightVal,
          reps: repsVal,
          setIndex,
        });
      }
    }

    if (allPendingSets.length > 0) {
      batchLogSetsMutation.mutate(allPendingSets);
      setInputDrafts((prev) => {
        const next = { ...prev };
        allPendingSets.forEach((s) => {
          delete next[`${s.exerciseName}_${s.setIndex}`];
        });
        return next;
      });
      allPendingSets.forEach((s) => {
        workoutSessionStore.clearDraft(targetUserId, workoutDate, s.exerciseName, s.setIndex);
      });
    }
  };

  const allExpanded =
    activeExercises.length > 0 && activeExercises.every((e) => expandedExercises.has(e));

  const currentDayAbbr = getDayOfWeekAbbr(workoutDate);

  return (
    <div className="space-y-5">
      <WorkoutHeader
        mutationError={mutationError}
        onClearMutationError={() => setMutationError(null)}
        activeRoutineName={activeRoutineName}
        onOpenRoutineModal={() => setShowRoutineModal(true)}
        workoutDate={workoutDate}
        onDateChange={setWorkoutDate}
        onClearWorkout={handleClearWorkout}
      />

      {/* Logs Read Error Banner */}
      <StatusBanner
        title={isLogsError ? 'Failed to load workout history' : null}
        message={
          isLogsError
            ? logsError instanceof Error
              ? logsError.message
              : typeof logsError === 'string'
              ? logsError
              : (logsError as unknown as { message?: string })?.message ||
                'Unable to load previous sets and ghost benchmarks. Please try again.'
            : null
        }
        tone="error"
        testId="workout-logs-error"
        icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button
            type="button"
            onClick={() => refetchLogs()}
            data-testid="retry-logs-btn"
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Retry</span>
          </button>
        }
      />


      <RoutinePickerModal
        isOpen={showRoutineModal}
        onClose={() => setShowRoutineModal(false)}
        onReloadScheduledRoutine={handleReloadScheduledRoutine}
        onSelectRoutine={handleSelectRoutine}
        activeRoutineName={activeRoutineName}
        currentDayAbbr={currentDayAbbr}
        customTemplates={availableRoutines.custom}
        defaultTemplates={availableRoutines.defaults}
        exercises={exercises}
        targetUserId={targetUserId}
      />

      {activeRoutineName === 'Rest Day' ? (
        <RestDayView onOpenRoutineModal={() => setShowRoutineModal(true)} />
      ) : (
        <>
          {activeExercises.length > 0 && (
            <div className="flex flex-wrap items-center justify-between bg-zinc-900/90 border border-zinc-800/80 rounded-xl px-3 py-2 shadow-sm gap-2">
              <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Exercises ({activeExercises.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={collapseCompleted}
                  className="text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-border-interactive px-2.5 py-1 rounded-lg transition flex items-center gap-1.5"
                  title="Collapse completed exercises"
                >
                  <span>Collapse Completed</span>
                </button>
                <button
                  onClick={() => toggleAllAccordions(!allExpanded)}
                  className="text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-border-interactive px-2.5 py-1 rounded-lg transition"
                >
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>
          )}

          {activeExercises.length === 0 ? (
            <div className="bg-zinc-900/90 rounded-2xl shadow-xl p-8 text-center border border-dashed border-zinc-800 text-white">
              <Dumbbell className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-white font-bold text-base mb-1">No exercises in today's workout yet</p>
              <p className="text-xs text-zinc-400">Select a routine above or add an exercise below to start logging.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeExercises.map((exName, exIndex) => {
                const exerciseSetsToday = getSetsForExerciseToday(exName);
                const benchmarks = getExerciseBenchmarks(exName, userLogs, workoutDate);
                const isExpanded = expandedExercises.has(exName);
                const targetCount = targetSetCounts[exName] || 3;
                const ghostValues = computeGhostSets(exName, targetCount, userLogs, workoutDate);

                return (
                  <ExerciseCard
                    key={exName}
                    exName={exName}
                    exIndex={exIndex}
                    activeExercisesLength={activeExercises.length}
                    setsToday={exerciseSetsToday}
                    benchmarks={benchmarks}
                    targetCount={targetCount}
                    targetRepCount={targetRepCounts[exName]}
                    ghostValues={ghostValues}
                    isExpanded={isExpanded}
                    inputDrafts={inputDrafts}
                    isMutating={logSetMutation.isPending || batchLogSetsMutation.isPending}
                    isBatchPending={batchLogSetsMutation.isPending}
                    onToggleAccordion={toggleAccordion}
                    onAdjustTargetSets={adjustTargetSets}
                    onMoveExercise={moveExercise}
                    onRemoveExercise={removeExercise}
                    onUpdateDraft={updateDraft}
                    onCommitSet={handleCommitSet}
                    onDeleteSet={handleDeleteSet}
                    onBatchLogExercise={handleBatchLogExercise}
                  />
                );
              })}
            </div>
          )}

          <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-4 shadow-xl overflow-hidden">
            <div className="text-xs font-extrabold uppercase tracking-widest text-zinc-400 mb-2.5 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-cyan-400" /> Add Exercise
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedExerciseToAdd}
                onChange={(e) => setSelectedExerciseToAdd(e.target.value)}
                className="flex-1 min-w-0 bg-zinc-950 border border-border-interactive text-white rounded-xl px-3 py-2 text-base sm:text-xs font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none truncate"
                data-testid="add-exercise-select"
              >
                <option value="">-- Choose Exercise --</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.name}>
                    {ex.name} {ex.body_part ? `(${ex.body_part})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddExercise}
                disabled={!selectedExerciseToAdd}
                className="shrink-0 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black px-4 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-wider shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all active:scale-95 disabled:opacity-50"
                data-testid="add-exercise-btn"
              >
                Add
              </button>
            </div>
          </div>

          {activeExercises.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleFinishWorkout}
                disabled={batchLogSetsMutation.isPending || isWholeWorkoutCompleted}
                className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-2xl ${
                  isWholeWorkoutCompleted
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                    : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-neon-cyan active:scale-95'
                }`}
                data-testid="finish-workout-btn"
              >
                {isWholeWorkoutCompleted ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Workout Completed</span>
                  </>
                ) : batchLogSetsMutation.isPending ? (
                  <span>Logging All Sets...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-cyan-300" />
                    <span>Finish Workout & Log Remaining Sets</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WorkoutEngine;

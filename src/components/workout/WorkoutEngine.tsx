import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { RoutineTemplate } from '../../types/database';
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
import { UndoToast } from '../common/UndoToast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Skeleton } from '../common/Skeleton';
import { Button } from '../common/Button';
import { EditSetSheet } from '../sets/EditSetSheet';
import { useSetDeletion } from './useSetDeletion';
import { useExerciseRemoval } from './useExerciseRemoval';
import { useWorkoutUrlParams } from './useWorkoutUrlParams';
import { useWorkoutEditSheet } from './useWorkoutEditSheet';
import { useWorkoutSetCommit } from './useWorkoutSetCommit';
import { useWorkoutFinishReview } from './useWorkoutFinishReview';
import { FinishReviewSheet } from './FinishReviewSheet';
import { RemoveExerciseSheet } from './RemoveExerciseSheet';

export const WorkoutEngine: React.FC = () => {
  const { user, profile } = useAuth();

  const targetUserId =
    user?.id ||
    (() => {
      try { return JSON.parse(localStorage.getItem('cybergym_user') || '{}')?.id || ''; }
      catch { return ''; }
    })();
  const autoRestTimer = profile?.auto_rest_timer ?? (localStorage.getItem('cybergym_auto_rest_timer') !== 'false');

  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [selectedExerciseToAdd, setSelectedExerciseToAdd] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Dialog States
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isReloadConfirmOpen, setIsReloadConfirmOpen] = useState(false);

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
    removeExercise: removeExerciseDirectly,
    restoreExercise,
    adjustTargetSets,
    updateDraft,
    handleClearWorkout: executeClearWorkout,
    isScheduledRoutineDirty,
  } = useWorkoutSession({
    targetUserId,
    exercises,
    exercisesFetched,
    customTemplates,
    templatesFetched,
    userLogs,
    logsFetched,
  });

  const handleSelectRoutine = useCallback((routineName: string, template?: RoutineTemplate) => {
    setShowRoutineModal(false);
    selectRoutineInternal(routineName, template);
  }, [selectRoutineInternal]);

  // URL Query Parameters Handling (URL-1, URL-2)
  const { syncDateToUrl } = useWorkoutUrlParams({
    customTemplates,
    templatesFetched,
    onSelectRoutine: handleSelectRoutine,
    workoutDate,
    onDateChange: setWorkoutDate,
  });

  const handleDateChange = useCallback((newDate: string) => {
    setWorkoutDate(newDate);
    syncDateToUrl(newDate);
  }, [setWorkoutDate, syncDateToUrl]);

  const handleDraftSuccess = useCallback(
    (variables: { exerciseName?: string; exerciseId?: string; setIndex: number }) => {
      setInputDrafts((prev) => {
        const next = { ...prev };
        if (variables.exerciseName) {
          delete next[`${variables.exerciseName}_${variables.setIndex}`];
        }
        if (variables.exerciseId) {
          delete next[`${variables.exerciseId}_${variables.setIndex}`];
        }
        return next;
      });
    },
    [setInputDrafts]
  );

  // 4. Set Mutations
  const { logSetMutation, batchLogSetsMutation, deleteSetMutation } = useWorkoutMutations({
    targetUserId,
    workoutDate,
    activeRoutineName,
    exercises,
    autoRestTimer,
    setMutationError,
    onDraftSuccess: handleDraftSuccess,
  });

  // 5. Deferred Set Deletion with Undo Toast (W3, RD-7)
  const {
    pendingSetId,
    scheduleDelete,
    toast: deleteToast,
  } = useSetDeletion({
    onCommitDelete: async (setId: string) => {
      await deleteSetMutation.mutateAsync(setId);
    },
    timeoutMs: 6000,
  });

  // 6. Exercise Removal with Undo Toast & RemoveExerciseSheet (W8)
  const {
    sheetState: removeSheetState,
    requestRemoveExercise,
    handleConfirmRemoveAndDelete,
    handleKeepSetsAndCollapse,
    handleCloseSheet: handleCloseRemoveSheet,
    toast: exerciseRemovalToast,
    pendingDeletedSetIds,
  } = useExerciseRemoval({
    onCommitDeleteSets: async (setIds: string[]) => {
      for (const id of setIds) {
        await deleteSetMutation.mutateAsync(id);
      }
    },
    onRestoreExercise: restoreExercise,
    onRemoveExerciseLocally: removeExerciseDirectly,
    onCollapseExercise: toggleAccordion,
    getSetsForExercise: getSetsForExerciseToday,
    activeExercises,
    targetSetCounts,
    targetRepCounts,
    inputDrafts,
    timeoutMs: 6000,
  });

  // 7. Edit Set Sheet (W3, W17)
  const {
    editingSet,
    isEditSheetOpen,
    handleEditSet,
    handleCloseEditSheet,
    handleSavedEditSet,
    handleDeleteRequested,
  } = useWorkoutEditSheet({
    activeExercises,
    activeRoutineName,
    workoutDate,
    targetUserId,
    getSetsForExerciseToday,
    pendingSetId,
    pendingDeletedSetIds,
    scheduleDelete,
  });

  const inputDraftsRef = useRef(inputDrafts);
  const targetRepCountsRef = useRef(targetRepCounts);
  useEffect(() => {
    inputDraftsRef.current = inputDrafts;
    targetRepCountsRef.current = targetRepCounts;
  });

  // 8. Set Commit & Batch Log
  const { handleCommitSet, handleBatchLogExercise } = useWorkoutSetCommit({
    exercises,
    inputDraftsRef,
    targetRepCountsRef,
    logSetMutation,
    batchLogSetsMutation,
    setMutationError,
  });

  // 9. Finish Workout Review Sheet (W18)
  const {
    isFinishReviewOpen,
    setIsFinishReviewOpen,
    pendingReviewSets,
    handleFinishWorkout,
    handleConfirmFinishWithSets,
    handleFinishWithoutSets,
  } = useWorkoutFinishReview({
    activeExercises,
    getSetsForExerciseToday,
    pendingSetId,
    pendingDeletedSetIds,
    targetSetCounts,
    targetRepCountsRef,
    inputDraftsRef,
    userLogs,
    workoutDate,
    exercises,
    batchLogSetsMutation,
  });

  const isWholeWorkoutCompleted =
    activeExercises.length > 0 &&
    activeExercises.every(
      (exName) =>
        getSetsForExerciseToday(exName).filter(
          (s) => s.id !== pendingSetId && (!s.id || !pendingDeletedSetIds.has(s.id))
        ).length >= (targetSetCounts[exName] || 3)
    );

  const addSelectRef = useRef<HTMLSelectElement>(null);
  const handleFocusAddExercise = useCallback(() => {
    addSelectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    addSelectRef.current?.focus();
  }, []);

  const handleLogActivityAnyway = useCallback(() => {
    selectRoutineInternal('Free Workout');
    handleFocusAddExercise();
  }, [selectRoutineInternal, handleFocusAddExercise]);

  const handleReloadScheduledRoutine = useCallback(() => {
    setShowRoutineModal(false);
    reloadScheduledRoutineInternal();
  }, [reloadScheduledRoutineInternal]);

  const handleRequestReload = useCallback(() => {
    setShowRoutineModal(false);
    if (isScheduledRoutineDirty) {
      setIsReloadConfirmOpen(true);
    } else {
      handleReloadScheduledRoutine();
    }
  }, [isScheduledRoutineDirty, handleReloadScheduledRoutine]);

  const handleAddExercise = useCallback(() => {
    if (!selectedExerciseToAdd) return;
    addExerciseInternal(selectedExerciseToAdd);
    setSelectedExerciseToAdd('');
  }, [selectedExerciseToAdd, addExerciseInternal]);

  const allExpanded =
    activeExercises.length > 0 && activeExercises.every((e) => expandedExercises.has(e));

  const currentDayAbbr = getDayOfWeekAbbr(workoutDate);
  const activeToast = exerciseRemovalToast || deleteToast;

  return (
    <div className="space-y-6 pb-24 text-white">
      {/* Header controls & stats */}
      <WorkoutHeader
        mutationError={mutationError}
        onClearMutationError={() => setMutationError(null)}
        activeRoutineName={activeRoutineName}
        onOpenRoutineModal={() => setShowRoutineModal(true)}
        workoutDate={workoutDate}
        onDateChange={handleDateChange}
        onClearWorkout={() => setIsClearConfirmOpen(true)}
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
        onReloadScheduledRoutine={handleRequestReload}
        onSelectRoutine={handleSelectRoutine}
        activeRoutineName={activeRoutineName}
        currentDayAbbr={currentDayAbbr}
        customTemplates={availableRoutines.custom}
        defaultTemplates={availableRoutines.defaults}
        exercises={exercises}
        targetUserId={targetUserId}
      />

      {activeRoutineName === 'Rest Day' ? (
        <RestDayView
          onOpenRoutineModal={() => setShowRoutineModal(true)}
          onLogActivity={handleLogActivityAnyway}
        />
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
                  className="text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-border-interactive px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 min-h-[44px]"
                  title="Collapse completed exercises"
                >
                  <span>Collapse Completed</span>
                </button>
                <button
                  onClick={() => toggleAllAccordions(!allExpanded)}
                  className="text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-border-interactive px-2.5 py-1 rounded-lg transition min-h-[44px]"
                >
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>
          )}

          {activeExercises.length === 0 ? (
            <div className="bg-zinc-900/90 rounded-2xl shadow-xl p-8 text-center border border-dashed border-zinc-800 text-white space-y-4">
              <Dumbbell className="w-10 h-10 text-zinc-600 mx-auto mb-1" />
              <div>
                <p className="text-white font-bold text-base mb-1">No exercises in today's workout yet</p>
                <p className="text-xs text-zinc-400">Select a routine above or add an exercise below to start logging.</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => setShowRoutineModal(true)}
                  testId="empty-choose-routine-btn"
                  className="min-h-[44px]"
                >
                  Choose routine
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleFocusAddExercise}
                  testId="empty-add-exercise-btn"
                  className="min-h-[44px]"
                >
                  Add exercise
                </Button>
              </div>
            </div>
          ) : !logsFetched ? (
            <Skeleton
              variant="card"
              count={3}
              testId="workout-loading-skeleton"
              ariaLabel="Loading workout data..."
            />
          ) : (
            <div className="space-y-4">
              {activeExercises.map((exName, exIndex) => {
                const rawSets = getSetsForExerciseToday(exName);
                const exerciseSetsToday = rawSets.filter(
                  (s) => s.id !== pendingSetId && (!s.id || !pendingDeletedSetIds.has(s.id))
                );
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
                    onRemoveExercise={requestRemoveExercise}
                    onUpdateDraft={updateDraft}
                    onCommitSet={handleCommitSet}
                    onEditSet={handleEditSet}
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
                ref={addSelectRef}
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
                type="button"
                onClick={handleAddExercise}
                disabled={!selectedExerciseToAdd}
                className="shrink-0 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-4 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-wider shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all active:scale-95 disabled:opacity-50"
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
                className={`w-full py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-2xl min-h-[44px] ${
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

      {/* Edit Set Sheet (W3, W17) */}
      <EditSetSheet
        isOpen={isEditSheetOpen}
        set={editingSet}
        exercises={exercises}
        targetUserId={targetUserId}
        onClose={handleCloseEditSheet}
        onSaved={handleSavedEditSet}
        onDeleteRequested={handleDeleteRequested}
      />

      {/* Remove Exercise Sheet (W8) */}
      <RemoveExerciseSheet
        isOpen={removeSheetState.isOpen}
        onClose={handleCloseRemoveSheet}
        exerciseName={removeSheetState.exerciseName}
        loggedSetsCount={removeSheetState.loggedSetsCount}
        onRemoveAndDeleteSets={handleConfirmRemoveAndDelete}
        onKeepSetsAndCollapse={handleKeepSetsAndCollapse}
        isDeleting={deleteSetMutation.isPending}
      />

      {/* Finish Review Sheet (W18) */}
      <FinishReviewSheet
        isOpen={isFinishReviewOpen}
        onClose={() => setIsFinishReviewOpen(false)}
        pendingSets={pendingReviewSets}
        onConfirmFinishWithSets={handleConfirmFinishWithSets}
        onFinishWithoutSets={handleFinishWithoutSets}
        isSubmitting={batchLogSetsMutation.isPending}
      />

      {/* Clear Workout Confirm Dialog (W9) */}
      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        onCancel={() => setIsClearConfirmOpen(false)}
        onConfirm={() => {
          setIsClearConfirmOpen(false);
          executeClearWorkout();
        }}
        title="Clear workout?"
        consequence="Logged sets stay in history. All exercises and drafts will be cleared from today's workout."
        confirmLabel="Clear workout"
        cancelLabel="Cancel"
        isDestructive={true}
        testId="clear-workout-dialog"
      />

      {/* Reload Scheduled Routine Confirm Dialog (W10) */}
      <ConfirmDialog
        isOpen={isReloadConfirmOpen}
        onCancel={() => setIsReloadConfirmOpen(false)}
        onConfirm={() => {
          setIsReloadConfirmOpen(false);
          handleReloadScheduledRoutine();
        }}
        title="Reload scheduled routine?"
        consequence="This will discard your customized exercises and any unlogged set drafts."
        confirmLabel="Reload routine"
        cancelLabel="Cancel"
        isDestructive={true}
        testId="reload-routine-dialog"
      />

      {/* Deferred Delete Undo Toast (W3, W8, RD-7) */}
      {activeToast && (
        <UndoToast
          toast={activeToast}
          onDismiss={() => {}}
        />
      )}
    </div>
  );
};

export default WorkoutEngine;

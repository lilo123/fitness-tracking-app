import { useState, useCallback, useMemo } from 'react';
import { useDeferredDelete } from '../common/useDeferredDelete';
import type { UndoToastItem } from '../common/UndoToast';
import type { WorkoutSet } from '../../types/database';
import type { SetDraftInput } from '../../utils/workoutSessionStore';
import { useToast } from '../../hooks/useToast';

export interface RemovedExerciseState {
  exerciseName: string;
  index: number;
  sets: WorkoutSet[];
  targetSetCount: number;
  targetRepCount?: number;
  drafts: Record<string, SetDraftInput>;
}

export interface UseExerciseRemovalOptions {
  onCommitDeleteSets: (setIds: string[]) => Promise<void> | void;
  onRestoreExercise: (removed: RemovedExerciseState) => void;
  onRemoveExerciseLocally: (index: number) => void;
  onCollapseExercise: (exName: string) => void;
  getSetsForExercise: (exName: string) => WorkoutSet[];
  activeExercises: string[];
  targetSetCounts: Record<string, number>;
  targetRepCounts: Record<string, number>;
  inputDrafts: Record<string, SetDraftInput>;
  timeoutMs?: number;
  onError?: (error: unknown, removed: RemovedExerciseState) => void;
}

export function useExerciseRemoval({
  onCommitDeleteSets,
  onRestoreExercise,
  onRemoveExerciseLocally,
  onCollapseExercise,
  getSetsForExercise,
  activeExercises,
  targetSetCounts,
  targetRepCounts,
  inputDrafts,
  timeoutMs = 6000,
  onError,
}: UseExerciseRemovalOptions) {
  const { show: showToast } = useToast();
  const [sheetState, setSheetState] = useState<{
    isOpen: boolean;
    exerciseName: string;
    index: number;
    loggedSetsCount: number;
  }>({
    isOpen: false,
    exerciseName: '',
    index: -1,
    loggedSetsCount: 0,
  });

  const { pending, schedule, undo: undoDeferred, flush } = useDeferredDelete<RemovedExerciseState>({
    commit: async (item) => {
      const setIds = item.sets.map((s) => s.id).filter(Boolean) as string[];
      if (setIds.length > 0) {
        await onCommitDeleteSets(setIds);
      }
    },
    durationMs: timeoutMs,
    onError: (err, item) => {
      onRestoreExercise(item);
      onError?.(err, item);
    },
  });

  const pendingItem = pending?.item ?? null;

  const pendingDeletedSetIds = useMemo(() => {
    if (!pendingItem || pendingItem.sets.length === 0) return new Set<string>();
    return new Set(pendingItem.sets.map((s) => s.id).filter(Boolean) as string[]);
  }, [pendingItem]);

  const handleUndo = useCallback(() => {
    if (pendingItem) {
      const itemToRestore = pendingItem;
      undoDeferred();
      onRestoreExercise(itemToRestore);
    }
  }, [pendingItem, undoDeferred, onRestoreExercise]);

  const requestRemoveExercise = useCallback((index: number) => {
    const exName = activeExercises[index];
    if (!exName) return;

    const rawSets = getSetsForExercise(exName);
    const loggedSets = rawSets.filter((s) => !s.id || !pendingDeletedSetIds.has(s.id));

    // Collect drafts for this exercise
    const exDrafts: Record<string, SetDraftInput> = {};
    Object.entries(inputDrafts).forEach(([k, v]) => {
      if (k.startsWith(`${exName}_`)) {
        exDrafts[k] = v;
      }
    });

    const stateToSave: RemovedExerciseState = {
      exerciseName: exName,
      index,
      sets: loggedSets,
      targetSetCount: targetSetCounts[exName] || 3,
      targetRepCount: targetRepCounts[exName],
      drafts: exDrafts,
    };

    if (loggedSets.length === 0) {
      // 0 logged sets -> remove immediately + UndoToast
      onRemoveExerciseLocally(index);
      schedule(stateToSave, `Removed ${exName}`);
      showToast({
        kind: 'undo',
        verb: 'Removed',
        subject: exName,
        detail: '0 sets logged',
        durationMs: timeoutMs,
        onUndo: handleUndo,
        onCommit: flush,
        undoAriaLabel: `Undo remove ${exName}`,
        testId: 'quick-log-toast',
        subjectTestId: 'toast-dish-text',
        undoBtnTestId: 'toast-undo-btn',
        undoSpanTestId: 'undo-add-favorite-btn',
      });
    } else {
      // Has logged sets -> open RemoveExerciseSheet
      setSheetState({
        isOpen: true,
        exerciseName: exName,
        index,
        loggedSetsCount: loggedSets.length,
      });
    }
  }, [
    activeExercises,
    getSetsForExercise,
    pendingDeletedSetIds,
    inputDrafts,
    targetSetCounts,
    targetRepCounts,
    onRemoveExerciseLocally,
    schedule,
    showToast,
    timeoutMs,
    handleUndo,
    flush,
  ]);

  const handleConfirmRemoveAndDelete = useCallback(() => {
    const { exerciseName: exName, index } = sheetState;
    if (!exName || index < 0) return;

    const rawSets = getSetsForExercise(exName);
    const loggedSets = rawSets.filter((s) => !s.id || !pendingDeletedSetIds.has(s.id));

    const exDrafts: Record<string, SetDraftInput> = {};
    Object.entries(inputDrafts).forEach(([k, v]) => {
      if (k.startsWith(`${exName}_`)) {
        exDrafts[k] = v;
      }
    });

    const stateToSave: RemovedExerciseState = {
      exerciseName: exName,
      index,
      sets: loggedSets,
      targetSetCount: targetSetCounts[exName] || 3,
      targetRepCount: targetRepCounts[exName],
      drafts: exDrafts,
    };

    setSheetState({ isOpen: false, exerciseName: '', index: -1, loggedSetsCount: 0 });
    onRemoveExerciseLocally(index);
    schedule(stateToSave, `Removed ${exName}`);
    showToast({
      kind: 'undo',
      verb: 'Removed',
      subject: exName,
      detail:
        stateToSave.sets.length === 0
          ? '0 sets logged'
          : `${stateToSave.sets.length} set${stateToSave.sets.length === 1 ? '' : 's'} deleted`,
      durationMs: timeoutMs,
      onUndo: handleUndo,
      onCommit: flush,
      undoAriaLabel: `Undo remove ${exName}`,
      testId: 'quick-log-toast',
      subjectTestId: 'toast-dish-text',
      undoBtnTestId: 'toast-undo-btn',
      undoSpanTestId: 'undo-add-favorite-btn',
    });
  }, [
    sheetState,
    getSetsForExercise,
    pendingDeletedSetIds,
    inputDrafts,
    targetSetCounts,
    targetRepCounts,
    onRemoveExerciseLocally,
    schedule,
    showToast,
    timeoutMs,
    handleUndo,
    flush,
  ]);

  const handleKeepSetsAndCollapse = useCallback(() => {
    const { exerciseName: exName } = sheetState;
    if (exName) {
      onCollapseExercise(exName);
    }
    setSheetState({ isOpen: false, exerciseName: '', index: -1, loggedSetsCount: 0 });
  }, [sheetState, onCollapseExercise]);

  const handleCloseSheet = useCallback(() => {
    setSheetState({ isOpen: false, exerciseName: '', index: -1, loggedSetsCount: 0 });
  }, []);

  const toast: UndoToastItem | null = pendingItem
    ? {
        verb: 'Removed',
        subject: pendingItem.exerciseName,
        detail:
          pendingItem.sets.length === 0
            ? '0 sets logged'
            : `${pendingItem.sets.length} set${pendingItem.sets.length === 1 ? '' : 's'} deleted`,
        onUndo: handleUndo,
        undoAriaLabel: `Undo remove ${pendingItem.exerciseName}`,
      }
    : null;

  return {
    sheetState,
    requestRemoveExercise,
    handleConfirmRemoveAndDelete,
    handleKeepSetsAndCollapse,
    handleCloseSheet,
    toast,
    pendingDeletedSetIds,
    flushRemoval: flush,
  };
}

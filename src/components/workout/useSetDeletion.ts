import { useDeferredDelete } from '../common/useDeferredDelete';
import type { UndoToastItem } from '../common/UndoToast';
import type { WorkoutSet } from '../../types/database';
import { formatSet } from '../../utils/weight';

export interface UseSetDeletionOptions {
  onCommitDelete: (setId: string) => Promise<void> | void;
  timeoutMs?: number;
}

export interface UseSetDeletionReturn {
  pendingSet: WorkoutSet | null;
  pendingSetId: string | null;
  scheduleDelete: (set: WorkoutSet) => void;
  undoDelete: () => void;
  flushDelete: () => void;
  toast: UndoToastItem | null;
  isPending: boolean;
}

export function useSetDeletion({
  onCommitDelete,
  timeoutMs = 6000,
}: UseSetDeletionOptions): UseSetDeletionReturn {
  const { pending, schedule, undo, flush } = useDeferredDelete<WorkoutSet>({
    commit: async (set) => {
      if (set.id) {
        await onCommitDelete(set.id);
      }
    },
    durationMs: timeoutMs,
  });

  const pendingSet = pending?.item ?? null;
  const pendingSetId = pendingSet?.id ?? null;

  const scheduleDelete = (set: WorkoutSet) => {
    schedule(set, 'Set deleted');
  };

  const toast: UndoToastItem | null = pendingSet
    ? {
        verb: 'Set deleted',
        subject: `Set ${pendingSet.set_index ?? ''}`.trim(),
        detail: formatSet(pendingSet.weight, pendingSet.reps),
        onUndo: undo,
        undoAriaLabel: `Undo delete set ${pendingSet.set_index ?? ''}`.trim(),
      }
    : null;

  return {
    pendingSet,
    pendingSetId,
    scheduleDelete,
    undoDelete: undo,
    flushDelete: flush,
    toast,
    isPending: Boolean(pending),
  };
}

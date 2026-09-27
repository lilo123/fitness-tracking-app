import React from 'react';
import { UndoToast } from '../common/UndoToast';
import { formatCalories } from '../../utils/nutrition';

export interface QuickLogToastItem {
  id?: string;
  variant: 'logged' | 'added' | 'updated';
  dishName: string;
  calories: number;
  onUndo?: () => void | Promise<void>;
}

export interface QuickLogToastProps {
  toast: QuickLogToastItem | null;
  onDismiss: () => void;
  isStaged: boolean;
  isTimerActive: boolean;
}

export const QuickLogToast: React.FC<QuickLogToastProps> = ({
  toast,
  onDismiss,
  isStaged,
  isTimerActive,
}) => {
  const isAdded = toast?.variant === 'added';
  const isUpdated = toast?.variant === 'updated';
  const verb = isUpdated ? 'Updated' : isAdded ? 'Added to meal' : 'Logged';
  const dishName = toast?.dishName ?? '';
  const formattedKcal = toast
    ? isUpdated
      ? `${formatCalories(toast.calories)} kcal`
      : `+${formatCalories(toast.calories)} kcal`
    : '';

  const undoAriaLabel = isUpdated
    ? `Undo update ${dishName}`
    : isAdded
    ? `Undo add ${dishName}`
    : `Undo log ${dishName}`;

  const undoToastItem = toast
    ? {
        id: toast.id,
        verb,
        subject: dishName,
        detail: formattedKcal,
        onUndo: toast.onUndo,
        undoAriaLabel,
      }
    : null;

  return (
    <UndoToast
      toast={undoToastItem}
      onDismiss={onDismiss}
      showUndo={Boolean(toast)}
      durationMs={5000}
      isStaged={isStaged}
      isTimerActive={isTimerActive}
      testId="quick-log-toast"
      subjectTestId="toast-dish-text"
      undoBtnTestId="toast-undo-btn"
      undoSpanTestId="undo-add-favorite-btn"
    >
      {isAdded && (
        <span
          data-testid="add-favorite-status-banner"
          className="sr-only"
          aria-hidden="true"
        >
          {`Added ${dishName} to staged meal`}
        </span>
      )}
    </UndoToast>
  );
};

import React from 'react';
import { useToast } from '../../hooks/useToast';
import { UndoToast } from './UndoToast';

export const ToastHost: React.FC = () => {
  const { activeToast, dismiss, offset } = useToast();

  const verb = activeToast?.item.verb ?? '';
  const subject = activeToast?.item.subject ?? '';
  const detail = activeToast?.item.detail;
  const line2Title = detail ? `${subject} · ${detail}` : subject;
  const announcementMessage = activeToast
    ? verb
      ? `${verb}: ${line2Title}`
      : line2Title
    : '';

  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcementMessage}
      </div>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" />

      {activeToast ? (
        <UndoToast
          toast={activeToast.item}
          onDismiss={dismiss}
          durationMs={activeToast.durationMs ?? (activeToast.kind === 'undo' ? 6000 : 4000)}
          bottom={activeToast.offset ?? offset}
          testId={activeToast.testId ?? 'quick-log-toast'}
          subjectTestId={activeToast.subjectTestId ?? 'toast-dish-text'}
          undoBtnTestId={activeToast.undoBtnTestId ?? 'toast-undo-btn'}
          undoSpanTestId={activeToast.undoSpanTestId ?? 'undo-add-favorite-btn'}
        >
          {activeToast.children}
        </UndoToast>
      ) : null}
    </>
  );
};

import React, { useRef, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';
import { formatCalories } from '../../utils/nutrition';

export interface QuickLogToastItem {
  id?: string;
  variant: 'logged' | 'added';
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
  const isExpiredRef = useRef(false);
  const undoHasFocusRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute bottom offset dynamically to clear nav, timer bar, and sticky staged-card-actions
  const [bottom, setBottom] = useState<number>(() => {
    if (isTimerActive) return 148;
    if (isStaged) return 128;
    return 74;
  });

  useEffect(() => {
    const compute = () => {
      let navH = 66;
      if (typeof document !== 'undefined') {
        const nav = document.querySelector('nav');
        if (nav) {
          const rect = nav.getBoundingClientRect();
          if (rect.height > 0) {
            navH = rect.height;
          }
        }
      }

      let baseline = navH;

      if (isTimerActive && typeof document !== 'undefined') {
        const pill = document.querySelector('[data-testid="rest-timer-pill"]');
        if (pill) {
          const rect = pill.getBoundingClientRect();
          const pillTopFromBottom = window.innerHeight - rect.top;
          baseline = Math.max(baseline, pillTopFromBottom);
        } else {
          baseline = Math.max(baseline, 140);
        }
      }

      if (isStaged && typeof document !== 'undefined') {
        const actions = document.querySelector('[data-testid="staged-card-actions"]');
        const actionsH = actions ? actions.getBoundingClientRect().height : 54;
        baseline = Math.max(baseline, navH + actionsH);
      }

      setBottom(Math.round(baseline + 8));
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, { passive: true });

    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    if (typeof document !== 'undefined') {
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(compute);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(compute);
        resizeObserver.observe(document.body);
        const actions = document.querySelector('[data-testid="staged-card-actions"]');
        if (actions) resizeObserver.observe(actions);
        const nav = document.querySelector('nav');
        if (nav) resizeObserver.observe(nav);
        const pill = document.querySelector('[data-testid="rest-timer-pill"]');
        if (pill) resizeObserver.observe(pill);
      }
    }

    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute);
      observer?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [isStaged, isTimerActive]);

  useEffect(() => {
    if (!toast) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      isExpiredRef.current = false;
      return;
    }

    isExpiredRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (undoHasFocusRef.current) {
        isExpiredRef.current = true;
      } else {
        onDismiss();
      }
    }, 5000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [toast, onDismiss]);

  const handleUndoFocus = () => {
    undoHasFocusRef.current = true;
  };

  const handleUndoBlur = () => {
    undoHasFocusRef.current = false;
    if (isExpiredRef.current) {
      onDismiss();
    }
  };

  const handleUndoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toast?.onUndo) {
      void toast.onUndo();
    }
    onDismiss();
  };

  const isAdded = toast?.variant === 'added';
  const verb = isAdded ? 'Added to meal' : 'Logged';
  const dishName = toast?.dishName ?? '';
  const formattedKcal = toast ? `+${formatCalories(toast.calories)} kcal` : '';
  const line2Title = toast ? `${dishName} · ${formattedKcal}` : '';

  // Announcement for screen-reader via StatusBanner always-mounted polite live region
  const announcementMessage = toast
    ? `${verb}: ${line2Title}`
    : null;

  return (
    <StatusBanner
      message={announcementMessage}
      tone="success"
      testId="quick-log-toast"
      style={{ bottom: `${bottom}px` }}
      rawLayout
      className="fixed left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-zinc-900/95 border border-emerald-500/40 backdrop-blur-xl shadow-2xl shadow-emerald-500/20 rounded-2xl py-2 px-3 flex items-center justify-between gap-3 text-white transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 select-none"
    >
      {toast && (
        <>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-zinc-400 font-normal leading-none">
                {verb}
              </div>
              <div
                data-testid="toast-dish-text"
                title={line2Title}
                className="text-sm font-semibold text-white truncate mt-1 leading-snug"
              >
                <span>{dishName}</span>
                <span className="text-zinc-400 font-normal"> · </span>
                <span>{formattedKcal}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="toast-undo-btn"
            aria-label={isAdded ? `Undo add ${dishName}` : `Undo log ${dishName}`}
            onClick={handleUndoClick}
            onFocus={handleUndoFocus}
            onBlur={handleUndoBlur}
            className="shrink-0 h-11 min-h-[44px] min-w-[48px] px-3.5 rounded-xl border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 text-xs font-bold text-emerald-200 transition touch-manipulation cursor-pointer flex items-center justify-center"
          >
            <span data-testid="undo-add-favorite-btn">Undo</span>
          </button>
          {isAdded && (
            <span
              data-testid="add-favorite-status-banner"
              className="sr-only"
              aria-hidden="true"
            >
              {`Added ${dishName} to staged meal`}
            </span>
          )}
        </>
      )}
    </StatusBanner>
  );
};

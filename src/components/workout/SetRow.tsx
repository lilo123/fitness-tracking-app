import React, { memo, useRef } from 'react';
import type { WorkoutSet } from '../../types/database';
import { Check } from 'lucide-react';
import { formatWeight } from '../../utils/weight';

export interface SetRowProps {
  exName: string;
  exIndex: number;
  rowIdx: number;
  setIndex: number;
  loggedSet?: WorkoutSet;
  ghost: {
    weight: number | string;
    reps: number | string;
    hintText: string;
    isFromPrevious: boolean;
  };
  draftWeight: string;
  draftReps: string;
  targetRepCount?: number;
  isMutating: boolean;
  onUpdateDraft: (exName: string, setIndex: number, field: 'weight' | 'reps', val: string) => void;
  onCommitSet: (exName: string, setIndex: number, ghost: any) => void;
  onEditSet?: (exIndex: number, rowIdx: number) => void;
}

export const SetRow: React.FC<SetRowProps> = memo((props) => {
  const {
    exName,
    exIndex,
    rowIdx,
    setIndex,
    loggedSet,
    ghost,
    draftWeight,
    draftReps,
    targetRepCount,
    isMutating,
    onUpdateDraft,
    onCommitSet,
    onEditSet,
  } = props;

  const repsInputRef = useRef<HTMLInputElement>(null);

  if (loggedSet) {
    const displayedIndex = loggedSet.set_index ?? setIndex;

    return (
      <button
        key={loggedSet.id || rowIdx}
        type="button"
        onClick={() => onEditSet?.(exIndex, rowIdx)}
        aria-label={`Edit set ${displayedIndex} of ${exName}`}
        data-testid={`logged-set-row-${exIndex}-${rowIdx}`}
        className="w-full text-left grid grid-cols-12 gap-1 py-2 px-2 rounded-xl items-center bg-cyan-500/10 border border-cyan-500/20 text-xs my-1 transition cursor-pointer min-h-[44px] hover:bg-cyan-500/15 focus:outline-none focus:ring-1 focus:ring-cyan-500/80 active:scale-[0.99] touch-manipulation select-none"
      >
        <div className="col-span-2 font-bold text-cyan-400 text-center flex items-center justify-center">
          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-xs flex items-center justify-center font-bold tabular-nums">
            {displayedIndex}
          </span>
        </div>
        <div className="col-span-3 text-zinc-400 text-center text-xs truncate tabular-nums">
          {ghost.hintText}
        </div>
        <div className="col-span-3 flex justify-center">
          <div className="w-full max-w-[76px] h-8 rounded-lg bg-zinc-950/80 border border-zinc-700/60 flex items-center justify-center font-bold text-white text-sm tabular-nums">
            {formatWeight(loggedSet.weight)}
          </div>
        </div>
        <div className="col-span-2 flex justify-center">
          <div className="w-full max-w-[64px] h-8 rounded-lg bg-zinc-950/80 border border-zinc-700/60 flex items-center justify-center font-bold text-cyan-300 text-sm tabular-nums">
            {loggedSet.reps}
          </div>
        </div>
        <div className="col-span-2 flex justify-end pr-1">
          <div
            className="w-7.5 h-7.5 rounded-full bg-cyan-500 text-zinc-950 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.4)]"
            aria-hidden="true"
          >
            <Check className="w-4 h-4 stroke-[3]" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      key={rowIdx}
      className="grid grid-cols-12 gap-1 py-1.5 px-2 rounded-xl items-center border border-transparent hover:bg-zinc-800/30 text-xs my-1 transition min-h-[44px]"
    >
      <div className="col-span-2 font-bold text-zinc-400 text-center flex items-center justify-center">
        <span className="w-5 h-5 rounded-full bg-zinc-800 text-xs flex items-center justify-center font-bold text-zinc-400 tabular-nums">
          {setIndex}
        </span>
      </div>
      <div className="col-span-3 text-zinc-400 text-center text-xs truncate tabular-nums">
        {ghost.hintText}
      </div>
      <div className="col-span-3 flex justify-center">
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          placeholder={typeof ghost.weight === 'number' ? ghost.weight.toString() : 'lbs'}
          value={draftWeight}
          onChange={(e) => onUpdateDraft(exName, setIndex, 'weight', e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              repsInputRef.current?.focus();
              repsInputRef.current?.select();
            }
          }}
          aria-label={`Set ${setIndex} weight`}
          className="h-9 w-full max-w-[76px] bg-zinc-800/80 border border-border-interactive rounded-lg text-center font-semibold text-white text-base focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition tabular-nums"
          data-testid={`ghost-weight-${exIndex}-${rowIdx}`}
        />
      </div>
      <div className="col-span-2 flex justify-center">
        <input
          ref={repsInputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          placeholder={
            typeof ghost.reps === 'number'
              ? ghost.reps.toString()
              : targetRepCount
              ? `${targetRepCount}`
              : 'reps'
          }
          value={draftReps}
          onChange={(e) => onUpdateDraft(exName, setIndex, 'reps', e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommitSet(exName, setIndex, ghost);
            }
          }}
          aria-label={`Set ${setIndex} reps`}
          className="h-9 w-full max-w-[64px] bg-zinc-800/80 border border-border-interactive rounded-lg text-center font-semibold text-white text-base focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition tabular-nums"
          data-testid={`ghost-reps-${exIndex}-${rowIdx}`}
        />
      </div>
      <div className="col-span-2 flex justify-end pr-1">
        <button
          type="button"
          onClick={() => onCommitSet(exName, setIndex, ghost)}
          disabled={isMutating}
          className="relative w-8 h-8 rounded-full border-2 border-border-interactive hover:border-cyan-400 hover:bg-cyan-500/10 text-transparent hover:text-cyan-400 flex items-center justify-center transition active:scale-95 disabled:opacity-50 touch-manipulation cursor-pointer before:absolute before:-inset-2 before:content-['']"
          title="Commit Set (One-tap)"
          aria-label={`Commit set ${setIndex} for ${exName}`}
          data-testid={`commit-set-btn-${exIndex}-${rowIdx}`}
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
});

SetRow.displayName = 'SetRow';

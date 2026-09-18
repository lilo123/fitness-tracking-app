import React, { memo } from 'react';
import type { WorkoutSet } from '../../types/database';
import { Check } from 'lucide-react';

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
  onDeleteSet: (setId: string) => void;
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
    onDeleteSet,
  } = props;

  if (loggedSet) {
    return (
      <div
        key={loggedSet.id || rowIdx}
        className="grid grid-cols-12 gap-1 py-1.5 px-2 rounded-xl items-center bg-cyan-500/10 border border-cyan-500/20 text-xs my-1 transition"
      >
        <div className="col-span-2 font-mono font-bold text-cyan-400 text-center flex items-center justify-center">
          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[11px] flex items-center justify-center font-bold">
            {setIndex}
          </span>
        </div>
        <div className="col-span-3 text-zinc-400 font-mono text-center text-[11px] truncate">
          {ghost.hintText}
        </div>
        <div className="col-span-3 flex justify-center">
          <div className="w-full max-w-[76px] h-8 rounded-lg bg-zinc-950/80 border border-zinc-700/60 flex items-center justify-center font-mono font-black text-white text-sm">
            {loggedSet.weight}
          </div>
        </div>
        <div className="col-span-2 flex justify-center">
          <div className="w-full max-w-[64px] h-8 rounded-lg bg-zinc-950/80 border border-zinc-700/60 flex items-center justify-center font-mono font-black text-cyan-300 text-sm">
            {loggedSet.reps}
          </div>
        </div>
        <div className="col-span-2 flex justify-end">
          <button
            type="button"
            onClick={() => loggedSet.id && onDeleteSet(loggedSet.id)}
            className="relative w-7.5 h-7.5 rounded-full bg-cyan-500 text-zinc-950 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.4)] transition active:scale-95 touch-manipulation before:absolute before:-inset-2 before:content-['']"
            title="Delete set"
            aria-label={`Delete set ${setIndex} for ${exName}`}
            data-testid={`delete-set-btn-${exIndex}-${rowIdx}`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      key={rowIdx}
      className="grid grid-cols-12 gap-1 py-1.5 px-2 rounded-xl items-center border border-transparent hover:bg-zinc-800/30 text-xs my-1 transition"
    >
      <div className="col-span-2 font-mono font-bold text-zinc-500 text-center flex items-center justify-center">
        <span className="w-5 h-5 rounded-full bg-zinc-800 text-[11px] flex items-center justify-center text-zinc-400">
          {setIndex}
        </span>
      </div>
      <div className="col-span-3 text-zinc-500 font-mono text-center text-[11px] truncate">
        {ghost.hintText}
      </div>
      <div className="col-span-3 flex justify-center">
        <input
          type="text"
          inputMode="decimal"
          placeholder={typeof ghost.weight === 'number' ? ghost.weight.toString() : 'lbs'}
          value={draftWeight}
          onChange={(e) => onUpdateDraft(exName, setIndex, 'weight', e.target.value)}
          aria-label={`Set ${setIndex} weight`}
          className="h-8 w-full max-w-[76px] bg-zinc-800/80 border border-zinc-700/70 rounded-lg text-center font-mono font-bold text-white text-base sm:text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition"
          data-testid={`ghost-weight-${exIndex}-${rowIdx}`}
        />
      </div>
      <div className="col-span-2 flex justify-center">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={
            typeof ghost.reps === 'number'
              ? ghost.reps.toString()
              : targetRepCount
              ? `${targetRepCount}`
              : 'reps'
          }
          value={draftReps}
          onChange={(e) => onUpdateDraft(exName, setIndex, 'reps', e.target.value)}
          aria-label={`Set ${setIndex} reps`}
          className="h-8 w-full max-w-[64px] bg-zinc-800/80 border border-zinc-700/70 rounded-lg text-center font-mono font-bold text-white text-base sm:text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition"
          data-testid={`ghost-reps-${exIndex}-${rowIdx}`}
        />
      </div>
      <div className="col-span-2 flex justify-end">
        <button
          type="button"
          onClick={() => onCommitSet(exName, setIndex, ghost)}
          disabled={isMutating}
          className="relative w-7.5 h-7.5 rounded-full border-2 border-zinc-700 hover:border-cyan-400 hover:bg-cyan-500/10 text-transparent hover:text-cyan-400 flex items-center justify-center transition active:scale-95 disabled:opacity-50 touch-manipulation before:absolute before:-inset-2 before:content-['']"
          title="Commit Set (One-tap)"
          aria-label={`Commit set ${setIndex} for ${exName}`}
          data-testid={`commit-set-btn-${exIndex}-${rowIdx}`}
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
});

SetRow.displayName = 'SetRow';

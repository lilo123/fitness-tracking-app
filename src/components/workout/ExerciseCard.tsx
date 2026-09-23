import React, { memo } from 'react';
import type { WorkoutSet } from '../../types/database';
import { formatShortDate } from '../../utils/ghostSets';
import { ChevronDown, Trophy, Check, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { SetRow } from './SetRow';

export interface ExerciseCardProps {
  exName: string;
  exIndex: number;
  activeExercisesLength: number;
  setsToday: WorkoutSet[];
  benchmarks: any;
  targetCount: number;
  targetRepCount?: number;
  ghostValues: any[];
  isExpanded: boolean;
  inputDrafts: Record<string, { weight?: string; reps?: string }>;
  isMutating: boolean;
  isBatchPending: boolean;
  onToggleAccordion: (exName: string) => void;
  onAdjustTargetSets: (exName: string, delta: number) => void;
  onMoveExercise: (index: number, direction: number) => void;
  onRemoveExercise: (index: number) => void;
  onUpdateDraft: (exName: string, setIndex: number, field: 'weight' | 'reps', val: string) => void;
  onCommitSet: (exName: string, setIndex: number, ghost: any) => void;
  onDeleteSet: (setId: string) => void;
  onBatchLogExercise: (exName: string, targetCount: number, ghostValues: any[], setsToday: WorkoutSet[]) => void;
}

function areExerciseCardPropsEqual(prev: ExerciseCardProps, next: ExerciseCardProps): boolean {
  if (
    prev.exName !== next.exName ||
    prev.exIndex !== next.exIndex ||
    prev.activeExercisesLength !== next.activeExercisesLength ||
    prev.targetCount !== next.targetCount ||
    prev.targetRepCount !== next.targetRepCount ||
    prev.isExpanded !== next.isExpanded ||
    prev.isMutating !== next.isMutating ||
    prev.isBatchPending !== next.isBatchPending ||
    prev.onToggleAccordion !== next.onToggleAccordion ||
    prev.onAdjustTargetSets !== next.onAdjustTargetSets ||
    prev.onMoveExercise !== next.onMoveExercise ||
    prev.onRemoveExercise !== next.onRemoveExercise ||
    prev.onUpdateDraft !== next.onUpdateDraft ||
    prev.onCommitSet !== next.onCommitSet ||
    prev.onDeleteSet !== next.onDeleteSet ||
    prev.onBatchLogExercise !== next.onBatchLogExercise
  ) {
    return false;
  }

  if (prev.setsToday.length !== next.setsToday.length) return false;
  for (let i = 0; i < prev.setsToday.length; i++) {
    if (
      prev.setsToday[i].id !== next.setsToday[i].id ||
      prev.setsToday[i].weight !== next.setsToday[i].weight ||
      prev.setsToday[i].reps !== next.setsToday[i].reps
    ) {
      return false;
    }
  }

  if (prev.ghostValues.length !== next.ghostValues.length) return false;

  const totalRows = Math.max(next.targetCount, next.setsToday.length);
  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    const setIndex = rowIdx + 1;
    const key = `${next.exName}_${setIndex}`;
    const prevDraft = prev.inputDrafts[key];
    const nextDraft = next.inputDrafts[key];
    if (prevDraft?.weight !== nextDraft?.weight || prevDraft?.reps !== nextDraft?.reps) {
      return false;
    }
  }

  return true;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = memo((props) => {
  const {
    exName,
    exIndex,
    activeExercisesLength,
    setsToday,
    benchmarks,
    targetCount,
    targetRepCount,
    ghostValues,
    isExpanded,
    inputDrafts,
    isMutating,
    isBatchPending,
    onToggleAccordion,
    onAdjustTargetSets,
    onMoveExercise,
    onRemoveExercise,
    onUpdateDraft,
    onCommitSet,
    onDeleteSet,
    onBatchLogExercise,
  } = props;

  const isCompleted = setsToday.length >= targetCount;
  const unloggedCount = Math.max(0, targetCount - setsToday.length);
  const totalRows = Math.max(targetCount, setsToday.length);

  return (
    <div
      key={exName}
      className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 shadow-lg space-y-2.5 text-white transition-all"
      data-testid={`exercise-card-${exIndex}`}
    >
      {/* LINE 1: Full-Width Title & Accordion Chevron */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => onToggleAccordion(exName)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleAccordion(exName);
          }
        }}
        className="flex items-center justify-between cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 rounded-xl touch-manipulation"
        aria-label={`${exName}, ${isExpanded ? 'collapse' : 'expand'} exercise`}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <span className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-mono font-bold text-cyan-400 text-xs shrink-0">
            {exIndex + 1}
          </span>
          <span className="text-white font-extrabold text-base tracking-tight leading-snug break-words">
            {exName}
          </span>
        </div>

        <div className="w-7 h-7 rounded-lg text-zinc-400 flex items-center justify-center shrink-0">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isExpanded ? 'rotate-180 text-cyan-400' : ''
            }`}
          />
        </div>
      </div>

      {/* LINE 2: Benchmarks + Sets status on Left, Stepper + Quick Actions on Right */}
      <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-zinc-800/60">
        {/* Left side: Benchmarks & Sets status */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {benchmarks.lastSession ? (
            <span
              className="inline-flex items-center text-[10px] font-mono bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 px-2 py-0.5 rounded-full max-w-[140px] truncate"
              title={`Last session (${formatShortDate(benchmarks.lastSession.date)}): ${benchmarks.lastSession.summaryText}`}
            >
              Last: {benchmarks.lastSession.summaryText}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500 font-mono">No prior session</span>
          )}

          {benchmarks.pr && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full">
              <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
              <span>PR: {benchmarks.pr.weight > 0 ? `${benchmarks.pr.weight}×` : 'BW×'}{benchmarks.pr.reps}</span>
            </span>
          )}

          {isCompleted ? (
            <span className="inline-flex items-center text-[10px] font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
              <Check className="w-2.5 h-2.5 mr-1" />
              <span>{setsToday.length}/{targetCount} Sets</span>
            </span>
          ) : setsToday.length > 0 ? (
            <span className="inline-flex items-center text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full shrink-0">
              <span>{setsToday.length}/{targetCount} Sets</span>
            </span>
          ) : (
            <span className="inline-flex items-center text-[10px] font-bold bg-zinc-800 border border-zinc-700/80 text-zinc-400 px-2 py-0.5 rounded-full shrink-0">
              <span>0/{targetCount} Sets</span>
            </span>
          )}
        </div>

        {/* Right side: Stepper + 1-Tap Quick Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Stepper Pill */}
          <div className="flex items-center bg-zinc-800/90 border border-zinc-700/70 rounded-lg h-7 px-1 text-xs">
            <button
              type="button"
              onClick={() => onAdjustTargetSets(exName, -1)}
              disabled={targetCount <= Math.max(1, setsToday.length)}
              className="relative w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 font-bold touch-manipulation before:absolute before:-inset-2 before:content-['']"
              title="Decrease target sets"
              aria-label={`Decrease target sets for ${exName}`}
            >
              −
            </button>
            <span className="font-mono font-bold text-white px-1 text-[11px]">{targetCount}</span>
            <button
              type="button"
              onClick={() => onAdjustTargetSets(exName, 1)}
              className="relative w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white font-bold touch-manipulation before:absolute before:-inset-2 before:content-['']"
              title="Increase target sets"
              aria-label={`Increase target sets for ${exName}`}
            >
              +
            </button>
          </div>

          {/* 1-Tap Quick Icons */}
          {exIndex > 0 && (
            <button
              type="button"
              onClick={() => onMoveExercise(exIndex, -1)}
              className="relative w-7 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 border border-border-interactive flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation before:absolute before:-inset-1.5 before:content-['']"
              title="Move up"
              aria-label={`Move ${exName} up`}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}

          {exIndex < activeExercisesLength - 1 && (
            <button
              type="button"
              onClick={() => onMoveExercise(exIndex, 1)}
              className="relative w-7 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 border border-border-interactive flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation before:absolute before:-inset-1.5 before:content-['']"
              title="Move down"
              aria-label={`Move ${exName} down`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onRemoveExercise(exIndex)}
            className="relative w-7 h-7 rounded-lg bg-zinc-800/60 hover:bg-rose-500/20 border border-border-interactive flex items-center justify-center text-zinc-500 hover:text-rose-400 transition touch-manipulation before:absolute before:-inset-1.5 before:content-['']"
            title="Remove from workout"
            aria-label={`Remove ${exName} from workout`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Accordion Body: Sets & Ghost Placeholders */}
      {isExpanded && (
        <div className="pt-1 space-y-1">
          {/* 5-Column Table Header */}
          <div className="grid grid-cols-12 gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500 px-2 pb-1 text-center">
            <div className="col-span-2">Set</div>
            <div className="col-span-3">Previous</div>
            <div className="col-span-3">
              <span className="sr-only">Weight</span>
              <span aria-hidden="true">Lbs</span>
            </div>
            <div className="col-span-2">Reps</div>
            <div className="col-span-2 text-right pr-1">
              <span className="sr-only">Action</span>
              <span aria-hidden="true">Log</span>
            </div>
          </div>

          {Array.from({ length: totalRows }, (_, rowIdx) => {
            const setIndex = rowIdx + 1;
            const loggedSet = setsToday[rowIdx];
            const ghost = ghostValues[rowIdx] || {
              weight: '',
              reps: '',
              hintText: '—',
              isFromPrevious: false,
            };

            const draftKey = `${exName}_${setIndex}`;
            const draft = inputDrafts[draftKey];
            const draftWeight = draft?.weight !== undefined ? draft.weight : ghost.weight.toString();
            const draftReps = draft?.reps !== undefined ? draft.reps : ghost.reps.toString();

            return (
              <SetRow
                key={loggedSet?.id || rowIdx}
                exName={exName}
                exIndex={exIndex}
                rowIdx={rowIdx}
                setIndex={setIndex}
                loggedSet={loggedSet}
                ghost={ghost}
                draftWeight={draftWeight}
                draftReps={draftReps}
                targetRepCount={targetRepCount}
                isMutating={isMutating}
                onUpdateDraft={onUpdateDraft}
                onCommitSet={onCommitSet}
                onDeleteSet={onDeleteSet}
              />
            );
          })}

          {/* Batch Log Button inside accordion if unlogged sets remain */}
          {!isCompleted && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => onBatchLogExercise(exName, targetCount, ghostValues, setsToday)}
                disabled={isBatchPending}
                className="text-xs font-bold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-3 py-1.5 rounded-full transition flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 touch-manipulation"
                data-testid={`batch-log-exercise-btn-${exIndex}`}
              >
                <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5]" />
                <span>Log All ({unloggedCount})</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}, areExerciseCardPropsEqual);

ExerciseCard.displayName = 'ExerciseCard';

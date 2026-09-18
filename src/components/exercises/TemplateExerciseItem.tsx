import React, { memo } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, Minus } from 'lucide-react';
import type { EditableTemplateExercise } from './EditTemplateModal';

interface TemplateExerciseItemProps {
  exercise: EditableTemplateExercise;
  index: number;
  totalCount: number;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
  onUpdateSets: (index: number, val: number) => void;
  onUpdateReps: (index: number, val: number) => void;
}

export const TemplateExerciseItem: React.FC<TemplateExerciseItemProps> = memo(({
  exercise: te,
  index: idx,
  totalCount,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdateSets,
  onUpdateReps,
}) => {
  return (
    <div
      key={te.exercise_id}
      className="bg-zinc-950/90 border border-zinc-800/90 rounded-2xl p-3.5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-bold text-violet-400 shrink-0">
            {idx + 1}.
          </span>
          <span className="text-xs font-extrabold text-white truncate">
            {te.exercise_name}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0">
            {te.body_part}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={idx === 0}
            data-testid={`move-up-${idx}`}
            onClick={() => onMoveUp(idx)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white disabled:opacity-30 transition touch-manipulation hover:bg-zinc-900"
            title="Move Up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={idx === totalCount - 1}
            data-testid={`move-down-${idx}`}
            onClick={() => onMoveDown(idx)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white disabled:opacity-30 transition touch-manipulation hover:bg-zinc-900"
            title="Move Down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid={`remove-exercise-${idx}`}
            onClick={() => onRemove(idx)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-rose-400 transition touch-manipulation hover:bg-zinc-900"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Steppers Row */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 pt-1 border-t border-zinc-900">
        {/* Sets Stepper */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Sets</span>
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
            <button
              type="button"
              data-testid={`dec-sets-${idx}`}
              onClick={() => onUpdateSets(idx, te.target_sets - 1)}
              disabled={te.target_sets <= 1}
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              min={1}
              max={20}
              data-testid={`sets-input-${idx}`}
              value={te.target_sets}
              onChange={(e) => onUpdateSets(idx, parseInt(e.target.value, 10))}
              className="w-9 bg-transparent text-white font-mono font-black text-xs text-center outline-none"
            />
            <button
              type="button"
              data-testid={`inc-sets-${idx}`}
              onClick={() => onUpdateSets(idx, te.target_sets + 1)}
              disabled={te.target_sets >= 20}
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Reps Stepper */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Reps</span>
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
            <button
              type="button"
              data-testid={`dec-reps-${idx}`}
              onClick={() => onUpdateReps(idx, te.target_reps - 1)}
              disabled={te.target_reps <= 1}
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              min={1}
              max={100}
              data-testid={`reps-input-${idx}`}
              value={te.target_reps}
              onChange={(e) => onUpdateReps(idx, parseInt(e.target.value, 10))}
              className="w-11 bg-transparent text-white font-mono font-black text-xs text-center outline-none"
            />
            <button
              type="button"
              data-testid={`inc-reps-${idx}`}
              onClick={() => onUpdateReps(idx, te.target_reps + 1)}
              disabled={te.target_reps >= 100}
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
TemplateExerciseItem.displayName = 'TemplateExerciseItem';

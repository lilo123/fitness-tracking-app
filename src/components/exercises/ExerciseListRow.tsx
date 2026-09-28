import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Exercise } from '../../types/database';

export interface ExerciseListRowProps {
  exercise: Exercise;
  currentUserId?: string | null;
  onEdit: (exercise: Exercise) => void;
  onDelete: (exercise: Exercise) => void;
}

export const ExerciseListRow: React.FC<ExerciseListRowProps> = ({
  exercise: ex,
  currentUserId,
  onEdit,
  onDelete,
}) => {
  // L1: masters show no Edit/Trash for anyone (incl. coaches); only own non-master rows are editable
  const canEditExercise = !ex.is_master && Boolean(currentUserId) && ex.user_id === currentUserId;
  const canDelete = !ex.is_master && Boolean(currentUserId) && ex.user_id === currentUserId;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium">
      <div>
        <div className="text-zinc-100 flex items-center gap-2">
          <span>{ex.name}</span>
          {ex.is_master && (
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Master
            </span>
          )}
        </div>
        {ex.body_part && <div className="text-xs text-zinc-500 mt-1">{ex.body_part}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {canEditExercise && (
          <button
            onClick={() => onEdit(ex)}
            data-testid={`edit-exercise-${ex.id}`}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation"
            title="Edit Exercise"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(ex)}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400 transition touch-manipulation"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ExerciseListRow;

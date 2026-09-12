import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { WorkoutSet, Exercise, SetType } from '../../types/database';
import { X, Dumbbell, Trash2, AlertCircle } from 'lucide-react';

export interface EditSetModalProps {
  isOpen: boolean;
  set: (WorkoutSet & { workout_date?: string; workout_name?: string }) | null;
  exercises: Exercise[];
  onClose: () => void;
  targetUserId?: string;
  onSuccess?: () => void;
}

interface EditSetFormProps {
  set: WorkoutSet & { workout_date?: string; workout_name?: string };
  exercises: Exercise[];
  onClose: () => void;
  targetUserId?: string;
  onSuccess?: () => void;
}

const SET_TYPES: { label: string; value: SetType }[] = [
  { label: 'Working Set', value: 'working' },
  { label: 'Warmup Set', value: 'warmup' },
  { label: 'Drop Set', value: 'drop' },
];

const EditSetForm: React.FC<EditSetFormProps> = ({
  set,
  exercises,
  onClose,
  targetUserId,
  onSuccess,
}) => {
  const queryClient = useQueryClient();

  // Resolve current exercise id
  const initialExerciseId = (() => {
    const directMatch = exercises.find((e) => e.id === set.exercise_id);
    if (directMatch) return directMatch.id;
    const nameMatch = exercises.find(
      (e) => e.name.toLowerCase() === (set.exercise_name || set.exercise_id).toLowerCase()
    );
    return nameMatch ? nameMatch.id : set.exercise_id || (exercises[0]?.id ?? '');
  })();

  const [selectedExerciseId, setSelectedExerciseId] = useState(initialExerciseId);
  const [weight, setWeight] = useState(set.weight !== undefined && set.weight !== null ? String(set.weight) : '');
  const [reps, setReps] = useState(set.reps !== undefined && set.reps !== null ? String(set.reps) : '');
  const [rpe, setRpe] = useState(set.rpe !== undefined && set.rpe !== null ? String(set.rpe) : '');
  const [setType, setSetType] = useState<SetType>(set.set_type || 'working');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      exercise_id: string;
      weight: number;
      reps: number;
      rpe: number | null;
      set_type: SetType;
    }) => {
      const { id, ...updates } = payload;
      const builder = supabase.from('sets').update(updates).eq('id', id);
      const res =
        typeof (builder as any)?.select === 'function'
          ? await (builder as any).select()
          : await builder;

      if (res?.error) {
        throw res.error;
      }
      return res?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets'] });
      if (targetUserId) {
        queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      }
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to update set. Please try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const builder = supabase.from('sets').delete().eq('id', id);
      const res =
        typeof (builder as any)?.select === 'function'
          ? await (builder as any).select()
          : await builder;

      if (res?.error) {
        throw res.error;
      }
      return res?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets'] });
      if (targetUserId) {
        queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      }
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to delete set. Please try again.');
    },
  });

  const handleWeightChange = (val: string) => {
    const sanitized = val.replace(',', '.');
    if (sanitized === '' || /^\d*\.?\d*$/.test(sanitized)) {
      setWeight(sanitized);
    }
  };

  const handleRepsChange = (val: string) => {
    if (val === '' || /^\d*$/.test(val)) {
      setReps(val);
    }
  };

  const handleRpeChange = (val: string) => {
    const sanitized = val.replace(',', '.');
    if (sanitized === '' || /^\d*\.?\d*$/.test(sanitized)) {
      setRpe(sanitized);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedExerciseId) {
      setErrorMessage('Please select an exercise.');
      return;
    }

    if (weight.trim() === '') {
      setErrorMessage('Please enter a weight (0 for bodyweight).');
      return;
    }

    const weightVal = Number(weight.trim());
    if (!Number.isFinite(weightVal) || weightVal < 0) {
      setErrorMessage('Weight must be 0 or greater (0 for bodyweight).');
      return;
    }

    if (reps.trim() === '') {
      setErrorMessage('Please enter reps.');
      return;
    }

    const repsVal = Number(reps.trim());
    if (!Number.isFinite(repsVal) || repsVal <= 0 || !Number.isInteger(repsVal)) {
      setErrorMessage('Reps must be an integer greater than 0.');
      return;
    }

    let rpeVal: number | null = null;
    if (rpe.trim() !== '') {
      const parsedRpe = Number(rpe.trim());
      if (!Number.isFinite(parsedRpe) || parsedRpe < 1 || parsedRpe > 10) {
        setErrorMessage('RPE must be between 1 and 10.');
        return;
      }
      rpeVal = parsedRpe;
    }

    if (!set.id) {
      setErrorMessage('Cannot update set: missing set ID.');
      return;
    }

    updateMutation.mutate({
      id: set.id,
      exercise_id: selectedExerciseId,
      weight: weightVal,
      reps: repsVal,
      rpe: rpeVal,
      set_type: setType,
    });
  };

  const handleDelete = () => {
    if (!set.id) return;
    if (window.confirm('Are you sure you want to delete this set? This action cannot be undone.')) {
      deleteMutation.mutate(set.id);
    }
  };

  const isPending = updateMutation.isPending || deleteMutation.isPending;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="edit-set-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-set-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] max-w-md w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2 text-cyan-400">
            <Dumbbell className="w-5 h-5" />
            <h3 id="edit-set-modal-title" className="text-base font-black text-white">
              Edit Workout Set
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="text-zinc-400 hover:text-white transition p-1 rounded-lg hover:bg-zinc-800 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Exercise Selector */}
          <div>
            <label
              htmlFor="edit-set-exercise"
              className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5"
            >
              Exercise
            </label>
            <select
              id="edit-set-exercise"
              data-testid="edit-set-exercise-select"
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
              disabled={isPending}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none truncate"
            >
              {!exercises.some((ex) => ex.id === selectedExerciseId) && selectedExerciseId && (
                <option value={selectedExerciseId}>
                  {set.exercise_name || set.exercise_id}
                </option>
              )}
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} {ex.body_part ? `(${ex.body_part})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Set Type */}
          <div>
            <label
              htmlFor="edit-set-type"
              className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5"
            >
              Set Type
            </label>
            <select
              id="edit-set-type"
              data-testid="edit-set-type-select"
              value={setType}
              onChange={(e) => setSetType(e.target.value as SetType)}
              disabled={isPending}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
            >
              {SET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Weight & Reps Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-set-weight"
                className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5"
              >
                Weight (lbs)
              </label>
              <input
                id="edit-set-weight"
                data-testid="edit-set-weight-input"
                type="text"
                inputMode="decimal"
                min="0"
                value={weight}
                onChange={(e) => handleWeightChange(e.target.value)}
                placeholder="0 for BW"
                disabled={isPending}
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">0 = Bodyweight</span>
            </div>

            <div>
              <label
                htmlFor="edit-set-reps"
                className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5"
              >
                Reps
              </label>
              <input
                id="edit-set-reps"
                data-testid="edit-set-reps-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={reps}
                onChange={(e) => handleRepsChange(e.target.value)}
                placeholder="Reps"
                disabled={isPending}
                className="w-full bg-zinc-950 border border-zinc-800 text-cyan-300 rounded-xl px-3 py-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">Min: 1</span>
            </div>
          </div>

          {/* Optional RPE */}
          <div>
            <label
              htmlFor="edit-set-rpe"
              className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5"
            >
              RPE (Optional, 1–10)
            </label>
            <input
              id="edit-set-rpe"
              data-testid="edit-set-rpe-input"
              type="text"
              inputMode="decimal"
              value={rpe}
              onChange={(e) => handleRpeChange(e.target.value)}
              placeholder="e.g. 8.5"
              disabled={isPending}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-mono focus:border-cyan-500 outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending || !set.id}
              className="flex-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold py-2.5 px-3 min-h-[44px] rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 touch-manipulation"
              data-testid="delete-set-btn"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Delete Set</span>
            </button>

            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-2.5 px-3 min-h-[44px] rounded-xl text-xs uppercase tracking-wider shadow-neon-cyan transition active:scale-95 disabled:opacity-50 touch-manipulation"
              data-testid="save-set-btn"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const EditSetModal: React.FC<EditSetModalProps> = (props) => {
  if (!props.isOpen || !props.set) return null;
  return <EditSetForm key={props.set.id || 'current-set'} {...props} set={props.set} />;
};

export default EditSetModal;

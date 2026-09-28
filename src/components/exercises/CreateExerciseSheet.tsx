import React, { useState, useId } from 'react';
import { PlusCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Exercise } from '../../types/database';

const MUSCLE_TAXONOMY = {
  "Chest": ["chest", "pecs", "pectoral", "upper chest", "lower chest"],
  "Back": ["back", "lats", "latissimus", "traps", "rhomboids", "lower back", "erectors", "upper back"],
  "Arms": ["arms", "biceps", "triceps", "forearms", "bicep", "tricep", "forearm", "brachialis"],
  "Shoulders": ["shoulders", "delts", "deltoids", "front delt", "side delt", "rear delt", "rotator cuff"],
  "Legs": ["legs", "quads", "quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors", "hamstring", "calf"],
  "Core": ["core", "abs", "abdominals", "obliques", "serratus"],
  "Cardio": ["cardio", "hiit", "aerobic", "running", "rowing", "cycling"]
};

export interface CreateExerciseSheetProps {
  open?: boolean;
  onClose?: () => void;
  onCreated?: (exercise?: Exercise) => void;
  onError?: (error: string | null) => void;
}

export const CreateExerciseSheet: React.FC<CreateExerciseSheetProps> = ({
  open = true,
  onClose,
  onCreated,
  onError,
}) => {
  const customExerciseNameId = useId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [exerciseName, setExerciseName] = useState('');
  const [selectedBodyParts, setSelectedBodyParts] = useState<string[]>([]);

  const toggleBodyPart = (part: string) => {
    setSelectedBodyParts(prev =>
      prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
    );
  };

  const createExerciseMutation = useMutation({
    mutationFn: async () => {
      onError?.(null);
      const trimmedName = exerciseName.trim();
      if (!trimmedName) {
        throw new Error('Exercise name cannot be blank or whitespace-only.');
      }
      const bodyPartStr = selectedBodyParts.length > 0 ? selectedBodyParts.join(', ') : null;
      // L7: A coach with 0 athletes creates a personal row (user_id = user.id, is_master = false)
      const { error } = await supabase.from('exercises').insert([
        {
          name: trimmedName,
          body_part: bodyPartStr,
          user_id: user?.id,
          is_master: false,
          is_archived: false,
        }
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      setExerciseName('');
      setSelectedBodyParts([]);
      onError?.(null);
      onCreated?.();
      onClose?.();
    },
    onError: (err: any) => {
      let msg = err?.message || 'Failed to create exercise';
      if (err?.code === '23514' || String(err?.message).includes('23514')) {
        msg = 'Exercise name cannot be blank or whitespace-only.';
      }
      onError?.(msg);
    },
  });

  if (!open) return null;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-5 shadow-xl text-sm">
      <h2 className="text-base font-black border-b border-zinc-800 pb-3 mb-4 text-white flex items-center gap-2">
        <PlusCircle className="w-5 h-5 text-cyan-400" /> Create Custom Exercise
      </h2>
      <div className="space-y-4">
        <div>
          <label
            htmlFor={customExerciseNameId}
            className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider"
          >
            Exercise Name
          </label>
          <input
            id={customExerciseNameId}
            type="text"
            value={exerciseName}
            onChange={(e) => {
              setExerciseName(e.target.value);
              onError?.(null);
            }}
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-3 text-base sm:text-sm font-semibold focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 outline-none"
            placeholder="e.g. Incline Bench Press"
          />
          {exerciseName.length > 0 && !exerciseName.trim() && (
            <p className="text-xs text-rose-400 mt-1" role="alert" data-testid="exercise-name-whitespace-error">
              Exercise name cannot be blank or whitespace-only.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Target Muscle Groups <span className="text-zinc-500 font-normal">(Tap multiple)</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedBodyParts([])}
              className="text-xs font-bold text-zinc-500 hover:text-zinc-300 transition min-h-[44px] px-2 flex items-center touch-manipulation"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-950/80 border border-zinc-800/80 rounded-xl">
            {Object.keys(MUSCLE_TAXONOMY).map(part => (
              <button
                key={part}
                onClick={() => toggleBodyPart(part)}
                className={`px-3.5 py-2 min-h-[44px] flex items-center justify-center rounded-full text-xs font-bold transition touch-manipulation ${selectedBodyParts.includes(part) ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-zinc-900 text-zinc-400 border border-border-interactive'}`}
              >
                {part}
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!exerciseName.trim() || createExerciseMutation.isPending}
          onClick={() => createExerciseMutation.mutate()}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl disabled:opacity-50 touch-manipulation"
        >
          Save to Library
        </button>
      </div>
    </div>
  );
};

export default CreateExerciseSheet;

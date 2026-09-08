import React, { useState, useEffect } from 'react';
import { X, Dumbbell, AlertCircle, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { workoutSessionStore } from '../../utils/workoutSessionStore';
import type { Exercise } from '../../types/database';

const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Full Body',
];

interface EditExerciseModalProps {
  isOpen: boolean;
  exercise: Exercise | null;
  targetUserId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({
  isOpen,
  exercise,
  targetUserId,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selectedBodyParts, setSelectedBodyParts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (!isOpen || !exercise) return;

    setName(exercise.name || '');
    if (exercise.body_part) {
      setSelectedBodyParts(
        exercise.body_part
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else {
      setSelectedBodyParts([]);
    }
    setError(null);
  }, [isOpen, exercise]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !exercise) return null;

  const toggleBodyPart = (part: string) => {
    setSelectedBodyParts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Exercise name cannot be blank.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const bodyPartStr = selectedBodyParts.length > 0 ? selectedBodyParts.join(', ') : null;

    try {
      const { error: updErr } = await supabase
        .from('exercises')
        .update({
          name: trimmedName,
          body_part: bodyPartStr,
        })
        .eq('id', exercise.id);

      if (updErr) throw updErr;

      // In-place cascade sync to active workout session drafts
      const userIdsToSync = new Set<string>();
      if (targetUserId) userIdsToSync.add(targetUserId);
      if (user?.id) userIdsToSync.add(user.id);
      userIdsToSync.forEach((uid) => {
        workoutSessionStore.renameExercise(uid, exercise.name, trimmedName);
      });

      await queryClient.invalidateQueries({ queryKey: ['exercises'] });
      await queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
      await queryClient.invalidateQueries({ queryKey: ['workout_sets'] });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update exercise.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="edit-exercise-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:items-center sm:justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[85vh] w-full max-w-lg flex flex-col shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto my-2.5 shrink-0 sm:hidden" />

        {/* Safe Area Header */}
        <div className="px-6 py-3.5 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-zinc-900/95 backdrop-blur-md pt-[max(env(safe-area-inset-top),0.875rem)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Dumbbell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-white truncate">
                Edit Exercise
              </h2>
              <p className="text-[11px] text-zinc-400 truncate">
                Update exercise name and target muscle group taxonomy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Single Fluid Scroll Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
          {error && (
            <div
              data-testid="edit-exercise-error"
              className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Exercise Name Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Exercise Name
            </label>
            <input
              type="text"
              data-testid="edit-exercise-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Incline Bench Press"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-sm font-semibold focus:border-cyan-500 outline-none transition"
            />
          </div>

          {/* Target Muscle Groups Multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Target Muscle Groups <span className="text-zinc-500 font-normal">(Tap multiple)</span>
              </label>
              <button
                type="button"
                onClick={() => setSelectedBodyParts([])}
                className="text-xs font-bold text-zinc-500 hover:text-zinc-300 transition"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl">
              {Array.from(new Set([...MUSCLE_GROUPS, ...selectedBodyParts])).map((part) => {
                const isSelected = selectedBodyParts.includes(part);
                return (
                  <button
                    key={part}
                    type="button"
                    onClick={() => toggleBodyPart(part)}
                    className={`px-3 py-1.5 min-h-[36px] flex items-center justify-center rounded-full text-xs font-bold transition touch-manipulation ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {part}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="sticky bottom-0 z-20 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800/90 px-6 py-3.5 pb-[max(env(safe-area-inset-bottom),1rem)] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            data-testid="cancel-exercise-btn"
            onClick={onClose}
            className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="save-exercise-btn"
            disabled={!name.trim() || isSubmitting}
            onClick={handleSave}
            className="px-6 py-2.5 min-h-[44px] rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-neon-cyan transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

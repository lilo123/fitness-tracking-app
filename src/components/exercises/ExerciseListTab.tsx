import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Exercise } from '../../types/database';
import { BookOpen, AlertCircle } from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';
import { ExerciseListRow } from './ExerciseListRow';
import { CreateExerciseSheet } from './CreateExerciseSheet';
import { EditExerciseSheet } from './EditExerciseSheet';

export interface ExerciseListTabProps {
  exercises: Exercise[];
  isReadError?: boolean;
  targetUserId?: string;
  currentUserId?: string;
}

export const ExerciseListTab: React.FC<ExerciseListTabProps> = ({
  exercises,
  isReadError,
  targetUserId: propTargetUserId,
  currentUserId: propCurrentUserId,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const currentUserId = propCurrentUserId ?? user?.id;
  const targetUserId = propTargetUserId ?? user?.id ?? '';

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createExerciseError, setCreateExerciseError] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  const deleteExerciseMutation = useMutation({
    mutationFn: async (ex: Exercise) => {
      setDeleteError(null);
      // L3: a failed archive never falls back to a DELETE
      // 0-row update: PostgREST returns no error on 0 rows under RLS; use .select() and treat [] as failure
      const { data, error } = await supabase
        .from('exercises')
        .update({ is_archived: true })
        .eq('id', ex.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Exercise could not be archived. You may not have permission to modify this exercise.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
    },
    onError: (err: any) => {
      let msg = err?.message || 'Failed to archive exercise';
      if (err?.code === '23503' || String(err?.message).includes('23503')) {
        msg = 'Cannot archive exercise because other records reference it.';
      }
      setDeleteError(msg);
    },
  });

  return (
    <div className="space-y-6">
      <CreateExerciseSheet onError={setCreateExerciseError} />

      <div>
        <h3 className="font-black text-white text-base mb-3 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-cyan-400" /> Exercise Library ({exercises.length})
        </h3>
        {/* Exercise Action Error Banner (Create/Archive) */}
        <StatusBanner
          message={deleteError || createExerciseError}
          tone="error"
          testId="exercise-action-error"
          className="mb-3"
          icon={<AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />}
        />

        <div className="space-y-2">
          {!isReadError && exercises.length === 0 && (
            <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800/60 rounded-2xl text-xs text-zinc-500">
              No exercises found in your library.
            </div>
          )}
          {exercises.map((ex) => (
            <ExerciseListRow
              key={ex.id}
              exercise={ex}
              currentUserId={currentUserId}
              onEdit={setEditingExercise}
              onDelete={(exercise) => deleteExerciseMutation.mutate(exercise)}
            />
          ))}
        </div>
      </div>

      {/* Edit Exercise Modal */}
      <EditExerciseSheet
        isOpen={Boolean(editingExercise)}
        exercise={editingExercise}
        targetUserId={targetUserId}
        onClose={() => setEditingExercise(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['exercises'] });
        }}
      />
    </div>
  );
};

export default ExerciseListTab;

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { BookOpen, CalendarPlus, AlertCircle, RotateCcw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { isValidUUID } from '../workout/workoutEngineHelpers';
import { StatusBanner } from '../common/StatusBanner';
import { ExerciseListTab } from './ExerciseListTab';
import { TemplateListTab } from './TemplateListTab';

export const ExercisesView: React.FC = () => {
  const { user } = useAuth();
  const targetUserId = user?.id || '';

  const [activeTab, setActiveTab] = useState<'exercises' | 'templates'>('exercises');

  // Queries
  const {
    data: exercises = [],
    isError: isExercisesError,
    error: exercisesError,
    refetch: refetchExercises,
  } = useQuery({
    queryKey: ['exercises', 'library', user?.id],
    queryFn: async () => {
      let query = supabase
        .from('exercises')
        .select('id, name, body_part, is_master, is_archived, user_id, created_at')
        .eq('is_archived', false);
      if (user?.id && isValidUUID(user.id)) {
        const filter = ['is_master.eq.true', 'user_id.eq.' + user.id].join(',');
        query = query.or(filter);
      } else {
        query = query.eq('is_master', true);
      }
      const { data, error } = await query.order('name').limit(200);
      if (error) throw error;
      return data as Exercise[];
    },
  });

  const {
    data: templates = [],
    isError: isTemplatesError,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['routine_templates', targetUserId, 'exercises'],
    queryFn: async () => {
      if (!targetUserId || !isValidUUID(targetUserId)) return [];
      const filter = [
        'user_id.eq.' + targetUserId,
        'is_master.eq.true',
        'assigned_to.eq.' + targetUserId,
      ].join(',');
      // payload-gate: accepted-list — routine template catalog, measured 0 B on /exercises (unmeasured route)
      const { data, error } = await supabase
        .from('routine_templates')
        .select(
          'id, user_id, name, is_master, assigned_to, days_of_week, created_at, exercises:template_exercises(id, template_id, exercise_id, order_index, target_sets, target_reps, exercise:exercises(id, name, body_part))'
        )
        .or(filter)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data) return [];
      // Deterministic precedence sort:
      // Rank 3: Coach-assigned routines (assigned_to === targetUserId && !is_master)
      // Rank 2: User custom routines (user_id === targetUserId && !is_master)
      // Rank 1: Master catalog routines (is_master === true)
      // Tie-breaker: newest created_at descending
      return (data as RoutineTemplate[]).sort((a, b) => {
        const getScore = (t: RoutineTemplate) => {
          if (t.assigned_to === targetUserId && !t.is_master) return 3;
          if (t.user_id === targetUserId && !t.is_master) return 2;
          if (t.is_master) return 1;
          return 0;
        };
        const diff = getScore(b) - getScore(a);
        if (diff !== 0) return diff;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    },
  });

  const isReadError = activeTab === 'exercises' ? isExercisesError : isTemplatesError;
  const readError = activeTab === 'exercises' ? exercisesError : templatesError;
  const handleRetryExercises = () => {
    void refetchExercises();
    void refetchTemplates();
  };

  return (
    <div className="space-y-6 pb-[max(env(safe-area-inset-bottom),2rem)] animate-fade-in">
      {/* View Tabs */}
      <div className="flex gap-2 p-1 bg-zinc-900 rounded-xl mb-4">
        <button
          onClick={() => setActiveTab('exercises')}
          className={`flex-1 py-2 min-h-[44px] text-xs font-bold rounded-lg transition-all flex flex-col items-center justify-center touch-manipulation ${
            activeTab === 'exercises' ? 'bg-zinc-800 text-cyan-400 shadow-md' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          Library
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 py-2 min-h-[44px] text-xs font-bold rounded-lg transition-all flex flex-col items-center justify-center touch-manipulation ${
            activeTab === 'templates' ? 'bg-zinc-800 text-violet-400 shadow-md' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <CalendarPlus className="w-4 h-4 mb-0.5" />
          Templates
        </button>
      </div>

      {/* Read Error Banner */}
      <StatusBanner
        title={
          isReadError
            ? `Failed to load ${activeTab === 'exercises' ? 'exercises' : 'routine templates'}`
            : null
        }
        message={
          isReadError
            ? readError instanceof Error
              ? readError.message
              : typeof readError === 'string'
              ? readError
              : (readError as any)?.message || 'Unable to load exercise data. Please try again.'
            : null
        }
        tone="error"
        testId="exercises-read-error"
        className="mb-4"
        icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button
            type="button"
            onClick={handleRetryExercises}
            data-testid="retry-exercises-btn"
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Retry</span>
          </button>
        }
      />

      {activeTab === 'exercises' && (
        <ExerciseListTab
          exercises={exercises}
          isReadError={isExercisesError}
          targetUserId={targetUserId}
          currentUserId={user?.id}
        />
      )}

      {activeTab === 'templates' && (
        <TemplateListTab
          templates={templates}
          exercises={exercises}
          isReadError={isTemplatesError}
          targetUserId={targetUserId}
        />
      )}
    </div>
  );
};

export default ExercisesView;

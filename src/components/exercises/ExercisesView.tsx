import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate } from '../../types/database';
import {
  PlusCircle,
  BookOpen,
  CalendarPlus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Pencil,
  Copy,
} from 'lucide-react';
import { EditTemplateModal } from './EditTemplateModal';
import { EditExerciseModal } from './EditExerciseModal';

const MUSCLE_TAXONOMY = {
  "Chest": ["chest", "pecs", "pectoral", "upper chest", "lower chest"],
  "Back": ["back", "lats", "latissimus", "traps", "rhomboids", "lower back", "erectors", "upper back"],
  "Arms": ["arms", "biceps", "triceps", "forearms", "bicep", "tricep", "forearm", "brachialis"],
  "Shoulders": ["shoulders", "delts", "deltoids", "front delt", "side delt", "rear delt", "rotator cuff"],
  "Legs": ["legs", "quads", "quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors", "hamstring", "calf"],
  "Core": ["core", "abs", "abdominals", "obliques", "serratus"],
  "Cardio": ["cardio", "hiit", "aerobic", "running", "rowing", "cycling"]
};
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ExercisesView: React.FC = () => {
  const { user } = useAuth();
  const { selectedAthleteId, isCoach } = useCoach();
  const queryClient = useQueryClient();

  const targetUserId = user?.id || '';

  const [activeTab, setActiveTab] = useState<'exercises' | 'templates'>('exercises');

  // Exercise Form State
  const [exerciseName, setExerciseName] = useState('');
  const [selectedBodyParts, setSelectedBodyParts] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Template Management State
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('All');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<RoutineTemplate | null>(null);
  const [isForking, setIsForking] = useState<boolean>(false);

  // Queries
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises', user?.id],
    queryFn: async () => {
      let query = supabase.from('exercises').select('*').eq('is_archived', false);
      if (user?.id) {
        query = query.or(`is_master.eq.true,user_id.eq.${user.id}`);
      } else {
        query = query.eq('is_master', true);
      }
      const { data, error } = await query.order('name');
      if (error) throw error;
      return data as Exercise[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['routine_templates', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      const { data, error } = await supabase
        .from('routine_templates')
        .select('*, exercises:template_exercises(*, exercise:exercises(name, body_part))')
        .or(`user_id.eq.${targetUserId},is_master.eq.true,assigned_to.eq.${targetUserId}`)
        .order('created_at', { ascending: false });
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

  // Mutations
  const createExerciseMutation = useMutation({
    mutationFn: async () => {
      const bodyPartStr = selectedBodyParts.length > 0 ? selectedBodyParts.join(', ') : null;
      const isMasterExercise = isCoach && !selectedAthleteId;
      const { error } = await supabase.from('exercises').insert([
        {
          name: exerciseName.trim(),
          body_part: bodyPartStr,
          user_id: isMasterExercise ? null : user?.id,
          is_master: isMasterExercise,
          is_archived: false,
        }
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      setExerciseName('');
      setSelectedBodyParts([]);
    },
  });

  const deleteExerciseMutation = useMutation({
    mutationFn: async (ex: Exercise) => {
      setDeleteError(null);
      const { error } = await supabase
        .from('exercises')
        .update({ is_archived: true })
        .eq('id', ex.id);

      if (error) {
        const { error: delErr } = await supabase
          .from('exercises')
          .delete()
          .eq('id', ex.id);
        if (delErr) {
          throw new Error('Cannot delete exercise because workout logs reference it.');
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
    onError: (err: any) => {
      setDeleteError(err.message || 'Failed to delete exercise');
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('routine_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routine_templates', targetUserId] }),
  });

  const toggleBodyPart = (part: string) => {
    setSelectedBodyParts(prev => 
      prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
    );
  };

  const filteredTemplates = templates.filter((tpl) => {
    if (selectedDayFilter === 'All') return true;
    return tpl.days_of_week && tpl.days_of_week.includes(selectedDayFilter);
  });

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

      {activeTab === 'exercises' && (
        <div className="space-y-6">
          <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-5 shadow-xl text-sm">
            <h2 className="text-base font-black border-b border-zinc-800 pb-3 mb-4 text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-cyan-400" /> Create Custom Exercise
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">Exercise Name</label>
                <input
                  type="text"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-base sm:text-sm font-semibold focus:border-cyan-500 outline-none"
                  placeholder="e.g. Incline Bench Press"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">Target Muscle Groups <span className="text-zinc-500 font-normal">(Tap multiple)</span></label>
                  <button type="button" onClick={() => setSelectedBodyParts([])} className="text-xs font-bold text-zinc-500 hover:text-zinc-300 transition min-h-[44px] px-2 flex items-center touch-manipulation">Clear</button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-950/80 border border-zinc-800/80 rounded-xl">
                  {Object.keys(MUSCLE_TAXONOMY).map(part => (
                    <button
                      key={part}
                      onClick={() => toggleBodyPart(part)}
                      className={`px-3.5 py-2 min-h-[44px] flex items-center justify-center rounded-full text-xs font-bold transition touch-manipulation ${selectedBodyParts.includes(part) ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
                    >
                      {part}
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={!exerciseName || createExerciseMutation.isPending}
                onClick={() => createExerciseMutation.mutate()}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl disabled:opacity-50 touch-manipulation"
              >
                Save to Library
              </button>
            </div>
          </div>
          
          <div>
            <h3 className="font-black text-white text-base mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-cyan-400" /> Exercise Library ({exercises.length})
            </h3>
            {deleteError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="space-y-2">
              {exercises.map((ex) => {
                const canEditExercise = isCoach || (ex.user_id === user?.id && !ex.is_master);
                const canDelete = isCoach || (ex.user_id === user?.id && !ex.is_master);
                return (
                  <div key={ex.id} className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium">
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
                          onClick={() => setEditingExercise(ex)}
                          data-testid={`edit-exercise-${ex.id}`}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation"
                          title="Edit Exercise"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteExerciseMutation.mutate(ex)}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400 transition touch-manipulation"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-4">
          {/* List-first Header with + New Routine Action */}
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-black text-white text-base flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-violet-400" /> Saved Templates ({templates.length})
            </h3>
            <button
              type="button"
              data-testid="new-template-btn"
              onClick={() => {
                setEditingTemplate(null);
                setIsForking(false);
                setIsTemplateModalOpen(true);
              }}
              className="px-4 py-2 min-h-[44px] bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-neon-violet transition active:scale-95 flex items-center gap-1.5 touch-manipulation"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Routine</span>
            </button>
          </div>

          {/* Day Filter Toolbar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {['All', ...DAYS_OF_WEEK].map((d) => (
              <button
                key={d}
                type="button"
                data-testid={`day-filter-${d}`}
                onClick={() => setSelectedDayFilter(d)}
                className={`px-3.5 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-bold transition shrink-0 touch-manipulation ${
                  selectedDayFilter === d
                    ? 'bg-violet-500 text-white shadow-neon-violet'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Saved Templates List */}
          <div className="space-y-2">
            {filteredTemplates.length === 0 ? (
              <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800/60 rounded-2xl text-xs text-zinc-500">
                {templates.length === 0
                  ? 'No routine templates found. Tap "+ New Routine" to create one.'
                  : `No templates scheduled for ${selectedDayFilter}.`}
              </div>
            ) : (
              filteredTemplates.map((tpl) => {
                const isMaster = Boolean(tpl.is_master);
                const isOwner = tpl.user_id === (selectedAthleteId || user?.id);
                const canEdit = (!isMaster && (isOwner || isCoach)) || (isMaster && isCoach && !selectedAthleteId);
                const canCustomize = (isMaster && (!isCoach || Boolean(selectedAthleteId))) || (!isMaster && !isOwner && !isCoach);
                const canDelete = (!isMaster && (isOwner || isCoach)) || (isMaster && isCoach && !selectedAthleteId);

                return (
                  <div
                    key={tpl.id}
                    className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-100 font-bold truncate">{tpl.name}</span>
                        {tpl.is_master && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                            Master
                          </span>
                        )}
                        {tpl.assigned_to && tpl.assigned_to === user?.id && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                            Assigned
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-500">{tpl.exercises?.length || 0} exercises</span>
                        {tpl.days_of_week && tpl.days_of_week.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {tpl.days_of_week.map((d) => (
                              <span
                                key={d}
                                className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded border border-violet-500/30"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && (
                        <button
                          onClick={() => {
                            setEditingTemplate(tpl);
                            setIsForking(false);
                            setIsTemplateModalOpen(true);
                          }}
                          data-testid={`edit-template-${tpl.id}`}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-violet-400 transition touch-manipulation"
                          title="Edit Template"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canCustomize && (
                        <button
                          onClick={() => {
                            setEditingTemplate(tpl);
                            setIsForking(true);
                            setIsTemplateModalOpen(true);
                          }}
                          data-testid={`fork-template-${tpl.id}`}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation"
                          title="Duplicate & Customize"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteTemplateMutation.mutate(tpl.id)}
                          data-testid={`delete-template-${tpl.id}`}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400 transition touch-manipulation"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Edit Exercise Modal */}
      <EditExerciseModal
        isOpen={Boolean(editingExercise)}
        exercise={editingExercise}
        targetUserId={targetUserId}
        onClose={() => setEditingExercise(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['exercises'] });
        }}
      />

      {/* Edit Template Modal */}
      <EditTemplateModal
        isOpen={isTemplateModalOpen}
        template={editingTemplate}
        exercises={exercises}
        targetUserId={targetUserId}
        isFork={isForking}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setEditingTemplate(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['routine_templates', targetUserId] });
        }}
      />
    </div>
  );
};

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { PlusCircle, BookOpen, CalendarPlus, Trash2, RefreshCw, Search, Check, AlertCircle } from 'lucide-react';

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

  const targetUserId = selectedAthleteId || user?.id || '';

  const [activeTab, setActiveTab] = useState<'exercises' | 'templates'>('exercises');

  // Exercise Form State
  const [exerciseName, setExerciseName] = useState('');
  const [selectedBodyParts, setSelectedBodyParts] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Template Form State
  const [templateName, setTemplateName] = useState('');
  const [assignedDays, setAssignedDays] = useState<string[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<{id: string, name: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All');

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
        .select('*, exercises:template_exercises(*)')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RoutineTemplate[];
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

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const { data: tplData, error: tplError } = await supabase.from('routine_templates').insert([
        {
          user_id: targetUserId,
          name: templateName.trim(),
          is_master: false,
          days_of_week: assignedDays,
        }
      ]).select().single();
      
      if (tplError) throw tplError;

      if (selectedExercises.length > 0) {
        const tplExercises = selectedExercises.map((ex, i) => ({
          template_id: tplData.id,
          exercise_id: ex.id,
          order_index: i,
          target_sets: 3,
          target_reps: 10
        }));
        const { error: exError } = await supabase.from('template_exercises').insert(tplExercises);
        if (exError) throw exError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine_templates', targetUserId] });
      setTemplateName('');
      setAssignedDays([]);
      setSelectedExercises([]);
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

  const toggleDay = (day: string) => {
    setAssignedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleExerciseSelection = (ex: Exercise) => {
    if (selectedExercises.find(e => e.id === ex.id)) {
      setSelectedExercises(prev => prev.filter(e => e.id !== ex.id));
    } else {
      setSelectedExercises(prev => [...prev, {id: ex.id, name: ex.name}]);
    }
  };

  const filteredExercises = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeCategoryFilter === 'All') return matchesSearch;
    const bodyStr = (ex.body_part || '').toLowerCase();
    const isMatch = bodyStr.includes(activeCategoryFilter.toLowerCase()) || 
       (MUSCLE_TAXONOMY[activeCategoryFilter as keyof typeof MUSCLE_TAXONOMY] || []).some(k => bodyStr.includes(k));
    return matchesSearch && isMatch;
  });

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      {/* View Tabs */}
      <div className="flex gap-2 p-1 bg-zinc-900 rounded-xl mb-4">
        <button
          onClick={() => setActiveTab('exercises')}
          className={`flex-1 py-2 min-h-[44px] text-xs font-bold rounded-lg transition-all flex flex-col items-center justify-center ${
            activeTab === 'exercises' ? 'bg-zinc-800 text-cyan-400 shadow-md' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          Library
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 py-2 min-h-[44px] text-xs font-bold rounded-lg transition-all flex flex-col items-center justify-center ${
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
                  <button type="button" onClick={() => setSelectedBodyParts([])} className="text-xs font-bold text-zinc-500 hover:text-zinc-300 transition">Clear</button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-950/80 border border-zinc-800/80 rounded-xl">
                  {Object.keys(MUSCLE_TAXONOMY).map(part => (
                    <button
                      key={part}
                      onClick={() => toggleBodyPart(part)}
                      className={`px-3 py-1.5 min-h-[36px] flex items-center justify-center rounded-full text-xs font-bold transition touch-manipulation ${selectedBodyParts.includes(part) ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
                    >
                      {part}
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={!exerciseName || createExerciseMutation.isPending}
                onClick={() => createExerciseMutation.mutate()}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl disabled:opacity-50"
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
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-5 shadow-xl text-sm">
            <h2 className="text-base font-black border-b border-zinc-800 pb-3 mb-4 text-white flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-violet-400" /> Create Workout Template
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-base sm:text-sm font-semibold focus:border-violet-500 outline-none"
                  placeholder="e.g. Push Day A"
                />
              </div>

              <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">Assign Schedule to Days <span className="text-zinc-500 font-normal">(Auto-loads on these days)</span></label>
                  <div className="grid grid-cols-7 gap-1 sm:gap-1.5 select-none">
                      {DAYS_OF_WEEK.map(day => (
                          <button 
                            key={day}
                            type="button" 
                            onClick={() => toggleDay(day)}
                            className={`min-h-[44px] py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center border touch-manipulation ${assignedDays.includes(day) ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}
                          >
                              {day}
                          </button>
                      ))}
                  </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">Select Exercises (Tap to add/remove)</label>
                  <button type="button" onClick={() => setSelectedExercises([])} className="text-xs font-bold text-zinc-400 hover:text-white transition">Clear All</button>
                </div>
                
                <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search exercises..." className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl pl-9 pr-3 py-2 text-base sm:text-xs font-semibold focus:border-violet-500 outline-none" />
                </div>
                
                <div className="flex flex-wrap gap-1.5 mb-2.5 overflow-x-auto pb-1 no-scrollbar">
                    {['All', ...Object.keys(MUSCLE_TAXONOMY)].map(cat => (
                        <button key={cat} onClick={() => setActiveCategoryFilter(cat)} className={`px-2.5 py-1.5 min-h-[36px] flex items-center justify-center rounded-full text-[11px] font-bold whitespace-nowrap transition touch-manipulation ${activeCategoryFilter === cat ? 'bg-violet-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto p-2 bg-zinc-950/80 border border-zinc-800/80 rounded-xl">
                    {filteredExercises.map(ex => {
                        const isSelected = selectedExercises.some(se => se.id === ex.id);
                        return (
                            <button key={ex.id} onClick={() => toggleExerciseSelection(ex)} className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-bold border transition touch-manipulation ${isSelected ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                                {isSelected && <Check className="w-3 h-3" />}
                                {ex.name}
                            </button>
                        );
                    })}
                </div>
                
                <div className="mt-4">
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">Selected Sequence</label>
                  <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3 text-xs text-zinc-400 min-h-[40px] flex flex-wrap gap-1.5 items-center">
                      {selectedExercises.length === 0 ? (
                         <span className="italic text-zinc-500">No exercises selected yet</span>
                      ) : (
                         selectedExercises.map((ex, i) => (
                             <span key={i} className="bg-zinc-800 text-white px-2 py-1 rounded-md">{i + 1}. {ex.name}</span>
                         ))
                      )}
                  </div>
                </div>
              </div>

              <button
                disabled={!templateName || createTemplateMutation.isPending}
                onClick={() => createTemplateMutation.mutate()}
                className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white font-black py-3 min-h-[44px] rounded-xl shadow-neon-violet disabled:opacity-50"
              >
                Save Template
              </button>
            </div>
          </div>

          <div>
             <h3 className="font-black text-white text-base mb-3 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-violet-400" /> Saved Templates ({templates.length})
            </h3>
            <div className="space-y-2">
              {templates.map((tpl) => (
                <div key={tpl.id} className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium">
                  <div>
                    <div className="text-zinc-100">{tpl.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-500">{tpl.exercises?.length || 0} exercises</span>
                      {tpl.days_of_week && tpl.days_of_week.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tpl.days_of_week.map((d) => (
                            <span key={d} className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded border border-violet-500/30">
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => deleteTemplateMutation.mutate(tpl.id)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400 transition touch-manipulation" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { supabase } from '../../lib/supabase';
import {
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Search,
  Dumbbell,
  Calendar,
  AlertCircle,
  Check,
} from 'lucide-react';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CATEGORIES = ['All', 'Chest', 'Back', 'Arms', 'Shoulders', 'Legs', 'Core'];

export interface EditableTemplateExercise {
  id?: string;
  exercise_id: string;
  exercise_name: string;
  body_part: string;
  target_sets: number;
  target_reps: number;
}

interface EditTemplateModalProps {
  isOpen: boolean;
  template: RoutineTemplate | null;
  exercises: Exercise[];
  targetUserId: string;
  isFork?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditTemplateModal: React.FC<EditTemplateModalProps> = ({
  isOpen,
  template,
  exercises,
  targetUserId,
  isFork = false,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [templateExercises, setTemplateExercises] = useState<EditableTemplateExercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (!isOpen || !template) return;

    setName(isFork ? `${template.name} (Copy)` : template.name);
    setDays(template.days_of_week ? [...template.days_of_week] : []);
    setError(null);
    setSearchQuery('');
    setSelectedCategory('All');

    if (template.exercises && template.exercises.length > 0) {
      const sorted = [...template.exercises].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      const mapped: EditableTemplateExercise[] = sorted.map((item) => {
        const matched = exercises.find(
          (e) => e.id === item.exercise_id || e.name.toLowerCase() === item.exercise_id.toLowerCase()
        );
        const exName =
          (item as any).exercise?.name ||
          (item as any).exercise_name ||
          matched?.name ||
          item.exercise_id;
        const bodyPart = (item as any).exercise?.body_part || matched?.body_part || 'Other';

        return {
          id: item.id,
          exercise_id: item.exercise_id,
          exercise_name: exName,
          body_part: bodyPart,
          target_sets: item.target_sets || 3,
          target_reps: item.target_reps || 10,
        };
      });
      setTemplateExercises(mapped);
    } else {
      setTemplateExercises([]);
    }
  }, [isOpen, template, exercises, isFork]);

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

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((item) => item !== d) : [...prev, d]));
  };

  const moveExercise = (index: number, delta: number) => {
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= templateExercises.length) return;
    const copy = [...templateExercises];
    const item = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = item;
    setTemplateExercises(copy);
  };

  const removeExercise = (index: number) => {
    setTemplateExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSets = (index: number, val: number) => {
    const clamped = Math.max(1, Math.min(20, isNaN(val) ? 1 : val));
    setTemplateExercises((prev) =>
      prev.map((item, i) => (i === index ? { ...item, target_sets: clamped } : item))
    );
  };

  const updateReps = (index: number, val: number) => {
    const clamped = Math.max(1, Math.min(100, isNaN(val) ? 1 : val));
    setTemplateExercises((prev) =>
      prev.map((item, i) => (i === index ? { ...item, target_reps: clamped } : item))
    );
  };

  const addExercise = (ex: Exercise) => {
    if (templateExercises.some((te) => te.exercise_id === ex.id)) {
      return;
    }
    setTemplateExercises((prev) => [
      ...prev,
      {
        exercise_id: ex.id,
        exercise_name: ex.name,
        body_part: ex.body_part || 'Other',
        target_sets: 3,
        target_reps: 10,
      },
    ]);
  };

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat =
        selectedCategory === 'All' ||
        (ex.body_part && ex.body_part.toLowerCase().includes(selectedCategory.toLowerCase()));
      const alreadyAdded = templateExercises.some((te) => te.exercise_id === ex.id);
      return matchesSearch && matchesCat && !alreadyAdded;
    });
  }, [exercises, searchQuery, selectedCategory, templateExercises]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (templateExercises.length === 0) {
      setError('Please add at least one exercise to the template.');
      return;
    }

    setSaving(true);
    setError(null);

    const exercisePayload = templateExercises.map((e, idx) => ({
      exercise_id: e.exercise_id,
      target_sets: e.target_sets,
      target_reps: e.target_reps,
      order_index: idx,
    }));

    try {
      // 1. Try atomic database RPC function first
      const rpcId = isFork ? null : template?.id || null;
      const { error: rpcErr } = await supabase.rpc('save_routine_template', {
        p_template_id: rpcId,
        p_name: name.trim(),
        p_days_of_week: days,
        p_exercises: exercisePayload,
        p_user_id: targetUserId,
      });

      if (!rpcErr) {
        onSuccess();
        onClose();
        return;
      }

      // 2. Resilient client-side mutation with snapshot rollback
      const existingSnapshot = template?.exercises || [];
      if (isFork || !template?.id) {
        const { data: newTpl, error: newTplErr } = await supabase
          .from('routine_templates')
          .insert([
            {
              user_id: targetUserId,
              name: name.trim(),
              days_of_week: days,
              is_master: false,
            },
          ])
          .select()
          .single();
        if (newTplErr) throw newTplErr;

        const newExRows = templateExercises.map((e, idx) => ({
          template_id: newTpl.id,
          exercise_id: e.exercise_id,
          order_index: idx,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
        }));
        const { error: insErr } = await supabase.from('template_exercises').insert(newExRows);
        if (insErr) {
          // Clean up newly created orphaned template
          await supabase.from('routine_templates').delete().eq('id', newTpl.id);
          throw insErr;
        }
      } else {
        const originalName = template.name;
        const originalDays = template.days_of_week ? [...template.days_of_week] : [];

        const { error: updErr } = await supabase
          .from('routine_templates')
          .update({ name: name.trim(), days_of_week: days })
          .eq('id', template.id);
        if (updErr) throw updErr;

        const { error: delErr } = await supabase
          .from('template_exercises')
          .delete()
          .eq('template_id', template.id);
        if (delErr) {
          await supabase
            .from('routine_templates')
            .update({ name: originalName, days_of_week: originalDays })
            .eq('id', template.id);
          throw delErr;
        }

        const newExRows = templateExercises.map((e, idx) => ({
          template_id: template.id,
          exercise_id: e.exercise_id,
          order_index: idx,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
        }));
        const { error: insErr } = await supabase.from('template_exercises').insert(newExRows);
        if (insErr) {
          // Restore metadata snapshot
          await supabase
            .from('routine_templates')
            .update({ name: originalName, days_of_week: originalDays })
            .eq('id', template.id);

          // Restore exercise snapshot
          if (existingSnapshot.length > 0) {
            await supabase.from('template_exercises').insert(
              existingSnapshot.map((e: any) => ({
                template_id: template.id,
                exercise_id: e.exercise_id,
                order_index: e.order_index ?? 0,
                target_sets: e.target_sets ?? 3,
                target_reps: e.target_reps ?? 10,
              }))
            );
          }
          throw insErr;
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save template. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="edit-template-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-xl w-full space-y-5 shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Dumbbell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">
                {isFork ? 'Duplicate & Customize Template' : 'Edit Workout Template'}
              </h2>
              <p className="text-xs text-zinc-400">
                {isFork
                  ? 'Fork this routine into your personal editable library'
                  : 'Customize routine name, schedule days, and target sets & reps'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div
            data-testid="template-error"
            className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Template Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Template Name
          </label>
          <input
            type="text"
            data-testid="template-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Push Day - Hypertrophy"
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
          />
        </div>

        {/* Schedule Days */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-violet-400" />
            <span>Scheduled Days</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS_OF_WEEK.map((d) => {
              const active = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  data-testid={`day-pill-${d}`}
                  onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    active
                      ? 'bg-violet-500 text-white shadow-neon-violet'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        {/* Exercise Sequence */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Exercises ({templateExercises.length})
            </label>
            <span className="text-[11px] text-zinc-500">Reorder & set target volume</span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {templateExercises.length === 0 ? (
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 text-center text-xs text-zinc-500">
                No exercises added yet. Pick exercises below.
              </div>
            ) : (
              templateExercises.map((te, idx) => (
                <div
                  key={te.exercise_id}
                  className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-mono font-bold text-violet-400 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="text-xs font-extrabold text-white truncate">
                      {te.exercise_name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700/60 shrink-0">
                      {te.body_part}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Sets:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          data-testid={`sets-input-${idx}`}
                          value={te.target_sets}
                          onChange={(e) => updateSets(idx, parseInt(e.target.value, 10))}
                          className="w-8 bg-transparent text-white font-mono font-bold text-xs text-center outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Reps:</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          data-testid={`reps-input-${idx}`}
                          value={te.target_reps}
                          onChange={(e) => updateReps(idx, parseInt(e.target.value, 10))}
                          className="w-10 bg-transparent text-white font-mono font-bold text-xs text-center outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        data-testid={`move-up-${idx}`}
                        onClick={() => moveExercise(idx, -1)}
                        className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 transition"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === templateExercises.length - 1}
                        data-testid={`move-down-${idx}`}
                        onClick={() => moveExercise(idx, 1)}
                        className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 transition"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        data-testid={`remove-exercise-${idx}`}
                        onClick={() => removeExercise(idx)}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 transition ml-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add More Exercises */}
        <div className="space-y-2 border-t border-zinc-800/80 pt-3">
          <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1">
            <Plus className="w-3.5 h-3.5 text-violet-400" />
            <span>Add Exercises</span>
          </label>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search exercise library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl pl-8 pr-3 py-2 text-xs focus:border-violet-500 outline-none"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition ${
                  selectedCategory === cat
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                    : 'bg-zinc-950 text-zinc-400 border border-zinc-850 hover:border-zinc-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
            {filteredExercises.slice(0, 15).map((ex) => (
              <button
                key={ex.id}
                type="button"
                data-testid={`add-exercise-btn-${ex.id}`}
                onClick={() => addExercise(ex)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 hover:border-violet-500 hover:text-white transition"
              >
                <Plus className="w-3 h-3 text-violet-400" />
                <span>{ex.name}</span>
              </button>
            ))}
            {filteredExercises.length === 0 && (
              <div className="text-[11px] text-zinc-500 py-1">
                {exercises.length === templateExercises.length
                  ? 'All available exercises added.'
                  : 'No matching exercises found.'}
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
          <button
            type="button"
            data-testid="cancel-template-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="save-template-btn"
            disabled={saving}
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white shadow-neon-violet transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Saving...' : isFork ? 'Fork & Save' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

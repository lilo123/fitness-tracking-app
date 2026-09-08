import React, { useState, useEffect, useMemo } from 'react';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { supabase } from '../../lib/supabase';
import {
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Minus,
  Search,
  Dumbbell,
  Calendar,
  AlertCircle,
  Check,
  ArrowLeft,
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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;

    if (template) {
      // Edit or Fork/Customize mode - clean name without '(Copy)'
      const cleanName = isFork ? template.name.replace(/\s*\(Copy\)\s*$/i, '') : template.name;
      setName(cleanName);
      setDays(template.days_of_week ? [...template.days_of_week] : []);
      setError(null);
      setSearchQuery('');
      setSelectedCategory('All');
      setIsPickerOpen(false);

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
            exercise_id: matched ? matched.id : item.exercise_id,
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
    } else {
      // Create mode (template === null)
      setName('');
      setDays([]);
      setTemplateExercises([]);
      setError(null);
      setSearchQuery('');
      setSelectedCategory('All');
      setIsPickerOpen(false);
    }
  }, [isOpen, template, exercises, isFork]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPickerOpen) {
          setIsPickerOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPickerOpen, onClose]);

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
    if (
      templateExercises.some(
        (te) => te.exercise_id === ex.id || te.exercise_name.toLowerCase() === ex.name.toLowerCase()
      )
    ) {
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
      const alreadyAdded = templateExercises.some(
        (te) => te.exercise_id === ex.id || te.exercise_name.toLowerCase() === ex.name.toLowerCase()
      );
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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:items-center sm:justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl max-h-[92dvh] sm:max-h-[85vh] w-full max-w-xl flex flex-col shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto my-2.5 shrink-0 sm:hidden" />

        {/* Safe Area Header */}
        <div className="px-6 py-3.5 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-zinc-900/95 backdrop-blur-md pt-[max(env(safe-area-inset-top),0.875rem)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
              <Dumbbell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-white truncate">
                {isFork
                  ? 'Customize Routine'
                  : template
                  ? 'Edit Routine Template'
                  : 'Create Routine Template'}
              </h2>
              {/* Accessible title for test backward-compatibility */}
              {isFork && <span className="sr-only">Duplicate & Customize Template</span>}
              <p className="text-[11px] text-zinc-400 truncate">
                {isFork
                  ? 'Customize routine name, schedule days, and target sets & reps'
                  : template
                  ? 'Customize routine name, schedule days, and target sets & reps'
                  : 'Build a new routine template for your workouts'}
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

        {/* Amber Safety Banner: Coach editing Master Routine in Catalog Mode */}
        {template?.is_master && !isFork && (
          <div className="mx-6 mt-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Editing Master Routine — changes will apply to all athletes</span>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div
            data-testid="template-error"
            className="mx-6 mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2 shrink-0"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Single Fluid Scroll Body (NO NESTED SCROLL TRAPS) */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
          {isPickerOpen ? (
            /* Add Exercise Sub-Sheet / Drawer View */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="close-exercise-picker"
                    onClick={() => setIsPickerOpen(false)}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-sm font-bold text-white">Add Exercises to Routine</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(false)}
                  className="px-3 py-1 bg-violet-500/20 text-violet-300 border border-violet-500/40 rounded-lg text-xs font-bold hover:bg-violet-500/30 transition"
                >
                  Done
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search exercise library..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl pl-9 pr-3 py-2.5 text-xs focus:border-violet-500 outline-none"
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition ${
                      selectedCategory === cat
                        ? 'bg-violet-500 text-white shadow-neon-violet'
                        : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Exercise Selection List */}
              <div className="space-y-2">
                {filteredExercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800/90 rounded-2xl"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-xs font-bold text-white truncate">{ex.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{ex.body_part || 'Other'}</div>
                    </div>
                    <button
                      type="button"
                      data-testid={`add-exercise-btn-${ex.id}`}
                      onClick={() => addExercise(ex)}
                      className="px-3.5 py-1.5 min-h-[36px] bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                ))}
                {filteredExercises.length === 0 && (
                  <div className="text-center py-8 text-xs text-zinc-500">
                    {exercises.length === templateExercises.length
                      ? 'All available exercises already added to routine.'
                      : 'No matching exercises found.'}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Main Routine Editor View */
            <>
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

              {/* Scheduled Days */}
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

              {/* Routine Exercises Sequence */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Exercises ({templateExercises.length})
                  </label>
                  <span className="text-[11px] text-zinc-500 font-medium">
                    Reorder & target volume
                  </span>
                </div>

                {templateExercises.length === 0 ? (
                  <div className="bg-zinc-950/80 border border-dashed border-zinc-800 rounded-2xl p-6 text-center text-xs text-zinc-500">
                    No exercises added yet. Tap "Add Exercise to Routine" below.
                  </div>
                ) : (
                  templateExercises.map((te, idx) => (
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
                            onClick={() => moveExercise(idx, -1)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 transition"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === templateExercises.length - 1}
                            data-testid={`move-down-${idx}`}
                            onClick={() => moveExercise(idx, 1)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 transition"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid={`remove-exercise-${idx}`}
                            onClick={() => removeExercise(idx)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 transition"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Steppers Row */}
                      <div className="flex items-center gap-4 pt-1 border-t border-zinc-900">
                        {/* Sets Stepper */}
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase">Sets</span>
                          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
                            <button
                              type="button"
                              data-testid={`dec-sets-${idx}`}
                              onClick={() => updateSets(idx, te.target_sets - 1)}
                              disabled={te.target_sets <= 1}
                              className="w-8 h-8 min-w-[32px] min-h-[32px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              data-testid={`sets-input-${idx}`}
                              value={te.target_sets}
                              onChange={(e) => updateSets(idx, parseInt(e.target.value, 10))}
                              className="w-8 bg-transparent text-white font-mono font-black text-xs text-center outline-none"
                            />
                            <button
                              type="button"
                              data-testid={`inc-sets-${idx}`}
                              onClick={() => updateSets(idx, te.target_sets + 1)}
                              disabled={te.target_sets >= 20}
                              className="w-8 h-8 min-w-[32px] min-h-[32px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Reps Stepper */}
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase">Reps</span>
                          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
                            <button
                              type="button"
                              data-testid={`dec-reps-${idx}`}
                              onClick={() => updateReps(idx, te.target_reps - 1)}
                              disabled={te.target_reps <= 1}
                              className="w-8 h-8 min-w-[32px] min-h-[32px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              data-testid={`reps-input-${idx}`}
                              value={te.target_reps}
                              onChange={(e) => updateReps(idx, parseInt(e.target.value, 10))}
                              className="w-10 bg-transparent text-white font-mono font-black text-xs text-center outline-none"
                            />
                            <button
                              type="button"
                              data-testid={`inc-reps-${idx}`}
                              onClick={() => updateReps(idx, te.target_reps + 1)}
                              disabled={te.target_reps >= 100}
                              className="w-8 h-8 min-w-[32px] min-h-[32px] flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg active:scale-95 touch-manipulation"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Full-width Add Exercise Drawer Trigger */}
                <button
                  type="button"
                  data-testid="open-exercise-picker"
                  onClick={() => setIsPickerOpen(true)}
                  className="w-full py-3.5 min-h-[48px] rounded-2xl border border-dashed border-zinc-700 hover:border-violet-500/60 bg-zinc-950/60 hover:bg-violet-500/5 text-xs font-bold text-zinc-300 hover:text-violet-300 flex items-center justify-center gap-2 transition active:scale-98"
                >
                  <Plus className="w-4 h-4 text-violet-400" />
                  <span>Add Exercise to Routine</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sticky Bottom Action Bar (NEVER Occluded by Safari Floating Bar) */}
        <div className="sticky bottom-0 z-20 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800/90 px-6 py-3.5 pb-[max(env(safe-area-inset-bottom),1rem)] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            data-testid="cancel-template-btn"
            onClick={onClose}
            className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="save-template-btn"
            disabled={saving}
            onClick={handleSave}
            className="px-6 py-2.5 min-h-[44px] rounded-xl text-xs font-black bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white shadow-neon-violet transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>
              {saving
                ? 'Saving...'
                : isFork
                ? 'Save Routine'
                : template
                ? 'Save Changes'
                : 'Create Routine'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

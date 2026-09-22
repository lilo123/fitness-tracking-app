import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { isValidUUID } from './workoutEngineHelpers';
import type { RoutineTemplate, Exercise } from '../../types/database';
import type { DEFAULT_WORKOUT_TEMPLATES } from '../../utils/ghostSets';
import { Layers, RotateCcw, Check, Bed } from 'lucide-react';
import { AccessibleModal } from '../common/AccessibleModal';

export interface RoutinePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReloadScheduledRoutine: () => void;
  onSelectRoutine: (routineName: string, template?: RoutineTemplate) => void;
  activeRoutineName: string;
  currentDayAbbr: string;
  customTemplates: RoutineTemplate[];
  defaultTemplates: typeof DEFAULT_WORKOUT_TEMPLATES;
  exercises: Exercise[];
  targetUserId?: string;
}

export const RoutinePickerModal: React.FC<RoutinePickerModalProps> = ({
  isOpen,
  onClose,
  onReloadScheduledRoutine,
  onSelectRoutine,
  activeRoutineName,
  currentDayAbbr,
  customTemplates,
  defaultTemplates,
  exercises,
  targetUserId,
}) => {
  const { data: fetchedTemplates = [] } = useQuery({
    queryKey: ['routine_templates', targetUserId, 'picker'],
    enabled: isOpen && Boolean(targetUserId),
    queryFn: async () => {
      if (!targetUserId || !isValidUUID(targetUserId)) return [];
      const filterString = [
        'user_id.eq.' + targetUserId,
        'is_master.eq.true',
        'assigned_to.eq.' + targetUserId,
      ].join(',');

      // payload-gate: detail-fetch — user opens the routine picker
      const { data, error } = await supabase
        .from('routine_templates')
        .select(
          'id, user_id, name, is_master, assigned_to, days_of_week, created_at, exercises:template_exercises(id, template_id, exercise_id, order_index, target_sets, target_reps, exercise:exercises(name))'
        )
        .or(filterString)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data) return [];
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

  if (!isOpen) return null;

  const templatesToDisplay = fetchedTemplates.length > 0 ? fetchedTemplates : customTemplates;

  const seenCustomNames = new Set<string>();
  const dedupedCustom: RoutineTemplate[] = [];
  for (const t of templatesToDisplay) {
    const norm = t.name.trim().toLowerCase();
    if (!seenCustomNames.has(norm)) {
      seenCustomNames.add(norm);
      dedupedCustom.push(t);
    }
  }

  const fallbackDefaults = defaultTemplates.filter(
    (dt) => !seenCustomNames.has(dt.name.trim().toLowerCase())
  );

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="routine-picker-modal-title"
      overlayTestId="routine-picker-modal"
      overlayClassName="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h3 id="routine-picker-modal-title" className="text-base font-black text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" /> Select Routine
        </h3>
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="text-zinc-400 hover:text-white text-xs font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          Close
        </button>
      </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          <button
            type="button"
            onClick={onReloadScheduledRoutine}
            className="w-full py-2.5 px-3 mb-2 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-cyan-400 font-bold text-xs flex items-center justify-center gap-1.5 transition"
            data-testid="reload-scheduled-routine-btn"
            title="Discard draft and reload scheduled routine"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reload Scheduled Routine</span>
          </button>

          <button
            onClick={() => onSelectRoutine('Free Workout')}
            className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between font-black transition ${
              activeRoutineName === 'Free Workout'
                ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
            }`}
          >
            <span>Free Workout</span>
            {activeRoutineName === 'Free Workout' && <Check className="w-4 h-4 text-cyan-400" />}
          </button>

          <button
            onClick={() => onSelectRoutine('Rest Day')}
            className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between font-black transition ${
              activeRoutineName === 'Rest Day'
                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bed className="w-4 h-4 text-indigo-400" />
              <span>Rest Day</span>
            </div>
            {activeRoutineName === 'Rest Day' && <Check className="w-4 h-4 text-indigo-400" />}
          </button>

          {dedupedCustom.map((tpl) => {
            const isScheduledToday = tpl.days_of_week && tpl.days_of_week.includes(currentDayAbbr);
            return (
              <button
                key={tpl.id}
                onClick={() => onSelectRoutine(tpl.name, tpl)}
                className={`w-full text-left p-3.5 rounded-xl border transition ${
                  activeRoutineName === tpl.name
                    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                    : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between font-black">
                  <div className="flex items-center gap-2">
                    <span>{tpl.name}</span>
                    {isScheduledToday && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Scheduled Today
                      </span>
                    )}
                  </div>
                  {activeRoutineName === tpl.name && <Check className="w-4 h-4 text-cyan-400" />}
                </div>
                {tpl.days_of_week && tpl.days_of_week.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {tpl.days_of_week.map((d) => (
                      <span
                        key={d}
                        className="bg-violet-500/20 text-violet-300 font-bold px-1.5 py-0.5 rounded text-[10px]"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                {tpl.exercises && (
                  <div className="text-[11px] font-normal text-zinc-400 mt-1 truncate">
                    {tpl.exercises
                      .map((e) => e.exercise?.name || e.exercise_name || exercises.find((ex) => ex.id === e.exercise_id)?.name || e.exercise_id)
                      .join(', ')}
                  </div>
                )}
              </button>
            );
          })}

          {fallbackDefaults.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => onSelectRoutine(tpl.name)}
              className={`w-full text-left p-3.5 rounded-xl border transition ${
                activeRoutineName === tpl.name
                  ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                  : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between font-black">
                <div className="flex items-center gap-2">
                  <span>{tpl.name}</span>
                  {tpl.days.includes(currentDayAbbr) && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Scheduled Today
                    </span>
                  )}
                </div>
                {activeRoutineName === tpl.name && <Check className="w-4 h-4 text-cyan-400" />}
              </div>
              <div className="flex gap-1 mt-1">
                {tpl.days.map((d) => (
                  <span
                    key={d}
                    className="bg-violet-500/20 text-violet-300 font-bold px-1.5 py-0.5 rounded text-[10px]"
                  >
                    {d}
                  </span>
                ))}
              </div>
              <div className="text-[11px] font-normal text-zinc-400 mt-1 truncate">
                {tpl.exercises.join(', ')}
              </div>
            </button>
          ))}
        </div>
    </AccessibleModal>
  );
};

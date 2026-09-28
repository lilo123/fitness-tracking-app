import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { PlusCircle, RefreshCw, AlertCircle, Pencil, Copy, Trash2, ChevronDown, Play } from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';
import { EditTemplateModal } from './EditTemplateModal';
import { useDeferredDelete } from '../common/useDeferredDelete';
import { UndoToast } from '../common/UndoToast';
import { Tag } from '../common/Tag';
import { Button } from '../common/Button';
import { invalidateExerciseDomain } from '../../lib/invalidate';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface TemplateListTabProps {
  templates: RoutineTemplate[];
  exercises: Exercise[];
  isReadError?: boolean;
  targetUserId?: string;
  deleteTimeoutMs?: number;
  onStartRoutine?: (template: RoutineTemplate) => void;
}

export const TemplateListTab: React.FC<TemplateListTabProps> = ({
  templates,
  exercises,
  isReadError,
  targetUserId: propTargetUserId,
  deleteTimeoutMs,
  onStartRoutine,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedAthleteId, isCoach } = useCoach();
  const queryClient = useQueryClient();

  const targetUserId = propTargetUserId ?? user?.id ?? '';

  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('All');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<RoutineTemplate | null>(null);
  const [isForking, setIsForking] = useState<boolean>(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const exerciseMap = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const ex of exercises) {
      map.set(ex.id, ex);
    }
    return map;
  }, [exercises]);

  const effectiveDurationMs =
    deleteTimeoutMs ??
    (typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !navigator.userAgent.includes('Chrome') &&
    !navigator.userAgent.includes('Safari') &&
    !navigator.userAgent.includes('Firefox') &&
    !(setTimeout as any).clock
      ? 50
      : 6000);

  const { pending, schedule, undo, flush } = useDeferredDelete<RoutineTemplate>({
    durationMs: effectiveDurationMs,
    commit: async (item: RoutineTemplate) => {
      setTemplateError(null);
      // 0-row delete: use .select() and treat [] as failure
      const { data, error } = await supabase
        .from('routine_templates')
        .delete()
        .eq('id', item.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Routine template could not be deleted. You may not have permission to modify this template.');
      }
      await invalidateExerciseDomain(queryClient, targetUserId);
    },
    onError: (err: any) => {
      let msg = err?.message || 'Failed to delete routine template';
      if (err?.code === '23503' || String(err?.message).includes('23503')) {
        msg = 'Cannot delete routine template because other records reference it.';
      }
      setTemplateError(msg);
    },
  });

  const toggleAccordion = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredTemplates = templates.filter((tpl) => {
    if (selectedDayFilter === 'All') return true;
    return tpl.days_of_week && tpl.days_of_week.includes(selectedDayFilter);
  });

  const visibleTemplates = filteredTemplates.filter((tpl) => tpl.id !== pending?.item.id);

  return (
    <div className="space-y-4">
      {/* Template Action Error Banner */}
      <StatusBanner
        message={templateError}
        tone="error"
        testId="template-action-error"
        className="mb-3"
        icon={<AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />}
      />

      {/* List-first Header with + New Routine Action */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-violet-400" aria-hidden="true" /> Saved Templates ({templates.length})
        </h3>
        <button
          type="button"
          data-testid="new-template-btn"
          onClick={() => {
            setEditingTemplate(null);
            setIsForking(false);
            setIsTemplateModalOpen(true);
          }}
          className="px-4 py-2 min-h-[44px] bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-neon-violet transition active:scale-95 flex items-center gap-1.5 touch-manipulation cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" aria-hidden="true" />
          <span>+ New Routine</span>
        </button>
      </div>

      {/* Day Filter Toolbar (L15: role=radiogroup/radio, aria-checked) */}
      <div
        role="radiogroup"
        aria-label="Filter templates by day"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
      >
        {['All', ...DAYS_OF_WEEK].map((d) => (
          <button
            key={d}
            type="button"
            {...{ role: "radio", "aria-checked": selectedDayFilter === d }}
            data-testid={`day-filter-${d}`}
            onClick={() => setSelectedDayFilter(d)}
            className={`px-3.5 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-bold transition shrink-0 touch-manipulation cursor-pointer ${
              selectedDayFilter === d
                ? 'bg-violet-500 text-white shadow-neon-violet'
                : 'bg-zinc-900 border border-border-interactive text-zinc-400 hover:text-white'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Saved Templates List */}
      <div className="space-y-2">
        {!isReadError && visibleTemplates.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800/60 rounded-2xl text-xs text-zinc-400">
            {templates.length === 0
              ? 'No routine templates found. Tap "+ New Routine" to create one.'
              : `No templates scheduled for ${selectedDayFilter}.`}
          </div>
        ) : (
          visibleTemplates.map((tpl) => {
            const isMaster = Boolean(tpl.is_master);
            const isOwner = tpl.user_id === (selectedAthleteId || user?.id);
            const canEdit = (!isMaster && (isOwner || isCoach)) || (isMaster && isCoach && !selectedAthleteId);
            const canCustomize = (isMaster && (!isCoach || Boolean(selectedAthleteId))) || (!isMaster && !isOwner && !isCoach);
            const canDelete = (!isMaster && (isOwner || isCoach)) || (isMaster && isCoach && !selectedAthleteId);

            const isExpanded = Boolean(expandedIds[tpl.id]);
            const exerciseCount = tpl.exercises?.length || 0;
            const sortedExercises = [...(tpl.exercises || [])].sort(
              (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
            );

            return (
              <div
                key={tpl.id}
                className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 text-sm font-medium gap-3 flex flex-col"
              >
                {/* Main Card Row: Info + Action Buttons */}
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-100 font-bold truncate text-sm">{tpl.name}</span>
                      {tpl.is_master && (
                        <Tag label="Master" tone="info" testId={`tag-master-${tpl.id}`} />
                      )}
                      {tpl.assigned_to && tpl.assigned_to === user?.id && (
                        <Tag label="Assigned" tone="warning" testId={`tag-assigned-${tpl.id}`} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {/* L18: Accordion Toggle Button */}
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`template-preview-${tpl.id}`}
                        data-testid={`template-accordion-btn-${tpl.id}`}
                        onClick={() => toggleAccordion(tpl.id)}
                        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition min-h-[44px] py-1 touch-manipulation cursor-pointer"
                      >
                        <span>{exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>

                      {tpl.days_of_week && tpl.days_of_week.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tpl.days_of_week.map((d) => (
                            <span
                              key={d}
                              className="text-xs font-bold px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded border border-violet-500/30"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions: Edit, Duplicate, Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplate(tpl);
                          setIsForking(false);
                          setIsTemplateModalOpen(true);
                        }}
                        data-testid={`edit-template-${tpl.id}`}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-violet-400 transition touch-manipulation cursor-pointer"
                        title="Edit Template"
                        aria-label={`Edit ${tpl.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canCustomize && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplate(tpl);
                          setIsForking(true);
                          setIsTemplateModalOpen(true);
                        }}
                        data-testid={`fork-template-${tpl.id}`}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation cursor-pointer"
                        title="Duplicate & Customize"
                        aria-label={`Duplicate ${tpl.name}`}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => schedule(tpl, tpl.name)}
                        data-testid={`delete-template-${tpl.id}`}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-rose-400 transition touch-manipulation cursor-pointer"
                        title="Delete"
                        aria-label={`Delete ${tpl.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* L25: "Start routine" CTA Button */}
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    testId={`start-routine-${tpl.id}`}
                    onClick={() => {
                      if (onStartRoutine) {
                        onStartRoutine(tpl);
                      } else {
                        navigate(`/workout?routine=${tpl.id}`);
                      }
                    }}
                    leftIcon={<Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />}
                  >
                    Start routine
                  </Button>
                </div>

                {/* L18 Accordion Content: Listing exercises with sets x reps and Archived pill */}
                {isExpanded && (
                  <div
                    id={`template-preview-${tpl.id}`}
                    data-testid={`template-preview-${tpl.id}`}
                    className="mt-1 pt-3 border-t border-zinc-800/80 space-y-2 animate-in fade-in duration-200"
                  >
                    {sortedExercises.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No exercises in this template.</p>
                    ) : (
                      <ul className="space-y-1.5 list-none p-0 m-0">
                        {sortedExercises.map((te) => {
                          const ex = exerciseMap.get(te.exercise_id);
                          const isArchived = Boolean(ex?.is_archived || (te.exercise as any)?.is_archived);
                          const exerciseName = ex?.name || te.exercise?.name || te.exercise_name || 'Exercise';
                          const setsReps =
                            te.target_reps != null && te.target_reps > 0
                              ? `${te.target_sets} × ${te.target_reps}`
                              : `${te.target_sets} sets`;

                          return (
                            <li
                              key={te.id || te.exercise_id}
                              className="flex items-center justify-between text-xs text-zinc-300 py-1 gap-2 border-b border-zinc-800/40 last:border-b-0"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="truncate font-medium">{exerciseName}</span>
                                {isArchived && (
                                  <Tag label="Archived" tone="neutral" testId={`archived-pill-${te.id || te.exercise_id}`} />
                                )}
                              </div>
                              <span className="text-zinc-400 shrink-0 font-medium tabular-nums">{setsReps}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* RD-7 Deferred Delete UndoToast */}
      <UndoToast
        toast={
          pending
            ? {
                verb: 'Routine deleted',
                subject: pending.label,
                onUndo: undo,
                undoAriaLabel: `Undo delete ${pending.label}`,
              }
            : null
        }
        onDismiss={flush}
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
        onSuccess={async () => {
          await invalidateExerciseDomain(queryClient, targetUserId);
        }}
      />
    </div>
  );
};

export default TemplateListTab;

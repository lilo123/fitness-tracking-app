import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { PlusCircle, RefreshCw, AlertCircle, Pencil, Copy, Trash2 } from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';
import { EditTemplateModal } from './EditTemplateModal';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface TemplateListTabProps {
  templates: RoutineTemplate[];
  exercises: Exercise[];
  isReadError?: boolean;
  targetUserId?: string;
}

export const TemplateListTab: React.FC<TemplateListTabProps> = ({
  templates,
  exercises,
  isReadError,
  targetUserId: propTargetUserId,
}) => {
  const { user } = useAuth();
  const { selectedAthleteId, isCoach } = useCoach();
  const queryClient = useQueryClient();

  const targetUserId = propTargetUserId ?? user?.id ?? '';

  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('All');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<RoutineTemplate | null>(null);
  const [isForking, setIsForking] = useState<boolean>(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      setTemplateError(null);
      // 0-row delete: use .select() and treat [] as failure
      const { data, error } = await supabase
        .from('routine_templates')
        .delete()
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Routine template could not be deleted. You may not have permission to modify this template.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
      setTemplateError(null);
    },
    onError: (err: any) => {
      let msg = err?.message || 'Failed to delete routine template';
      if (err?.code === '23503' || String(err?.message).includes('23503')) {
        msg = 'Cannot delete routine template because other records reference it.';
      }
      setTemplateError(msg);
    },
  });

  const filteredTemplates = templates.filter((tpl) => {
    if (selectedDayFilter === 'All') return true;
    return tpl.days_of_week && tpl.days_of_week.includes(selectedDayFilter);
  });

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
                : 'bg-zinc-900 border border-border-interactive text-zinc-400 hover:text-white'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Saved Templates List */}
      <div className="space-y-2">
        {!isReadError && filteredTemplates.length === 0 ? (
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
          queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
        }}
      />
    </div>
  );
};

export default TemplateListTab;

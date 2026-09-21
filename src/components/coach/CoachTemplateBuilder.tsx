import React, { useId } from 'react';
import type { Exercise, RoutineTemplate } from '../../types/database';
import { Layers, Plus, Trash2, CheckCircle2 } from 'lucide-react';

interface SelectedTemplateExercise {
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  targetReps: number;
}

interface CoachTemplateBuilderProps {
  templateName: string;
  setTemplateName: (val: string) => void;
  isMaster: boolean;
  setIsMaster: (val: boolean) => void;
  exerciseToAdd: string;
  setExerciseToAdd: (val: string) => void;
  selectedExercises: SelectedTemplateExercise[];
  exercises: Exercise[];
  templates: RoutineTemplate[];
  isTemplatesError?: boolean;
  status: string;
  isSaving: boolean;
  onAddExercise: () => void;
  onRemoveExercise: (idx: number) => void;
  onUpdateTargetSets: (idx: number, val: number) => void;
  onUpdateTargetReps: (idx: number, val: number) => void;
  onSaveTemplate: () => void;
}

export const CoachTemplateBuilder: React.FC<CoachTemplateBuilderProps> = ({
  templateName,
  setTemplateName,
  isMaster,
  setIsMaster,
  exerciseToAdd,
  setExerciseToAdd,
  selectedExercises,
  exercises,
  templates,
  isTemplatesError,
  status,
  isSaving,
  onAddExercise,
  onRemoveExercise,
  onUpdateTargetSets,
  onUpdateTargetReps,
  onSaveTemplate,
}) => {
  const templateNameId = useId();

  return (
    <div className="space-y-6 min-w-0">
      {/* Routine Template Builder */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4 min-w-0">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 min-w-0">
          <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider truncate">
            Workout Template Builder
          </h3>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor={templateNameId} className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Template Name
            </label>
            <input
              id={templateNameId}
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Hypertrophy Upper Body A"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isMasterCheckbox"
              checked={isMaster}
              onChange={(e) => setIsMaster(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-800 text-cyan-500 focus:ring-0 w-4 h-4 shrink-0"
            />
            <label htmlFor="isMasterCheckbox" className="text-xs text-zinc-300 font-bold select-none cursor-pointer">
              Master Template (Available to all athletes)
            </label>
          </div>

          {/* Exercise Add Selector */}
          <div className="flex gap-2 w-full min-w-0">
            <select
              value={exerciseToAdd}
              onChange={(e) => setExerciseToAdd(e.target.value)}
              aria-label="Choose exercise to add"
              className="flex-1 min-w-0 max-w-full truncate cursor-pointer bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none min-h-[44px]"
              data-testid="template-exercise-select"
            >
              <option value="">-- Choose Exercise to Add --</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.name}>
                  {ex.name} ({ex.body_part || 'Body'})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onAddExercise}
              disabled={!exerciseToAdd}
              className="bg-zinc-800 hover:bg-zinc-700 text-cyan-300 font-bold px-4 py-2 min-h-[44px] rounded-xl text-xs flex items-center gap-1 border border-zinc-700 disabled:opacity-50 touch-manipulation shrink-0"
              data-testid="add-template-exercise-btn"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="shrink-0">Add</span>
            </button>
          </div>

          {/* Added Exercises List */}
          {selectedExercises.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider block">
                Exercise Sequence ({selectedExercises.length}):
              </span>
              {selectedExercises.map((ex, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                    <span className="w-5 h-5 rounded-md bg-zinc-800 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-white truncate min-w-0 flex-1">{ex.exerciseName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="20"
                          value={ex.targetSets}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 1;
                            onUpdateTargetSets(idx, val);
                          }}
                          className="w-12 min-h-[36px] bg-zinc-900 border border-zinc-750 text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold shrink-0"
                          title="Target Sets"
                          data-testid={`template-target-sets-${idx}`}
                        />
                        <span className="text-[10px] shrink-0">sets</span>
                      </div>
                      <span className="shrink-0">×</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="100"
                          value={ex.targetReps}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 1;
                            onUpdateTargetReps(idx, val);
                          }}
                          className="w-14 min-h-[36px] bg-zinc-900 border border-zinc-750 text-white rounded-lg px-1 py-0.5 text-center text-base sm:text-xs font-bold shrink-0"
                          title="Target Reps"
                          data-testid={`template-target-reps-${idx}`}
                        />
                        <span className="text-[10px] shrink-0">reps</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveExercise(idx)}
                      className="text-zinc-500 hover:text-rose-400 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation shrink-0"
                      title="Remove exercise"
                      data-testid={`template-remove-ex-${idx}`}
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onSaveTemplate}
            disabled={isSaving || !templateName.trim() || selectedExercises.length === 0}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan active:scale-95 transition disabled:opacity-50"
            data-testid="save-template-btn"
          >
            {isSaving ? 'Saving Template...' : 'Save Template'}
          </button>

          {status && (
            <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{status}</span>
            </div>
          )}
        </div>
      </div>

      {/* Existing Routine Templates */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3 min-w-0">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 min-w-0">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="truncate">Workout Templates ({templates.length})</span>
          </h3>
        </div>

        {isTemplatesError ? null : templates.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-xs">
            No workout templates created yet. Use the builder above to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between shadow-sm gap-2 min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-white text-xs flex items-center gap-2 min-w-0">
                    <span className="truncate">{tpl.name}</span>
                    {tpl.is_master && (
                      <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0">
                        Master
                      </span>
                    )}
                  </div>
                  {tpl.exercises && (
                    <div className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                      {tpl.exercises.length} exercises configured
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { AlertCircle, Layers, ChevronDown, Timer, RotateCcw } from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';
import { restTimerStore } from '../../utils/restTimerStore';

import { workoutSessionStore } from '../../utils/workoutSessionStore';

export interface WorkoutHeaderProps {
  mutationError: string | null;
  onClearMutationError: () => void;
  activeRoutineName: string;
  onOpenRoutineModal: () => void;
  workoutDate: string;
  onDateChange: (date: string) => void;
  onClearWorkout: () => void;
}

export const WorkoutHeader: React.FC<WorkoutHeaderProps> = ({
  mutationError,
  onClearMutationError,
  activeRoutineName,
  onOpenRoutineModal,
  workoutDate,
  onDateChange,
  onClearWorkout,
}) => {
  return (
    <>
      {/* Mutation Error Notification */}
      <StatusBanner
        message={mutationError}
        tone="error"
        icon={<AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />}
        action={
          <button
            type="button"
            onClick={onClearMutationError}
            className="p-1 min-w-[44px] min-h-[44px] text-rose-400 hover:text-white flex items-center justify-center"
          >
            ✕
          </button>
        }
      />


      {/* Routine & Date Control Banner */}
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 shadow-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-400 shrink-0">
              Routine:
            </span>
            <button
              onClick={onOpenRoutineModal}
              className="bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/80 hover:border-cyan-500/50 text-white text-xs font-bold px-3 py-1.5 min-h-[44px] rounded-xl flex items-center gap-2 transition-all shadow-sm"
              data-testid="routine-select-btn"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate max-w-[110px] sm:max-w-[200px]">{activeRoutineName}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400 ml-0.5 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => restTimerStore.toggleHeaderTimer()}
              className="bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/80 hover:border-cyan-500/50 text-cyan-300 text-xs font-bold px-3 py-1.5 min-h-[44px] rounded-xl flex items-center gap-1.5 transition-all shadow-sm touch-manipulation shrink-0"
              title="Rest Timer"
              data-testid="rest-timer-btn"
            >
              <Timer className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Rest Timer</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">
              Date:
            </span>
            <input
              type="date"
              value={workoutDate}
              onChange={(e) => {
                workoutSessionStore.flushPendingWrites();
                onDateChange(e.target.value);
              }}
              className="bg-zinc-950 border border-zinc-800 text-cyan-400 rounded-xl px-2.5 py-1.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none shadow-inner cursor-pointer"
              data-testid="workout-date-input"
            />
            <button
              onClick={onClearWorkout}
              className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-extrabold px-2.5 py-1.5 rounded-xl text-xs transition flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.15)] active:scale-95"
              title="Clear Workout"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

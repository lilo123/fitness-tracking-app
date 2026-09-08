import React, { useSyncExternalStore } from 'react';
import { Timer, Play, Pause, RotateCw } from 'lucide-react';
import { restTimerStore } from '../../utils/restTimerStore';

export const GlobalRestTimerPill: React.FC = () => {
  const state = useSyncExternalStore(
    restTimerStore.subscribe,
    restTimerStore.getSnapshot,
    restTimerStore.getServerSnapshot
  );

  if (!state.isRunning && !state.isPaused) {
    return null;
  }

  const mins = Math.floor(state.remainingSeconds / 60);
  const secs = (state.remainingSeconds % 60).toString().padStart(2, '0');

  return (
    <div
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-[45] max-w-lg mx-auto bg-zinc-900/95 backdrop-blur-xl border border-cyan-500/50 rounded-2xl p-3 flex items-center justify-between shadow-[0_4px_25px_rgba(6,182,212,0.3)] animate-pulse"
      data-testid="rest-timer-pill"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
          <Timer className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 font-bold">
            Rest Timer
          </div>
          <div className="text-xl font-black font-mono text-white" data-testid="rest-timer-display">
            {mins}:{secs}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => (state.isRunning ? restTimerStore.pause() : restTimerStore.resume())}
          className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-cyan-300 flex items-center justify-center transition"
          title={state.isRunning ? 'Pause timer' : 'Resume timer'}
          aria-label={state.isRunning ? 'Pause timer' : 'Resume timer'}
        >
          {state.isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={() => restTimerStore.addSeconds(90)}
          className="min-w-[44px] min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition"
          title="Add 90 seconds"
          aria-label="Add 90 seconds"
        >
          +90s
        </button>
        <button
          type="button"
          onClick={() => restTimerStore.stop()}
          className="min-w-[44px] min-h-[44px] rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center transition"
          title="Stop timer"
          aria-label="Stop timer"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

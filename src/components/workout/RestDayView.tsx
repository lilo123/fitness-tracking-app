import React from 'react';
import { Bed, Calendar, Dumbbell } from 'lucide-react';

export interface RestDayViewProps {
  onOpenRoutineModal: () => void;
}

export const RestDayView: React.FC<RestDayViewProps> = ({ onOpenRoutineModal }) => {
  return (
    <div className="bg-gradient-to-br from-indigo-950/40 via-zinc-900/90 to-zinc-950 border border-indigo-500/30 rounded-3xl p-8 text-center text-white shadow-2xl my-2">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 text-indigo-400 text-2xl shadow-[0_0_20px_rgba(99,102,241,0.25)]">
        <Bed className="w-8 h-8" />
      </div>
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2.5">
        <Calendar className="w-3.5 h-3.5" /> Rest Day
      </div>
      <h3 className="text-lg font-black text-white mb-1.5">Rest & Recovery</h3>
      <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-6 leading-relaxed">
        Take today to rest and recover, stretch, or choose a routine if you want to train today.
      </p>
      <button
        onClick={onOpenRoutineModal}
        className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white font-black py-3 px-6 rounded-xl text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(139,92,246,0.25)] active:scale-95 transition flex items-center gap-2 mx-auto"
      >
        <Dumbbell className="w-4 h-4" />
        <span>Choose Routine</span>
      </button>
    </div>
  );
};

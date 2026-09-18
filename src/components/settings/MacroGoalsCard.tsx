import React from 'react';
import { Target, CheckCircle2, AlertCircle } from 'lucide-react';

interface MacroGoalsCardProps {
  targetCalories: number;
  setTargetCalories: (val: number) => void;
  targetProtein: number;
  setTargetProtein: (val: number) => void;
  targetCarbs: number;
  setTargetCarbs: (val: number) => void;
  targetFat: number;
  setTargetFat: (val: number) => void;
  targetFiber: number;
  setTargetFiber: (val: number) => void;
  loading: boolean;
  status: { type: 'success' | 'error'; message: string } | null;
  onSave: (e: React.FormEvent) => void;
}

export const MacroGoalsCard: React.FC<MacroGoalsCardProps> = ({
  targetCalories,
  setTargetCalories,
  targetProtein,
  setTargetProtein,
  targetCarbs,
  setTargetCarbs,
  targetFat,
  setTargetFat,
  targetFiber,
  setTargetFiber,
  loading,
  status,
  onSave,
}) => {
  return (
    <form
      onSubmit={onSave}
      className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <Target className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-black text-white uppercase tracking-wider">
          Daily Macro Goals
        </h3>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-5 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
            Calories (kcal)
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={targetCalories}
            onChange={(e) => setTargetCalories(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
            Protein (g)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={targetProtein}
            onChange={(e) => setTargetProtein(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
            Carbs (g)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={targetCarbs}
            onChange={(e) => setTargetCarbs(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
            Fat (g)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={targetFat}
            onChange={(e) => setTargetFat(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
            required
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
            Fiber (g)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={targetFiber}
            onChange={(e) => setTargetFiber(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan active:scale-95 transition disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save Goals'}
      </button>

      {status && (
        <div
          data-testid="settings-status-banner"
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            status.type === 'error'
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
              : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
          }`}
        >
          {status.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{status.message}</span>
        </div>
      )}
    </form>
  );
};

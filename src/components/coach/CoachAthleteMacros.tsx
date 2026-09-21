import React, { useId } from 'react';
import { Target, CheckCircle2, AlertCircle } from 'lucide-react';

interface CoachAthleteMacrosProps {
  selectedAthlete: { name?: string } | null;
  athleteCal: number | string;
  setAthleteCal: (val: string) => void;
  athletePro: number | string;
  setAthletePro: (val: string) => void;
  athleteCarb: number | string;
  setAthleteCarb: (val: string) => void;
  athleteFat: number | string;
  setAthleteFat: (val: string) => void;
  athleteFiber: number | string;
  setAthleteFiber: (val: string) => void;
  isUpdatingMacros: boolean;
  macroStatus: { type: 'success' | 'error'; message: string } | null;
  onUpdateAthleteMacros: (e: React.FormEvent) => void;
}

export const CoachAthleteMacros: React.FC<CoachAthleteMacrosProps> = ({
  selectedAthlete,
  athleteCal,
  setAthleteCal,
  athletePro,
  setAthletePro,
  athleteCarb,
  setAthleteCarb,
  athleteFat,
  setAthleteFat,
  athleteFiber,
  setAthleteFiber,
  isUpdatingMacros,
  macroStatus,
  onUpdateAthleteMacros,
}) => {
  const baseId = useId();
  const calId = `${baseId}-cal`;
  const proId = `${baseId}-pro`;
  const carbId = `${baseId}-carb`;
  const fatId = `${baseId}-fat`;
  const fiberId = `${baseId}-fiber`;

  return (
    <form
      onSubmit={onUpdateAthleteMacros}
      className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          Athlete Nutrition Targets: {selectedAthlete?.name}
        </h3>
        <span className="text-[10px] uppercase font-bold text-zinc-400">Coach Override</span>
      </div>

      <p className="text-xs text-zinc-400">
        Set daily caloric and macronutrient goals for this athlete. Changes update their dashboard in real time.
      </p>

      <div className="space-y-3">
        {/* Tier 1: Full-Width Hero Daily Calorie Target */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label htmlFor={calId} className="block text-[11px] font-black text-amber-400 uppercase tracking-wider mb-0.5">
              Daily Calorie Target
            </label>
            <p className="text-[11px] text-zinc-400 font-medium">Total caloric energy ceiling per day</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={calId}
              type="number"
              inputMode="numeric"
              min="0"
              max="10000"
              value={athleteCal}
              onChange={(e) => setAthleteCal(e.target.value)}
              data-testid="athlete-macro-cal"
              className="w-full sm:w-36 min-h-[44px] bg-zinc-900 border border-zinc-700 text-amber-400 rounded-xl p-2.5 text-lg font-mono font-black focus:border-amber-500 outline-none text-center shadow-inner"
              required
            />
            <span className="text-xs font-mono font-bold text-zinc-400">kcal</span>
          </div>
        </div>

        {/* Tier 2: Sub-Macro 2x2 Grid (Mobile) / 4-Col Grid (Desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {/* Protein */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={proId} className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">Protein</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
            </div>
            <input
              id={proId}
              type="number"
              inputMode="decimal"
              min="0"
              value={athletePro}
              onChange={(e) => setAthletePro(e.target.value)}
              data-testid="athlete-macro-pro"
              className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              required
            />
          </div>

          {/* Carbs */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={carbId} className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Carbs</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
            </div>
            <input
              id={carbId}
              type="number"
              inputMode="decimal"
              min="0"
              value={athleteCarb}
              onChange={(e) => setAthleteCarb(e.target.value)}
              data-testid="athlete-macro-carb"
              className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-emerald-500 outline-none text-center"
              required
            />
          </div>

          {/* Fat */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={fatId} className="text-[10px] font-black text-violet-400 uppercase tracking-wider">Fat</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
            </div>
            <input
              id={fatId}
              type="number"
              inputMode="decimal"
              min="0"
              value={athleteFat}
              onChange={(e) => setAthleteFat(e.target.value)}
              data-testid="athlete-macro-fat"
              className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-violet-500 outline-none text-center"
              required
            />
          </div>

          {/* Fiber */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={fiberId} className="text-[10px] font-black text-teal-400 uppercase tracking-wider">Fiber</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">grams</span>
            </div>
            <input
              id={fiberId}
              type="number"
              inputMode="decimal"
              min="0"
              value={athleteFiber}
              onChange={(e) => setAthleteFiber(e.target.value)}
              data-testid="athlete-macro-fiber"
              className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-teal-500 outline-none text-center"
              required
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isUpdatingMacros}
        className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan transition disabled:opacity-50 touch-manipulation flex items-center justify-center gap-2"
        data-testid="update-athlete-macros-btn"
      >
        <Target className="w-4 h-4" />
        {isUpdatingMacros ? 'Updating Targets...' : 'Update Athlete Targets'}
      </button>

      {macroStatus && (
        <div
          data-testid="athlete-macro-status"
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            macroStatus.type === 'error'
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
              : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
          }`}
        >
          {macroStatus.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{macroStatus.message}</span>
        </div>
      )}
    </form>
  );
};

import React, { memo } from 'react';
import { Flame } from 'lucide-react';
import { MacroRing } from '../common/MacroRing';
import type { BreakdownNutrient } from './NutrientBreakdownModal';

export interface NutritionDashboardRingsProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  dailyTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  remainingFuel: {
    calories: { badgeLabel: string; isOver: boolean };
    protein: { badgeLabel: string; isOver: boolean };
    carbs: { badgeLabel: string; isOver: boolean };
    fat: { badgeLabel: string; isOver: boolean };
    fiber: { badgeLabel: string; isOver: boolean };
  };
  onSelectBreakdownNutrient: (nutrient: BreakdownNutrient) => void;
}

export const NutritionDashboardRings: React.FC<NutritionDashboardRingsProps> = memo(({
  selectedDate,
  onDateChange,
  dailyTotals,
  targets,
  remainingFuel,
  onSelectBreakdownNutrient,
}) => {
  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-black uppercase tracking-wider text-white">
            Today's Nutrition
          </h2>
        </div>
        <input
          type="date"
          data-testid="nutrition-date-input"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 text-cyan-400 rounded-xl px-2.5 py-1.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none cursor-pointer"
        />
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-5 gap-1.5 sm:gap-2">
        <div className="col-span-2 sm:col-span-1">
          <MacroRing
            label="Calories"
            current={dailyTotals.calories}
            target={targets.calories}
            unit="kcal"
            colorClass="text-amber-400"
            strokeColor="#f59e0b"
            onClick={() => onSelectBreakdownNutrient('calories')}
            testId="macro-ring-calories"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <MacroRing
            label="Protein"
            current={dailyTotals.protein}
            target={targets.protein}
            unit="g"
            colorClass="text-cyan-400"
            strokeColor="#06b6d4"
            onClick={() => onSelectBreakdownNutrient('protein')}
            testId="macro-ring-protein"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <MacroRing
            label="Carbs"
            current={dailyTotals.carbs}
            target={targets.carbs}
            unit="g"
            colorClass="text-emerald-400"
            strokeColor="#10b981"
            onClick={() => onSelectBreakdownNutrient('carbs')}
            testId="macro-ring-carbs"
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <MacroRing
            label="Fat"
            current={dailyTotals.fat}
            target={targets.fat}
            unit="g"
            colorClass="text-violet-400"
            strokeColor="#8b5cf6"
            onClick={() => onSelectBreakdownNutrient('fat')}
            testId="macro-ring-fat"
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <MacroRing
            label="Fiber"
            current={dailyTotals.fiber}
            target={targets.fiber}
            unit="g"
            colorClass="text-teal-400"
            strokeColor="#14b8a6"
            onClick={() => onSelectBreakdownNutrient('fiber')}
            testId="macro-ring-fiber"
          />
        </div>
      </div>

      {/* Daily Remaining Fuel Indicator */}
      <div
        data-testid="remaining-fuel-container"
        className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono"
      >
        <span className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Remaining Fuel:</span>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.focus();
              onSelectBreakdownNutrient('calories');
            }}
            data-testid="remaining-fuel-calories"
            className={`px-2 py-0.5 min-h-[44px] inline-flex items-center justify-center rounded-lg border text-[11px] font-mono font-bold transition-all cursor-pointer touch-manipulation hover:brightness-110 active:scale-95 ${
              remainingFuel.calories.isOver
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.1)]'
            }`}
          >
            {remainingFuel.calories.badgeLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.focus();
              onSelectBreakdownNutrient('protein');
            }}
            data-testid="remaining-fuel-protein"
            className={`px-2 py-0.5 min-h-[44px] inline-flex items-center justify-center rounded-lg border text-[11px] font-mono font-bold transition-all cursor-pointer touch-manipulation hover:brightness-110 active:scale-95 ${
              remainingFuel.protein.isOver
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                : 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.1)]'
            }`}
          >
            {remainingFuel.protein.badgeLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.focus();
              onSelectBreakdownNutrient('carbs');
            }}
            data-testid="remaining-fuel-carbs"
            className={`px-2 py-0.5 min-h-[44px] inline-flex items-center justify-center rounded-lg border text-[11px] font-mono font-bold transition-all cursor-pointer touch-manipulation hover:brightness-110 active:scale-95 ${
              remainingFuel.carbs.isOver
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.1)]'
            }`}
          >
            {remainingFuel.carbs.badgeLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.focus();
              onSelectBreakdownNutrient('fat');
            }}
            data-testid="remaining-fuel-fat"
            className={`px-2 py-0.5 min-h-[44px] inline-flex items-center justify-center rounded-lg border text-[11px] font-mono font-bold transition-all cursor-pointer touch-manipulation hover:brightness-110 active:scale-95 ${
              remainingFuel.fat.isOver
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                : 'bg-violet-500/10 border-violet-500/25 text-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.1)]'
            }`}
          >
            {remainingFuel.fat.badgeLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.focus();
              onSelectBreakdownNutrient('fiber');
            }}
            data-testid="remaining-fuel-fiber"
            className={`px-2 py-0.5 min-h-[44px] inline-flex items-center justify-center rounded-lg border text-[11px] font-mono font-bold transition-all cursor-pointer touch-manipulation hover:brightness-110 active:scale-95 ${
              remainingFuel.fiber.isOver
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                : 'bg-teal-500/10 border-teal-500/25 text-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.1)]'
            }`}
          >
            {remainingFuel.fiber.badgeLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

NutritionDashboardRings.displayName = 'NutritionDashboardRings';

import React from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { NutritionLog } from '../../types/database';
import { Calendar } from 'lucide-react';
import { formatShortDate } from '../../utils/ghostSets';
import { formatCalories, formatMacro } from '../../utils/nutrition';
import { MealLogRow } from '../nutrition/MealLogRow';
import type { NutritionItem } from '../../utils/itemModel';
import { FALLBACK_WINDOW } from './virtualizationConstants';

export interface NutritionDaySummary {
  date: string;
  meals: NutritionLog[];
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  macroCalories: { protein: number; carbs: number; fat: number; total: number };
  percentages: { protein: number; carbs: number; fat: number };
}

interface NutritionHistoryTimelineProps {
  filteredNutritionDays: NutritionDaySummary[];
  timeRange: 'all' | '90d' | '30d' | '1y';
  isInspectingAthlete: boolean;
  onEditMeal: (meal: NutritionLog) => void;
  onDeleteMeal: (mealId: string) => void;
  onScaleMeal: (log: NutritionLog, items: NutritionItem[]) => Promise<unknown>;
}

export const NutritionHistoryTimeline: React.FC<NutritionHistoryTimelineProps> = ({
  filteredNutritionDays,
  timeRange,
  isInspectingAthlete,
  onEditMeal,
  onDeleteMeal,
  onScaleMeal,
}) => {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);

  // We re-measure scrollMargin whenever the container ref attaches to the DOM, when layout shifts,
  // or when the window resizes. The nutrition timeline sits below dynamic controls (time range pills,
  // athlete selector, macro summaries) whose conditional rendering shifts the container's offsetTop
  // after mount. Tracking offsetTop dynamically ensures useWindowVirtualizer computes accurate
  // window scroll offsets, preventing cards from prematurely unmounting during window scroll.
  const measureScrollMargin = React.useCallback(() => {
    if (parentRef.current) {
      const offsetTop = parentRef.current.offsetTop;
      setScrollMargin((prev) => (prev !== offsetTop ? offsetTop : prev));
    }
  }, []);

  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    parentRef.current = node;
    if (node) {
      const offsetTop = node.offsetTop;
      setScrollMargin((prev) => (prev !== offsetTop ? offsetTop : prev));
    }
  }, []);

  React.useLayoutEffect(() => {
    measureScrollMargin();
  });

  React.useEffect(() => {
    measureScrollMargin();
    window.addEventListener('resize', measureScrollMargin);
    if (typeof ResizeObserver !== 'undefined' && document.body) {
      const observer = new ResizeObserver(() => {
        measureScrollMargin();
      });
      observer.observe(document.body);
      return () => {
        window.removeEventListener('resize', measureScrollMargin);
        observer.disconnect();
      };
    }
    return () => {
      window.removeEventListener('resize', measureScrollMargin);
    };
  }, [measureScrollMargin]);

  const virtualizer = useWindowVirtualizer({
    count: filteredNutritionDays.length,
    estimateSize: (index) => {
      const day = filteredNutritionDays[index];
      const mealsCount = day?.meals?.length ?? 1;
      return 200 + mealsCount * 80;
    },
    overscan: 0,
    gap: 16,
    scrollMargin,
    measureElement: (element, entry) => {
      if (entry?.borderBoxSize?.[0]?.blockSize) {
        return Math.round(entry.borderBoxSize[0].blockSize);
      }
      const measured = element?.getBoundingClientRect?.()?.height;
      if (measured && measured > 0) {
        return Math.round(measured);
      }
      const index = Number(element?.getAttribute('data-index'));
      const day = filteredNutritionDays[index];
      const mealsCount = day?.meals?.length ?? 1;
      return 200 + mealsCount * 80;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();
  const isVirtual = virtualItems.length > 0;

  if (filteredNutritionDays.length === 0) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 text-center text-zinc-500 text-xs">
        {timeRange === 'all'
          ? 'No nutrition logs recorded yet.'
          : 'No nutrition logs recorded in this time range.'}
      </div>
    );
  }

  const renderDayCard = (day: NutritionDaySummary) => (
    <div
      key={day.date}
      className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4"
    >
          {/* Date Header & Macro Summary Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>{formatShortDate(day.date)}</span>
              </h3>
              <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
                {day.date} • {day.meals.length} {day.meals.length === 1 ? 'meal' : 'meals'} logged
              </div>
            </div>

            {/* Daily Macro Summary Pills */}
            <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs font-bold">
              <span className="bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-xl">
                {formatCalories(day.totals.calories)} kcal
              </span>
              <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-xl text-[11px]">
                {formatMacro(day.totals.protein)}g P
              </span>
              <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-xl text-[11px]">
                {formatMacro(day.totals.carbs)}g C
              </span>
              <span className="bg-violet-500/15 text-violet-400 border border-violet-500/30 px-2 py-1 rounded-xl text-[11px]">
                {formatMacro(day.totals.fat)}g F
              </span>
              <span className="bg-teal-500/15 text-teal-400 border border-teal-500/30 px-2 py-1 rounded-xl text-[11px]">
                {formatMacro(day.totals.fiber)}g Fib
              </span>
            </div>
          </div>

          {/* Proportional Caloric Macro Distribution Bar */}
          {day.macroCalories.total > 0 && (
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-zinc-400 tracking-wider">
                <span>Caloric Macro Distribution</span>
                <span className="text-zinc-500 font-mono font-normal text-[10px]">
                  {formatCalories(day.macroCalories.total)} macro kcal
                </span>
              </div>

              {/* Multi-segment ratio bar */}
              <div className="h-2.5 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden flex shadow-inner">
                {day.percentages.protein > 0 && (
                  <div
                    style={{ width: `${day.percentages.protein}%` }}
                    className="bg-cyan-400 transition-all duration-500"
                    title={`Protein: ${day.percentages.protein}% (${formatCalories(day.macroCalories.protein)} kcal)`}
                  />
                )}
                {day.percentages.carbs > 0 && (
                  <div
                    style={{ width: `${day.percentages.carbs}%` }}
                    className="bg-emerald-400 transition-all duration-500"
                    title={`Carbs: ${day.percentages.carbs}% (${formatCalories(day.macroCalories.carbs)} kcal)`}
                  />
                )}
                {day.percentages.fat > 0 && (
                  <div
                    style={{ width: `${day.percentages.fat}%` }}
                    className="bg-violet-400 transition-all duration-500"
                    title={`Fat: ${day.percentages.fat}% (${formatCalories(day.macroCalories.fat)} kcal)`}
                  />
                )}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span>
                  <span className="text-cyan-300 font-bold">{day.percentages.protein}% P</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                  <span className="text-emerald-300 font-bold">{day.percentages.carbs}% C</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400 inline-block"></span>
                  <span className="text-violet-300 font-bold">{day.percentages.fat}% F</span>
                </div>
              </div>
            </div>
          )}

          {/* Meals timeline for this day */}
          <div className="space-y-2 pt-1">
            {day.meals.map((meal) => (
              <MealLogRow
                key={meal.id}
                log={meal}
                onEdit={onEditMeal}
                onDelete={(m) => onDeleteMeal(m.id)}
                readOnly={isInspectingAthlete}
                onItemsChange={
                  isInspectingAthlete
                    ? undefined
                    : (m, items) => onScaleMeal(m, items)
                }
              />
            ))}
          </div>
        </div>
  );

  return (
    <div className="space-y-4">
      {!isVirtual ? (
        <div ref={containerRef} className="space-y-4">
          {filteredNutritionDays.length > FALLBACK_WINDOW && (
            <div
              data-testid="virtualizer-fallback-notice"
              className="text-xs text-zinc-500 text-center py-2 font-mono"
            >
              Showing first {FALLBACK_WINDOW} of {filteredNutritionDays.length} (virtualization disabled)
            </div>
          )}
          {filteredNutritionDays.slice(0, FALLBACK_WINDOW).map((day) => (
            <div key={day.date}>
              {renderDayCard(day)}
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            width: '100%',
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualItems.map((virtualRow) => {
            const day = filteredNutritionDays[virtualRow.index];
            if (!day) return null;
            return (
              <div
                key={day.date || virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: `${virtualRow.start - scrollMargin}px`,
                  left: 0,
                  width: '100%',
                }}
              >
                {renderDayCard(day)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

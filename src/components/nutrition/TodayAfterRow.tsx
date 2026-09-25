import React from 'react';
import { roundTo1Decimal, formatCalories, formatMacro } from '../../utils/nutrition';
import {
  type MacroColumnKey,
  MACRO_COLUMNS_CONFIG,
  getMacroGridTemplateColumns,
} from './macroColumns';

export interface MacroTotalsShape {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface DayTotalRowProps {
  macroColumns: MacroColumnKey[];
  mealTotals: MacroTotalsShape;
  dailyTotals?: Partial<MacroTotalsShape>;
  targets?: Partial<MacroTotalsShape>;
}

export const DayTotalRow: React.FC<DayTotalRowProps> = ({
  macroColumns,
  mealTotals,
  dailyTotals,
  targets,
}) => {
  return (
    <div
      data-testid="staged-meal-day-total"
      className="mt-2.5 text-xs tabular-nums leading-tight"
    >
      <div
        data-testid="day-total-label"
        className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-0.5 leading-none"
      >
        Day total
      </div>
      <div
        data-testid="day-total-grid"
        className="grid text-xs tabular-nums leading-tight"
        style={{ gridTemplateColumns: getMacroGridTemplateColumns(macroColumns) }}
      >
        {macroColumns.map((colKey) => {
          const config = MACRO_COLUMNS_CONFIG[colKey];
          const consumed = Number(dailyTotals?.[colKey]) || 0;
          const meal = Number(mealTotals[colKey]) || 0;
          const newVal = roundTo1Decimal(consumed + meal);
          const target = Number(targets?.[colKey]) || 0;
          const isOver = target > 0 && newVal > target;

          const isZero = colKey === 'calories' ? Math.abs(newVal) < 0.5 : Math.abs(newVal) < 0.05;
          const formatted = isZero ? '0' : (colKey === 'calories' ? formatCalories(newVal) : formatMacro(newVal));

          const colorClass = isOver
            ? 'text-rose-400'
            : isZero
            ? 'text-zinc-600 font-normal'
            : config.colorClass;

          const overAmount = isOver ? roundTo1Decimal(newVal - target) : 0;
          const formattedOver = colKey === 'calories' ? formatCalories(overAmount) : formatMacro(overAmount);
          const overDescription = isOver ? `over target by ${formattedOver} ${config.label}` : undefined;

          return (
            <div
              key={colKey}
              data-testid={`day-total-${colKey}`}
              className={`text-right text-xs tabular-nums ${colorClass}`}
              aria-label={overDescription}
            >
              <span
                data-testid={`day-total-val-${colKey}`}
                className={`tabular-nums ${isZero && !isOver ? 'font-normal' : 'font-semibold'}`}
              >
                {formatted}
              </span>{' '}
              <span className="opacity-70 font-normal">
                {config.label}
              </span>
              {isOver && (
                <span data-testid={`day-total-over-${colKey}`} className="sr-only">
                  {overDescription}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const TodayAfterRow = DayTotalRow;
export type TodayAfterRowProps = DayTotalRowProps;

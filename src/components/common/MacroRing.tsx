import React from 'react';
import { formatCalories, formatMacro } from '../../utils/nutrition';

export interface MacroRingProps {
  label: string;
  current: number;
  target: number;
  unit: string;
  colorClass: string;
  strokeColor: string;
  onClick?: () => void;
  testId?: string;
}

export const MacroRing: React.FC<MacroRingProps> = ({
  label,
  current,
  target,
  unit,
  colorClass,
  strokeColor,
  onClick,
  testId,
}) => {
  const safeTarget = target > 0 ? target : 1;
  const displayPercentage = Math.round((current / safeTarget) * 100);
  const strokePercentage = Math.min(Math.max(displayPercentage, 0), 100);

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (strokePercentage / 100) * circumference;

  const isCalories = unit === 'kcal' || label.toLowerCase().includes('cal');
  const formattedCurrent = isCalories ? formatCalories(current) : formatMacro(current);
  const formattedTarget = isCalories ? formatCalories(target) : formatMacro(target);

  const innerContent = (
    <>
      <div className="relative w-14 h-14 sm:w-18 sm:h-18 flex items-center justify-center">
        <svg className="w-14 h-14 sm:w-18 sm:h-18 transform -rotate-90" viewBox="0 0 76 76">
          {/* Background circle */}
          <circle
            cx="38"
            cy="38"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            className="text-zinc-800"
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx="38"
            cy="38"
            r={radius}
            stroke={strokeColor}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className={`text-[10px] sm:text-xs font-black font-mono ${colorClass}`}>
            {formattedCurrent}
          </span>
          <span className="text-[8px] sm:text-[9px] text-zinc-500 font-mono -mt-0.5">
            /{formattedTarget}
          </span>
        </div>
      </div>
      <div className="mt-1.5 sm:mt-2 text-center w-full">
        <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-zinc-300 truncate">
          {label}
        </div>
        <div className="text-[8px] sm:text-[9px] text-zinc-500 font-mono">
          {displayPercentage}% {unit}
        </div>
      </div>
    </>
  );

  const baseClasses =
    'flex flex-col items-center p-2 sm:p-3 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl shadow-xl flex-1 w-full min-w-[56px] sm:min-w-[75px] min-h-[44px]';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.focus();
          onClick();
        }}
        data-testid={testId}
        aria-label={`${label} breakdown: ${formattedCurrent} of ${formattedTarget} ${unit}`}
        className={`${baseClasses} cursor-pointer hover:border-zinc-700 hover:bg-zinc-800/80 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 transition-all touch-manipulation`}
      >
        {innerContent}
      </button>
    );
  }

  return (
    <div data-testid={testId} className={baseClasses}>
      {innerContent}
    </div>
  );
};

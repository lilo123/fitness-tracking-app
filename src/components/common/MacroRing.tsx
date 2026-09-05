import React from 'react';

interface MacroRingProps {
  label: string;
  current: number;
  target: number;
  unit: string;
  colorClass: string;
  strokeColor: string;
}

export const MacroRing: React.FC<MacroRingProps> = ({
  label,
  current,
  target,
  unit,
  colorClass,
  strokeColor,
}) => {
  const safeTarget = target > 0 ? target : 1;
  const displayPercentage = Math.round((current / safeTarget) * 100);
  const strokePercentage = Math.min(Math.max(displayPercentage, 0), 100);

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (strokePercentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center p-2 sm:p-3 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl shadow-xl flex-1 min-w-[56px] sm:min-w-[75px]">
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
            {current}
          </span>
          <span className="text-[8px] sm:text-[9px] text-zinc-500 font-mono -mt-0.5">
            /{target}
          </span>
        </div>
      </div>
      <div className="mt-1.5 sm:mt-2 text-center">
        <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-zinc-300 truncate">
          {label}
        </div>
        <div className="text-[8px] sm:text-[9px] text-zinc-500 font-mono">
          {displayPercentage}% {unit}
        </div>
      </div>
    </div>
  );
};

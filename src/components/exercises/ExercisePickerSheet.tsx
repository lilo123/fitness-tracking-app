import React from 'react';
import type { Exercise } from '../../types/database';
import { ArrowLeft, Search, Plus } from 'lucide-react';

const CATEGORIES = ['All', 'Chest', 'Back', 'Arms', 'Shoulders', 'Legs', 'Core'];

interface ExercisePickerSheetProps {
  filteredExercises: Exercise[];
  totalExercisesCount: number;
  templateExercisesCount: number;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedCategory: string;
  onSelectedCategoryChange: (category: string) => void;
  onAddExercise: (ex: Exercise) => void;
  onClose: () => void;
}

export const ExercisePickerSheet: React.FC<ExercisePickerSheetProps> = ({
  filteredExercises,
  totalExercisesCount,
  templateExercisesCount,
  searchQuery,
  onSearchQueryChange,
  selectedCategory,
  onSelectedCategoryChange,
  onAddExercise,
  onClose,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="close-exercise-picker"
            onClick={onClose}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition touch-manipulation"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-bold text-white">Add Exercises to Routine</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 min-h-[44px] flex items-center justify-center bg-violet-500/20 text-violet-300 border border-violet-500/40 rounded-xl text-xs font-bold hover:bg-violet-500/30 transition touch-manipulation"
        >
          Done
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search exercise library..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl pl-9 pr-3 py-2.5 input-text-xs focus:border-violet-500 focus:ring-2 focus:ring-violet-500/50 outline-none"
        />
      </div>

      {/* Category Filter Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectedCategoryChange(cat)}
            className={`px-3.5 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-bold shrink-0 transition touch-manipulation ${
              selectedCategory === cat
                ? 'bg-violet-500 text-white shadow-neon-violet'
                : 'bg-zinc-950 text-zinc-400 border border-border-interactive hover:border-zinc-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Exercise Selection List */}
      <div className="space-y-2">
        {filteredExercises.map((ex) => (
          <div
            key={ex.id}
            className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800/90 rounded-2xl"
          >
            <div className="min-w-0 pr-3">
              <div className="text-xs font-bold text-white truncate">{ex.name}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{ex.body_part || 'Other'}</div>
            </div>
            <button
              type="button"
              data-testid={`add-exercise-btn-${ex.id}`}
              onClick={() => onAddExercise(ex)}
              className="px-4 py-2 min-h-[44px] bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shrink-0 touch-manipulation"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        ))}
        {filteredExercises.length === 0 && (
          <div className="text-center py-8 text-xs text-zinc-500">
            {totalExercisesCount === templateExercisesCount
              ? 'All available exercises already added to routine.'
              : 'No matching exercises found.'}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import type { CustomDish } from '../../types/database';
import { AccessibleModal } from '../common/AccessibleModal';
import { Search, X, Star, Plus, Edit2, FileText } from 'lucide-react';
import { getDishIcon } from '../../utils/dishIcons';
import { formatCalories, formatMacro } from '../../utils/nutrition';

export interface QuickLogAllSheetProps {
  isOpen: boolean;
  onClose: () => void;
  customDishes: (CustomDish & { notes?: string | null })[];
  onStageCustomDish: (dish: CustomDish) => void;
  onOpenEditDishModal: (dish: CustomDish) => void;
  onQuickLogCustomDishDirect: (dish: CustomDish, e: React.MouseEvent) => void;
  onOpenNewDishModal: () => void;
}

export const QuickLogAllSheet: React.FC<QuickLogAllSheetProps> = ({
  isOpen,
  onClose,
  customDishes,
  onStageCustomDish,
  onOpenEditDishModal,
  onQuickLogCustomDishDirect,
  onOpenNewDishModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDishes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customDishes;
    return customDishes.filter(
      (dish) =>
        dish.name.toLowerCase().includes(q) ||
        (dish.notes ? dish.notes.toLowerCase().includes(q) : false)
    );
  }, [customDishes, searchQuery]);

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="favorites-sheet-title"
      testId="quick-log-all-sheet"
      overlayTestId="quick-log-all-sheet-overlay"
      className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] max-w-md w-full shadow-2xl space-y-4 max-h-[88vh] flex flex-col"
      overlayClassName="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400/20" />
          <h3 id="favorites-sheet-title" className="text-base font-black text-white">
            All Favorite Dishes
          </h3>
          <span className="text-xs font-mono text-zinc-500">
            ({filteredDishes.length}/{customDishes.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close favorites sheet"
          className="text-zinc-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-zinc-800 transition touch-manipulation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search Bar - text-base sm:text-xs prevents iOS Safari zoom */}
      <div className="relative shrink-0">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search favorites (e.g. oats, shake, bowl)..."
          aria-label="Search favorite dishes"
          data-testid="search-favorites-input"
          className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl pl-10 pr-12 py-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none transition min-h-[44px]"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-zinc-300 touch-manipulation"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dish List */}
      <div className="overflow-y-auto space-y-2 flex-1 pr-1 -mr-1 min-h-[160px]">
        {filteredDishes.length === 0 ? (
          <div className="py-10 text-center text-zinc-500 text-xs">
            {searchQuery ? `No dishes found matching "${searchQuery}"` : 'No favorite dishes yet.'}
          </div>
        ) : (
          filteredDishes.map((dish) => {
            const hasNote = Boolean(dish.notes && dish.notes.trim().length > 0);
            return (
              <div
                key={dish.id}
                className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-3 flex items-center justify-between gap-2.5 transition group"
              >
                {/* Left Hit Zone: Tap to stage */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStageCustomDish(dish);
                  }}
                  data-testid={`sheet-dish-card-${dish.id}`}
                  aria-label={`Stage ${dish.name}, ${dish.calories ?? 0} calories, ${dish.protein ?? 0} grams protein${hasNote ? ', note attached' : ''}`}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-xl"
                >
                  <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                    {getDishIcon(dish.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white group-hover:text-cyan-300 transition truncate">
                        {dish.name}
                      </span>
                      {hasNote && (
                        <span title="Has saved note" aria-label="Has saved note" className="shrink-0 text-cyan-400 inline-flex items-center">
                          <FileText className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 whitespace-nowrap mt-0.5">
                      <span className="text-amber-400 font-bold">{formatCalories(dish.calories)} kcal</span>
                      <span className="text-zinc-600"> • </span>
                      <span className="text-cyan-400 font-semibold">{formatMacro(dish.protein)}g P</span>
                      <span className="text-zinc-600"> • </span>
                      <span className="text-blue-400">{formatMacro(dish.carbs)}g C</span>
                      <span className="text-zinc-600"> • </span>
                      <span className="text-rose-400">{formatMacro(dish.fat)}g F</span>
                    </div>
                    {hasNote && (
                      <p className="text-[11px] text-zinc-500 italic truncate mt-0.5 max-w-[240px]">
                        {dish.notes}
                      </p>
                    )}
                  </div>
                </button>

                {/* Right Zone: Edit & 1-Tap Quick-Log */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEditDishModal(dish);
                    }}
                    title="Edit Custom Dish"
                    aria-label={`Edit ${dish.name}`}
                    data-testid={`sheet-edit-dish-btn-${dish.id}`}
                    className="min-w-[44px] min-h-[44px] rounded-xl text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition flex items-center justify-center touch-manipulation"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => onQuickLogCustomDishDirect(dish, e)}
                    title="1-Tap Log Meal"
                    aria-label={`Quick log 1 serving of ${dish.name}`}
                    data-testid={`sheet-quick-log-btn-${dish.id}`}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 transition active:scale-95 touch-manipulation font-bold text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Log</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-800 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 rounded-xl border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition touch-manipulation"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenNewDishModal();
          }}
          data-testid="sheet-create-dish-btn"
          className="min-h-[44px] px-4 rounded-xl bg-cyan-500 text-black font-bold text-xs hover:bg-cyan-400 transition flex items-center gap-1.5 touch-manipulation shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Dish</span>
        </button>
      </div>
    </AccessibleModal>
  );
};

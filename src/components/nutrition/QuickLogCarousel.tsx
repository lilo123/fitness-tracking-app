import React, { memo } from 'react';
import type { CustomDish } from '../../types/database';
import { Star, Plus, Edit2 } from 'lucide-react';
import { getDishIcon } from '../../utils/dishIcons';
import { formatCalories, formatMacro } from '../../utils/nutrition';

export interface QuickLogCarouselProps {
  customDishes: CustomDish[];
  onOpenNewDishModal: () => void;
  onStageCustomDish: (dish: CustomDish) => void;
  onOpenEditDishModal: (dish: CustomDish) => void;
  onQuickLogCustomDishDirect: (dish: CustomDish, e: React.MouseEvent) => void;
  onDismissToast: () => void;
}

export const QuickLogCarousel: React.FC<QuickLogCarouselProps> = memo(({
  customDishes,
  onOpenNewDishModal,
  onStageCustomDish,
  onOpenEditDishModal,
  onQuickLogCustomDishDirect,
  onDismissToast,
}) => {
  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Star className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-black uppercase tracking-wider text-white">
            Quick Log Favorites
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenNewDishModal}
            data-testid="create-custom-dish-btn"
            className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-xl transition touch-manipulation min-h-[36px]"
          >
            <Plus className="w-3 h-3" />
            <span>New Dish</span>
          </button>
        </div>
      </div>

      {customDishes.length === 0 ? (
        <p className="text-xs text-zinc-500 py-1">
          No saved custom dishes yet. Create a custom dish or save a logged meal to quick-log it later.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pt-1">
          {customDishes.map((dish) => (
            <div
              key={dish.id}
              onClick={() => onStageCustomDish(dish)}
              className="bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-cyan-500/40 rounded-2xl p-2.5 shrink-0 flex items-center gap-2.5 cursor-pointer transition shadow-sm group select-none"
              data-testid={`custom-dish-card-${dish.id}`}
            >
              <div className="w-7 h-7 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                {getDishIcon(dish.name)}
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition truncate max-w-[110px] sm:max-w-[160px]">
                  {dish.name}
                </div>
                <div className="text-[10px] font-mono text-zinc-400 whitespace-nowrap">
                  <span className="text-amber-400 font-bold">{formatCalories(dish.calories)} kcal</span>
                  <span> • </span>
                  <span className="text-cyan-400 font-semibold">{formatMacro(dish.protein)}g P</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissToast();
                    onOpenEditDishModal(dish);
                  }}
                  title="Edit Custom Dish"
                  aria-label={`Edit ${dish.name}`}
                  data-testid={`edit-dish-btn-${dish.id}`}
                  className="min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] rounded-xl text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition flex items-center justify-center touch-manipulation"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => onQuickLogCustomDishDirect(dish, e)}
                  title="1-Tap Log Meal"
                  aria-label={`Quick log ${dish.name}, ${dish.calories} calories`}
                  data-testid={`quick-log-btn-${dish.id}`}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 flex items-center justify-center transition active:scale-95 touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

QuickLogCarousel.displayName = 'QuickLogCarousel';

import React, { useState, useMemo } from 'react';
import type { CustomDish } from '../../types/database';
import { QuickLogDishCard } from './QuickLogDishCard';
import { QuickLogAllSheet } from './QuickLogAllSheet';
import { Star, Plus, Search, ChevronRight } from 'lucide-react';

export interface QuickLogFavoritesProps {
  customDishes: (CustomDish & { notes?: string | null })[];
  onOpenNewDishModal: () => void;
  onStageCustomDish: (dish: CustomDish) => void;
  onOpenEditDishModal: (dish: CustomDish) => void;
  onQuickLogCustomDishDirect: (dish: CustomDish, e: React.MouseEvent) => void;
  onDismissToast: () => void;
}

export const QuickLogFavorites: React.FC<QuickLogFavoritesProps> = ({
  customDishes,
  onOpenNewDishModal,
  onStageCustomDish,
  onOpenEditDishModal,
  onQuickLogCustomDishDirect,
  onDismissToast,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Sort dishes: use_count desc, created_at desc
  const sortedDishes = useMemo(() => {
    return [...customDishes].sort((a, b) => {
      const countA = a.use_count ?? 0;
      const countB = b.use_count ?? 0;
      if (countB !== countA) {
        return countB - countA;
      }
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [customDishes]);

  const topDishes = useMemo(() => sortedDishes.slice(0, 4), [sortedDishes]);
  const hasOverflow = sortedDishes.length > 4;

  return (
    <section className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400/20" />
          <h3 className="text-xs font-black text-white uppercase tracking-wider">
            Quick Log Favorites
          </h3>
          <span className="text-[10px] font-mono text-zinc-500">
            ({customDishes.length})
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenNewDishModal}
          data-testid="create-custom-dish-btn"
          className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition px-2 rounded-lg hover:bg-zinc-800/50 touch-manipulation min-h-[44px] min-w-[44px]"
          title="Create New Custom Dish"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Dish</span>
        </button>
      </div>

      {/* Tier 1: 2x2 Bento Grid (Top 4 Favorites) */}
      {customDishes.length === 0 ? (
        <p className="text-xs text-zinc-500 py-1">
          No saved custom dishes yet. Create a custom dish or save a logged meal to quick-log it later.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {topDishes.map((dish) => (
            <QuickLogDishCard
              key={dish.id}
              dish={dish}
              onStageCustomDish={onStageCustomDish}
              onOpenEditDishModal={onOpenEditDishModal}
              onQuickLogCustomDishDirect={onQuickLogCustomDishDirect}
              onDismissToast={onDismissToast}
            />
          ))}
        </div>
      )}

      {/* Tier 2 Trigger: Browse & Search All Button */}
      {customDishes.length > 0 && (
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          data-testid="open-favorites-sheet-btn"
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-850 border border-zinc-800/90 text-xs font-semibold text-zinc-300 hover:text-white transition touch-manipulation min-h-[44px] group shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>
              {hasOverflow
                ? `Browse & Search All ${customDishes.length} Favorites`
                : `View All / Search Dishes`}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 group-hover:text-cyan-300">
            <span>Open</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </button>
      )}

      {/* Tier 2: Accessible Bottom Sheet for Catalog Search & Filter */}
      <QuickLogAllSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        customDishes={sortedDishes}
        onStageCustomDish={(dish) => {
          setIsSheetOpen(false);
          onStageCustomDish(dish);
        }}
        onOpenEditDishModal={(dish) => {
          setIsSheetOpen(false);
          onOpenEditDishModal(dish);
        }}
        onQuickLogCustomDishDirect={onQuickLogCustomDishDirect}
        onOpenNewDishModal={() => {
          setIsSheetOpen(false);
          onOpenNewDishModal();
        }}
      />
    </section>
  );
};

import React, { memo } from 'react';
import type { CustomDish } from '../../types/database';
import type { NutritionItem } from '../../utils/itemModel';
import { roundTo1Decimal, formatCalories, formatMacro } from '../../utils/nutrition';
import { getDishIcon } from '../../utils/dishIcons';
import { Star, X, Trash2, Edit2 } from 'lucide-react';
import { CustomDishEditor } from './CustomDishEditor';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface CustomDishesModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDish: CustomDish | null;
  dishModalName: string;
  setDishModalName: (val: string) => void;
  dishModalCalories: number | '';
  setDishModalCalories: (val: number | '') => void;
  dishModalProtein: number | '';
  setDishModalProtein: (val: number | '') => void;
  dishModalCarbs: number | '';
  setDishModalCarbs: (val: number | '') => void;
  dishModalFat: number | '';
  setDishModalFat: (val: number | '') => void;
  dishModalFiber: number | '';
  setDishModalFiber: (val: number | '') => void;
  dishModalItems: NutritionItem[];
  setDishModalItems: React.Dispatch<React.SetStateAction<NutritionItem[]>>;
  onSaveDish: (e: React.FormEvent) => void;
  onDeleteDish: (dishId: string) => void;
  isSaving: boolean;
  isDeleting: boolean;
  customDishes: CustomDish[];
  onOpenEditDishModal: (dish: CustomDish) => void;
}

export const CustomDishesModal: React.FC<CustomDishesModalProps> = memo(({
  isOpen,
  onClose,
  editingDish,
  dishModalName,
  setDishModalName,
  dishModalCalories,
  setDishModalCalories,
  dishModalProtein,
  setDishModalProtein,
  dishModalCarbs,
  setDishModalCarbs,
  dishModalFat,
  setDishModalFat,
  dishModalFiber,
  setDishModalFiber,
  dishModalItems,
  setDishModalItems,
  onSaveDish,
  onDeleteDish,
  isSaving,
  isDeleting,
  customDishes,
  onOpenEditDishModal,
}) => {
  const dishModalRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={dishModalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dish-modal-title"
        data-testid="custom-dish-modal"
        className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 id="dish-modal-title" className="text-base font-black text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            {editingDish ? 'Edit Custom Dish' : 'New Custom Dish'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSaveDish} className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Dish Name
            </label>
            <input
              type="text"
              value={dishModalName}
              onChange={(e) => setDishModalName(e.target.value)}
              placeholder="e.g. Protein Oatmeal"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
              required
            />
          </div>

          {/* Once a dish has a real breakdown its totals are Σ(components);
              showing editable parent macros would invite a value the DB
              sum constraint then rejects. */}
          {dishModalItems.length <= 1 && (
            <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                  Calories
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="numeric"
                  value={dishModalCalories === '' ? '' : roundTo1Decimal(dishModalCalories)}
                  onChange={(e) =>
                    setDishModalCalories(e.target.value === '' ? '' : roundTo1Decimal(Number(e.target.value)))
                  }
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                  required
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                  Protein (g)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={dishModalProtein === '' ? '' : roundTo1Decimal(dishModalProtein)}
                  onChange={(e) =>
                    setDishModalProtein(e.target.value === '' ? '' : roundTo1Decimal(Number(e.target.value)))
                  }
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                  required
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={dishModalCarbs === '' ? '' : roundTo1Decimal(dishModalCarbs)}
                  onChange={(e) =>
                    setDishModalCarbs(e.target.value === '' ? '' : roundTo1Decimal(Number(e.target.value)))
                  }
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                  required
                />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
                  Fat (g)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={dishModalFat === '' ? '' : roundTo1Decimal(dishModalFat)}
                  onChange={(e) =>
                    setDishModalFat(e.target.value === '' ? '' : roundTo1Decimal(Number(e.target.value)))
                  }
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                  required
                />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                  Fiber (g)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={dishModalFiber === '' ? '' : roundTo1Decimal(dishModalFiber)}
                  onChange={(e) =>
                    setDishModalFiber(e.target.value === '' ? '' : roundTo1Decimal(Number(e.target.value)))
                  }
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                />
              </div>
            </div>
          )}

          <CustomDishEditor items={dishModalItems} onChange={setDishModalItems} />

          <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
            {editingDish ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete "${editingDish.name}" from your custom dishes?`)) {
                    onDeleteDish(editingDish.id);
                  }
                }}
                data-testid="modal-delete-dish-btn"
                disabled={isDeleting}
                className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center gap-1.5 touch-manipulation disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Dish'}</span>
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold text-zinc-400 hover:bg-zinc-800 transition touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 min-h-[44px] rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-400 text-black shadow-neon-cyan transition disabled:opacity-50 touch-manipulation"
              >
                {isSaving ? 'Saving...' : 'Save Dish'}
              </button>
            </div>
          </div>
        </form>

        {/* List of existing custom dishes */}
        {customDishes.length > 0 && (
          <div className="border-t border-zinc-800 pt-3 space-y-2">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider block">
              Saved Dishes ({customDishes.length})
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {customDishes.map((dish) => (
                <div
                  key={dish.id}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-white truncate flex items-center gap-2">
                      <div className="w-5 h-5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                        {getDishIcon(dish.name)}
                      </div>
                      <span>{dish.name}</span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                      <span className="text-amber-400 font-bold">{formatCalories(dish.calories)} kcal</span>
                      <span> • </span>
                      <span className="text-cyan-400">P: {formatMacro(dish.protein)}g</span>
                      <span> • </span>
                      <span className="text-emerald-400">C: {formatMacro(dish.carbs)}g</span>
                      <span> • </span>
                      <span className="text-violet-400">F: {formatMacro(dish.fat)}g</span>
                      <span> • </span>
                      <span className="text-teal-400">Fib: {formatMacro(dish.fiber)}g</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenEditDishModal(dish)}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 rounded-lg transition touch-manipulation"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete "${dish.name}" from your custom dishes?`)) {
                          onDeleteDish(dish.id);
                        }
                      }}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition touch-manipulation"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

CustomDishesModal.displayName = 'CustomDishesModal';

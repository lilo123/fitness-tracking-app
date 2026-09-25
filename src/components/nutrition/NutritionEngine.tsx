import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { NutritionLog, CustomDish, CustomDishDetail } from '../../types/database';
import { getLocalDateStr, formatLocalTimestamp } from '../../utils/date';
import { EditMealModal } from './EditMealModal';
import { formatCalories, roundTo1Decimal } from '../../utils/nutrition';
import {
  itemsForPersist, itemsFromLegacyIngredients, normalizeItems, sumItems, type NutritionItem,
} from '../../utils/itemModel';
import { MealLogRow } from './MealLogRow';
import { NutrientBreakdownModal, type BreakdownNutrient } from './NutrientBreakdownModal';
import {
  stagedToItem, buildStagedItem, recomputeStagedTotals, type StagedItem, type StagedMeal,
} from './nutritionEngineHelpers';
import { useNutritionData } from './useNutritionData';
import { useNutritionAi } from './useNutritionAi';
import { useCustomDishModal } from './useCustomDishModal';
import { NutritionDashboardRings } from './NutritionDashboardRings';
import { QuickLogFavorites } from './QuickLogFavorites';
import { NutritionAiInput } from './NutritionAiInput';
import { StagedMealCard } from './StagedMealCard';
import { ManualMealForm } from './ManualMealForm';
import { useManualMealForm } from './useManualMealForm';
import { useCustomDishSaving } from './useCustomDishSaving';
import { CustomDishesModal } from './CustomDishesModal';
import { Utensils, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBanner } from '../common/StatusBanner';

export { type StagedItem, stagedToItem, stagedReference, type StagedMeal } from './nutritionEngineHelpers';

export const NutritionEngine: React.FC = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const targetUserId = user?.id || '';

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getLocalDateStr(new Date());
  });

  const [stagedMeal, setStagedMeal] = useState<StagedMeal | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [breakdownNutrient, setBreakdownNutrient] = useState<BreakdownNutrient | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isError, setIsError] = useState(false);

  // Manual Form Fallback State
  const manualMealForm = useManualMealForm({
    selectedDate,
    onSubmitLog: (payload) => mutation.mutate(payload),
  });

  const [editingMealLog, setEditingMealLog] = useState<NutritionLog | null>(null);

  const {
    customDishes,
    todayLogs,
    dailyTotals,
    targets,
    remainingFuel,
    mutation,
    scaleLogMutation,
    saveCustomDishMutation,
    deleteCustomDishMutation,
    activeToast,
    dismissToast,
    triggerToast,
    isTimerActive,
    isNutritionLogsError,
    nutritionLogsError,
    refetchNutritionLogs,
    isCustomDishesError,
    customDishesError,
    refetchCustomDishes,
    fetchDishDetail,
  } = useNutritionData({
    targetUserId,
    selectedDate,
    profile,
    onMutationSuccessReset: () => {
      setStagedMeal(null);
      ai.setSelectedPhoto(null);
      setShowManualForm(false);
      ai.setIsRateLimited(false);
      ai.setNlInput('');
      manualMealForm.resetManualForm();
    },
    setStatus,
    setIsError,
  });

  const [dishFetchError, setDishFetchError] = useState<{ message: string; retry: () => void } | null>(null);

  const ai = useNutritionAi({
    customDishes,
    onParsedSuccess: (meal) => {
      setStagedMeal(meal);
      setShowManualForm(false);
    },
    onFallbackToManual: (dishName) => {
      setShowManualForm(true);
      if (!manualMealForm.manualDishName.trim()) {
        manualMealForm.setManualDishName(dishName);
      }
      setStagedMeal(null);
    },
    setStatus,
    setIsError,
  });

  const dishModal = useCustomDishModal({
    onSaveDish: (args) => saveCustomDishMutation.mutate(args),
    onDeleteDish: (dishId) => deleteCustomDishMutation.mutate(dishId),
    onDismissToast: dismissToast,
    fetchDishDetail,
    onFetchError: (err, retry) => {
      setDishFetchError({ message: err?.message || 'Failed to load dish details', retry });
    },
  });

  const applyStagedItemChange = (itemId: string, next: NutritionItem) => {
    if (!stagedMeal) return;
    const updatedItems = stagedMeal.items.map((it) =>
      it.id === itemId
        ? {
            ...it,
            name: next.name,
            quantity: roundTo1Decimal(next.quantity),
            unit: next.unit,
            calories: roundTo1Decimal(next.calories),
            protein: roundTo1Decimal(next.protein),
            carbs: roundTo1Decimal(next.carbs),
            fat: roundTo1Decimal(next.fat),
            fiber: roundTo1Decimal(next.fiber),
            portionMultiplier: it.baseQuantity > 0 ? next.quantity / it.baseQuantity : 1,
          }
        : it
    );
    setStagedMeal({ ...stagedMeal, items: updatedItems, ...recomputeStagedTotals(updatedItems) });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!stagedMeal) return;
    const updatedItems = stagedMeal.items.filter((it) => it.id !== itemId);
    if (updatedItems.length === 0) {
      setStagedMeal(null);
      return;
    }
    setStagedMeal({ ...stagedMeal, items: updatedItems, ...recomputeStagedTotals(updatedItems) });
  };

  const handleLogStagedMeal = () => {
    if (!stagedMeal) return;
    const items = stagedMeal.items.map(stagedToItem);
    const totals = sumItems(items);
    const isSingle = items.length <= 1;
    const item0 = items[0];
    const payload = {
      food_name: stagedMeal.name,
      calories: isSingle && item0 ? roundTo1Decimal(item0.calories) : roundTo1Decimal(totals.calories),
      protein: isSingle && item0 ? roundTo1Decimal(item0.protein) : roundTo1Decimal(totals.protein),
      carbs: isSingle && item0 ? roundTo1Decimal(item0.carbs) : roundTo1Decimal(totals.carbs),
      fat: isSingle && item0 ? roundTo1Decimal(item0.fat) : roundTo1Decimal(totals.fat),
      fiber: isSingle && item0 ? roundTo1Decimal(item0.fiber) : roundTo1Decimal(totals.fiber),
      meal_type: stagedMeal.mealType,
      serving_size: Number(stagedMeal.servingSize) || 1,
      serving_unit: stagedMeal.servingUnit || 'serving',
      logged_at: formatLocalTimestamp(selectedDate),
      logged_date: selectedDate,
      items: items.length > 1 ? itemsForPersist(items) : null,
      notes: stagedMeal.notes ?? null,
    };
    mutation.mutate(payload);
  };

  const { handleSaveStagedAsCustomDish, handleSaveItemAsCustomDish } = useCustomDishSaving({
    targetUserId,
    stagedMeal,
    setStatus,
    setIsError,
  });

  const handleStageCustomDish = async (dish: CustomDish) => {
    setDishFetchError(null);
    let detail: CustomDishDetail | null = null;
    try {
      detail = await fetchDishDetail(dish.id);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load dish details';
      setDishFetchError({
        message: msg,
        retry: () => {
          void handleStageCustomDish(dish);
        },
      });
      return;
    }

    const stored =
      normalizeItems(detail?.items) ?? itemsFromLegacyIngredients(dish.id, dish.name, detail?.ingredients);

    let items: StagedItem[] = (stored ?? []).map((it) =>
      buildStagedItem({
        name: it.name,
        portion: it.displayPortion,
        quantity: it.quantity,
        unit: it.unit,
        calories: it.calories,
        protein: it.protein,
        carbs: it.carbs,
        fat: it.fat,
        fiber: it.fiber,
      })
    );

    if (items.length === 0) {
      items = [
        buildStagedItem({
          name: dish.name,
          portion: '1 serving',
          calories: dish.calories,
          protein: dish.protein,
          carbs: dish.carbs,
          fat: dish.fat,
          fiber: dish.fiber,
        }),
      ];
    }

    const { explanation, ...tot } = recomputeStagedTotals(items);

    setStagedMeal({
      name: dish.name,
      mealType: 'Breakfast',
      explanation:
        items.length > 1 ? explanation : `${formatCalories(tot.calories)} kcal (${dish.name})`,
      items,
      ...tot,
      servingSize: 1,
      servingUnit: 'serving',
      notes: dish.notes ?? null,
    });

    void supabase
      .from('custom_dishes')
      .update({ use_count: (dish.use_count ?? 0) + 1 })
      .eq('id', dish.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
      });
  };

  const handleQuickLogCustomDishDirect = (dish: CustomDish, e: React.MouseEvent) => {
    e.stopPropagation();
    const payload = {
      food_name: dish.name,
      calories: roundTo1Decimal(dish.calories),
      protein: roundTo1Decimal(dish.protein),
      carbs: roundTo1Decimal(dish.carbs),
      fat: roundTo1Decimal(dish.fat),
      fiber: roundTo1Decimal(dish.fiber),
      meal_type: 'Breakfast',
      serving_size: 1,
      serving_unit: 'serving',
      logged_at: formatLocalTimestamp(selectedDate),
      logged_date: selectedDate,
      notes: dish.notes ?? null,
    };
    mutation.mutate(payload);
    void supabase
      .from('custom_dishes')
      .update({ use_count: (dish.use_count ?? 0) + 1 })
      .eq('id', dish.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
      });
    triggerToast(dish);
  };

  // Saved-dish failures surface here, beside Quick Log Favorites, rather than in the nutrition
  // logs banner. They are independent queries; folding them together reported a custom_dishes
  // failure as "Failed to load nutrition logs" and hid meals that had loaded perfectly well.
  const savedDishesErrorMessage = isCustomDishesError
    ? `Failed to load saved dishes: ${
        customDishesError instanceof Error
          ? customDishesError.message
          : (customDishesError as any)?.message || 'Please try again.'
      }`
    : null;

  return (
    <div className={`space-y-6 ${stagedMeal ? 'pb-32' : ''}`}>
      <NutritionDashboardRings
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        dailyTotals={dailyTotals}
        targets={targets}
        remainingFuel={remainingFuel}
        onSelectBreakdownNutrient={setBreakdownNutrient}
      />

      <QuickLogFavorites
        customDishes={customDishes}
        onOpenNewDishModal={dishModal.handleOpenNewDishModal}
        onStageCustomDish={handleStageCustomDish}
        onOpenEditDishModal={dishModal.handleOpenEditDishModal}
        onQuickLogCustomDishDirect={handleQuickLogCustomDishDirect}
        onDismissToast={dismissToast}
      />

      <StatusBanner
        message={dishFetchError?.message || dishModal.dishFetchError?.message || savedDishesErrorMessage}
        tone="error"
        testId="dish-fetch-error"
        className="shadow-lg"
        action={
          (dishFetchError || dishModal.dishFetchError || isCustomDishesError) && (
            <button
              type="button"
              data-testid="dish-fetch-retry"
              onClick={() => {
                if (dishFetchError) {
                  dishFetchError.retry();
                } else if (dishModal.dishFetchError) {
                  dishModal.dishFetchError.retry();
                } else {
                  void refetchCustomDishes();
                }
              }}
              className="shrink-0 rounded border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-200 hover:bg-rose-500/30 touch-manipulation"
            >
              Retry
            </button>
          )
        }
      />

      {stagedMeal ? (
        <StagedMealCard
          stagedMeal={stagedMeal}
          dailyTotals={dailyTotals}
          targets={targets}
          onUpdateStagedMeal={setStagedMeal}
          onApplyStagedItemChange={applyStagedItemChange}
          onDeleteItem={handleDeleteItem}
          onSaveItemAsCustomDish={handleSaveItemAsCustomDish}
          onLogStagedMeal={handleLogStagedMeal}
          onSaveStagedAsCustomDish={handleSaveStagedAsCustomDish}
          onDiscardStagedMeal={() => setStagedMeal(null)}
          isPending={mutation.isPending}
        />
      ) : (
        <NutritionAiInput
          nlInput={ai.nlInput}
          onNlInputChange={ai.setNlInput}
          selectedPhoto={ai.selectedPhoto}
          onRemovePhoto={ai.handleRemovePhoto}
          onFileChange={ai.handleFileChange}
          onPickPhoto={ai.handlePickPhoto}
          isAnalyzing={ai.isAnalyzing}
          onAnalyze={ai.handleAnalyze}
          showManualForm={showManualForm}
          onToggleManualForm={() => setShowManualForm((prev) => !prev)}
          isRateLimited={ai.isRateLimited}
          onSwitchToManual={() => {
            setShowManualForm(true);
            ai.setIsRateLimited(false);
            if (!manualMealForm.manualDishName.trim()) {
              manualMealForm.setManualDishName(ai.nlInput.trim() || (ai.selectedPhoto ? 'Meal Photo' : ''));
            }
          }}
          status={status}
          isError={isError}
          fileInputRef={ai.fileInputRef}
          hasCustomDishes={customDishes.length > 0}
        />
      )}

      <ManualMealForm
        show={showManualForm}
        onClose={() => setShowManualForm(false)}
        selectedPhoto={ai.selectedPhoto}
        onRemovePhoto={ai.handleRemovePhoto}
        manualName={manualMealForm.manualDishName}
        onManualNameChange={manualMealForm.setManualDishName}
        manualMealType={manualMealForm.manualMealType}
        onManualMealTypeChange={manualMealForm.setManualMealType}
        manualCalories={manualMealForm.manualCalories}
        onManualCaloriesChange={manualMealForm.setManualCalories}
        manualProtein={manualMealForm.manualProtein}
        onManualProteinChange={manualMealForm.setManualProtein}
        manualCarbs={manualMealForm.manualCarbs}
        onManualCarbsChange={manualMealForm.setManualCarbs}
        manualFat={manualMealForm.manualFat}
        onManualFatChange={manualMealForm.setManualFat}
        manualFiber={manualMealForm.manualFiber}
        onManualFiberChange={manualMealForm.setManualFiber}
        manualServingSize={manualMealForm.manualServingSize}
        onManualServingSizeChange={manualMealForm.setManualServingSize}
        manualServingUnit={manualMealForm.manualServingUnit}
        onManualServingUnitChange={manualMealForm.setManualServingUnit}
        onSubmit={manualMealForm.handleManualSubmit}
        isPending={mutation.isPending}
      />

      {/* Logged Meals Timeline */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Today's Meals ({todayLogs.length})
            </h3>
          </div>
        </div>

        <StatusBanner
          message={
            isNutritionLogsError
              ? `Failed to load nutrition logs: ${
                  nutritionLogsError instanceof Error
                    ? nutritionLogsError.message
                    : typeof nutritionLogsError === 'string'
                    ? nutritionLogsError
                    : (nutritionLogsError as any)?.message ||
                      'Unable to load nutrition data. Please try again.'
                }`
              : null
          }
          tone="error"
          testId="nutrition-read-error"
          className="rounded-2xl p-4 flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
          icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
          action={
            isNutritionLogsError && (
              <button
                type="button"
                onClick={() => {
                  void refetchNutritionLogs();
                }}
                data-testid="retry-nutrition-btn"
                className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 border border-rose-500/40 rounded-xl transition touch-manipulation min-h-[44px] min-w-[44px] shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )
          }
        />

        {!isNutritionLogsError && todayLogs.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs">
            No meals logged for this date yet.
          </div>
        ) : !isNutritionLogsError ? (
          <div className="space-y-2">
            {todayLogs.map((log) => (
              <MealLogRow
                key={log.id}
                log={log}
                onEdit={setEditingMealLog}
                onDelete={(l) => {
                  if (window.confirm(`Delete "${l.food_name}" from today's log?`)) {
                    void (async () => {
                      try {
                        const { error } = await supabase.from('nutrition_logs').delete().eq('id', l.id);
                        if (error) throw error;
                        queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
                        setStatus('Meal deleted');
                        setIsError(false);
                      } catch (err: any) {
                        setStatus('Failed to delete meal: ' + err.message);
                        setIsError(true);
                      }
                    })();
                  }
                }}
                onItemsChange={(l, items) => scaleLogMutation.mutateAsync({ log: l, items })}
              />
            ))}
          </div>
        ) : null}
      </div>

      <CustomDishesModal
        isOpen={dishModal.showDishModal}
        onClose={dishModal.handleCloseDishModal}
        editingDish={dishModal.editingDish}
        dishModalKind={dishModal.dishModalKind}
        setDishModalKind={dishModal.setDishModalKind}
        dishModalName={dishModal.dishModalName}
        setDishModalName={dishModal.setDishModalName}
        dishModalCalories={dishModal.dishModalCalories}
        setDishModalCalories={dishModal.setDishModalCalories}
        dishModalProtein={dishModal.dishModalProtein}
        setDishModalProtein={dishModal.setDishModalProtein}
        dishModalCarbs={dishModal.dishModalCarbs}
        setDishModalCarbs={dishModal.setDishModalCarbs}
        dishModalFat={dishModal.dishModalFat}
        setDishModalFat={dishModal.setDishModalFat}
        dishModalFiber={dishModal.dishModalFiber}
        setDishModalFiber={dishModal.setDishModalFiber}
        dishModalNotes={dishModal.dishModalNotes}
        setDishModalNotes={dishModal.setDishModalNotes}
        dishModalItems={dishModal.dishModalItems}
        setDishModalItems={dishModal.setDishModalItems}
        onSaveDish={dishModal.handleSaveCustomDishModal}
        onDeleteDish={dishModal.handleDeleteCustomDish}
        isSaving={saveCustomDishMutation.isPending}
        isDeleting={deleteCustomDishMutation.isPending}
        customDishes={customDishes}
        onOpenEditDishModal={dishModal.handleOpenEditDishModal}
      />

      {/* Floating Quick-Log Toast */}
      <div
        onClick={activeToast ? dismissToast : undefined}
        className={activeToast ? undefined : 'contents'}
      >
        <StatusBanner
          message={activeToast ? activeToast.name : null}
          tone="success"
          testId="quick-log-toast"
          className={`fixed ${
            isTimerActive
              ? 'bottom-[calc(9.25rem+env(safe-area-inset-bottom,0px))]'
              : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]'
          } left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-zinc-900/95 border border-cyan-500/50 backdrop-blur-xl shadow-2xl shadow-cyan-500/20 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs font-bold text-white transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 cursor-pointer touch-manipulation select-none`}
          icon={
            activeToast && (
              <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                </div>
                <span className="text-zinc-400 font-medium">Logged:&nbsp;</span>
              </div>
            )
          }
          action={
            activeToast && (
              <div className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 font-mono text-[11px] font-black">
                +{activeToast.calories} kcal
              </div>
            )
          }
        />
      </div>

      {/* Edit Meal Modal */}
      <EditMealModal
        isOpen={!!editingMealLog}
        meal={editingMealLog}
        onClose={() => setEditingMealLog(null)}
        targetUserId={targetUserId}
        onSuccess={() => {
          setStatus('Meal updated successfully');
          setIsError(false);
        }}
      />

      {/* Nutrient Breakdown Modal */}
      <NutrientBreakdownModal
        isOpen={breakdownNutrient !== null}
        onClose={() => setBreakdownNutrient(null)}
        selectedNutrient={breakdownNutrient ?? 'calories'}
        onSelectNutrient={setBreakdownNutrient}
        logs={todayLogs}
        dailyTotals={dailyTotals}
        targets={targets}
      />
    </div>
  );
};

export default NutritionEngine;

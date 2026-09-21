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
import { QuickLogCarousel } from './QuickLogCarousel';
import { NutritionAiInput } from './NutritionAiInput';
import { StagedMealCard } from './StagedMealCard';
import { ManualMealForm } from './ManualMealForm';
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
  const [manualDishName, setManualDishName] = useState('');
  const [manualCalories, setManualCalories] = useState<number | ''>('');
  const [manualProtein, setManualProtein] = useState<number | ''>('');
  const [manualCarbs, setManualCarbs] = useState<number | ''>('');
  const [manualFat, setManualFat] = useState<number | ''>('');
  const [manualFiber, setManualFiber] = useState<number | ''>('');
  const [manualMealType, setManualMealType] = useState<string>('Breakfast');
  const [manualServingSize, setManualServingSize] = useState<number | ''>(1);
  const [manualServingUnit, setManualServingUnit] = useState<string>('serving');

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
    isReadError,
    readError,
    refetchRead,
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
      setManualDishName('');
      setManualCalories('');
      setManualProtein('');
      setManualCarbs('');
      setManualFat('');
      setManualFiber('');
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
      if (!manualDishName.trim()) {
        setManualDishName(dishName);
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
    const payload = {
      food_name: stagedMeal.name,
      calories: isSingle ? roundTo1Decimal(stagedMeal.calories) : roundTo1Decimal(totals.calories),
      protein: isSingle ? roundTo1Decimal(stagedMeal.protein) : roundTo1Decimal(totals.protein),
      carbs: isSingle ? roundTo1Decimal(stagedMeal.carbs) : roundTo1Decimal(totals.carbs),
      fat: isSingle ? roundTo1Decimal(stagedMeal.fat) : roundTo1Decimal(totals.fat),
      fiber: isSingle ? roundTo1Decimal(stagedMeal.fiber) : roundTo1Decimal(totals.fiber),
      meal_type: stagedMeal.mealType,
      serving_size: Number(stagedMeal.servingSize) || 1,
      serving_unit: stagedMeal.servingUnit || 'serving',
      logged_at: formatLocalTimestamp(selectedDate),
      items: items.length > 1 ? itemsForPersist(items) : null,
    };
    mutation.mutate(payload);
  };

  const handleSaveStagedAsCustomDish = async () => {
    if (!stagedMeal) return;
    try {
      const items = stagedMeal.items.map(stagedToItem);
      const totals = sumItems(items);
      const { error } = await supabase.from('custom_dishes').insert([
        {
          user_id: targetUserId,
          name: stagedMeal.name,
          ingredients: JSON.stringify(stagedMeal.items),
          items: items.length > 1 ? itemsForPersist(items) : null,
          calories: roundTo1Decimal(totals.calories),
          protein: roundTo1Decimal(totals.protein),
          carbs: roundTo1Decimal(totals.carbs),
          fat: roundTo1Decimal(totals.fat),
          fiber: roundTo1Decimal(totals.fiber),
        },
      ]);
      if (error) throw error;
      setStatus('Saved custom dish');
      setIsError(false);
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
    } catch (err: any) {
      setStatus('Failed to save custom dish: ' + err.message);
      setIsError(true);
    }
  };

  const handleSaveItemAsCustomDish = async (item: StagedItem) => {
    try {
      const { error } = await supabase.from('custom_dishes').insert([
        {
          user_id: targetUserId,
          name: item.name,
          ingredients: JSON.stringify([item]),
          items: null,
          calories: roundTo1Decimal(item.calories),
          protein: roundTo1Decimal(item.protein),
          carbs: roundTo1Decimal(item.carbs),
          fat: roundTo1Decimal(item.fat),
          fiber: roundTo1Decimal(item.fiber),
        },
      ]);
      if (error) throw error;
      setStatus(`Saved ${item.name} as custom dish`);
      setIsError(false);
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
    } catch (err: any) {
      setStatus('Failed to save custom dish: ' + err.message);
      setIsError(true);
    }
  };

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
    };
    mutation.mutate(payload);
    triggerToast(dish);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDishName.trim()) return;

    const payload = {
      food_name: manualDishName,
      calories: roundTo1Decimal(manualCalories),
      protein: roundTo1Decimal(manualProtein),
      carbs: roundTo1Decimal(manualCarbs),
      fat: roundTo1Decimal(manualFat),
      fiber: roundTo1Decimal(manualFiber),
      meal_type: manualMealType,
      serving_size: Number(manualServingSize) || 1,
      serving_unit: manualServingUnit,
      logged_at: formatLocalTimestamp(selectedDate),
    };

    mutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <NutritionDashboardRings
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        dailyTotals={dailyTotals}
        targets={targets}
        remainingFuel={remainingFuel}
        onSelectBreakdownNutrient={setBreakdownNutrient}
      />

      <QuickLogCarousel
        customDishes={customDishes}
        onOpenNewDishModal={dishModal.handleOpenNewDishModal}
        onStageCustomDish={handleStageCustomDish}
        onOpenEditDishModal={dishModal.handleOpenEditDishModal}
        onQuickLogCustomDishDirect={handleQuickLogCustomDishDirect}
        onDismissToast={dismissToast}
      />

      <StatusBanner
        message={dishFetchError?.message || dishModal.dishFetchError?.message || null}
        tone="error"
        testId="dish-fetch-error"
        className="shadow-lg"
        action={
          (dishFetchError || dishModal.dishFetchError) && (
            <button
              type="button"
              data-testid="dish-fetch-retry"
              onClick={() => {
                if (dishFetchError) {
                  dishFetchError.retry();
                } else if (dishModal.dishFetchError) {
                  dishModal.dishFetchError.retry();
                }
              }}
              className="shrink-0 rounded border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-200 hover:bg-rose-500/30 touch-manipulation"
            >
              Retry
            </button>
          )
        }
      />

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
          if (!manualDishName.trim()) {
            setManualDishName(ai.nlInput.trim() || (ai.selectedPhoto ? 'Meal Photo' : ''));
          }
        }}
        status={status}
        isError={isError}
        fileInputRef={ai.fileInputRef}
        hasCustomDishes={customDishes.length > 0}
      />

      {stagedMeal && (
        <StagedMealCard
          stagedMeal={stagedMeal}
          onUpdateStagedMeal={setStagedMeal}
          onApplyStagedItemChange={applyStagedItemChange}
          onDeleteItem={handleDeleteItem}
          onSaveItemAsCustomDish={handleSaveItemAsCustomDish}
          onLogStagedMeal={handleLogStagedMeal}
          onSaveStagedAsCustomDish={handleSaveStagedAsCustomDish}
          onDiscardStagedMeal={() => setStagedMeal(null)}
          isPending={mutation.isPending}
        />
      )}

      <ManualMealForm
        show={showManualForm}
        onClose={() => setShowManualForm(false)}
        selectedPhoto={ai.selectedPhoto}
        onRemovePhoto={ai.handleRemovePhoto}
        manualName={manualDishName}
        onManualNameChange={setManualDishName}
        manualMealType={manualMealType}
        onManualMealTypeChange={setManualMealType}
        manualCalories={manualCalories}
        onManualCaloriesChange={setManualCalories}
        manualProtein={manualProtein}
        onManualProteinChange={setManualProtein}
        manualCarbs={manualCarbs}
        onManualCarbsChange={setManualCarbs}
        manualFat={manualFat}
        onManualFatChange={setManualFat}
        manualFiber={manualFiber}
        onManualFiberChange={setManualFiber}
        manualServingSize={manualServingSize}
        onManualServingSizeChange={setManualServingSize}
        manualServingUnit={manualServingUnit}
        onManualServingUnitChange={setManualServingUnit}
        onSubmit={handleManualSubmit}
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
            isReadError
              ? `Failed to load nutrition logs: ${
                  readError instanceof Error
                    ? readError.message
                    : typeof readError === 'string'
                    ? readError
                    : (readError as any)?.message || 'Unable to load nutrition data. Please try again.'
                }`
              : null
          }
          tone="error"
          testId="nutrition-read-error"
          className="rounded-2xl p-4 flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
          icon={<AlertCircle className="w-5 h-5 shrink-0 text-rose-400" aria-hidden="true" />}
          action={
            isReadError && (
              <button
                type="button"
                onClick={() => {
                  void refetchRead();
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

        {!isReadError && todayLogs.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs">
            No meals logged for this date yet.
          </div>
        ) : !isReadError ? (
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

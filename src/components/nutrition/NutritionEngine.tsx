import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { NutritionLog } from '../../types/database';
import { getLocalDateStr, formatLocalTimestamp } from '../../utils/date';
import { EditMealModal } from './EditMealModal';
import { roundTo1Decimal } from '../../utils/nutrition';
import {
  itemsForPersist, sumItems, type NutritionItem,
} from '../../utils/itemModel';
import { MealLogRow } from './MealLogRow';
import { NutrientBreakdownModal, type BreakdownNutrient } from './NutrientBreakdownModal';
import {
  stagedToItem, recomputeStagedTotals, buildStagedMealFromManualData,
  useStagedCardFocus, type StagedMeal,
} from './nutritionEngineHelpers';
import { useNutritionData } from './useNutritionData';
import { useNutritionAi } from './useNutritionAi';
import { useCustomDishModal } from './useCustomDishModal';
import { NutritionDashboardRings } from './NutritionDashboardRings';
import { QuickLogFavorites } from './QuickLogFavorites';
import { NutritionAiInput } from './NutritionAiInput';
import { StagedMealCard } from './StagedMealCard';
import { ManualMealForm } from './ManualMealForm';
import { useManualMealForm, type ManualMealStagedData } from './useManualMealForm';
import { useCustomDishSaving } from './useCustomDishSaving';
import { useCustomDishActions } from './useCustomDishActions';
import { CustomDishesModal } from './CustomDishesModal';
import { Utensils, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';
import { QuickLogToast } from './QuickLogToast';

export const NutritionEngine: React.FC = () => {
  const { user, profile } = useAuth();
  const targetUserId = user?.id || '';

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getLocalDateStr(new Date());
  });

  const [stagedMeal, setStagedMeal] = useState<StagedMeal | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [breakdownNutrient, setBreakdownNutrient] = useState<BreakdownNutrient | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isError, setIsError] = useState(false);

  const handleStageManualMeal = (data: ManualMealStagedData) => {
    setStagedMeal(buildStagedMealFromManualData(data, ai.selectedPhoto?.dataUrl));
    setShowManualForm(false);
  };

  // Manual Form Fallback State (D22: stages into StagedMealCard instead of logging directly)
  const manualMealForm = useManualMealForm({
    onStageMeal: handleStageManualMeal,
  });

  const [editingMealLog, setEditingMealLog] = useState<NutritionLog | null>(null);
  const { textareaRef: aiTextareaRef, headingRef: sectionHeadingRef, decideFocusRestore, cardFocusProps } =
    useStagedCardFocus(Boolean(stagedMeal));

  const {
    customDishes, todayLogs, dailyTotals, targets, remainingFuel,
    mutation, deleteMutation, scaleLogMutation, saveCustomDishMutation, deleteCustomDishMutation,
    activeToast, dismissToast, triggerToast, isTimerActive,
    isNutritionLogsError, nutritionLogsError, refetchNutritionLogs,
    isCustomDishesError, customDishesError, refetchCustomDishes, fetchDishDetail,
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
      decideFocusRestore();
      setStagedMeal(null);
      return;
    }
    setStagedMeal({ ...stagedMeal, items: updatedItems, ...recomputeStagedTotals(updatedItems) });
  };

  const handleLogStagedMeal = (e?: React.MouseEvent | React.UIEvent) => {
    if (!stagedMeal) return;
    decideFocusRestore(e);
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

  const { handleStageCustomDish, handleQuickLogCustomDishDirect, handleAddCustomDishToStaged } =
    useCustomDishActions({
      targetUserId, selectedDate, stagedMeal, setStagedMeal, setDishFetchError, fetchDishDetail, mutation, triggerToast,
    });

  useEffect(() => {
    if (
      activeToast?.variant === 'added' &&
      (!stagedMeal ||
        (stagedMeal !== activeToast.forMeal && stagedMeal !== activeToast.preMeal))
    ) {
      dismissToast();
    }
  }, [stagedMeal, activeToast, dismissToast]);

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
        isStaged={Boolean(stagedMeal)}
        onAddCustomDishToStaged={handleAddCustomDishToStaged}
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

      {stagedMeal && status ? (
        <StatusBanner
          message={status}
          tone={isError ? 'error' : 'info'}
          testId="status-message"
          className="shadow-lg"
          icon={
            isError ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
            )
          }
        />
      ) : null}



      {stagedMeal ? (
        <div {...cardFocusProps}>
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
            onDiscardStagedMeal={(e) => {
              decideFocusRestore(e);
              setStagedMeal(null);
            }}
            isPending={mutation.isPending}
          />
        </div>
      ) : (
        <NutritionAiInput
          textareaRef={aiTextareaRef}
          headingRef={sectionHeadingRef}
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
                    void deleteMutation.mutateAsync(l.id);
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

      {/* Floating Quick-Log Toast (D41 & D42) */}
      <QuickLogToast
        toast={activeToast}
        onDismiss={dismissToast}
        isStaged={Boolean(stagedMeal)}
        isTimerActive={isTimerActive}
      />

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

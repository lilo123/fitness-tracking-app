import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { NutritionLog, CustomDish } from '../../types/database';
import { MacroRing } from '../common/MacroRing';
import { normalizeDateStr, getLocalDateStr, formatLocalTimestamp } from '../../utils/date';
import { getDishIcon } from '../../utils/dishIcons';
import { EditMealModal } from './EditMealModal';
import { formatCalories, formatMacro, calculateRemainingFuel } from '../../utils/nutrition';
import {
  Sparkles,
  Utensils,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Flame,
  Plus,
  Star,
  X,
  Edit2,
  Check,
  Calculator,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface StagedItem {
  id: string;
  name: string;
  portion: string;
  portionMultiplier: number;
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  baseFiber: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface StagedMeal {
  name: string;
  mealType: string;
  explanation: string;
  items: StagedItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingSize: number;
  servingUnit: string;
}

let itemSequence = 0;
function generateItemId(): string {
  itemSequence += 1;
  return `item-${Date.now()}-${itemSequence}`;
}

export const NutritionEngine: React.FC = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const targetUserId = user?.id || '';

  // Input & Staged State
  const [nlInput, setNlInput] = useState('');
  const [stagedMeal, setStagedMeal] = useState<StagedMeal | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  // Manual Form Fallback State (when no staged meal is active)
  const [manualDishName, setManualDishName] = useState('');
  const [manualCalories, setManualCalories] = useState<number | ''>('');
  const [manualProtein, setManualProtein] = useState<number | ''>('');
  const [manualCarbs, setManualCarbs] = useState<number | ''>('');
  const [manualFat, setManualFat] = useState<number | ''>('');
  const [manualFiber, setManualFiber] = useState<number | ''>('');
  const [manualMealType, setManualMealType] = useState<string>('Breakfast');
  const [manualServingSize, setManualServingSize] = useState<number | ''>(1);
  const [manualServingUnit, setManualServingUnit] = useState<string>('serving');

  // Custom Dish Management Modal State
  const [showDishModal, setShowDishModal] = useState(false);
  const [editingDish, setEditingDish] = useState<CustomDish | null>(null);
  const [editingMealLog, setEditingMealLog] = useState<NutritionLog | null>(null);
  const [dishModalName, setDishModalName] = useState('');
  const [dishModalCalories, setDishModalCalories] = useState<number | ''>('');
  const [dishModalProtein, setDishModalProtein] = useState<number | ''>('');
  const [dishModalCarbs, setDishModalCarbs] = useState<number | ''>('');
  const [dishModalFat, setDishModalFat] = useState<number | ''>('');
  const [dishModalFiber, setDishModalFiber] = useState<number | ''>('');
  const [dishModalIngredients, setDishModalIngredients] = useState('');

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getLocalDateStr(new Date());
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [isError, setIsError] = useState(false);

  // Targets
  const targetCalories = profile?.target_calories || 2200;
  const targetProtein = profile?.target_protein || 160;
  const targetCarbs = profile?.target_carbs || 220;
  const targetFat = profile?.target_fat || 70;
  const targetFiber = profile?.target_fiber ?? 30;

  // Fetch custom dishes for context injection & quick log
  const { data: customDishes = [] } = useQuery({
    queryKey: ['custom_dishes', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      try {
        const { data, error } = await supabase
          .from('custom_dishes')
          .select('*')
          .eq('user_id', targetUserId);
        if (error || !data) return [];
        return data as CustomDish[];
      } catch {
        return [];
      }
    },
  });

  // Fetch nutrition logs for target user
  const { data: nutritionLogs = [] } = useQuery({
    queryKey: ['nutrition_logs', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      try {
        const { data, error } = await supabase
          .from('nutrition_logs')
          .select('*')
          .eq('user_id', targetUserId)
          .order('logged_at', { ascending: false });

        if (error || !data) return [];
        return data as NutritionLog[];
      } catch {
        return [];
      }
    },
  });

  // Calculate daily totals
  const todayLogs = useMemo(() => {
    return nutritionLogs.filter((l) => normalizeDateStr(l.logged_at) === selectedDate);
  }, [nutritionLogs, selectedDate]);

  const dailyTotals = useMemo(() => {
    return todayLogs.reduce(
      (acc, log) => {
        acc.calories += Number(log.calories) || 0;
        acc.protein += Number(log.protein) || 0;
        acc.carbs += Number(log.carbs) || 0;
        acc.fat += Number(log.fat) || 0;
        acc.fiber += Number(log.fiber) || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [todayLogs]);

  const remainingFuel = useMemo(() => {
    return calculateRemainingFuel(dailyTotals, {
      calories: targetCalories,
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
      fiber: targetFiber,
    });
  }, [dailyTotals, targetCalories, targetProtein, targetCarbs, targetFat, targetFiber]);

  // Insert mutation
  const mutation = useMutation({
    mutationFn: async (newLog: Partial<NutritionLog>) => {
      const payload = {
        ...newLog,
        user_id: targetUserId,
      };

      const { data, error } = await supabase
        .from('nutrition_logs')
        .insert([payload])
        .select();

      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: () => {
      setStatus('Saved');
      setIsError(false);
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
      // Reset state
      setStagedMeal(null);
      setNlInput('');
      setManualDishName('');
      setManualCalories('');
      setManualProtein('');
      setManualCarbs('');
      setManualFat('');
      setManualFiber('');
    },
    onError: (error: any) => {
      console.error(error);
      setStatus('Failed to save log: ' + error.message);
      setIsError(true);
    },
  });

  // Delete log mutation
  const deleteMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase.from('nutrition_logs').delete().eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs', targetUserId] });
    },
  });

  // Custom Dish CRUD mutations
  const saveCustomDishMutation = useMutation({
    mutationFn: async (dishPayload: Partial<CustomDish>) => {
      if (editingDish) {
        const { data, error } = await supabase
          .from('custom_dishes')
          .update(dishPayload)
          .eq('id', editingDish.id)
          .select();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('custom_dishes')
          .insert([{ ...dishPayload, user_id: targetUserId }])
          .select();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
      setShowDishModal(false);
      setEditingDish(null);
      resetDishModalFields();
      setStatus('Custom dish saved');
      setIsError(false);
    },
    onError: (err: any) => {
      setStatus('Failed to save custom dish: ' + err.message);
      setIsError(true);
    },
  });

  const deleteCustomDishMutation = useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase.from('custom_dishes').delete().eq('id', dishId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_dishes', targetUserId] });
      setStatus('Custom dish deleted');
      setIsError(false);
    },
    onError: (err: any) => {
      setStatus('Failed to delete dish: ' + err.message);
      setIsError(true);
    },
  });

  const resetDishModalFields = () => {
    setDishModalName('');
    setDishModalCalories('');
    setDishModalProtein('');
    setDishModalCarbs('');
    setDishModalFat('');
    setDishModalFiber('');
    setDishModalIngredients('');
  };

  const handleOpenNewDishModal = () => {
    setEditingDish(null);
    resetDishModalFields();
    setShowDishModal(true);
  };

  const handleOpenEditDishModal = (dish: CustomDish) => {
    setEditingDish(dish);
    setDishModalName(dish.name);
    setDishModalCalories(dish.calories ?? '');
    setDishModalProtein(dish.protein ?? '');
    setDishModalCarbs(dish.carbs ?? '');
    setDishModalFat(dish.fat ?? '');
    setDishModalFiber(dish.fiber ?? '');
    setDishModalIngredients(dish.ingredients ?? '');
    setShowDishModal(true);
  };

  const handleSaveCustomDishModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishModalName.trim()) return;
    saveCustomDishMutation.mutate({
      name: dishModalName.trim(),
      calories: Number(dishModalCalories) || 0,
      protein: Number(dishModalProtein) || 0,
      carbs: Number(dishModalCarbs) || 0,
      fat: Number(dishModalFat) || 0,
      fiber: Number(dishModalFiber) || 0,
      ingredients: dishModalIngredients.trim() || null,
    });
  };

  const handleAnalyze = async () => {
    if (!nlInput.trim()) return;
    setIsAnalyzing(true);
    setStatus('Analyzing...');
    setIsError(false);

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Edge function timeout after 25s')), 25000)
      );

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const invokePromise = supabase.functions.invoke('parse-nutrition', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          input: nlInput,
          text: nlInput,
          custom_dishes: customDishes.map((d) => ({
            name: d.name,
            calories: d.calories,
            protein: d.protein,
            carbs: d.carbs,
            fat: d.fat,
            fiber: d.fiber ?? 0,
          })),
        },
      });

      const { data, error } = (await Promise.race([invokePromise, timeoutPromise])) as any;
      if (error) throw error;

      const parsed = typeof data === 'string' ? JSON.parse(data) : data;

      if (parsed?.error) {
        throw new Error(parsed.error);
      }

      if (parsed && (parsed.calories !== undefined || (Array.isArray(parsed.items) && parsed.items.length > 0))) {
        let items: StagedItem[] = [];
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          items = parsed.items.map((it: any) => ({
            id: generateItemId(),
            name: it.name || 'Item',
            portion: it.portion || '1 serving',
            portionMultiplier: 1,
            baseCalories: Number(it.calories) || 0,
            baseProtein: Number(it.protein) || 0,
            baseCarbs: Number(it.carbs) || 0,
            baseFat: Number(it.fat) || 0,
            baseFiber: Number(it.fiber) || 0,
            calories: Number(it.calories) || 0,
            protein: Number(it.protein) || 0,
            carbs: Number(it.carbs) || 0,
            fat: Number(it.fat) || 0,
            fiber: Number(it.fiber) || 0,
          }));
        } else {
          items = [
            {
              id: generateItemId(),
              name: parsed.name || nlInput,
              portion: '1 serving',
              portionMultiplier: 1,
              baseCalories: Number(parsed.calories) || 0,
              baseProtein: Number(parsed.protein) || 0,
              baseCarbs: Number(parsed.carbs) || 0,
              baseFat: Number(parsed.fat) || 0,
              baseFiber: Number(parsed.fiber) || 0,
              calories: Number(parsed.calories) || 0,
              protein: Number(parsed.protein) || 0,
              carbs: Number(parsed.carbs) || 0,
              fat: Number(parsed.fat) || 0,
              fiber: Number(parsed.fiber) || 0,
            },
          ];
        }

        const totalCal = parsed.calories !== undefined && !isNaN(Number(parsed.calories)) ? Number(parsed.calories) : items.reduce((s, it) => s + it.calories, 0);
        const totalP = parsed.protein !== undefined && !isNaN(Number(parsed.protein)) ? Number(parsed.protein) : items.reduce((s, it) => s + it.protein, 0);
        const totalC = parsed.carbs !== undefined && !isNaN(Number(parsed.carbs)) ? Number(parsed.carbs) : items.reduce((s, it) => s + it.carbs, 0);
        const totalF = parsed.fat !== undefined && !isNaN(Number(parsed.fat)) ? Number(parsed.fat) : items.reduce((s, it) => s + it.fat, 0);
        const totalFib = parsed.fiber !== undefined && !isNaN(Number(parsed.fiber)) ? Number(parsed.fiber) : items.reduce((s, it) => s + it.fiber, 0);

        setStagedMeal({
          name: parsed.name || nlInput,
          mealType: 'Breakfast',
          explanation:
            parsed.explanation ||
            items.map((it) => `${it.calories} kcal (${it.name})`).join(' + ') + ` = ${totalCal} kcal`,
          items,
          calories: totalCal,
          protein: totalP,
          carbs: totalC,
          fat: totalF,
          fiber: totalFib,
          servingSize: Number(parsed.serving_size ?? parsed.servingSize) || 1,
          servingUnit: parsed.serving_unit || parsed.servingUnit || 'serving',
        });

        setShowManualForm(false);
        setStatus('Analyzed');
        return;
      }
      throw new Error('Invalid parsed response: missing nutrition data');
    } catch (error: any) {
      console.warn('AI Edge function failed:', error);
      setIsError(true);
      const errorMsg = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      setStatus(`AI service unavailable: ${errorMsg}`);
      setShowManualForm(true);
      if (!manualDishName.trim()) {
        setManualDishName(nlInput.trim());
      }
      setStagedMeal(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAdjustPortion = (itemId: string, deltaMultiplier: number) => {
    if (!stagedMeal) return;
    const updatedItems = stagedMeal.items.map((it) => {
      if (it.id !== itemId) return it;
      const nextMult = Math.max(0.25, Math.round((it.portionMultiplier + deltaMultiplier) * 100) / 100);
      return {
        ...it,
        portionMultiplier: nextMult,
        calories: Math.round(it.baseCalories * nextMult),
        protein: Math.round(it.baseProtein * nextMult),
        carbs: Math.round(it.baseCarbs * nextMult),
        fat: Math.round(it.baseFat * nextMult),
        fiber: Math.round(it.baseFiber * nextMult),
      };
    });

    const totalCal = updatedItems.reduce((s, it) => s + it.calories, 0);
    const totalP = updatedItems.reduce((s, it) => s + it.protein, 0);
    const totalC = updatedItems.reduce((s, it) => s + it.carbs, 0);
    const totalF = updatedItems.reduce((s, it) => s + it.fat, 0);
    const totalFib = updatedItems.reduce((s, it) => s + it.fiber, 0);
    const explanation =
      updatedItems
        .map(
          (it) =>
            `${it.calories} kcal (${it.name}${it.portionMultiplier !== 1 ? ` ×${it.portionMultiplier}` : ''})`
        )
        .join(' + ') + ` = ${totalCal} kcal`;

    setStagedMeal({
      ...stagedMeal,
      items: updatedItems,
      calories: totalCal,
      protein: totalP,
      carbs: totalC,
      fat: totalF,
      fiber: totalFib,
      explanation,
    });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!stagedMeal) return;
    const updatedItems = stagedMeal.items.filter((it) => it.id !== itemId);
    if (updatedItems.length === 0) {
      setStagedMeal(null);
      return;
    }
    const totalCal = updatedItems.reduce((s, it) => s + it.calories, 0);
    const totalP = updatedItems.reduce((s, it) => s + it.protein, 0);
    const totalC = updatedItems.reduce((s, it) => s + it.carbs, 0);
    const totalF = updatedItems.reduce((s, it) => s + it.fat, 0);
    const totalFib = updatedItems.reduce((s, it) => s + it.fiber, 0);
    const explanation =
      updatedItems.map((it) => `${it.calories} kcal (${it.name})`).join(' + ') + ` = ${totalCal} kcal`;

    setStagedMeal({
      ...stagedMeal,
      items: updatedItems,
      calories: totalCal,
      protein: totalP,
      carbs: totalC,
      fat: totalF,
      fiber: totalFib,
      explanation,
    });
  };

  const handleLogStagedMeal = () => {
    if (!stagedMeal) return;
    const payload = {
      food_name: stagedMeal.name,
      calories: Number(stagedMeal.calories) || 0,
      protein: Number(stagedMeal.protein) || 0,
      carbs: Number(stagedMeal.carbs) || 0,
      fat: Number(stagedMeal.fat) || 0,
      fiber: Number(stagedMeal.fiber) || 0,
      meal_type: stagedMeal.mealType,
      serving_size: Number(stagedMeal.servingSize) || 1,
      serving_unit: stagedMeal.servingUnit || 'serving',
      logged_at: formatLocalTimestamp(selectedDate),
    };
    mutation.mutate(payload);
  };

  const handleSaveStagedAsCustomDish = async () => {
    if (!stagedMeal) return;
    try {
      const { error } = await supabase.from('custom_dishes').insert([
        {
          user_id: targetUserId,
          name: stagedMeal.name,
          ingredients: JSON.stringify(stagedMeal.items),
          calories: stagedMeal.calories,
          protein: stagedMeal.protein,
          carbs: stagedMeal.carbs,
          fat: stagedMeal.fat,
          fiber: stagedMeal.fiber,
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
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fiber: item.fiber,
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

  const handleStageCustomDish = (dish: CustomDish) => {
    const cal = Number(dish.calories) || 0;
    const p = Number(dish.protein) || 0;
    const c = Number(dish.carbs) || 0;
    const f = Number(dish.fat) || 0;
    const fib = Number(dish.fiber) || 0;

    let items: StagedItem[] = [];
    if (dish.ingredients) {
      try {
        const parsed = JSON.parse(dish.ingredients);
        if (Array.isArray(parsed) && parsed.length > 0) {
          items = parsed.map((it: any) => ({
            id: generateItemId(),
            name: it.name || dish.name,
            portion: it.portion || '1 serving',
            portionMultiplier: it.portionMultiplier ?? 1,
            baseCalories: Number(it.baseCalories ?? it.calories) || 0,
            baseProtein: Number(it.baseProtein ?? it.protein) || 0,
            baseCarbs: Number(it.baseCarbs ?? it.carbs) || 0,
            baseFat: Number(it.baseFat ?? it.fat) || 0,
            baseFiber: Number(it.baseFiber ?? it.fiber) || 0,
            calories: Number(it.calories) || 0,
            protein: Number(it.protein) || 0,
            carbs: Number(it.carbs) || 0,
            fat: Number(it.fat) || 0,
            fiber: Number(it.fiber) || 0,
          }));
        }
      } catch {
        // Plain text fallback
      }
    }

    if (items.length === 0) {
      items = [
        {
          id: generateItemId(),
          name: dish.name,
          portion: '1 serving',
          portionMultiplier: 1,
          baseCalories: cal,
          baseProtein: p,
          baseCarbs: c,
          baseFat: f,
          baseFiber: fib,
          calories: cal,
          protein: p,
          carbs: c,
          fat: f,
          fiber: fib,
        },
      ];
    }

    const totalCal = items.reduce((s, it) => s + it.calories, 0);
    const totalP = items.reduce((s, it) => s + it.protein, 0);
    const totalC = items.reduce((s, it) => s + it.carbs, 0);
    const totalF = items.reduce((s, it) => s + it.fat, 0);
    const totalFib = items.reduce((s, it) => s + it.fiber, 0);

    const explanation =
      items.length > 1
        ? items.map((it) => `${it.calories} kcal (${it.name})`).join(' + ') + ` = ${totalCal} kcal`
        : `${totalCal} kcal (${dish.name})`;

    setStagedMeal({
      name: dish.name,
      mealType: 'Breakfast',
      explanation,
      items,
      calories: totalCal,
      protein: totalP,
      carbs: totalC,
      fat: totalF,
      fiber: totalFib,
      servingSize: 1,
      servingUnit: 'serving',
    });
  };

  const handleQuickLogCustomDishDirect = (dish: CustomDish, e: React.MouseEvent) => {
    e.stopPropagation();
    const payload = {
      food_name: dish.name,
      calories: Number(dish.calories) || 0,
      protein: Number(dish.protein) || 0,
      carbs: Number(dish.carbs) || 0,
      fat: Number(dish.fat) || 0,
      fiber: Number(dish.fiber) || 0,
      meal_type: 'Breakfast',
      serving_size: 1,
      serving_unit: 'serving',
      logged_at: formatLocalTimestamp(selectedDate),
    };
    mutation.mutate(payload);
  };

  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDishName.trim()) return;

    const payload = {
      food_name: manualDishName,
      calories: Number(manualCalories) || 0,
      protein: Number(manualProtein) || 0,
      carbs: Number(manualCarbs) || 0,
      fat: Number(manualFat) || 0,
      fiber: Number(manualFiber) || 0,
      meal_type: manualMealType,
      serving_size: Number(manualServingSize) || 1,
      serving_unit: manualServingUnit,
      logged_at: formatLocalTimestamp(selectedDate),
    };

    mutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      {/* Daily Macro Rings */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Today's Nutrition
            </h2>
          </div>
          <input
            type="date"
            data-testid="nutrition-date-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-cyan-400 rounded-xl px-2.5 py-1.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-5 gap-1.5 sm:gap-2">
          <div className="col-span-2 sm:col-span-1">
            <MacroRing
              label="Calories"
              current={dailyTotals.calories}
              target={targetCalories}
              unit="kcal"
              colorClass="text-amber-400"
              strokeColor="#f59e0b"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <MacroRing
              label="Protein"
              current={dailyTotals.protein}
              target={targetProtein}
              unit="g"
              colorClass="text-cyan-400"
              strokeColor="#06b6d4"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <MacroRing
              label="Carbs"
              current={dailyTotals.carbs}
              target={targetCarbs}
              unit="g"
              colorClass="text-emerald-400"
              strokeColor="#10b981"
            />
          </div>
          <div className="col-span-3 sm:col-span-1">
            <MacroRing
              label="Fat"
              current={dailyTotals.fat}
              target={targetFat}
              unit="g"
              colorClass="text-violet-400"
              strokeColor="#8b5cf6"
            />
          </div>
          <div className="col-span-3 sm:col-span-1">
            <MacroRing
              label="Fiber"
              current={dailyTotals.fiber}
              target={targetFiber}
              unit="g"
              colorClass="text-teal-400"
              strokeColor="#14b8a6"
            />
          </div>
        </div>

        {/* Daily Remaining Fuel Indicator */}
        <div
          data-testid="remaining-fuel-container"
          className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono"
        >
          <span className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Remaining Fuel:</span>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span
              data-testid="remaining-fuel-calories"
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold transition-all ${
                remainingFuel.calories.isOver
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.1)]'
              }`}
            >
              {remainingFuel.calories.badgeLabel}
            </span>
            <span
              data-testid="remaining-fuel-protein"
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold transition-all ${
                remainingFuel.protein.isOver
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                  : 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.1)]'
              }`}
            >
              {remainingFuel.protein.badgeLabel}
            </span>
            <span
              data-testid="remaining-fuel-carbs"
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold transition-all ${
                remainingFuel.carbs.isOver
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.1)]'
              }`}
            >
              {remainingFuel.carbs.badgeLabel}
            </span>
            <span
              data-testid="remaining-fuel-fat"
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold transition-all ${
                remainingFuel.fat.isOver
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                  : 'bg-violet-500/10 border-violet-500/25 text-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.1)]'
              }`}
            >
              {remainingFuel.fat.badgeLabel}
            </span>
            <span
              data-testid="remaining-fuel-fiber"
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold transition-all ${
                remainingFuel.fiber.isOver
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                  : 'bg-teal-500/10 border-teal-500/25 text-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.1)]'
              }`}
            >
              {remainingFuel.fiber.badgeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 1-Tap Quick-Log Carousel for Custom Dishes */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-4 shadow-2xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Quick Log Favorites
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenNewDishModal}
            className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-xl transition"
          >
            <Plus className="w-3 h-3" />
            <span>New Dish</span>
          </button>
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
                onClick={() => handleStageCustomDish(dish)}
                className="bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-cyan-500/40 rounded-2xl p-2.5 shrink-0 flex items-center gap-2.5 cursor-pointer transition shadow-sm group select-none"
              >
                <div className="w-7 h-7 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                  {getDishIcon(dish.name)}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition truncate max-w-[130px]">
                    {dish.name}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-400">
                    <span className="text-amber-400 font-bold">{formatCalories(dish.calories)} kcal</span>
                    <span> • {formatMacro(dish.protein)}g P</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleQuickLogCustomDishDirect(dish, e)}
                  title="1-Tap Log Meal"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 flex items-center justify-center transition active:scale-95 shrink-0 touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conversational AI Food Logger */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-neon-cyan">
              <Sparkles className="w-4 h-4 text-zinc-950 font-black" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Log Food
              </h3>
              <p className="text-[11px] text-zinc-400">
                Describe what you ate in natural language
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowManualForm((prev) => !prev)}
            className="text-[11px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 min-h-[36px] rounded-xl transition border border-zinc-700"
          >
            <span>{showManualForm ? 'Hide Manual' : 'Manual Entry'}</span>
            {showManualForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 focus-within:border-cyan-500 transition">
          <textarea
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder="Describe what you ate (e.g., 3 eggs, 2 slices sourdough, 1 tbsp butter)"
            className="w-full bg-transparent text-white text-base sm:text-xs placeholder:text-zinc-600 outline-none resize-none"
            rows={3}
          />
          <div className="flex justify-end pt-2 border-t border-zinc-850">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !nlInput.trim()}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs px-4 py-2.5 min-h-[44px] rounded-xl shadow-neon-cyan active:scale-95 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAnalyzing ? 'Analyzing...' : 'Analyze Meal'}</span>
            </button>
          </div>
        </div>

        {/* Staged Meal Card */}
        {stagedMeal && (
          <div data-testid="staged-meal-card" className="bg-gradient-to-b from-zinc-950 to-zinc-900 border-2 border-cyan-500/50 rounded-2xl p-4 space-y-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                  Meal Name
                </label>
                <input
                  type="text"
                  data-testid="dish-name-input"
                  value={stagedMeal.name}
                  onChange={(e) => setStagedMeal({ ...stagedMeal, name: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 text-white font-black text-base sm:text-sm rounded-xl px-3 py-1.5 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Meal Type
                </label>
                <select
                  value={stagedMeal.mealType}
                  onChange={(e) => setStagedMeal({ ...stagedMeal, mealType: e.target.value })}
                  className="bg-zinc-900 border border-zinc-700 text-white text-base sm:text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-cyan-500 min-h-[44px]"
                >
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snack">Snack</option>
                  <option value="Pre-Workout">Pre-Workout</option>
                  <option value="Post-Workout">Post-Workout</option>
                </select>
              </div>
            </div>

            {/* Itemized Ingredient Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                <span>Itemized Breakdown ({stagedMeal.items.length})</span>
                <span className="text-zinc-500 text-[10px]">Adjust portion or remove item</span>
              </div>

              <div className="space-y-1.5">
                {stagedMeal.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-white text-xs truncate flex items-center gap-1.5">
                        <span>{item.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800 px-1.5 py-0.5 rounded">
                          {item.portion}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                        <span className="text-amber-400 font-bold">{formatCalories(item.calories)} kcal</span>
                        <span> • P: {formatMacro(item.protein)}g</span>
                        <span> • C: {formatMacro(item.carbs)}g</span>
                        <span> • F: {formatMacro(item.fat)}g</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Portion Multiplier Controls */}
                      <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => handleAdjustPortion(item.id, -0.5)}
                          className="min-w-[44px] min-h-[44px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm flex items-center justify-center transition touch-manipulation"
                          title="Decrease portion"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold px-2 text-cyan-300">
                          {item.portionMultiplier}x
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAdjustPortion(item.id, 0.5)}
                          className="min-w-[44px] min-h-[44px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm flex items-center justify-center transition touch-manipulation"
                          title="Increase portion"
                        >
                          +
                        </button>
                      </div>

                      {/* Save to Quick Log */}
                      <button
                        type="button"
                        onClick={() => handleSaveItemAsCustomDish(item)}
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition touch-manipulation"
                        title="Save to quick log (custom dishes)"
                      >
                        <Star className="w-4 h-4" />
                      </button>

                      {/* 1-Tap Item Deletion */}
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition touch-manipulation"
                        title="Remove ingredient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mathematical Breakdown Callout */}
            {stagedMeal.explanation && (
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-2.5 flex items-start gap-2 text-xs">
                <Calculator className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="font-mono text-cyan-200 text-[11px]">
                  {stagedMeal.explanation}
                </div>
              </div>
            )}

            {/* Macro Summary Row & Editable Fields */}
            <div className="grid grid-cols-6 sm:grid-cols-5 gap-2 pt-1">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                  Calories
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  data-testid="calories-input"
                  value={stagedMeal.calories}
                  onChange={(e) =>
                    setStagedMeal({
                      ...stagedMeal,
                      calories: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                  Protein (g)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  data-testid="protein-input"
                  value={stagedMeal.protein}
                  onChange={(e) =>
                    setStagedMeal({
                      ...stagedMeal,
                      protein: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  data-testid="carbs-input"
                  value={stagedMeal.carbs}
                  onChange={(e) =>
                    setStagedMeal({
                      ...stagedMeal,
                      carbs: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
                  Fat (g)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  data-testid="fat-input"
                  value={stagedMeal.fat}
                  onChange={(e) =>
                    setStagedMeal({
                      ...stagedMeal,
                      fat: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                  Fiber (g)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  data-testid="fiber-input"
                  value={stagedMeal.fiber}
                  onChange={(e) =>
                    setStagedMeal({
                      ...stagedMeal,
                      fiber: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                />
              </div>
            </div>

            {/* Action Buttons Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleLogStagedMeal}
                disabled={mutation.isPending}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black py-3 px-4 min-h-[44px] rounded-xl text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>
                  {mutation.isPending
                    ? 'Logging...'
                    : `Log Meal (+${formatCalories(stagedMeal.calories)} kcal)`}
                </span>
              </button>

              <button
                type="button"
                onClick={handleSaveStagedAsCustomDish}
                className="bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold py-3 px-3.5 min-h-[44px] rounded-xl text-xs border border-zinc-700 transition flex items-center gap-1.5"
                title="Save this meal as a quick-log custom dish"
              >
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span className="hidden sm:inline">Save as Custom Dish</span>
              </button>

              <button
                type="button"
                onClick={() => setStagedMeal(null)}
                className="bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-white font-bold py-3 px-3 min-h-[44px] rounded-xl text-xs transition"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Fallback Manual Review Form */}
        {!stagedMeal && showManualForm && (
          <form onSubmit={handleManualSave} className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Dish Name
                </label>
                <input
                  type="text"
                  data-testid="dish-name-input"
                  value={manualDishName}
                  onChange={(e) => setManualDishName(e.target.value)}
                  placeholder="e.g. Scrambled Eggs & Toast"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Meal Type
                </label>
                <select
                  value={manualMealType}
                  onChange={(e) => setManualMealType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none min-h-[44px]"
                >
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snack">Snack</option>
                  <option value="Pre-Workout">Pre-Workout</option>
                  <option value="Post-Workout">Post-Workout</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                  Calories
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  data-testid="calories-input"
                  value={manualCalories}
                  onChange={(e) => setManualCalories(e.target.value === '' ? '' : Number(e.target.value))}
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
                  inputMode="decimal"
                  data-testid="protein-input"
                  value={manualProtein}
                  onChange={(e) => setManualProtein(e.target.value === '' ? '' : Number(e.target.value))}
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
                  inputMode="decimal"
                  data-testid="carbs-input"
                  value={manualCarbs}
                  onChange={(e) => setManualCarbs(e.target.value === '' ? '' : Number(e.target.value))}
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
                  inputMode="decimal"
                  data-testid="fat-input"
                  value={manualFat}
                  onChange={(e) => setManualFat(e.target.value === '' ? '' : Number(e.target.value))}
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
                  inputMode="decimal"
                  data-testid="fiber-input"
                  value={manualFiber}
                  onChange={(e) => setManualFiber(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Serving Size
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={manualServingSize}
                  onChange={(e) => setManualServingSize(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono focus:border-cyan-500 outline-none text-center"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Serving Unit
                </label>
                <input
                  type="text"
                  value={manualServingUnit}
                  onChange={(e) => setManualServingUnit(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none text-center"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition disabled:opacity-50"
            >
              {mutation.isPending ? 'Logging...' : 'Log Meal'}
            </button>
          </form>
        )}

        {status && (
          <div
            data-testid="status-message"
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              isError
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{status}</span>
          </div>
        )}
      </div>

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

        {todayLogs.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs">
            No meals logged for this date yet.
          </div>
        ) : (
          <div className="space-y-2">
            {todayLogs.map((log) => (
              <div
                key={log.id}
                data-testid="meal-log-item"
                className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between shadow-sm"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-extrabold text-white text-xs truncate flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      {getDishIcon(log.food_name)}
                    </div>
                    <span>{log.food_name}</span>
                    {log.meal_type && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded-lg">
                        {log.meal_type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] font-mono mt-0.5 text-zinc-400 flex-wrap">
                    <span className="text-amber-400 font-bold">{formatCalories(log.calories)} kcal</span>
                    <span>•</span>
                    <span>P: {formatMacro(log.protein)}g</span>
                    <span>•</span>
                    <span>C: {formatMacro(log.carbs)}g</span>
                    <span>•</span>
                    <span>F: {formatMacro(log.fat)}g</span>
                    <span>•</span>
                    <span className="text-teal-400">Fib: {formatMacro(log.fiber)}g</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingMealLog(log)}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition touch-manipulation"
                    title="Edit meal"
                    data-testid={`edit-meal-${log.id}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(log.id)}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition touch-manipulation"
                    title="Delete meal"
                    data-testid={`delete-meal-${log.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Dishes Modal */}
      {showDishModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                {editingDish ? 'Edit Custom Dish' : 'New Custom Dish'}
              </h3>
              <button
                type="button"
                onClick={() => setShowDishModal(false)}
                className="text-zinc-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomDishModal} className="space-y-3">
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

              <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                    Calories
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={dishModalCalories}
                    onChange={(e) =>
                      setDishModalCalories(e.target.value === '' ? '' : Number(e.target.value))
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
                    inputMode="decimal"
                    value={dishModalProtein}
                    onChange={(e) =>
                      setDishModalProtein(e.target.value === '' ? '' : Number(e.target.value))
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
                    inputMode="decimal"
                    value={dishModalCarbs}
                    onChange={(e) =>
                      setDishModalCarbs(e.target.value === '' ? '' : Number(e.target.value))
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
                    inputMode="decimal"
                    value={dishModalFat}
                    onChange={(e) =>
                      setDishModalFat(e.target.value === '' ? '' : Number(e.target.value))
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
                    inputMode="decimal"
                    value={dishModalFiber}
                    onChange={(e) =>
                      setDishModalFiber(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Ingredients (Optional)
                </label>
                <input
                  type="text"
                  value={dishModalIngredients}
                  onChange={(e) => setDishModalIngredients(e.target.value)}
                  placeholder="e.g. 1 cup oats, 1 scoop whey, 1 tbsp peanut butter"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowDishModal(false)}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveCustomDishMutation.isPending}
                  className="px-5 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black shadow-neon-cyan font-black disabled:opacity-50"
                >
                  {saveCustomDishMutation.isPending ? 'Saving...' : 'Save Dish'}
                </button>
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
                          {formatCalories(dish.calories)} kcal • P: {formatMacro(dish.protein)}g • C: {formatMacro(dish.carbs)}g • F: {formatMacro(dish.fat)}g • Fib: {formatMacro(dish.fiber)}g
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditDishModal(dish)}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 rounded-lg transition touch-manipulation"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCustomDishMutation.mutate(dish.id)}
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
      )}

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
    </div>
  );
};

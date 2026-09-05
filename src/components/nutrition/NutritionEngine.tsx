import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { NutritionLog, CustomDish } from '../../types/database';
import { MacroRing } from '../common/MacroRing';
import { normalizeDateStr } from '../../utils/ghostSets';
import { getDishIcon } from '../../utils/dishIcons';
import { EditMealModal } from './EditMealModal';
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

function parseLocalNutrition(input: string, customDishes: CustomDish[]): StagedMeal {
  const lower = input.toLowerCase();

  // Check if matches custom dish
  const matchedDish = customDishes.find((d) => lower.includes(d.name.toLowerCase()));
  if (matchedDish) {
    const cal = Number(matchedDish.calories) || 0;
    const p = Number(matchedDish.protein) || 0;
    const c = Number(matchedDish.carbs) || 0;
    const f = Number(matchedDish.fat) || 0;
    const fib = Number(matchedDish.fiber) || 0;

    let items: StagedItem[] = [];
    if (matchedDish.ingredients) {
      try {
        const parsed = JSON.parse(matchedDish.ingredients);
        if (Array.isArray(parsed) && parsed.length > 0) {
          items = parsed.map((it: any) => ({
            id: generateItemId(),
            name: it.name || matchedDish.name,
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
        // Not JSON
      }
    }

    if (items.length === 0) {
      items = [
        {
          id: generateItemId(),
          name: matchedDish.name,
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
        : `${totalCal} kcal (${matchedDish.name})`;

    return {
      name: matchedDish.name,
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
    };
  }

  // 1. Check for pre-analyzed structured text with explicit line items (e.g. "* Scrambled Egg White: 180 g | 139 kcal | 20 g P | 1 g C | 5 g F")
  const lines = input.split('\n');
  const structuredItems: StagedItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('===') || trimmed.startsWith('+++') || trimmed.startsWith('---')) continue;
    if (/^(?:Component Breakdown|Breakdown|Ingredients|Totals?):/i.test(trimmed)) continue;
    if (/^(?:Total\s+)?(?:Calories|Protein|Carbs|Fat|Fiber):/i.test(trimmed)) continue;
    if (/^(?:Food Item|Meal Name|Dish Name|Meal|Dish|Title|Total Portion Size|Portion Size|Serving Size):/i.test(trimmed)) continue;

    const bulletCleaned = trimmed.replace(/^(?:[*•\-+]|\d+[.)])\s*/, '');
    const hasMacros = /(?:kcal|cal|\bp\b|\bprotein\b|\bc\b|\bcarbs?\b|\bf\b|\bfat\b)/i.test(bulletCleaned);
    if (!hasMacros) continue;

    let nameAndPortion = '';
    let macrosStr = '';

    if (bulletCleaned.includes('|')) {
      const parts = bulletCleaned.split('|');
      if (/(?:kcal|cal|\bp\b|\bprotein\b)/i.test(parts[0])) continue;
      if (parts.length > 2 && !/(?:kcal|cal|\bp\b|\bprotein\b|\bc\b|\bcarbs?\b|\bf\b|\bfat\b)/i.test(parts[1])) {
        nameAndPortion = parts[0] + ': ' + parts[1];
        macrosStr = parts.slice(2).join(' | ');
      } else {
        nameAndPortion = parts[0];
        macrosStr = parts.slice(1).join(' | ');
      }
    } else if (bulletCleaned.includes(':')) {
      const colonIdx = bulletCleaned.indexOf(':');
      nameAndPortion = bulletCleaned.slice(0, colonIdx);
      macrosStr = bulletCleaned.slice(colonIdx + 1);
    } else {
      continue;
    }

    let name = nameAndPortion.trim();
    let portion = '1 serving';

    if (nameAndPortion.includes(':')) {
      const subParts = nameAndPortion.split(':');
      name = subParts[0].trim();
      portion = subParts.slice(1).join(':').trim() || '1 serving';
    } else if (nameAndPortion.includes(' - ')) {
      const subParts = nameAndPortion.split(' - ');
      name = subParts[0].trim();
      portion = subParts.slice(1).join(' - ').trim() || '1 serving';
    }

    const calMatch = macrosStr.match(/([\d.]+)\s*(?:kcal|cal(?:ories)?)\b/i);
    const pMatch = macrosStr.match(/([\d.]+)\s*g?\s*(?:P(?:rotein)?)\b/i);
    const cMatch = macrosStr.match(/([\d.]+)\s*g?\s*(?:C(?:arbs?|arbohydrates?)?)\b/i);
    const fMatch = macrosStr.match(/([\d.]+)\s*g?\s*(?:F(?:at)?)\b/i);
    const fibMatch = macrosStr.match(/([\d.]+)\s*g?\s*(?:Fiber|Fib|Fibre)\b/i);

    if (!calMatch && !pMatch && !cMatch && !fMatch) continue;

    const cal = calMatch ? parseFloat(calMatch[1]) : 0;
    const p = pMatch ? parseFloat(pMatch[1]) : 0;
    const c = cMatch ? parseFloat(cMatch[1]) : 0;
    const f = fMatch ? parseFloat(fMatch[1]) : 0;
    const fib = fibMatch ? parseFloat(fibMatch[1]) : 0;

    structuredItems.push({
      id: generateItemId(),
      name,
      portion,
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
    });
  }

  if (structuredItems.length > 0) {
    const foodItemMatch = input.match(/(?:Food Item|Meal Name|Dish Name|Meal|Dish|Title|Food):\s*([^\n\r+]+)/i);
    const mealTitle = foodItemMatch ? foodItemMatch[1].trim() : structuredItems.map((i) => i.name).join(', ');

    const portionSizeMatch = input.match(/(?:Total\s+Portion\s+Size|Portion\s+Size|Serving\s+Size|Total\s+Size):\s*([\d.]+)\s*([a-zA-Z%]+)?/i);
    const servingSize = portionSizeMatch ? parseFloat(portionSizeMatch[1]) : 1;
    const servingUnit = portionSizeMatch && portionSizeMatch[2] ? portionSizeMatch[2].trim() : 'serving';

    const totalCalMatch = input.match(/(?:Total\s+)?Calories:\s*([\d.]+)/i);
    const totalPMatch = input.match(/(?:Total\s+)?Protein:\s*([\d.]+)/i);
    const totalCMatch = input.match(/(?:Total\s+)?Carbs:\s*([\d.]+)/i);
    const totalFMatch = input.match(/(?:Total\s+)?Fat:\s*([\d.]+)/i);
    const totalFibMatch = input.match(/(?:Total\s+)?Fiber:\s*([\d.]+)/i);

    const totalCal = totalCalMatch ? parseFloat(totalCalMatch[1]) : structuredItems.reduce((acc, i) => acc + i.calories, 0);
    const totalP = totalPMatch ? parseFloat(totalPMatch[1]) : structuredItems.reduce((acc, i) => acc + i.protein, 0);
    const totalC = totalCMatch ? parseFloat(totalCMatch[1]) : structuredItems.reduce((acc, i) => acc + i.carbs, 0);
    const totalF = totalFMatch ? parseFloat(totalFMatch[1]) : structuredItems.reduce((acc, i) => acc + i.fat, 0);
    const totalFib = totalFibMatch ? parseFloat(totalFibMatch[1]) : structuredItems.reduce((acc, i) => acc + i.fiber, 0);

    const explanation = structuredItems
      .map((i) => `• ${i.name} (${i.portion}): ${i.calories} kcal | ${i.protein}g P | ${i.carbs}g C | ${i.fat}g F${i.fiber !== undefined ? ` | ${i.fiber}g Fiber` : ''}`)
      .join('\n') + `\nTotal: ${totalCal} kcal | ${totalP}g P | ${totalC}g C | ${totalF}g F${totalFib !== undefined ? ` | ${totalFib}g Fiber` : ''}`;

    return {
      name: mealTitle,
      mealType: 'Breakfast',
      explanation,
      items: structuredItems,
      calories: totalCal,
      protein: totalP,
      carbs: totalC,
      fat: totalF,
      fiber: totalFib,
      servingSize,
      servingUnit,
    };
  }

  const items: StagedItem[] = [];

  // Parse Com Tam / Cơm Tấm (Vietnamese Broken Rice multi-dish platter)
  const isComTam = lower.includes('com tam') || lower.includes('cơm tấm') || lower.includes('broken rice');
  if (isComTam) {
    items.push({
      id: generateItemId(),
      name: 'Broken Rice (Cơm Tấm)',
      portion: '1.5 cups (240g)',
      portionMultiplier: 1,
      baseCalories: 300,
      baseProtein: 6,
      baseCarbs: 65,
      baseFat: 1,
      baseFiber: 1,
      calories: 300,
      protein: 6,
      carbs: 65,
      fat: 1,
      fiber: 1,
    });
    items.push({
      id: generateItemId(),
      name: 'Grilled Pork Chop (Sườn Nướng)',
      portion: '1 chop (120g)',
      portionMultiplier: 1,
      baseCalories: 260,
      baseProtein: 26,
      baseCarbs: 4,
      baseFat: 15,
      baseFiber: 0,
      calories: 260,
      protein: 26,
      carbs: 4,
      fat: 15,
      fiber: 0,
    });
    if (lower.includes('egg') || lower.includes('trứng') || lower.includes('trung')) {
      items.push({
        id: generateItemId(),
        name: 'Fried Egg',
        portion: '1 large',
        portionMultiplier: 1,
        baseCalories: 90,
        baseProtein: 6,
        baseCarbs: 1,
        baseFat: 7,
        baseFiber: 0,
        calories: 90,
        protein: 6,
        carbs: 1,
        fat: 7,
        fiber: 0,
      });
    }
  }

  // Parse eggs (when not com tam)
  if (!isComTam) {
    if (lower.includes('egg white') || lower.includes('egg whites')) {
      items.push({
        id: generateItemId(),
        name: 'Scrambled Egg White',
        portion: '150 g',
        portionMultiplier: 1,
        baseCalories: 87,
        baseProtein: 14,
        baseCarbs: 1,
        baseFat: 3,
        baseFiber: 0,
        calories: 87,
        protein: 14,
        carbs: 1,
        fat: 3,
        fiber: 0,
      });
    } else {
      const eggMatch = lower.match(/(\d+)?\s*(?:scrambled |fried |boiled |poached )?(?:egg|eggs)/);
      if (eggMatch || lower.includes('egg')) {
        const count = eggMatch && eggMatch[1] ? parseInt(eggMatch[1], 10) : 2;
        const cal = count * 70;
        const p = count * 6;
        const f = count * 5;
        items.push({
          id: generateItemId(),
          name: 'Eggs',
          portion: `${count} large`,
          portionMultiplier: 1,
          baseCalories: cal,
          baseProtein: p,
          baseCarbs: 1,
          baseFat: f,
          baseFiber: 0,
          calories: cal,
          protein: p,
          carbs: 1,
          fat: f,
          fiber: 0,
        });
      }
    }
  }

  // Parse toast / bread / sourdough
  const breadMatch = lower.match(/(\d+)?\s*(?:slice|slices|piece|pieces)?\s*(?:of )?(?:sourdough|toast|bread|whole wheat)/);
  if (breadMatch || lower.includes('toast') || lower.includes('sourdough') || lower.includes('bread')) {
    const count = breadMatch && breadMatch[1] ? parseInt(breadMatch[1], 10) : 2;
    const isSourdough = lower.includes('sourdough');
    const name = isSourdough ? 'Sourdough Bread' : 'Whole Wheat Toast';
    const cal = count * 80;
    const p = count * 3;
    const c = count * 15;
    const f = count * 1;
    const fib = count * 1;
    items.push({
      id: generateItemId(),
      name,
      portion: `${count} ${count > 1 ? 'slices' : 'slice'}`,
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
    });
  }

  // Parse butter / oil
  const butterMatch = lower.match(/(\d+)?\s*(?:tbsp|tsp|pat|tablespoon)?\s*(?:of )?(?:butter|ghee|olive oil|oil)/);
  if (butterMatch || lower.includes('butter') || lower.includes('olive oil') || lower.includes('oil')) {
    const count = butterMatch && butterMatch[1] ? parseInt(butterMatch[1], 10) : 1;
    const name = lower.includes('olive oil') ? 'Olive Oil' : 'Butter';
    const cal = count * 100;
    const f = count * 11;
    items.push({
      id: generateItemId(),
      name,
      portion: `${count} tbsp`,
      portionMultiplier: 1,
      baseCalories: cal,
      baseProtein: 0,
      baseCarbs: 0,
      baseFat: f,
      baseFiber: 0,
      calories: cal,
      protein: 0,
      carbs: 0,
      fat: f,
      fiber: 0,
    });
  }

  // Parse chicken / meat / steak / salmon
  const meatMatch = lower.match(/(\d+)?\s*(?:oz|g|gram|grams)?\s*(?:of )?(?:chicken|breast|steak|beef|salmon|tuna|turkey)/);
  if (meatMatch || lower.includes('chicken') || lower.includes('steak') || lower.includes('salmon') || lower.includes('beef')) {
    const oz = meatMatch && meatMatch[1] ? parseInt(meatMatch[1], 10) : 6;
    let name = 'Chicken Breast';
    let calPerOz = 45;
    let pPerOz = 9;
    let fPerOz = 1;
    if (lower.includes('steak') || lower.includes('beef')) {
      name = 'Steak';
      calPerOz = 60;
      pPerOz = 8;
      fPerOz = 3;
    } else if (lower.includes('salmon')) {
      name = 'Salmon';
      calPerOz = 55;
      pPerOz = 7;
      fPerOz = 3;
    }
    const cal = oz * calPerOz;
    const p = oz * pPerOz;
    const f = oz * fPerOz;
    items.push({
      id: generateItemId(),
      name,
      portion: `${oz} oz`,
      portionMultiplier: 1,
      baseCalories: cal,
      baseProtein: p,
      baseCarbs: 0,
      baseFat: f,
      baseFiber: 0,
      calories: cal,
      protein: p,
      carbs: 0,
      fat: f,
      fiber: 0,
    });
  }

  // Parse rice / pasta / potato
  const carbMatch = lower.match(/(\d+)?\s*(?:cup|cups|serving|servings|g)?\s*(?:of )?(?:rice|jasmine rice|brown rice|pasta|potato|sweet potato)/);
  if (carbMatch || lower.includes('rice') || lower.includes('pasta') || lower.includes('potato')) {
    const count = carbMatch && carbMatch[1] ? parseInt(carbMatch[1], 10) : 1;
    let name = 'White Rice';
    if (lower.includes('pasta')) name = 'Pasta';
    else if (lower.includes('potato')) name = 'Baked Potato';
    const cal = count * 220;
    const p = count * 4;
    const c = count * 45;
    const f = count * 1;
    const fib = count * 2;
    items.push({
      id: generateItemId(),
      name,
      portion: `${count} cup`,
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
    });
  }

  // Parse oats / oatmeal
  const oatMatch = lower.match(/(\d+)?\s*(?:cup|cups|bowl|serving)?\s*(?:of )?(?:oat|oats|oatmeal)/);
  if (oatMatch || lower.includes('oat')) {
    const count = oatMatch && oatMatch[1] ? parseInt(oatMatch[1], 10) : 1;
    const cal = count * 150;
    const p = count * 5;
    const c = count * 27;
    const f = count * 3;
    const fib = count * 4;
    items.push({
      id: generateItemId(),
      name: 'Oats',
      portion: `${count} cup`,
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
    });
  }

  // Parse protein shake / whey
  if (lower.includes('shake') || lower.includes('whey') || lower.includes('protein powder')) {
    items.push({
      id: generateItemId(),
      name: 'Whey Protein',
      portion: '1 scoop (30g)',
      portionMultiplier: 1,
      baseCalories: 140,
      baseProtein: 25,
      baseCarbs: 3,
      baseFat: 2,
      baseFiber: 1,
      calories: 140,
      protein: 25,
      carbs: 3,
      fat: 2,
      fiber: 1,
    });
  }

  // Parse peanut butter
  if (lower.includes('peanut butter') || lower.includes('pb') || lower.includes('almond butter')) {
    items.push({
      id: generateItemId(),
      name: 'Peanut Butter',
      portion: '1 tbsp',
      portionMultiplier: 1,
      baseCalories: 95,
      baseProtein: 4,
      baseCarbs: 4,
      baseFat: 8,
      baseFiber: 1,
      calories: 95,
      protein: 4,
      carbs: 4,
      fat: 8,
      fiber: 1,
    });
  }

  // Parse avocado
  if (lower.includes('avocado')) {
    items.push({
      id: generateItemId(),
      name: 'Avocado',
      portion: '1/2 medium',
      portionMultiplier: 1,
      baseCalories: 120,
      baseProtein: 1,
      baseCarbs: 6,
      baseFat: 11,
      baseFiber: 5,
      calories: 120,
      protein: 1,
      carbs: 6,
      fat: 11,
      fiber: 5,
    });
  }

  // Parse fruit / banana
  if (lower.includes('banana')) {
    items.push({
      id: generateItemId(),
      name: 'Banana',
      portion: '1 medium',
      portionMultiplier: 1,
      baseCalories: 105,
      baseProtein: 1,
      baseCarbs: 27,
      baseFat: 0,
      baseFiber: 3,
      calories: 105,
      protein: 1,
      carbs: 27,
      fat: 0,
      fiber: 3,
    });
  }

  // Parse turkey
  if (lower.includes('turkey')) {
    items.push({
      id: generateItemId(),
      name: 'Sliced Turkey Breast',
      portion: '60 g',
      portionMultiplier: 1,
      baseCalories: 80,
      baseProtein: 10,
      baseCarbs: 1,
      baseFat: 4,
      baseFiber: 0,
      calories: 80,
      protein: 10,
      carbs: 1,
      fat: 4,
      fiber: 0,
    });
  }

  // Parse chia pudding
  if (lower.includes('chia')) {
    items.push({
      id: generateItemId(),
      name: 'Chocolate Coconut Chia Pudding',
      portion: '150 g',
      portionMultiplier: 1,
      baseCalories: 227,
      baseProtein: 5,
      baseCarbs: 18,
      baseFat: 15,
      baseFiber: 8,
      calories: 227,
      protein: 5,
      carbs: 18,
      fat: 15,
      fiber: 8,
    });
  }

  // Parse greek yogurt
  if (lower.includes('yogurt') || lower.includes('yoghurt')) {
    items.push({
      id: generateItemId(),
      name: '2% Plain Greek Yogurt',
      portion: '100 g',
      portionMultiplier: 1,
      baseCalories: 88,
      baseProtein: 9,
      baseCarbs: 4,
      baseFat: 4,
      baseFiber: 0,
      calories: 88,
      protein: 9,
      carbs: 4,
      fat: 4,
      fiber: 0,
    });
  }

  // If nothing matched, fallback to 1 generic item
  if (items.length === 0) {
    items.push({
      id: generateItemId(),
      name: input.trim() || 'Meal',
      portion: '1 serving',
      portionMultiplier: 1,
      baseCalories: 350,
      baseProtein: 20,
      baseCarbs: 35,
      baseFat: 12,
      baseFiber: 2,
      calories: 350,
      protein: 20,
      carbs: 35,
      fat: 12,
      fiber: 2,
    });
  }

  const totalCal = items.reduce((s, it) => s + it.calories, 0);
  const totalP = items.reduce((s, it) => s + it.protein, 0);
  const totalC = items.reduce((s, it) => s + it.carbs, 0);
  const totalF = items.reduce((s, it) => s + it.fat, 0);
  const totalFib = items.reduce((s, it) => s + it.fiber, 0);

  let mealName = items.map((it) => it.name).join(' & ');
  if (isComTam) {
    mealName = lower.includes('egg') || lower.includes('trứng') || lower.includes('trung')
      ? 'Com Tam & Eggs'
      : 'Com Tam';
  }
  const explanation = items.map((it) => `${it.calories} kcal (${it.name})`).join(' + ') + ` = ${totalCal} kcal`;

  return {
    name: mealName,
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
  };
}

export const NutritionEngine: React.FC = () => {
  const { user, profile, role } = useAuth();
  const { selectedAthleteId } = useCoach();
  const queryClient = useQueryClient();

  const targetUserId = (role === 'coach' && selectedAthleteId ? selectedAthleteId : user?.id) || user?.id || '';

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
    return normalizeDateStr(new Date().toISOString());
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

      if (parsed) {
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

        setStatus('Analyzed');
        return;
      }
      throw new Error('Invalid parsed response');
    } catch (error: any) {
      console.warn('AI Edge function fallback to local parser:', error);
      const fallbackMeal = parseLocalNutrition(nlInput, customDishes);
      setStagedMeal(fallbackMeal);
      setStatus('Analyzed');
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
      logged_at: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}Z`,
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
      logged_at: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}Z`,
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
      logged_at: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}Z`,
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
        <div className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
          <span className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Remaining Fuel:</span>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className={targetCalories - dailyTotals.calories >= 0 ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'}>
              {Math.max(0, targetCalories - dailyTotals.calories)} kcal
            </span>
            <span className="text-zinc-700">•</span>
            <span className="text-cyan-400 font-bold">{Math.max(0, targetProtein - dailyTotals.protein)}g P</span>
            <span className="text-zinc-700">•</span>
            <span className="text-emerald-400 font-bold">{Math.max(0, targetCarbs - dailyTotals.carbs)}g C</span>
            <span className="text-zinc-700">•</span>
            <span className="text-violet-400 font-bold">{Math.max(0, targetFat - dailyTotals.fat)}g F</span>
            <span className="text-zinc-700">•</span>
            <span className="text-teal-400 font-bold">{Math.max(0, targetFiber - dailyTotals.fiber)}g Fib</span>
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
                    <span className="text-amber-400 font-bold">{dish.calories || 0} kcal</span>
                    <span> • {dish.protein || 0}g P</span>
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
                        <span className="text-amber-400 font-bold">{item.calories} kcal</span>
                        <span> • P: {item.protein}g</span>
                        <span> • C: {item.carbs}g</span>
                        <span> • F: {item.fat}g</span>
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
                    : `Log Meal (+${stagedMeal.calories} kcal)`}
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
                    <span className="text-amber-400 font-bold">{log.calories} kcal</span>
                    <span>•</span>
                    <span>P: {log.protein || 0}g</span>
                    <span>•</span>
                    <span>C: {log.carbs || 0}g</span>
                    <span>•</span>
                    <span>F: {log.fat || 0}g</span>
                    <span>•</span>
                    <span className="text-teal-400">Fib: {log.fiber || 0}g</span>
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
                          {dish.calories} kcal • P: {dish.protein}g • C: {dish.carbs}g • F: {dish.fat}g • Fib: {dish.fiber || 0}g
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

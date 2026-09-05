import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Verify Authorization header presence and Bearer token format
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header. Authentication required.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

      if (!supabaseUrl || !anonKey) {
        throw new Error('Supabase environment variables not configured');
      }

      // Verify caller authentication via Supabase Auth
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json().catch(() => ({}));

      const rawInput = body.input || body.prompt || body.text || "";
      const input = typeof rawInput === 'string' ? rawInput.trim().slice(0, 2000) : "";
      if (!input) {
        return new Response(
          JSON.stringify({ error: 'Input text is required for nutrition parsing.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

interface StructuredNutritionResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  serving_size?: number;
  serving_unit?: string;
  explanation: string;
  items: Array<{
    name: string;
    portion: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  }>;
}

function parseStructuredNutritionText(input: string): StructuredNutritionResult | null {
  const lines = input.split('\n');
  const items: Array<{
    name: string;
    portion: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  }> = [];

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

    items.push({
      name,
      portion,
      calories: calMatch ? parseFloat(calMatch[1]) : 0,
      protein: pMatch ? parseFloat(pMatch[1]) : 0,
      carbs: cMatch ? parseFloat(cMatch[1]) : 0,
      fat: fMatch ? parseFloat(fMatch[1]) : 0,
      fiber: fibMatch ? parseFloat(fibMatch[1]) : 0,
    });
  }

  if (items.length === 0) return null;

  const foodItemMatch = input.match(/(?:Food Item|Meal Name|Dish Name|Meal|Dish|Title|Food):\s*([^\n\r+]+)/i);
  const mealTitle = foodItemMatch ? foodItemMatch[1].trim() : items.map((i) => i.name).join(', ');

  const portionSizeMatch = input.match(/(?:Total\s+Portion\s+Size|Portion\s+Size|Serving\s+Size|Total\s+Size):\s*([\d.]+)\s*([a-zA-Z%]+)?/i);
  const servingSize = portionSizeMatch ? parseFloat(portionSizeMatch[1]) : undefined;
  const servingUnit = portionSizeMatch && portionSizeMatch[2] ? portionSizeMatch[2].trim() : undefined;

  const totalCalMatch = input.match(/(?:Total\s+)?Calories:\s*([\d.]+)/i);
  const totalPMatch = input.match(/(?:Total\s+)?Protein:\s*([\d.]+)/i);
  const totalCMatch = input.match(/(?:Total\s+)?Carbs:\s*([\d.]+)/i);
  const totalFMatch = input.match(/(?:Total\s+)?Fat:\s*([\d.]+)/i);
  const totalFibMatch = input.match(/(?:Total\s+)?Fiber:\s*([\d.]+)/i);

  const totalCal = totalCalMatch ? parseFloat(totalCalMatch[1]) : items.reduce((acc, i) => acc + i.calories, 0);
  const totalP = totalPMatch ? parseFloat(totalPMatch[1]) : items.reduce((acc, i) => acc + i.protein, 0);
  const totalC = totalCMatch ? parseFloat(totalCMatch[1]) : items.reduce((acc, i) => acc + i.carbs, 0);
  const totalF = totalFMatch ? parseFloat(totalFMatch[1]) : items.reduce((acc, i) => acc + i.fat, 0);
  const totalFib = totalFibMatch ? parseFloat(totalFibMatch[1]) : items.reduce((acc, i) => acc + i.fiber, 0);

  const explanation = items
    .map((i) => `${i.calories} kcal (${i.name})`)
    .join(' + ') + ` = ${totalCal} kcal`;

  return {
    name: mealTitle,
    calories: totalCal,
    protein: totalP,
    carbs: totalC,
    fat: totalF,
    fiber: totalFib,
    serving_size: servingSize,
    serving_unit: servingUnit,
    explanation,
    items,
  };
}

      // Use valid production model fallback chain
      const configuredModel = Deno.env.get("GEMINI_MODEL_ID") || "gemini-3.6-flash";
      const candidateModels = Array.from(new Set([
        configuredModel,
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
      ]));

      const custom_dishes = Array.isArray(body.custom_dishes) ? body.custom_dishes.slice(0, 50) : [];
      let contextStr = "";
      if (custom_dishes.length > 0) {
        contextStr = ` Known custom dishes for this user: ${JSON.stringify(custom_dishes)}.`;
      }

      const promptContent = `You are an expert sports nutritionist and food data parser.
Analyze this meal input:
"""
${input}
"""
${contextStr}

INSTRUCTIONS:
1. PRE-STRUCTURED / EXPLICIT MACROS: If the text already provides explicit calorie or macronutrient breakdowns (e.g. lines with 'X g | Y kcal | Z g P', 'Total Calories: N', nutrition facts labels, or recipe logs), you MUST extract those exact ingredient names, portion sizes, and numbers directly rather than re-estimating. Preserve exact component items, portions, calories, and macros verbatim. Extract total portion size and serving unit if present.
2. NATURAL LANGUAGE & MULTI-DISH LOGGING: If informal or conversational, compute accurate itemized estimates. If a meal or multi-dish combination is mentioned (such as "Com Tam & Eggs", "Steak and Potatoes", "Pho with beef and tendon"), you MUST analyze ALL dishes and elaborate their individual components (for example, Com Tam typically includes broken rice, grilled pork chop, egg meatloaf/chả trứng or fried egg, pickled vegetables, and fish sauce dressing). Never omit or truncate dishes from a multi-dish meal.
3. OUTPUT: Extract meal name, total calories, protein (g), carbs (g), fat (g), fiber (g), serving_size (number if present), serving_unit (string if present), itemized list of components, and mathematical explanation. Output strictly JSON.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          fiber: { type: Type.NUMBER },
          serving_size: { type: Type.NUMBER },
          serving_unit: { type: Type.STRING },
          explanation: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                portion: { type: Type.STRING },
                calories: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fat: { type: Type.NUMBER },
                fiber: { type: Type.NUMBER },
              },
              required: ["name", "portion", "calories", "protein", "carbs", "fat", "fiber"],
            },
          },
        },
        required: ["name", "calories", "protein", "carbs", "fat", "fiber", "items", "explanation"],
      };

      const ai = new GoogleGenAI({ apiKey });
      let responseText = "";
      let lastAiError: any = null;

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: promptContent,
            config: {
              responseMimeType: "application/json",
              responseSchema,
            },
          });
          if (response?.text) {
            responseText = response.text;
            break;
          }
        } catch (modelErr: any) {
          lastAiError = modelErr;
          console.warn(`[parse-nutrition] Model ${model} encountered error:`, modelErr?.message || modelErr);
        }
      }

      if (!responseText) {
        // If all AI models failed, attempt server-side structured text parse before throwing
        const localStructured = parseStructuredNutritionText(input);
        if (localStructured) {
          return new Response(JSON.stringify(localStructured), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw lastAiError || new Error("All AI models failed to generate content");
      }

      const fenceMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch) {
        responseText = fenceMatch[1].trim();
      }

      return new Response(responseText, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error("[parse-nutrition error]:", error.message);
      return new Response(
        JSON.stringify({ error: "Failed to parse meal nutrition. Please check your connection or use manual entry." }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
};

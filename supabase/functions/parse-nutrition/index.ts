import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'Retry-After',
  'Access-Control-Max-Age': '86400',
};

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  if (err.status === 429 || err.statusCode === 429 || err.code === 429) return true;
  if (err.error?.code === 429 || err.error?.status === 429 || err.response?.status === 429) return true;
  const msgParts: string[] = [
    typeof err.message === 'string' ? err.message : '',
    typeof err.error?.message === 'string' ? err.error.message : '',
    typeof err.statusText === 'string' ? err.statusText : '',
    typeof err.cause?.message === 'string' ? err.cause.message : '',
    String(err),
  ];
  try {
    msgParts.push(JSON.stringify(err));
  } catch {
    // ignore circular json error
  }
  const msg = msgParts.join(' ').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit')
  );
}

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

      let body: any;
      try {
        body = await req.json();
      } catch (jsonErr: any) {
        console.error("[parse-nutrition] Failed to parse request JSON:", jsonErr?.message || jsonErr);
        return new Response(
          JSON.stringify({ error: 'Malformed JSON or payload too large.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rawImage = body.image_base64 || body.imageBase64 || body.image || "";
      const rawMimeType = body.imageMimeType || body.image_mime_type || body.mimeType || body.mime_type || "";
      const imageBase64 = typeof rawImage === 'string' ? rawImage.trim() : "";
      const cleanBase64 = (imageBase64 === 'data:,' || imageBase64.startsWith('data:,'))
        ? ""
        : imageBase64
            .replace(/^data:[^,]*;base64,/i, '')
            .replace(/\s/g, '')
            .trim();
      const dataUriMatch = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+)(?:;[^,]*)?;base64,/i);
      const detectedMime = dataUriMatch ? dataUriMatch[1] : "";
      const imageMimeType = (typeof rawMimeType === 'string' && rawMimeType.trim())
        ? rawMimeType.trim()
        : (detectedMime || "image/jpeg");

      const rawInput = body.input || body.prompt || body.text || "";
      const input = typeof rawInput === 'string' ? rawInput.trim().slice(0, 2000) : "";
      if (!input && !cleanBase64) {
        return new Response(
          JSON.stringify({ error: 'Input text or meal photo is required for nutrition parsing.' }),
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

      const custom_dishes = Array.isArray(body.custom_dishes) ? body.custom_dishes.slice(0, 50) : [];
      let contextStr = "";
      if (custom_dishes.length > 0) {
        contextStr = ` Known custom dishes for this user: ${JSON.stringify(custom_dishes)}.`;
      }

      let candidateModels: string[];
      let contents: any;

      if (cleanBase64) {
        const userNotes = input ? `User notes: "${input}"` : "No additional text description provided.";
        const multimodalPrompt = `You are an expert sports nutritionist, food data parser, and visual meal recognition engine.
Analyze this meal photo:
"""
${userNotes}
"""
${contextStr}

INSTRUCTIONS:
1. PHOTO / VISUAL RECOGNITION: Carefully identify each food item, portion size, and ingredient visible in the photo. Estimate realistic weights/portions (e.g. grams, cups, pieces) and compute corresponding macronutrients (calories, protein, carbs, fat, fiber).
2. PRE-STRUCTURED / EXPLICIT MACROS: If text or image already provides explicit calorie or macronutrient breakdowns (e.g. nutrition facts label, recipe logs, lines with 'X g | Y kcal | Z g P'), you MUST extract those exact ingredient names, portion sizes, and numbers directly rather than re-estimating. Preserve exact component items, portions, calories, and macros verbatim. Extract total portion size and serving unit if present.
3. NATURAL LANGUAGE & MULTI-DISH LOGGING: If informal or conversational, compute accurate itemized estimates. If a meal or multi-dish combination is mentioned or seen (such as "Com Tam & Eggs", "Steak and Potatoes", "Pho with beef and tendon"), you MUST analyze ALL dishes and elaborate their individual components. Never omit or truncate dishes from a multi-dish meal.
4. OUTPUT: Extract meal name, total calories, protein (g), carbs (g), fat (g), fiber (g), serving_size (number if present), serving_unit (string if present), itemized list of components, and mathematical explanation. Output strictly JSON.`;

        contents = [
          { inlineData: { data: cleanBase64, mimeType: imageMimeType } },
          multimodalPrompt,
        ];
        candidateModels = Array.from(new Set([
          Deno.env.get("GEMINI_VISION_MODEL_ID") || "gemini-3.8-flash",
          "gemini-3.7-flash",
          "gemini-3.5-flash",
        ]));
      } else {
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

        contents = promptContent;
        const configuredModel = Deno.env.get("GEMINI_MODEL_ID") || "gemini-3.6-flash";
        candidateModels = Array.from(new Set([
          configuredModel,
          "gemini-3.5-flash",
          "gemini-3.1-flash-lite",
        ]));
      }

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
      let rateLimitEncountered: any = null;

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: "application/json",
              responseSchema,
            },
          });
          if (response?.text) {
            let candidateText = response.text;
            const fenceMatch = candidateText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (fenceMatch) {
              candidateText = fenceMatch[1].trim();
            }
            // Validate that response.text can be parsed as JSON and contains meal nutrition before breaking
            const parsedCandidate = JSON.parse(candidateText);
            if (!parsedCandidate || typeof parsedCandidate !== 'object') {
              throw new Error("Candidate model returned non-object JSON");
            }
            if (
              parsedCandidate.calories === undefined &&
              (!Array.isArray(parsedCandidate.items) || parsedCandidate.items.length === 0)
            ) {
              throw new Error("Candidate model returned JSON missing both calories and items");
            }
            responseText = candidateText;
            break;
          }
        } catch (modelErr: any) {
          lastAiError = modelErr;
          if (isRateLimitError(modelErr)) {
            rateLimitEncountered = modelErr;
          }
          console.warn(`[parse-nutrition] Model ${model} encountered error:`, modelErr?.message || modelErr);
        }
      }

      if (!responseText) {
        // If all AI models failed, attempt server-side structured text parse before throwing
        if (input) {
          const localStructured = parseStructuredNutritionText(input);
          if (localStructured) {
            return new Response(JSON.stringify(localStructured), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        if (isRateLimitError(lastAiError) || rateLimitEncountered) {
          return new Response(
            JSON.stringify({
              error: "Gemini rate limit exceeded (15 RPM). Please wait 15 seconds or switch to manual entry.",
              code: "RATE_LIMITED",
              retryAfter: 15,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Retry-After': '15',
              },
            }
          );
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
      console.error("[parse-nutrition error]:", error?.message || error);
      if (isRateLimitError(error)) {
        return new Response(
          JSON.stringify({
            error: "Gemini rate limit exceeded (15 RPM). Please wait 15 seconds or switch to manual entry.",
            code: "RATE_LIMITED",
            retryAfter: 15,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': '15',
            },
          }
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to parse meal nutrition. Please check your connection or use manual entry." }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
};

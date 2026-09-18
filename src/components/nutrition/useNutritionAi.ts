import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { CustomDish } from '../../types/database';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  compressImageBase64,
  compressImageFile,
  type CompressedImage,
} from '../../utils/imageCompression';
import { roundTo1Decimal, formatCalories } from '../../utils/nutrition';
import {
  buildStagedItem,
  type StagedItem,
  type StagedMeal,
} from './nutritionEngineHelpers';

export interface UseNutritionAiOptions {
  customDishes: CustomDish[];
  onParsedSuccess: (meal: StagedMeal) => void;
  onFallbackToManual: (dishName: string) => void;
  setStatus: (msg: string) => void;
  setIsError: (err: boolean) => void;
}

export function useNutritionAi({
  customDishes,
  onParsedSuccess,
  onFallbackToManual,
  setStatus,
  setIsError,
}: UseNutritionAiOptions) {
  const [nlInput, setNlInput] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<CompressedImage | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickPhoto = async (source: CameraSource) => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source,
      });

      if (image.base64String) {
        const mimeType = image.format ? `image/${image.format}` : 'image/jpeg';
        const compressed = await compressImageBase64(image.base64String, mimeType);
        if (compressed && compressed.base64) {
          setSelectedPhoto(compressed);
          setIsError(false);
          setIsRateLimited(false);
        } else {
          setIsError(true);
          setStatus('Could not process captured photo. Please try again.');
        }
      }
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('cancel')) {
        return;
      }
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      if (compressed && compressed.base64) {
        setSelectedPhoto(compressed);
        setIsError(false);
        setIsRateLimited(false);
      } else {
        setIsError(true);
        setStatus('Could not process selected image. Please select a valid photo.');
      }
    } catch (err) {
      console.warn('Image compression failed:', err);
      setIsError(true);
      setStatus('Failed to process image.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = () => {
    setSelectedPhoto(null);
  };

  const handleAnalyze = async () => {
    if (!nlInput.trim() && !selectedPhoto) return;
    setIsAnalyzing(true);
    setStatus('Analyzing...');
    setIsError(false);
    setIsRateLimited(false);

    try {
      let timeoutId: any;
      const timeoutMs = selectedPhoto ? 45000 : 30000;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Edge function timeout after ${timeoutMs / 1000}s`)), timeoutMs);
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const invokePromise = supabase.functions.invoke('parse-nutrition', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          input: nlInput,
          text: nlInput,
          image_base64: selectedPhoto ? selectedPhoto.base64 : undefined,
          imageMimeType: selectedPhoto ? selectedPhoto.mimeType : undefined,
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

      let data: any;
      let error: any;
      try {
        const result = (await Promise.race([invokePromise, timeoutPromise])) as any;
        data = result?.data;
        error = result?.error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      if (error) {
        let serverMessage = '';
        let errorCode = '';
        let retryAfterSeconds: number | undefined;

        if (error?.context) {
          if (error.context.error) serverMessage = error.context.error;
          if (error.context.code) errorCode = error.context.code;
          if (error.context.retryAfter) retryAfterSeconds = Number(error.context.retryAfter);

          if (!serverMessage) {
            try {
              const ctxClone = typeof error.context?.clone === 'function' ? error.context.clone() : error.context;
              if (typeof ctxClone?.json === 'function') {
                const errData = await ctxClone.json();
                if (errData?.error) serverMessage = errData.error;
                if (errData?.code) errorCode = errData.code;
                if (errData?.retryAfter) retryAfterSeconds = Number(errData.retryAfter);
              }
            } catch {
              try {
                const ctxCloneText = typeof error.context?.clone === 'function' ? error.context.clone() : error.context;
                if (typeof ctxCloneText?.text === 'function') {
                  const textData = await ctxCloneText.text();
                  if (textData && textData.length < 500) {
                    serverMessage = textData;
                  }
                }
              } catch {
                // ignore
              }
            }
          }

          if (!retryAfterSeconds && error.context?.headers) {
            const headers = error.context.headers;
            const headerRetry = typeof headers?.get === 'function'
              ? (headers.get('Retry-After') || headers.get('retry-after'))
              : (headers['Retry-After'] || headers['retry-after']);
            if (headerRetry && !isNaN(parseInt(headerRetry, 10))) {
              retryAfterSeconds = parseInt(headerRetry, 10);
            }
          }
        }

        const is429 = error?.context?.status === 429 || error?.status === 429;
        if (is429) {
          const rateLimitMsg = serverMessage || 'Gemini rate limit exceeded (15 RPM). Please wait 15 seconds or switch to manual entry.';
          const rateErr = new Error(rateLimitMsg);
          (rateErr as any).is429 = true;
          (rateErr as any).retryAfter = retryAfterSeconds || 15;
          throw rateErr;
        }

        if (serverMessage) {
          const customErr = new Error(serverMessage);
          (customErr as any).code = errorCode;
          (customErr as any).status = error?.context?.status || error?.status;
          throw customErr;
        }

        throw error;
      }

      let parsed = data;
      if (typeof data === 'string') {
        const cleaned = data.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(cleaned);
      }

      if (parsed?.error) {
        const err = new Error(parsed.error);
        if (parsed.code) (err as any).code = parsed.code;
        throw err;
      }

      if (parsed && (parsed.calories !== undefined || (Array.isArray(parsed.items) && parsed.items.length > 0))) {
        let items: StagedItem[] = [];
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          items = parsed.items.map((it: any) =>
            buildStagedItem({
              name: it.name || 'Item',
              portion: it.portion,
              quantity: it.quantity,
              unit: it.unit,
              calories: it.calories,
              protein: it.protein,
              carbs: it.carbs,
              fat: it.fat,
              fiber: it.fiber,
            })
          );
        } else {
          items = [
            buildStagedItem({
              name: parsed.name || nlInput || (selectedPhoto ? 'Meal Photo' : 'Meal'),
              portion: '1 serving',
              calories: parsed.calories,
              protein: parsed.protein,
              carbs: parsed.carbs,
              fat: parsed.fat,
              fiber: parsed.fiber,
            }),
          ];
        }

        const totalCal = roundTo1Decimal(items.reduce((s, it) => s + it.calories, 0));
        const totalP = roundTo1Decimal(items.reduce((s, it) => s + it.protein, 0));
        const totalC = roundTo1Decimal(items.reduce((s, it) => s + it.carbs, 0));
        const totalF = roundTo1Decimal(items.reduce((s, it) => s + it.fat, 0));
        const totalFib = roundTo1Decimal(items.reduce((s, it) => s + it.fiber, 0));

        const meal: StagedMeal = {
          name: parsed.name || nlInput || (selectedPhoto ? 'Meal Photo' : 'Meal'),
          mealType: 'Breakfast',
          explanation:
            parsed.explanation ||
            items.map((it) => `${formatCalories(it.calories)} kcal (${it.name})`).join(' + ') + ` = ${formatCalories(totalCal)} kcal`,
          items,
          calories: totalCal,
          protein: totalP,
          carbs: totalC,
          fat: totalF,
          fiber: totalFib,
          servingSize: Number(parsed.serving_size ?? parsed.servingSize) || 1,
          servingUnit: parsed.serving_unit || parsed.servingUnit || 'serving',
          photoUrl: selectedPhoto?.dataUrl,
        };

        setIsRateLimited(false);
        setStatus('Analyzed');
        onParsedSuccess(meal);
        return;
      }
      throw new Error('Invalid parsed response: missing nutrition data');
    } catch (error: any) {
      console.warn('AI Edge function failed:', error);
      if (error?.is429 || error?.context?.status === 429 || error?.status === 429) {
        setIsRateLimited(true);
        setIsError(false);
        setStatus('');
        return;
      }
      setIsError(true);
      const errorMsg = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      setStatus(
        error?.code === 'NON_FOOD_DETECTED' || error?.status === 422 || error?.context?.status === 422
          ? `Meal Analysis: ${errorMsg}`
          : `AI service unavailable: ${errorMsg}`
      );
      onFallbackToManual(nlInput.trim() || (selectedPhoto ? 'Meal Photo' : ''));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    nlInput,
    setNlInput,
    selectedPhoto,
    setSelectedPhoto,
    isRateLimited,
    setIsRateLimited,
    isAnalyzing,
    fileInputRef,
    handlePickPhoto,
    handleFileChange,
    handleRemovePhoto,
    handleAnalyze,
  };
}

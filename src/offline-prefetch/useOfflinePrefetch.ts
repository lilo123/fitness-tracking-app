import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { fetchExerciseCatalogPage, type CatalogExercise } from '../lib/exercises';
import { fetchTemplateDetail } from '../components/workout/useWorkoutQueries';
import type { RoutineTemplate } from '../types/database';

export const PREFETCH_THROTTLE_MS = 12 * 60 * 60 * 1000; // 12 hours
export const PREFETCH_STORAGE_KEY_PREFIX = 'offline_prefetch_';

export async function prefetchAllExercises(_userId?: string): Promise<CatalogExercise[]> {
  const all: CatalogExercise[] = [];
  let cursor: string | null = null;
  while (true) {
    const page = await fetchExerciseCatalogPage({
      scope: 'all',
      limit: 200,
      cursor,
    });
    if (!page.items || page.items.length === 0) break;
    all.push(...page.items);
    if (!page.nextCursor || page.items.length < 200) break;
    cursor = page.nextCursor;
  }
  return all;
}

export async function prefetchRoutineCatalog(userId: string): Promise<RoutineTemplate[]> {
  if (typeof (supabase as any).rpc === 'function') {
    let allTemplates: RoutineTemplate[] = [];
    let cursor: string | null = null;
    let rpcFailed = false;

    while (true) {
      const res: any = await (supabase as any).rpc('get_routine_catalog', {
        p_user_id: userId,
        p_limit: 200,
        p_cursor: cursor,
      });

      if (!res || res.error) {
        rpcFailed = true;
        break;
      }

      const pageData: any = res.data;
      if (!pageData || !Array.isArray(pageData) || pageData.length === 0) break;

      const mapped: RoutineTemplate[] = pageData.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        is_master: row.is_master,
        assigned_to: row.assigned_to,
        days_of_week: row.days_of_week,
        created_at: row.created_at,
      }));
      allTemplates.push(...mapped);
      if (pageData.length < 200) break;
      cursor = pageData[pageData.length - 1].created_at;
    }

    if (!rpcFailed) return allTemplates;
  }

  // REST fallback
  const filterParts = [`is_master.eq.true`];
  if (userId) {
    filterParts.push(`user_id.eq.${userId}`);
    filterParts.push(`assigned_to.eq.${userId}`);
  }
  const { data, error } = await supabase
    .from('routine_templates')
    .select('id, user_id, name, is_master, assigned_to, days_of_week, created_at')
    .or(filterParts.join(','))
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []) as RoutineTemplate[];
}

export async function runOfflinePrefetch(
  queryClient: any,
  userId: string,
  force = false
): Promise<boolean> {
  if (!userId) return false;

  const storageKey = `${PREFETCH_STORAGE_KEY_PREFIX}${userId}`;
  if (!force && typeof localStorage !== 'undefined') {
    try {
      const lastPrefetch = localStorage.getItem(storageKey);
      if (lastPrefetch) {
        const elapsed = Date.now() - Number(lastPrefetch);
        if (elapsed < PREFETCH_THROTTLE_MS) {
          return false;
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  try {
    // 1. Prefetch Exercise Catalog
    const exercises = await prefetchAllExercises(userId);
    queryClient.setQueryData(['exercise_catalog', 'offline_all', userId], exercises);
    queryClient.setQueryData(['exercise_catalog', 'offline_all'], exercises);

    // 2. Prefetch Routine Catalog
    const templates = await prefetchRoutineCatalog(userId);
    queryClient.setQueryData(['routine_templates', userId, 'workout'], templates);

    // 3. Prefetch Template Details (own / recent, cap 60)
    const templatesToFetch = templates
      .filter((t) => t.user_id === userId || t.is_master)
      .slice(0, 60);

    await Promise.all(
      templatesToFetch.map((t) =>
        queryClient.prefetchQuery({
          queryKey: ['routine_template_detail', t.id],
          queryFn: () => fetchTemplateDetail(t.id),
          staleTime: 1000 * 60 * 60,
        })
      )
    );

    // 4. Prefetch Exercise Stats
    if (typeof (supabase as any).rpc === 'function') {
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: ['exercise_stats', userId, 'weight'],
          queryFn: async () => {
            const { data } = await (supabase as any).rpc('get_exercise_stats', {
              p_user_id: userId,
            });
            return data || [];
          },
          staleTime: 1000 * 60 * 60,
        }),
        queryClient.prefetchQuery({
          queryKey: ['exercise_stats', userId, 'e1rm'],
          queryFn: async () => {
            const { data } = await (supabase as any).rpc('get_exercise_stats', {
              p_user_id: userId,
              p_pr_mode: 'e1rm',
            });
            return data || [];
          },
          staleTime: 1000 * 60 * 60,
        }),
      ]);
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(storageKey, String(Date.now()));
      } catch {
        // Ignore localStorage write errors
      }
    }
    return true;
  } catch (err) {
    console.warn('[useOfflinePrefetch] prefetch failed:', err);
    return false;
  }
}

export function useOfflinePrefetch(userId?: string | null): void {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isOnline || !userId || runningRef.current) return;
    runningRef.current = true;
    runOfflinePrefetch(queryClient, userId)
      .catch(() => {})
      .finally(() => {
        runningRef.current = false;
      });
  }, [isOnline, userId, queryClient]);
}

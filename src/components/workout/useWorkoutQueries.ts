import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { WorkoutSet, Exercise, RoutineTemplate, TemplateExercise } from '../../types/database';
import {
  normalizeDateStr,
  DEFAULT_EXERCISES_LIST,
  DEFAULT_WORKOUT_TEMPLATES,
  getDayOfWeekAbbr,
} from '../../utils/ghostSets';
import { isValidUUID } from './workoutEngineHelpers';

export const WORKOUT_WITH_SETS_PROJECTION =
  'id, date, name, sets(id, reps, weight, set_index, created_at, exercise_id)';

export const SETS_PAGE_LIMIT = 500;

/**
 * W-10 — per-workout cap for the coach cockpit's embedded `sets(...)`.
 *
 * `/coach` embeds sets across up to 100 workouts over ~90 days. PostgREST applies an
 * embedded limit *per parent row*, not across the response, so a "high" cap does
 * nothing: the pathological case is one enormous session, not many large ones.
 *
 * Measured against the payload-stress fixture (bench-athlete: 50 workouts, 598 sets in
 * 90 days, 500 of them in a single session) by issuing this exact query to PostgREST and
 * reading Content-Length. PostgREST answers identity even when the client offers gzip,
 * so these bytes are the bytes on the wire. `/coach` totals 57,422 B, of which this query
 * contributes 682 B for the test fixture, so the projection below is 56,740 B + embed:
 *
 *   uncapped ->  119,655 B embed -> /coach 176,395 B  OVER the 153,600 B ceiling
 *   cap 2000 ->  119,655 B embed -> /coach 176,395 B  OVER   (byte-identical to uncapped)
 *   cap  500 ->  119,655 B embed -> /coach 176,395 B  OVER   (byte-identical to uncapped)
 *   cap  200 ->   62,475 B embed -> /coach 119,215 B  under
 *   cap  100 ->   43,415 B embed -> /coach 100,155 B  under
 *   cap   50 ->   33,934 B embed -> /coach  90,674 B  under
 *
 * Caps of 500 and 2000 return byte-identical responses to no cap at all: no single
 * session exceeds 500, so they never bind. A "generous" cap is not a weak mitigation
 * here, it is no mitigation. 200 is the first value that changes anything.
 *
 * 200 is ~3x a heavy real session (a hard training day is 30-60 sets), so it should
 * never truncate genuine data, while cutting the one case that actually breaches the
 * ceiling today. If it ever does truncate, we say so rather than silently showing a
 * coach an incomplete history.
 *
 * This bounds the tail; it is NOT a hard guarantee. 100 workouts x 200 sets is still
 * far above the ceiling in principle. The structural fix is to stop embedding sets and
 * fetch them on expand, as `/history` already does via `fetchSessionSets` — the coach
 * timeline only needs counts and volumes while a session is collapsed. Tracked as W-10b.
 */
export const COACH_SETS_PER_WORKOUT_LIMIT = 200;

/**
 * Warn when the cockpit response was capped, or when it is large enough to be worth
 * noticing. Silence here would mean a coach reviews a partial history believing it
 * complete, which is the failure mode we care about most.
 */
export function warnIfCoachSetsTruncated(
  workouts: ReadonlyArray<{ id?: string; sets?: unknown[] | null }>
): void {
  const truncated = workouts.filter((w) => (w.sets?.length ?? 0) >= COACH_SETS_PER_WORKOUT_LIMIT);
  if (truncated.length > 0) {
    console.warn(
      `[CoachCockpit] ${truncated.length} session(s) hit the ${COACH_SETS_PER_WORKOUT_LIMIT}-set ` +
        `per-workout cap; those sessions are showing partial set detail. Session ids: ` +
        truncated.map((w) => w.id ?? '(unknown)').join(', ')
    );
  }
  const totalSets = workouts.reduce((acc, w) => acc + (w.sets?.length ?? 0), 0);
  if (totalSets > 2000) {
    console.warn(
      `[CoachCockpit] timeline embedded ${totalSets} sets across ${workouts.length} workouts. ` +
        `This route has a 153,600 B budget; see W-10b for the lazy-load fix.`
    );
  }
}

export interface RoutineTemplateDetail {
  id: string;
  exercises: TemplateExercise[];
}

// payload-gate: detail-fetch — template exercises and targets for resolved routine
export async function fetchTemplateDetail(templateId: string): Promise<RoutineTemplateDetail | null> {
  const { data, error } = await supabase
    .from('routine_templates')
    .select(
      'id, exercises:template_exercises(id, template_id, exercise_id, order_index, target_sets, target_reps, exercise:exercises(name))'
    )
    .eq('id', templateId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RoutineTemplateDetail | null;
}

export const workoutExercisesQueryOptions = {
  queryKey: ['exercises', 'workout'] as const,
  queryFn: async (): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, body_part, is_master')
      .order('name')
      .limit(200);
    if (error) throw error;
    if (!data || data.length === 0) return DEFAULT_EXERCISES_LIST;
    return data as Exercise[];
  },
  staleTime: 5 * 60 * 1000,
};

export function useWorkoutQueries(targetUserId: string, workoutDate: string) {
  const queryClient = useQueryClient();
  const { data: exercises = DEFAULT_EXERCISES_LIST, isFetched: exercisesFetched } =
    useQuery(workoutExercisesQueryOptions);

  const currentDayAbbr =
    getDayOfWeekAbbr(workoutDate) || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

  const { data: rawTemplates = [], isFetched: rawTemplatesFetched } = useQuery({
    queryKey: ['routine_templates', targetUserId, 'workout'],
    enabled: Boolean(targetUserId),
    queryFn: async () => {
      if (!targetUserId || !isValidUUID(targetUserId)) return [];
      const filterString = `user_id.eq.${targetUserId},is_master.eq.true,assigned_to.eq.${targetUserId}`;

      // accepted-list (pending P1-7 conductor measurement): routine templates metadata on /workout
      const { data, error } = await supabase
        .from('routine_templates')
        .select('id, user_id, name, is_master, assigned_to, days_of_week, created_at')
        .or(filterString)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data) return [];
      return (data as RoutineTemplate[]).sort((a, b) => {
        const getScore = (t: RoutineTemplate) => {
          if (t.assigned_to === targetUserId && !t.is_master) return 3;
          if (t.user_id === targetUserId && !t.is_master) return 2;
          if (t.is_master) return 1;
          return 0;
        };
        const diff = getScore(b) - getScore(a);
        if (diff !== 0) return diff;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    },
  });

  const {
    data: userLogs = [],
    isFetched: logsFetched,
    isError: isLogsError,
    error: logsError,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['workout_sets', targetUserId, '90d'],
    enabled: Boolean(targetUserId),
    queryFn: async () => {
      if (!targetUserId || !isValidUUID(targetUserId)) return [];

      // Query 1: Today's workout session and sets
      const targetDate = workoutDate || new Date().toISOString().split('T')[0];
      const startOfDay = `${targetDate}T00:00:00.000Z`;
      const endOfDay = `${targetDate}T23:59:59.999Z`;

      // payload-gate: accepted-list — today workout session and sets, measured 95311 B on /workout (500-set stress session; bounded to a single day; sets embed capped at SETS_PAGE_LIMIT). Source: docs/evidence/perf-trace-results.json (route /workout, the workouts+sets query), reproduced identically across every run. Cite that retained path, never a runId: this file is in scripts/perf-payload-sources.json, so editing this comment changes the fingerprint and retires the run whose id was written here — a runId citation can never converge. Was 122311 B before W-5 dropped the redundant workout_id from the embed.
      const { data: workoutsData, error: wError } = await supabase
        .from('workouts')
        .select(WORKOUT_WITH_SETS_PROJECTION)
        .eq('user_id', targetUserId)
        .gte('date', startOfDay)
        .lte('date', endOfDay)
        .order('date', { ascending: false })
        .limit(SETS_PAGE_LIMIT, { foreignTable: 'sets' })
        .limit(5);

      if (wError) throw wError;

      let currentExercises =
        queryClient.getQueryData<Exercise[]>(workoutExercisesQueryOptions.queryKey) || exercises;
      if (!currentExercises || currentExercises === DEFAULT_EXERCISES_LIST || currentExercises.length === 0) {
        try {
          currentExercises = await queryClient.ensureQueryData(workoutExercisesQueryOptions);
        } catch {
          currentExercises = exercises;
        }
      }

      const todaySets: (WorkoutSet & { workout_date: string; workout_name?: string })[] = [];
      if (workoutsData && workoutsData.length > 0) {
        const hasEmbeddedSets = workoutsData.some((w) => Array.isArray(w.sets));
        if (hasEmbeddedSets || workoutsData.every((w) => w.sets !== undefined)) {
          if (workoutsData.some((w) => Array.isArray(w.sets) && w.sets.length >= SETS_PAGE_LIMIT)) {
            console.warn(
              `[useWorkoutQueries] today workout sets query reached cap of ${SETS_PAGE_LIMIT} rows; older historical sets may be truncated.`
            );
          }

          const setsData = workoutsData.flatMap((w) =>
            (w.sets || []).map((s) => ({
              ...s,
              // W-5: see the matching note in CoachCockpit.tsx. `workout_id` is no longer in
              // WORKOUT_WITH_SETS_PROJECTION, so `s.workout_id` is statically absent and the old
              // `s.workout_id || w.id` is dead. The worker's `(s as { workout_id?: string })` cast was
              // rejected: silencing TS2339 by asserting a property the projection removed is exactly the
              // kind of unverifiable claim this programme exists to eliminate. These sets are embedded
              // under `w`, so `w.id` is not a fallback — it is the value.
              workout_id: w.id,
              workouts: { date: w.date, name: w.name },
            }))
          );

          setsData.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

          todaySets.push(
            ...setsData.map((s) => ({
              ...s,
              set_index: s.set_index ?? 0,
              set_type: (s as any).set_type || 'normal',
              weight: s.weight ?? 0,
              workout_date: normalizeDateStr(s.workouts?.date || s.created_at),
              workout_name: s.workouts?.name || 'Workout Session',
              exercise_name:
                (s as any).exercise?.name ||
                currentExercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
                DEFAULT_EXERCISES_LIST.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
                (s as { exercise_name?: string }).exercise_name ||
                s.exercise_id,
            }))
          );
        } else {
          const workoutIds = workoutsData.map((w) => w.id);
          if (workoutIds.length > 0) {
            const { data: setsData, error: sError } = await supabase
              .from('sets')
              .select(
                'id, workout_id, exercise_id, weight, reps, set_index, created_at, workouts(date, name), exercise:exercises(id, name, body_part)'
              )
              .in('workout_id', workoutIds)
              .order('created_at', { ascending: false })
              .limit(SETS_PAGE_LIMIT);

            if (sError) throw sError;
            if (setsData) {
              if (setsData.length >= SETS_PAGE_LIMIT) {
                console.warn(
                  `[useWorkoutQueries] today workout sets query reached cap of ${SETS_PAGE_LIMIT} rows; older historical sets may be truncated.`
                );
              }

              const sortedSets = [...setsData].sort(
                (a, b) =>
                  (a.created_at || '').localeCompare(b.created_at || '') ||
                  (a.set_index ?? 0) - (b.set_index ?? 0)
              );

              todaySets.push(
                ...sortedSets.map((s) => ({
                  ...s,
                  set_index: s.set_index ?? 0,
                  set_type: (s as any).set_type || 'normal',
                  weight: s.weight ?? 0,
                  workout_date: normalizeDateStr(s.workouts?.date || s.created_at),
                  workout_name: s.workouts?.name || 'Workout Session',
                  exercise_name:
                    s.exercise?.name ||
                    currentExercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
                    DEFAULT_EXERCISES_LIST.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
                    (s as { exercise_name?: string }).exercise_name ||
                    s.exercise_id,
                }))
              );
            }
          }
        }
      }

      // Query 2: Ghost sets RPC for prior sessions (within 90 days)
      let ghostSets: (WorkoutSet & { workout_date: string; workout_name?: string })[] = [];
      if (typeof (supabase as any).rpc === 'function') {
        const { data: ghostData, error: ghostErr } = await (supabase as any).rpc('get_ghost_sets', {
          p_user_id: targetUserId,
          p_date: targetDate,
        });
        if (ghostErr) {
          console.warn('[useWorkoutQueries] get_ghost_sets RPC warning:', ghostErr);
        } else if (ghostData && Array.isArray(ghostData)) {
          ghostSets = ghostData.map((s: any) => ({
            ...s,
            set_index: s.set_index ?? 0,
            set_type: (s as any).set_type || 'normal',
            weight: s.weight ?? 0,
            workout_date: normalizeDateStr(s.workout_date || s.created_at),
            workout_name: s.workout_name || 'Workout Session',
            exercise_name:
              s.exercise_name ||
              currentExercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
              DEFAULT_EXERCISES_LIST.find((e) => e.id === s.exercise_id || e.name === s.exercise_id)?.name ||
              s.exercise_id,
          }));
        }
      }

      return [...todaySets, ...ghostSets];
    },
  });

  const todaySets = useMemo(() => {
    return userLogs.filter((s) => normalizeDateStr(s.workout_date) === workoutDate);
  }, [userLogs, workoutDate]);

  const resolvedTemplateId = useMemo(() => {
    if (!rawTemplatesFetched || !logsFetched) return null;
    if (todaySets.length > 0) {
      const loggedName = todaySets[0]?.workout_name || (todaySets[0] as any)?.workouts?.name || '';
      const normLoggedName = loggedName.trim().toLowerCase();
      const matched = rawTemplates.find((t) => {
        const tNorm = t.name.trim().toLowerCase();
        return (
          tNorm === normLoggedName ||
          (normLoggedName.length > 0 &&
            (tNorm.startsWith(normLoggedName) || normLoggedName.startsWith(tNorm)))
        );
      });
      return matched ? matched.id : null;
    }
    const dayAbbr = getDayOfWeekAbbr(workoutDate) || currentDayAbbr;
    const scheduled = rawTemplates.find((t) => t.days_of_week?.includes(dayAbbr));
    return scheduled ? scheduled.id : null;
  }, [rawTemplates, rawTemplatesFetched, todaySets, logsFetched, workoutDate, currentDayAbbr]);

  const { data: templateDetail, isFetched: detailFetched } = useQuery({
    queryKey: ['routine_template_detail', resolvedTemplateId],
    enabled: Boolean(resolvedTemplateId),
    queryFn: async () => {
      if (!resolvedTemplateId) return null;
      return fetchTemplateDetail(resolvedTemplateId);
    },
  });

  const customTemplates = useMemo(() => {
    if (!resolvedTemplateId || !templateDetail) return rawTemplates;
    return rawTemplates.map((t) => {
      if (t.id === resolvedTemplateId) {
        return {
          ...t,
          exercises: templateDetail.exercises,
        };
      }
      return t;
    });
  }, [rawTemplates, resolvedTemplateId, templateDetail]);

  const templatesFetched =
    rawTemplatesFetched && logsFetched && (!resolvedTemplateId || detailFetched);

  const availableRoutines = useMemo(() => {
    const seenCustomNames = new Set<string>();
    const dedupedCustom: RoutineTemplate[] = [];
    for (const t of customTemplates) {
      const norm = t.name.trim().toLowerCase();
      if (!seenCustomNames.has(norm)) {
        seenCustomNames.add(norm);
        dedupedCustom.push(t);
      }
    }

    const fallbackDefaults = DEFAULT_WORKOUT_TEMPLATES.filter(
      (dt) => !seenCustomNames.has(dt.name.trim().toLowerCase())
    );

    return {
      custom: dedupedCustom,
      defaults: fallbackDefaults,
    };
  }, [customTemplates]);

  return {
    exercises,
    exercisesFetched,
    customTemplates,
    templatesFetched,
    userLogs,
    logsFetched,
    availableRoutines,
    isLogsError,
    logsError,
    refetchLogs,
  };
}

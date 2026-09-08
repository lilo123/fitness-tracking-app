import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type {
  WorkoutSet,
  Exercise,
  RoutineTemplate,
} from '../../types/database';
import {
  computeGhostSets,
  getExerciseBenchmarks,
  normalizeDateStr,
  formatShortDate,
  getLocalDateStr,
  getDayOfWeekAbbr,
  DEFAULT_EXERCISES_LIST,
  DEFAULT_WORKOUT_TEMPLATES,
} from '../../utils/ghostSets';
import { workoutSessionStore, type SetDraftInput } from '../../utils/workoutSessionStore';
import { restTimerStore } from '../../utils/restTimerStore';
import {
  Layers,
  Calendar,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Timer,
  Trophy,
  Dumbbell,
  Bed,
  AlertCircle,
} from 'lucide-react';

export const WorkoutEngine: React.FC = () => {
  const { user, profile, role } = useAuth();
  const { selectedAthleteId } = useCoach();
  const queryClient = useQueryClient();

  const targetUserId =
    (role === 'coach' && selectedAthleteId ? selectedAthleteId : user?.id) ||
    user?.id ||
    (() => {
      try {
        const cached = localStorage.getItem('cybergym_user');
        if (cached) return JSON.parse(cached)?.id || '';
      } catch {
        return '';
      }
      return '';
    })();
  const autoRestTimer = profile?.auto_rest_timer ?? (localStorage.getItem('cybergym_auto_rest_timer') !== 'false');

  const [workoutDate, setWorkoutDate] = useState<string>(() => {
    const activeSession = workoutSessionStore.getActiveSession(targetUserId);
    if (activeSession && activeSession.workoutDate) {
      return activeSession.workoutDate;
    }
    return getLocalDateStr(new Date());
  });

  const initialSession = workoutSessionStore.getActiveSession(targetUserId, workoutDate);

  const [activeRoutineName, setActiveRoutineName] = useState<string>(() => {
    if (initialSession) return initialSession.routineName;
    const dayAbbr = getDayOfWeekAbbr(workoutDate);
    const defTpl = DEFAULT_WORKOUT_TEMPLATES.find((t) =>
      t.days.some((d) => d === dayAbbr || d.slice(0, 3) === dayAbbr)
    );
    return defTpl ? defTpl.name : 'Rest Day';
  });

  const [activeExercises, setActiveExercises] = useState<string[]>(() => {
    if (initialSession) return initialSession.exercises;
    const dayAbbr = getDayOfWeekAbbr(workoutDate);
    const defTpl = DEFAULT_WORKOUT_TEMPLATES.find((t) =>
      t.days.some((d) => d === dayAbbr || d.slice(0, 3) === dayAbbr)
    );
    return defTpl ? [...defTpl.exercises] : [];
  });

  const [targetSetCounts, setTargetSetCounts] = useState<Record<string, number>>(() => {
    if (initialSession) return initialSession.targetSetCounts;
    const dayAbbr = getDayOfWeekAbbr(workoutDate);
    const defTpl = DEFAULT_WORKOUT_TEMPLATES.find((t) =>
      t.days.some((d) => d === dayAbbr || d.slice(0, 3) === dayAbbr)
    );
    return defTpl ? { ...defTpl.targetSets } : {};
  });

  const [targetRepCounts, setTargetRepCounts] = useState<Record<string, number>>(() => {
    if (initialSession) return initialSession.targetRepCounts;
    const dayAbbr = getDayOfWeekAbbr(workoutDate);
    const defTpl = DEFAULT_WORKOUT_TEMPLATES.find((t) =>
      t.days.some((d) => d === dayAbbr || d.slice(0, 3) === dayAbbr)
    );
    return defTpl?.targetReps ? { ...defTpl.targetReps } : {};
  });

  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(() => {
    if (initialSession) return new Set(initialSession.expandedExercises);
    const dayAbbr = getDayOfWeekAbbr(workoutDate);
    const defTpl = DEFAULT_WORKOUT_TEMPLATES.find((t) =>
      t.days.some((d) => d === dayAbbr || d.slice(0, 3) === dayAbbr)
    );
    return defTpl && defTpl.exercises.length > 0 ? new Set([defTpl.exercises[0]]) : new Set();
  });

  // Ghost set form input drafts: { [exerciseName_setIndex]: { weight, reps } }
  const [inputDrafts, setInputDrafts] = useState<Record<string, SetDraftInput>>(
    () => initialSession?.inputDrafts ?? {}
  );

  const resolvedDateRef = useRef<string | null>(null);
  const manualSelectionDateRef = useRef<string | null>(null);
  const lastTargetUserRef = useRef<string>(targetUserId);

  // Routine Selector Modal
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [selectedExerciseToAdd, setSelectedExerciseToAdd] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Fetch exercises library
  const { data: exercises = DEFAULT_EXERCISES_LIST } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('exercises').select('*').order('name');
        if (error || !data || data.length === 0) return DEFAULT_EXERCISES_LIST;
        return data as Exercise[];
      } catch {
        return DEFAULT_EXERCISES_LIST;
      }
    },
  });

  // Fetch routine templates
  const { data: customTemplates = [], isFetched: templatesFetched } = useQuery({
    queryKey: ['routine_templates', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      try {
        const { data, error } = await supabase
          .from('routine_templates')
          .select('*, exercises:template_exercises(*, exercise:exercises(name))')
          .or(`user_id.eq.${targetUserId},is_master.eq.true,assigned_to.eq.${targetUserId}`);
        if (error || !data) return [];
        return (data as RoutineTemplate[]).sort((a, b) => {
          const getScore = (t: RoutineTemplate) => {
            if (t.user_id === targetUserId && !t.is_master) return 3;
            if (t.assigned_to === targetUserId && !t.is_master) return 2;
            if (t.is_master) return 1;
            return 0;
          };
          const diff = getScore(b) - getScore(a);
          if (diff !== 0) return diff;
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
      } catch {
        return [];
      }
    },
  });

  // Deduplicated routine templates with database precedence
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

  // Fetch workouts and sets for target user
  const { data: userLogs = [], isFetched: logsFetched } = useQuery({
    queryKey: ['workout_sets', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      try {
        const { data: workoutsData, error: wError } = await supabase
          .from('workouts')
          .select('id, date, name')
          .eq('user_id', targetUserId);

        if (wError || !workoutsData) return [];

        const workoutIds = workoutsData.map((w: any) => w.id);
        if (workoutIds.length === 0) return [];

        const { data: setsData, error: sError } = await supabase
          .from('sets')
          .select('*, workouts(date, name)')
          .in('workout_id', workoutIds)
          .order('created_at', { ascending: true });

        if (sError || !setsData) return [];

        return setsData.map((s: any) => {
          const matched = exercises.find((e) => e.id === s.exercise_id || e.name === s.exercise_id);
          return {
            ...s,
            workout_date: normalizeDateStr(s.workouts?.date || s.created_at),
            workout_name: s.workouts?.name || undefined,
            exercise_name: matched ? matched.name : s.exercise_id,
          };
        }) as (WorkoutSet & { workout_date: string; workout_name?: string })[];
      } catch {
        return [];
      }
    },
  });

  const getOrCreateWorkout = async (): Promise<string> => {
    let effectiveUserId = targetUserId;
    if (!effectiveUserId) {
      const { data: authData } = await supabase.auth.getUser();
      effectiveUserId = authData?.user?.id || '';
    }
    if (!effectiveUserId) throw new Error('Authenticated user required to log workout');

    const { data: existingWorkouts } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', effectiveUserId)
      .eq('date', workoutDate);

    if (existingWorkouts && existingWorkouts.length > 0) {
      return existingWorkouts[0].id;
    }

    const { data: newWorkout, error: nwErr } = await supabase
      .from('workouts')
      .insert([
        {
          user_id: effectiveUserId,
          name: activeRoutineName,
          date: workoutDate,
        },
      ])
      .select('id')
      .single();

    if (nwErr || !newWorkout) {
      throw new Error(nwErr?.message || 'Failed to create workout');
    }
    return newWorkout.id;
  };

  // Log set mutation
  const logSetMutation = useMutation({
    mutationFn: async (payload: {
      exerciseName: string;
      weight: number;
      reps: number;
      setIndex: number;
    }) => {
      const workoutId = await getOrCreateWorkout();

      // Resolve exercise ID
      const matchedEx = exercises.find(
        (e) => e.name.toLowerCase() === payload.exerciseName.toLowerCase() || e.id === payload.exerciseName
      );
      const isUUID = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      const exerciseId = matchedEx ? matchedEx.id : (isUUID(payload.exerciseName) ? payload.exerciseName : null);
      if (!exerciseId) {
        throw new Error(`Exercise "${payload.exerciseName}" cannot be resolved to a valid UUID.`);
      }

      // Insert set
      const { data: loggedSet, error: sErr } = await supabase
        .from('sets')
        .insert([
          {
            workout_id: workoutId,
            exercise_id: exerciseId,
            set_index: payload.setIndex,
            set_type: 'working',
            weight: payload.weight,
            reps: payload.reps,
            rpe: null,
          },
        ])
        .select()
        .single();

      if (sErr) throw sErr;
      return loggedSet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      // Start a convenient 90s rest timer if autoRestTimer preference is enabled
      if (autoRestTimer) {
        restTimerStore.start(90);
      }
    },
    onError: (err: any) => {
      setMutationError(err?.message || 'Failed to log set. Please try again.');
    },
  });

  // Batch log sets mutation
  const batchLogSetsMutation = useMutation({
    mutationFn: async (
      setsToLog: {
        exerciseName: string;
        weight: number;
        reps: number;
        setIndex: number;
      }[]
    ) => {
      if (setsToLog.length === 0) return [];
      const workoutId = await getOrCreateWorkout();

      const payloads = setsToLog
        .map((s) => {
          const matchedEx = exercises.find(
            (e) => e.name.toLowerCase() === s.exerciseName.toLowerCase() || e.id === s.exerciseName
          );
          const isUUID = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
          const exerciseId = matchedEx ? matchedEx.id : (isUUID(s.exerciseName) ? s.exerciseName : null);
          if (!exerciseId) return null;
          return {
            workout_id: workoutId,
            exercise_id: exerciseId,
            set_index: s.setIndex,
            set_type: 'working',
            weight: s.weight,
            reps: s.reps,
            rpe: null,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (payloads.length === 0) {
        if (setsToLog.length > 0) {
          throw new Error(`Exercise "${setsToLog[0].exerciseName}" cannot be resolved to a valid UUID.`);
        }
        return [];
      }
      if (payloads.length < setsToLog.length) {
        const unresolvable = setsToLog.find((s) => {
          const matchedEx = exercises.find(
            (e) => e.name.toLowerCase() === s.exerciseName.toLowerCase() || e.id === s.exerciseName
          );
          const isUUID = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
          return !(matchedEx || isUUID(s.exerciseName));
        });
        if (unresolvable) {
          throw new Error(`Exercise "${unresolvable.exerciseName}" cannot be resolved to a valid UUID.`);
        }
      }

      const { data, error } = await supabase.from('sets').insert(payloads).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      if (autoRestTimer) {
        restTimerStore.start(90);
      }
    },
    onError: (err: any) => {
      setMutationError(err?.message || 'Failed to log sets. Please try again.');
    },
  });

  // Delete set mutation
  const deleteSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      const { error } = await supabase.from('sets').delete().eq('id', setId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
    },
    onError: (err: any) => {
      setMutationError(err?.message || 'Failed to delete set. Please try again.');
    },
  });

  // Filter logs for today
  const todaySets = useMemo(() => {
    return userLogs.filter((s) => normalizeDateStr(s.workout_date) === workoutDate);
  }, [userLogs, workoutDate]);

  // Helper to get sets logged today for a specific exercise
  const getSetsForExerciseToday = (exName: string) => {
    const matchedEx = exercises.find((e) => e.name.toLowerCase() === exName.toLowerCase());
    return todaySets.filter((s) => {
      if (s.exercise_id === exName) return true;
      if (matchedEx && s.exercise_id === matchedEx.id) return true;
      if (s.exercise_name === exName) return true;
      return false;
    });
  };

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    // Reset date tracking when switching athletes
    if (lastTargetUserRef.current !== targetUserId) {
      lastTargetUserRef.current = targetUserId;
      // 1. Synchronously flush previous athlete's pending writes
      workoutSessionStore.flushPendingWrites();
      // 2. Immediately wipe in-memory state to prevent visual ghosting
      setInputDrafts({});
      setActiveExercises([]);
      setTargetSetCounts({});
      setTargetRepCounts({});
      resolvedDateRef.current = null;
      manualSelectionDateRef.current = null;
    }

    // Safety Gate: Do NOT execute resolution while queries are loading
    if (!templatesFetched || !logsFetched) return;

    // Reset manual override if date changed away from where manual override was recorded
    if (manualSelectionDateRef.current && manualSelectionDateRef.current !== workoutDate) {
      manualSelectionDateRef.current = null;
    }

    // Honor explicit user routine selection on this date
    if (manualSelectionDateRef.current === workoutDate) return;

    if (resolvedDateRef.current === workoutDate) return;
    resolvedDateRef.current = workoutDate;

    // 1. DRAFT PRECEDENCE: If an active session draft exists in the store, IT IS AUTHORITATIVE
    const existingSession = workoutSessionStore.getActiveSession(targetUserId, workoutDate);
    if (existingSession) {
      const updatedTargets = { ...existingSession.targetSetCounts };
      existingSession.exercises.forEach((exName) => {
        const matchedEx = exercises.find((e) => e.name.toLowerCase() === exName.toLowerCase());
        const loggedCount = todaySets.filter((s) => {
          if (s.exercise_id === exName) return true;
          if (matchedEx && s.exercise_id === matchedEx.id) return true;
          if (s.exercise_name === exName) return true;
          return false;
        }).length;
        if ((updatedTargets[exName] || 0) < loggedCount) {
          updatedTargets[exName] = loggedCount;
        }
      });

      setActiveRoutineName(existingSession.routineName);
      setActiveExercises(existingSession.exercises); // STRICT RESPECT FOR REORDERING & DELETIONS
      setTargetSetCounts(updatedTargets);
      setTargetRepCounts(existingSession.targetRepCounts);
      setInputDrafts(existingSession.inputDrafts || {});
      setExpandedExercises(new Set(existingSession.expandedExercises));
      return;
    }

    // 2. NO EXISTING DRAFT: Resolve from DB logged sets or templates
    let resolvedRoutine = 'Rest Day';
    let resolvedExList: string[] = [];
    let resolvedTargets: Record<string, number> = {};
    let resolvedReps: Record<string, number> = {};

    if (todaySets.length > 0) {
      const loggedRoutineName =
        todaySets[0].workout_name || (todaySets[0] as any)?.workouts?.name || '';
      const normLoggedName = loggedRoutineName.trim().toLowerCase();
      const matchedCustom = customTemplates.find((t) => {
        const tNorm = t.name.trim().toLowerCase();
        return (
          tNorm === normLoggedName ||
          (normLoggedName.length > 0 &&
            (tNorm.startsWith(normLoggedName) || normLoggedName.startsWith(tNorm)))
        );
      });
      const matchedDef = DEFAULT_WORKOUT_TEMPLATES.find((t) => {
        const tNorm = t.name.trim().toLowerCase();
        return (
          tNorm === normLoggedName ||
          (normLoggedName.length > 0 &&
            (tNorm.startsWith(normLoggedName) || normLoggedName.startsWith(tNorm)))
        );
      });

      let baseExercises: string[] = [];
      const setTargets: Record<string, number> = {};
      let repTargets: Record<string, number> = {};

      if (matchedCustom && matchedCustom.exercises) {
        resolvedRoutine = matchedCustom.name;
        const sortedExercises = [...(matchedCustom.exercises || [])].sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        );
        sortedExercises.forEach((e) => {
          const resolvedName =
            e.exercise?.name ||
            e.exercise_name ||
            exercises.find((ex) => ex.id === e.exercise_id)?.name ||
            e.exercise_id;
          if (resolvedName) {
            baseExercises.push(resolvedName);
            setTargets[resolvedName] = e.target_sets || 3;
            repTargets[resolvedName] = e.target_reps || 10;
          }
        });
      } else if (matchedDef) {
        resolvedRoutine = matchedDef.name;
        baseExercises = [...matchedDef.exercises];
        Object.assign(setTargets, matchedDef.targetSets);
        repTargets = matchedDef.targetReps ? { ...matchedDef.targetReps } : {};
      } else {
        resolvedRoutine = loggedRoutineName || 'Logged Workout';
        baseExercises = Array.from(
          new Set(
            todaySets
              .map(
                (s) =>
                  exercises.find((ex) => ex.id === s.exercise_id)?.name ||
                  s.exercise_name ||
                  s.exercise_id
              )
              .filter(Boolean)
          )
        );
        baseExercises.forEach((exName) => {
          const exSets = todaySets.filter(
            (s) =>
              (s.exercise_name || s.exercise_id) === exName ||
              exercises.find((ex) => ex.id === s.exercise_id)?.name === exName
          );
          const maxIdx = Math.max(
            ...exSets.map((s) => s.set_index || 0),
            exSets.length,
            3
          );
          setTargets[exName] = maxIdx;
        });
      }

      // Merge logged exercises not in base template
      const loggedExercises = Array.from(
        new Set(
          todaySets
            .map(
              (s) =>
                exercises.find((ex) => ex.id === s.exercise_id)?.name ||
                s.exercise_name ||
                s.exercise_id
            )
            .filter(Boolean)
        )
      );
      const distinctLoggedNotInBase = loggedExercises.filter((name) => !baseExercises.includes(name));

      resolvedExList = [...baseExercises, ...distinctLoggedNotInBase];
      resolvedTargets = setTargets;
      resolvedReps = repTargets;

      resolvedExList.forEach((exName) => {
        const loggedSetsForEx = todaySets.filter(
          (s) =>
            (s.exercise_name || s.exercise_id) === exName ||
            exercises.find((ex) => ex.id === s.exercise_id)?.name === exName
        );
        const currentTarget = resolvedTargets[exName] || 3;
        resolvedTargets[exName] = Math.max(currentTarget, loggedSetsForEx.length);
      });
    } else {
      const dayAbbr = getDayOfWeekAbbr(workoutDate);
      const scheduledCustom = customTemplates.find((t) => t.days_of_week?.includes(dayAbbr));
      const scheduledDef = DEFAULT_WORKOUT_TEMPLATES.find((t) =>
        t.days.some((d) => d === dayAbbr || d.slice(0, 3) === dayAbbr)
      );

      if (scheduledCustom && scheduledCustom.exercises) {
        resolvedRoutine = scheduledCustom.name;
        const sorted = [...scheduledCustom.exercises].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        sorted.forEach((e) => {
          const name =
            e.exercise?.name ||
            e.exercise_name ||
            exercises.find((ex) => ex.id === e.exercise_id)?.name ||
            e.exercise_id;
          if (name) {
            resolvedExList.push(name);
            resolvedTargets[name] = e.target_sets || 3;
            resolvedReps[name] = e.target_reps || 10;
          }
        });
      } else if (scheduledDef) {
        resolvedRoutine = scheduledDef.name;
        resolvedExList = [...scheduledDef.exercises];
        resolvedTargets = { ...scheduledDef.targetSets };
        resolvedReps = scheduledDef.targetReps ? { ...scheduledDef.targetReps } : {};
      }
    }

    // Pure inspection mode for dates that are not today: NEVER write to store unless mutated
    const isToday = workoutDate === getLocalDateStr(new Date());
    if (isToday) {
      const newSession = workoutSessionStore.getOrInitSession(targetUserId, workoutDate, {
        routineName: resolvedRoutine,
        exercises: resolvedExList,
        targetSetCounts: resolvedTargets,
        targetRepCounts: resolvedReps,
      });
      setActiveRoutineName(newSession.routineName);
      setActiveExercises(newSession.exercises);
      setTargetSetCounts(newSession.targetSetCounts);
      setTargetRepCounts(newSession.targetRepCounts);
      setInputDrafts(newSession.inputDrafts || {});
      setExpandedExercises(new Set(newSession.expandedExercises));
    } else {
      // Pure inspection mode for past/future dates: ephemeral display only
      setActiveRoutineName(resolvedRoutine);
      setActiveExercises(resolvedExList);
      setTargetSetCounts(resolvedTargets);
      setTargetRepCounts(resolvedReps);
      setInputDrafts({});
      setExpandedExercises(resolvedExList.length > 0 ? new Set([resolvedExList[0]]) : new Set());
    }
  }, [workoutDate, targetUserId, templatesFetched, logsFetched, customTemplates, todaySets, exercises]);

  const toggleAccordion = (exName: string) => {
    setExpandedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(exName)) next.delete(exName);
      else next.add(exName);
      workoutSessionStore.setExpandedExercises(targetUserId, workoutDate, Array.from(next));
      return next;
    });
  };

  const collapseCompleted = () => {
    const next = new Set<string>();
    activeExercises.forEach((exName) => {
      const logged = getSetsForExerciseToday(exName);
      const target = targetSetCounts[exName] || 3;
      if (logged.length < target) {
        next.add(exName);
      }
    });
    workoutSessionStore.setExpandedExercises(targetUserId, workoutDate, Array.from(next));
    setExpandedExercises(next);
  };

  const toggleAllAccordions = (expand: boolean) => {
    const next = expand ? new Set(activeExercises) : new Set<string>();
    workoutSessionStore.setExpandedExercises(targetUserId, workoutDate, Array.from(next));
    setExpandedExercises(next);
  };

  const handleSelectRoutine = (routineName: string) => {
    manualSelectionDateRef.current = workoutDate;
    setShowRoutineModal(false);

    let resolvedExList: string[] = [];
    let resolvedTargets: Record<string, number> = {};
    let resolvedReps: Record<string, number> = {};

    if (routineName === 'Rest Day') {
      setActiveRoutineName('Rest Day');
      setActiveExercises([]);
      setTargetSetCounts({});
      setTargetRepCounts({});
      setExpandedExercises(new Set());
    } else if (routineName === 'Free Workout') {
      setActiveRoutineName('Free Workout');
      setActiveExercises([]);
      setTargetSetCounts({});
      setTargetRepCounts({});
      setExpandedExercises(new Set());
    } else {
      const customTpl = customTemplates.find((t) => {
        const tNorm = t.name.trim().toLowerCase();
        const rNorm = routineName.trim().toLowerCase();
        return tNorm === rNorm || (rNorm.length > 0 && (tNorm.startsWith(rNorm) || rNorm.startsWith(tNorm)));
      });
      const defTpl = DEFAULT_WORKOUT_TEMPLATES.find((t) => {
        const tNorm = t.name.trim().toLowerCase();
        const rNorm = routineName.trim().toLowerCase();
        return tNorm === rNorm || (rNorm.length > 0 && (tNorm.startsWith(rNorm) || rNorm.startsWith(tNorm)));
      });

      if (customTpl && customTpl.exercises) {
        resolvedExList = [...customTpl.exercises]
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map(
            (e) =>
              e.exercise?.name ||
              e.exercise_name ||
              exercises.find((ex) => ex.id === e.exercise_id)?.name ||
              e.exercise_id
          )
          .filter(Boolean);
        customTpl.exercises.forEach((e) => {
          const name =
            e.exercise?.name ||
            e.exercise_name ||
            exercises.find((ex) => ex.id === e.exercise_id)?.name ||
            e.exercise_id;
          if (name) {
            resolvedTargets[name] = e.target_sets || 3;
            resolvedReps[name] = e.target_reps || 10;
          }
        });
      } else if (defTpl) {
        resolvedExList = [...defTpl.exercises];
        resolvedTargets = { ...defTpl.targetSets };
        resolvedReps = defTpl.targetReps ? { ...defTpl.targetReps } : {};
      }

      setActiveRoutineName(routineName);
      setActiveExercises(resolvedExList);
      setTargetSetCounts(resolvedTargets);
      setTargetRepCounts(resolvedReps);
      if (resolvedExList.length > 0) setExpandedExercises(new Set([resolvedExList[0]]));
      else setExpandedExercises(new Set());
    }

    workoutSessionStore.updateRoutine(
      targetUserId,
      workoutDate,
      routineName,
      resolvedExList,
      resolvedTargets,
      resolvedReps
    );

    if (todaySets.length > 0 && todaySets[0].workout_id) {
      const workoutId = todaySets[0].workout_id;
      const workoutsTable = supabase.from('workouts');
      if (workoutsTable && typeof workoutsTable.update === 'function') {
        Promise.resolve(workoutsTable.update({ name: routineName }).eq('id', workoutId))
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
          })
          .catch((err: unknown) => {
            console.error('Failed to update workout name:', err);
          });
      }
    }
  };

  const handleReloadScheduledRoutine = () => {
    workoutSessionStore.deleteSession(targetUserId, workoutDate);
    manualSelectionDateRef.current = null;
    resolvedDateRef.current = null;
    setShowRoutineModal(false);

    let resolvedRoutine = 'Rest Day';
    let resolvedExList: string[] = [];
    let resolvedTargets: Record<string, number> = {};
    let resolvedReps: Record<string, number> = {};

    if (todaySets.length > 0) {
      const loggedRoutineName =
        todaySets[0].workout_name || (todaySets[0] as any)?.workouts?.name || '';
      const normLoggedName = loggedRoutineName.trim().toLowerCase();
      const matchedCustom = customTemplates.find((t) => {
        const tNorm = t.name.trim().toLowerCase();
        return (
          tNorm === normLoggedName ||
          (normLoggedName.length > 0 &&
            (tNorm.startsWith(normLoggedName) || normLoggedName.startsWith(tNorm)))
        );
      });
      const matchedDef = DEFAULT_WORKOUT_TEMPLATES.find((t) => {
        const tNorm = t.name.trim().toLowerCase();
        return (
          tNorm === normLoggedName ||
          (normLoggedName.length > 0 &&
            (tNorm.startsWith(normLoggedName) || normLoggedName.startsWith(tNorm)))
        );
      });

      let baseExercises: string[] = [];
      const setTargets: Record<string, number> = {};
      let repTargets: Record<string, number> = {};

      if (matchedCustom && matchedCustom.exercises) {
        resolvedRoutine = matchedCustom.name;
        const sortedExercises = [...(matchedCustom.exercises || [])].sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        );
        sortedExercises.forEach((e) => {
          const resolvedName =
            e.exercise?.name ||
            e.exercise_name ||
            exercises.find((ex) => ex.id === e.exercise_id)?.name ||
            e.exercise_id;
          if (resolvedName) {
            baseExercises.push(resolvedName);
            setTargets[resolvedName] = e.target_sets || 3;
            repTargets[resolvedName] = e.target_reps || 10;
          }
        });
      } else if (matchedDef) {
        resolvedRoutine = matchedDef.name;
        baseExercises = [...matchedDef.exercises];
        Object.assign(setTargets, matchedDef.targetSets);
        repTargets = matchedDef.targetReps ? { ...matchedDef.targetReps } : {};
      } else {
        resolvedRoutine = loggedRoutineName || 'Logged Workout';
        baseExercises = Array.from(
          new Set(
            todaySets
              .map(
                (s) =>
                  exercises.find((ex) => ex.id === s.exercise_id)?.name ||
                  s.exercise_name ||
                  s.exercise_id
              )
              .filter(Boolean)
          )
        );
        baseExercises.forEach((exName) => {
          const exSets = todaySets.filter(
            (s) =>
              (s.exercise_name || s.exercise_id) === exName ||
              exercises.find((ex) => ex.id === s.exercise_id)?.name === exName
          );
          const maxIdx = Math.max(
            ...exSets.map((s) => s.set_index || 0),
            exSets.length,
            3
          );
          setTargets[exName] = maxIdx;
        });
      }

      const loggedExercises = Array.from(
        new Set(
          todaySets
            .map(
              (s) =>
                exercises.find((ex) => ex.id === s.exercise_id)?.name ||
                s.exercise_name ||
                s.exercise_id
            )
            .filter(Boolean)
        )
      );
      const distinctLoggedNotInBase = loggedExercises.filter((name) => !baseExercises.includes(name));

      resolvedExList = [...baseExercises, ...distinctLoggedNotInBase];
      resolvedTargets = setTargets;
      resolvedReps = repTargets;

      resolvedExList.forEach((exName) => {
        const loggedSetsForEx = todaySets.filter(
          (s) =>
            (s.exercise_name || s.exercise_id) === exName ||
            exercises.find((ex) => ex.id === s.exercise_id)?.name === exName
        );
        const currentTarget = resolvedTargets[exName] || 3;
        resolvedTargets[exName] = Math.max(currentTarget, loggedSetsForEx.length);
      });
    } else {
      const dayAbbr = getDayOfWeekAbbr(workoutDate);
      const scheduledCustom = customTemplates.find((t) => t.days_of_week?.includes(dayAbbr));
      const scheduledDef = DEFAULT_WORKOUT_TEMPLATES.find((t) =>
        t.days.some((d) => d === dayAbbr || d.slice(0, 3) === dayAbbr)
      );

      if (scheduledCustom && scheduledCustom.exercises) {
        resolvedRoutine = scheduledCustom.name;
        const sorted = [...scheduledCustom.exercises].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        sorted.forEach((e) => {
          const name =
            e.exercise?.name ||
            e.exercise_name ||
            exercises.find((ex) => ex.id === e.exercise_id)?.name ||
            e.exercise_id;
          if (name) {
            resolvedExList.push(name);
            resolvedTargets[name] = e.target_sets || 3;
            resolvedReps[name] = e.target_reps || 10;
          }
        });
      } else if (scheduledDef) {
        resolvedRoutine = scheduledDef.name;
        resolvedExList = [...scheduledDef.exercises];
        resolvedTargets = { ...scheduledDef.targetSets };
        resolvedReps = scheduledDef.targetReps ? { ...scheduledDef.targetReps } : {};
      }
    }

    const isToday = workoutDate === getLocalDateStr(new Date());
    if (isToday) {
      const newSession = workoutSessionStore.getOrInitSession(targetUserId, workoutDate, {
        routineName: resolvedRoutine,
        exercises: resolvedExList,
        targetSetCounts: resolvedTargets,
        targetRepCounts: resolvedReps,
      });
      setActiveRoutineName(newSession.routineName);
      setActiveExercises(newSession.exercises);
      setTargetSetCounts(newSession.targetSetCounts);
      setTargetRepCounts(newSession.targetRepCounts);
      setInputDrafts(newSession.inputDrafts || {});
      setExpandedExercises(new Set(newSession.expandedExercises));
    } else {
      setActiveRoutineName(resolvedRoutine);
      setActiveExercises(resolvedExList);
      setTargetSetCounts(resolvedTargets);
      setTargetRepCounts(resolvedReps);
      setInputDrafts({});
      setExpandedExercises(resolvedExList.length > 0 ? new Set([resolvedExList[0]]) : new Set());
    }
  };

  const ensureSession = () => {
    manualSelectionDateRef.current = workoutDate;
    let session = workoutSessionStore.getActiveSession(targetUserId, workoutDate);
    if (!session) {
      session = workoutSessionStore.getOrInitSession(targetUserId, workoutDate, {
        routineName: activeRoutineName,
        exercises: activeExercises,
        targetSetCounts,
        targetRepCounts,
      });
    }
    return session;
  };

  const handleAddExercise = () => {
    if (!selectedExerciseToAdd) return;
    ensureSession();
    if (!activeExercises.includes(selectedExerciseToAdd)) {
      const next = [...activeExercises, selectedExerciseToAdd];
      setActiveExercises(next);
      setTargetSetCounts((prev) => ({ ...prev, [selectedExerciseToAdd]: 3 }));
      setExpandedExercises((prev) => new Set(prev).add(selectedExerciseToAdd));
      workoutSessionStore.addExercise(targetUserId, workoutDate, selectedExerciseToAdd, 3);
    }
    setSelectedExerciseToAdd('');
  };

  const moveExercise = (index: number, direction: number) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= activeExercises.length) return;
    ensureSession();
    const copy = [...activeExercises];
    const item = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = item;
    setActiveExercises(copy);
    workoutSessionStore.reorderExercises(targetUserId, workoutDate, copy);
  };

  const removeExercise = (index: number) => {
    const exName = activeExercises[index];
    const loggedSets = getSetsForExerciseToday(exName);
    if (loggedSets.length > 0) {
      const confirmed = window.confirm(
        `"${exName}" has ${loggedSets.length} logged set(s). Remove from workout? (Logged sets will be preserved in history)`
      );
      if (!confirmed) return;
    }
    ensureSession();
    const next = activeExercises.filter((_, i) => i !== index);
    setActiveExercises(next);
    setTargetSetCounts((prev) => {
      const copy = { ...prev };
      delete copy[exName];
      return copy;
    });
    setTargetRepCounts((prev) => {
      const copy = { ...prev };
      delete copy[exName];
      return copy;
    });
    workoutSessionStore.removeExercise(targetUserId, workoutDate, exName);
  };

  const adjustTargetSets = (exName: string, delta: number) => {
    const minSets = Math.max(1, getSetsForExerciseToday(exName).length);
    ensureSession();
    setTargetSetCounts((prev) => {
      const current = prev[exName] || 3;
      const next = Math.max(minSets, current + delta);
      workoutSessionStore.updateTargetSets(targetUserId, workoutDate, exName, next);
      return { ...prev, [exName]: next };
    });
  };

  const handleCommitSet = (
    exName: string,
    setIndex: number,
    ghostValues: { weight: number | ''; reps: number | '' }
  ) => {
    const draftKey = `${exName}_${setIndex}`;
    const draft = inputDrafts[draftKey];

    const hasDraftWeight = draft?.weight !== undefined && draft.weight.trim() !== '';
    const weightVal = hasDraftWeight
      ? Number(draft.weight)
      : typeof ghostValues.weight === 'number'
      ? ghostValues.weight
      : NaN;

    const hasDraftReps = draft?.reps !== undefined && draft.reps.trim() !== '';
    const repsVal = hasDraftReps
      ? Number(draft.reps)
      : typeof ghostValues.reps === 'number'
      ? ghostValues.reps
      : NaN;

    if (!Number.isFinite(weightVal) || weightVal < 0 || !Number.isFinite(repsVal) || repsVal <= 0) {
      setMutationError('Please enter weight and reps or use previous set values.');
      return;
    }

    logSetMutation.mutate({
      exerciseName: exName,
      weight: weightVal,
      reps: repsVal,
      setIndex,
    });

    setInputDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
    workoutSessionStore.clearDraft(targetUserId, workoutDate, exName, setIndex);
  };

  const updateDraft = (
    exName: string,
    setIndex: number,
    field: 'weight' | 'reps',
    value: string
  ) => {
    let sanitized = value;
    if (field === 'weight') {
      sanitized = sanitized.replace(',', '.');
      if (sanitized !== '' && !/^\d*\.?\d*$/.test(sanitized)) return;
    } else if (field === 'reps') {
      if (sanitized !== '' && !/^\d*$/.test(sanitized)) return;
    }

    const draftKey = `${exName}_${setIndex}`;
    ensureSession();
    setInputDrafts((prev) => {
      const updated = {
        weight: field === 'weight' ? sanitized : prev[draftKey]?.weight || '',
        reps: field === 'reps' ? sanitized : prev[draftKey]?.reps || '',
      };
      workoutSessionStore.setDraftInput(targetUserId, workoutDate, exName, setIndex, updated);
      return {
        ...prev,
        [draftKey]: updated,
      };
    });
  };

  const handleBatchLogExercise = (
    exName: string,
    targetCount: number,
    ghostValues: { weight: number | ''; reps: number | '' }[],
    setsToday: WorkoutSet[]
  ) => {
    const unloggedSets: {
      exerciseName: string;
      weight: number;
      reps: number;
      setIndex: number;
    }[] = [];
    for (let rowIdx = setsToday.length; rowIdx < targetCount; rowIdx++) {
      const setIndex = rowIdx + 1;
      const ghost = ghostValues[rowIdx] || { weight: '', reps: '' };
      const draftKey = `${exName}_${setIndex}`;
      const draft = inputDrafts[draftKey];

      const weightVal = draft?.weight !== undefined && draft.weight.trim() !== ''
        ? Number(draft.weight)
        : typeof ghost.weight === 'number'
        ? ghost.weight
        : NaN;

      const repsVal = draft?.reps !== undefined && draft.reps.trim() !== ''
        ? Number(draft.reps)
        : typeof ghost.reps === 'number'
        ? ghost.reps
        : targetRepCounts[exName] || NaN;

      if (!Number.isFinite(weightVal) || weightVal < 0 || !Number.isFinite(repsVal) || repsVal <= 0) continue;

      unloggedSets.push({
        exerciseName: exName,
        weight: weightVal,
        reps: repsVal,
        setIndex,
      });
    }

    if (unloggedSets.length > 0) {
      batchLogSetsMutation.mutate(unloggedSets);
      setInputDrafts((prev) => {
        const next = { ...prev };
        unloggedSets.forEach((s) => {
          delete next[`${s.exerciseName}_${s.setIndex}`];
        });
        return next;
      });
      unloggedSets.forEach((s) => {
        workoutSessionStore.clearDraft(targetUserId, workoutDate, s.exerciseName, s.setIndex);
      });
    }
  };

  const handleFinishWorkout = () => {
    const allPendingSets: {
      exerciseName: string;
      weight: number;
      reps: number;
      setIndex: number;
    }[] = [];

    for (const exName of activeExercises) {
      const setsToday = getSetsForExerciseToday(exName);
      const targetCount = targetSetCounts[exName] || 3;
      const ghostValues = computeGhostSets(exName, targetCount, userLogs, workoutDate);

      for (let rowIdx = setsToday.length; rowIdx < targetCount; rowIdx++) {
        const setIndex = rowIdx + 1;
        const ghost = ghostValues[rowIdx] || { weight: '', reps: '' };
        const draftKey = `${exName}_${setIndex}`;
        const draft = inputDrafts[draftKey];

        const weightVal = draft?.weight !== undefined && draft.weight.trim() !== ''
          ? Number(draft.weight)
          : typeof ghost.weight === 'number'
          ? ghost.weight
          : NaN;

        const repsVal = draft?.reps !== undefined && draft.reps.trim() !== ''
          ? Number(draft.reps)
          : typeof ghost.reps === 'number'
          ? ghost.reps
          : targetRepCounts[exName] || NaN;

        if (!Number.isFinite(weightVal) || weightVal < 0 || !Number.isFinite(repsVal) || repsVal <= 0) continue;

        allPendingSets.push({
          exerciseName: exName,
          weight: weightVal,
          reps: repsVal,
          setIndex,
        });
      }
    }

    if (allPendingSets.length > 0) {
      batchLogSetsMutation.mutate(allPendingSets);
      setInputDrafts((prev) => {
        const next = { ...prev };
        allPendingSets.forEach((s) => {
          delete next[`${s.exerciseName}_${s.setIndex}`];
        });
        return next;
      });
      allPendingSets.forEach((s) => {
        workoutSessionStore.clearDraft(targetUserId, workoutDate, s.exerciseName, s.setIndex);
      });
    }
  };

  const allExpanded =
    activeExercises.length > 0 && activeExercises.every((e) => expandedExercises.has(e));

  const isWholeWorkoutCompleted =
    activeExercises.length > 0 &&
    activeExercises.every((exName) => getSetsForExerciseToday(exName).length >= (targetSetCounts[exName] || 3));

  // Reactive workout completion & set deletion sync effect
  useEffect(() => {
    if (!logsFetched || activeExercises.length === 0) return;
    const isToday = workoutDate === getLocalDateStr(new Date());
    if (!isToday) return;

    const session = workoutSessionStore.getSession(targetUserId, workoutDate);
    if (!session) return;

    if (isWholeWorkoutCompleted && todaySets.length > 0) {
      if (!session.completedAt) {
        workoutSessionStore.completeSession(targetUserId, workoutDate);
      }
    } else {
      // Reopen session if a previously completed workout had a set deleted (from History or Workout tab)
      if (session.completedAt) {
        workoutSessionStore.reopenSession(targetUserId, workoutDate);
      }
    }
  }, [isWholeWorkoutCompleted, logsFetched, activeExercises.length, todaySets.length, targetUserId, workoutDate]);

  // Synchronous teardown on date switch or unmount
  useEffect(() => {
    return () => {
      workoutSessionStore.flushPendingWrites();
    };
  }, [workoutDate, targetUserId]);

  const currentDayAbbr = getDayOfWeekAbbr(workoutDate);

  return (
    <div className="space-y-5">
      {/* Mutation Error Notification */}
      {mutationError && (
        <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded-2xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{mutationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            className="p-1 min-w-[32px] min-h-[32px] text-rose-400 hover:text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      )}

      {/* Routine & Date Control Banner */}
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 shadow-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-400 shrink-0">
              Routine:
            </span>
            <button
              onClick={() => setShowRoutineModal(true)}
              className="bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/80 hover:border-cyan-500/50 text-white text-xs font-bold px-3 py-1.5 min-h-[44px] rounded-xl flex items-center gap-2 transition-all shadow-sm"
              data-testid="routine-select-btn"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate max-w-[110px] sm:max-w-[200px]">{activeRoutineName}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400 ml-0.5 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => restTimerStore.toggleHeaderTimer()}
              className="bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/80 hover:border-cyan-500/50 text-cyan-300 text-xs font-bold px-3 py-1.5 min-h-[44px] rounded-xl flex items-center gap-1.5 transition-all shadow-sm touch-manipulation shrink-0"
              title="Rest Timer"
              data-testid="rest-timer-btn"
            >
              <Timer className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Rest Timer</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">
              Date:
            </span>
            <input
              type="date"
              value={workoutDate}
              onChange={(e) => {
                workoutSessionStore.flushPendingWrites();
                setWorkoutDate(e.target.value);
              }}
              className="bg-zinc-950 border border-zinc-800 text-cyan-400 rounded-xl px-2.5 py-1.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none shadow-inner cursor-pointer"
              data-testid="workout-date-input"
            />
            <button
              onClick={() => {
                if (window.confirm("Clear all exercises from today's workout?")) {
                  setActiveRoutineName('Free Workout');
                  setActiveExercises([]);
                  setTargetSetCounts({});
                  setTargetRepCounts({});
                  setInputDrafts({});
                  manualSelectionDateRef.current = workoutDate;
                  workoutSessionStore.clearWorkout(targetUserId, workoutDate);
                }
              }}
              className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-extrabold px-2.5 py-1.5 rounded-xl text-xs transition flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.15)] active:scale-95"
              title="Clear Workout"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Routine Selector Modal */}
      {showRoutineModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" /> Select Routine
              </h3>
              <button
                onClick={() => setShowRoutineModal(false)}
                className="text-zinc-400 hover:text-white text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={handleReloadScheduledRoutine}
                className="w-full py-2.5 px-3 mb-2 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-cyan-400 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                data-testid="reload-scheduled-routine-btn"
                title="Discard draft and reload scheduled routine"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Scheduled Routine</span>
              </button>

              <button
                onClick={() => handleSelectRoutine('Free Workout')}
                className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between font-black transition ${
                  activeRoutineName === 'Free Workout'
                    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                    : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
                }`}
              >
                <span>Free Workout</span>
                {activeRoutineName === 'Free Workout' && <Check className="w-4 h-4 text-cyan-400" />}
              </button>

              <button
                onClick={() => handleSelectRoutine('Rest Day')}
                className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between font-black transition ${
                  activeRoutineName === 'Rest Day'
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                    : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bed className="w-4 h-4 text-indigo-400" />
                  <span>Rest Day</span>
                </div>
                {activeRoutineName === 'Rest Day' && <Check className="w-4 h-4 text-indigo-400" />}
              </button>

              {availableRoutines.custom.map((tpl) => {
                const isScheduledToday = tpl.days_of_week && tpl.days_of_week.includes(currentDayAbbr);
                return (
                  <button
                    key={tpl.id}
                    onClick={() => handleSelectRoutine(tpl.name)}
                    className={`w-full text-left p-3.5 rounded-xl border transition ${
                      activeRoutineName === tpl.name
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                        : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-black">
                      <div className="flex items-center gap-2">
                        <span>{tpl.name}</span>
                        {isScheduledToday && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Scheduled Today
                          </span>
                        )}
                      </div>
                      {activeRoutineName === tpl.name && <Check className="w-4 h-4 text-cyan-400" />}
                    </div>
                    {tpl.days_of_week && tpl.days_of_week.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {tpl.days_of_week.map((d) => (
                          <span
                            key={d}
                            className="bg-violet-500/20 text-violet-300 font-bold px-1.5 py-0.5 rounded text-[10px]"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                    {tpl.exercises && (
                      <div className="text-[11px] font-normal text-zinc-400 mt-1 truncate">
                        {tpl.exercises
                          .map((e) => e.exercise?.name || e.exercise_name || exercises.find((ex) => ex.id === e.exercise_id)?.name || e.exercise_id)
                          .join(', ')}
                      </div>
                    )}
                  </button>
                );
              })}

              {availableRoutines.defaults.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => handleSelectRoutine(tpl.name)}
                  className={`w-full text-left p-3.5 rounded-xl border transition ${
                    activeRoutineName === tpl.name
                      ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                      : 'bg-zinc-950 border-zinc-800/80 text-white hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between font-black">
                    <div className="flex items-center gap-2">
                      <span>{tpl.name}</span>
                      {tpl.days.includes(currentDayAbbr) && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Scheduled Today
                        </span>
                      )}
                    </div>
                    {activeRoutineName === tpl.name && <Check className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {tpl.days.map((d) => (
                      <span
                        key={d}
                        className="bg-violet-500/20 text-violet-300 font-bold px-1.5 py-0.5 rounded text-[10px]"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] font-normal text-zinc-400 mt-1 truncate">
                    {tpl.exercises.join(', ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rest Day view */}
      {activeRoutineName === 'Rest Day' ? (
        <div className="bg-gradient-to-br from-indigo-950/40 via-zinc-900/90 to-zinc-950 border border-indigo-500/30 rounded-3xl p-8 text-center text-white shadow-2xl my-2">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 text-indigo-400 text-2xl shadow-[0_0_20px_rgba(99,102,241,0.25)]">
            <Bed className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2.5">
            <Calendar className="w-3.5 h-3.5" /> Rest Day
          </div>
          <h3 className="text-lg font-black text-white mb-1.5">Rest & Recovery</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-6 leading-relaxed">
            Take today to rest and recover, stretch, or choose a routine if you want to train today.
          </p>
          <button
            onClick={() => setShowRoutineModal(true)}
            className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white font-black py-3 px-6 rounded-xl text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(139,92,246,0.25)] active:scale-95 transition flex items-center gap-2 mx-auto"
          >
            <Dumbbell className="w-4 h-4" />
            <span>Choose Routine</span>
          </button>
        </div>
      ) : (
        <>
          {/* Exercises Accordions Toolbar */}
          {activeExercises.length > 0 && (
            <div className="flex flex-wrap items-center justify-between bg-zinc-900/90 border border-zinc-800/80 rounded-xl px-3 py-2 shadow-sm gap-2">
              <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Exercises ({activeExercises.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={collapseCompleted}
                  className="text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 px-2.5 py-1 rounded-lg transition flex items-center gap-1.5"
                  title="Collapse completed exercises"
                >
                  <span>Collapse Completed</span>
                </button>
                <button
                  onClick={() => toggleAllAccordions(!allExpanded)}
                  className="text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 px-2.5 py-1 rounded-lg transition"
                >
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>
          )}

          {/* Exercise Cards or Empty State */}
          {activeExercises.length === 0 ? (
            <div className="bg-zinc-900/90 rounded-2xl shadow-xl p-8 text-center border border-dashed border-zinc-800 text-white">
              <Dumbbell className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-white font-bold text-base mb-1">No exercises in today's workout yet</p>
              <p className="text-xs text-zinc-400">Select a routine above or add an exercise below to start logging.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeExercises.map((exName, exIndex) => {
                const setsToday = getSetsForExerciseToday(exName);
                const benchmarks = getExerciseBenchmarks(exName, userLogs, workoutDate);
                const isExpanded = expandedExercises.has(exName);
                const targetCount = targetSetCounts[exName] || 3;
                const isCompleted = setsToday.length >= targetCount;
                const unloggedCount = Math.max(0, targetCount - setsToday.length);

                // Compute ghost set placeholders for this exercise
                const ghostValues = computeGhostSets(exName, targetCount, userLogs, workoutDate);
                const totalRows = Math.max(targetCount, setsToday.length);

                return (
                  <div
                    key={exName}
                    className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 shadow-lg space-y-2.5 text-white transition-all"
                    data-testid={`exercise-card-${exIndex}`}
                  >
                    {/* LINE 1: Full-Width Title & Accordion Chevron */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleAccordion(exName)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleAccordion(exName);
                        }
                      }}
                      className="flex items-center justify-between cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 rounded-xl touch-manipulation"
                      aria-label={`${exName}, ${isExpanded ? 'collapse' : 'expand'} exercise`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-mono font-bold text-cyan-400 text-xs shrink-0">
                          {exIndex + 1}
                        </span>
                        <span className="text-white font-extrabold text-base tracking-tight leading-snug break-words">
                          {exName}
                        </span>
                      </div>

                      <div className="w-7 h-7 rounded-lg text-zinc-400 flex items-center justify-center shrink-0">
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-cyan-400' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* LINE 2: Benchmarks + Sets status on Left, Stepper + Quick Actions on Right */}
                    <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-zinc-800/60">
                      {/* Left side: Benchmarks & Sets status */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        {benchmarks.lastSession ? (
                          <span
                            className="inline-flex items-center text-[10px] font-mono bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 px-2 py-0.5 rounded-full max-w-[140px] truncate"
                            title={`Last session (${formatShortDate(benchmarks.lastSession.date)}): ${benchmarks.lastSession.summaryText}`}
                          >
                            Last: {benchmarks.lastSession.summaryText}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-500 font-mono">No prior session</span>
                        )}

                        {benchmarks.pr && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full">
                            <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>PR: {benchmarks.pr.weight > 0 ? `${benchmarks.pr.weight}×` : 'BW×'}{benchmarks.pr.reps}</span>
                          </span>
                        )}

                        {isCompleted ? (
                          <span className="inline-flex items-center text-[10px] font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                            <Check className="w-2.5 h-2.5 mr-1" />
                            <span>{setsToday.length}/{targetCount} Sets</span>
                          </span>
                        ) : setsToday.length > 0 ? (
                          <span className="inline-flex items-center text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full shrink-0">
                            <span>{setsToday.length}/{targetCount} Sets</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-bold bg-zinc-800 border border-zinc-700/80 text-zinc-400 px-2 py-0.5 rounded-full shrink-0">
                            <span>0/{targetCount} Sets</span>
                          </span>
                        )}
                      </div>

                      {/* Right side: Stepper + 1-Tap Quick Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Stepper Pill */}
                        <div className="flex items-center bg-zinc-800/90 border border-zinc-700/70 rounded-lg h-7 px-1 text-xs">
                          <button
                            type="button"
                            onClick={() => adjustTargetSets(exName, -1)}
                            disabled={targetCount <= Math.max(1, setsToday.length)}
                            className="relative w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 font-bold touch-manipulation before:absolute before:-inset-2 before:content-['']"
                            title="Decrease target sets"
                            aria-label={`Decrease target sets for ${exName}`}
                          >
                            −
                          </button>
                          <span className="font-mono font-bold text-white px-1 text-[11px]">{targetCount}</span>
                          <button
                            type="button"
                            onClick={() => adjustTargetSets(exName, 1)}
                            className="relative w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white font-bold touch-manipulation before:absolute before:-inset-2 before:content-['']"
                            title="Increase target sets"
                            aria-label={`Increase target sets for ${exName}`}
                          >
                            +
                          </button>
                        </div>

                        {/* 1-Tap Quick Icons */}
                        {exIndex > 0 && (
                          <button
                            type="button"
                            onClick={() => moveExercise(exIndex, -1)}
                            className="relative w-7 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 border border-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation before:absolute before:-inset-1.5 before:content-['']"
                            title="Move up"
                            aria-label={`Move ${exName} up`}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {exIndex < activeExercises.length - 1 && (
                          <button
                            type="button"
                            onClick={() => moveExercise(exIndex, 1)}
                            className="relative w-7 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 border border-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation before:absolute before:-inset-1.5 before:content-['']"
                            title="Move down"
                            aria-label={`Move ${exName} down`}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => removeExercise(exIndex)}
                          className="relative w-7 h-7 rounded-lg bg-zinc-800/60 hover:bg-rose-500/20 border border-zinc-700/50 flex items-center justify-center text-zinc-500 hover:text-rose-400 transition touch-manipulation before:absolute before:-inset-1.5 before:content-['']"
                          title="Remove from workout"
                          aria-label={`Remove ${exName} from workout`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Accordion Body: Sets & Ghost Placeholders */}
                    {isExpanded && (
                      <div className="pt-1 space-y-1">
                        {/* 5-Column Table Header */}
                        <div className="grid grid-cols-12 gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500 px-2 pb-1 text-center">
                          <div className="col-span-2">Set</div>
                          <div className="col-span-3">Previous</div>
                          <div className="col-span-3">
                            <span className="sr-only">Weight</span>
                            <span aria-hidden="true">Lbs</span>
                          </div>
                          <div className="col-span-2">Reps</div>
                          <div className="col-span-2 text-right pr-1">
                            <span className="sr-only">Action</span>
                            <span aria-hidden="true">Log</span>
                          </div>
                        </div>

                        {Array.from({ length: totalRows }, (_, rowIdx) => {
                          const setIndex = rowIdx + 1;
                          const loggedSet = setsToday[rowIdx];
                          const ghost = ghostValues[rowIdx] || {
                            weight: '',
                            reps: '',
                            hintText: '—',
                            isFromPrevious: false,
                          };

                          const draftKey = `${exName}_${setIndex}`;
                          const draft = inputDrafts[draftKey] || {
                            weight: ghost.weight.toString(),
                            reps: ghost.reps.toString(),
                          };

                          if (loggedSet) {
                            return (
                              <div
                                key={loggedSet.id || rowIdx}
                                className="grid grid-cols-12 gap-1 py-1.5 px-2 rounded-xl items-center bg-cyan-500/10 border border-cyan-500/20 text-xs my-1 transition"
                              >
                                <div className="col-span-2 font-mono font-bold text-cyan-400 text-center flex items-center justify-center">
                                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[11px] flex items-center justify-center font-bold">
                                    {setIndex}
                                  </span>
                                </div>
                                <div className="col-span-3 text-zinc-400 font-mono text-center text-[11px] truncate">
                                  {ghost.hintText}
                                </div>
                                <div className="col-span-3 flex justify-center">
                                  <div className="w-full max-w-[76px] h-8 rounded-lg bg-zinc-950/80 border border-zinc-700/60 flex items-center justify-center font-mono font-black text-white text-sm">
                                    {loggedSet.weight}
                                  </div>
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <div className="w-full max-w-[64px] h-8 rounded-lg bg-zinc-950/80 border border-zinc-700/60 flex items-center justify-center font-mono font-black text-cyan-300 text-sm">
                                    {loggedSet.reps}
                                  </div>
                                </div>
                                <div className="col-span-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => loggedSet.id && deleteSetMutation.mutate(loggedSet.id)}
                                    className="relative w-7.5 h-7.5 rounded-full bg-cyan-500 text-zinc-950 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.4)] transition active:scale-95 touch-manipulation before:absolute before:-inset-2 before:content-['']"
                                    title="Delete set"
                                    aria-label={`Delete set ${setIndex} for ${exName}`}
                                    data-testid={`delete-set-btn-${exIndex}-${rowIdx}`}
                                  >
                                    <Check className="w-4 h-4 stroke-[3]" />
                                  </button>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div
                                key={rowIdx}
                                className="grid grid-cols-12 gap-1 py-1.5 px-2 rounded-xl items-center border border-transparent hover:bg-zinc-800/30 text-xs my-1 transition"
                              >
                                <div className="col-span-2 font-mono font-bold text-zinc-500 text-center flex items-center justify-center">
                                  <span className="w-5 h-5 rounded-full bg-zinc-800 text-[11px] flex items-center justify-center text-zinc-400">
                                    {setIndex}
                                  </span>
                                </div>
                                <div className="col-span-3 text-zinc-500 font-mono text-center text-[11px] truncate">
                                  {ghost.hintText}
                                </div>
                                <div className="col-span-3 flex justify-center">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={typeof ghost.weight === 'number' ? ghost.weight.toString() : 'lbs'}
                                    value={draft.weight}
                                    onChange={(e) => updateDraft(exName, setIndex, 'weight', e.target.value)}
                                    aria-label={`Set ${setIndex} weight`}
                                    className="h-8 w-full max-w-[76px] bg-zinc-800/80 border border-zinc-700/70 rounded-lg text-center font-mono font-bold text-white text-base sm:text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition"
                                    data-testid={`ghost-weight-${exIndex}-${rowIdx}`}
                                  />
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder={
                                      typeof ghost.reps === 'number'
                                        ? ghost.reps.toString()
                                        : targetRepCounts[exName]
                                        ? `${targetRepCounts[exName]}`
                                        : 'reps'
                                    }
                                    value={draft.reps}
                                    onChange={(e) => updateDraft(exName, setIndex, 'reps', e.target.value)}
                                    aria-label={`Set ${setIndex} reps`}
                                    className="h-8 w-full max-w-[64px] bg-zinc-800/80 border border-zinc-700/70 rounded-lg text-center font-mono font-bold text-white text-base sm:text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition"
                                    data-testid={`ghost-reps-${exIndex}-${rowIdx}`}
                                  />
                                </div>
                                <div className="col-span-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleCommitSet(exName, setIndex, ghost)}
                                    disabled={logSetMutation.isPending || batchLogSetsMutation.isPending}
                                    className="relative w-7.5 h-7.5 rounded-full border-2 border-zinc-700 hover:border-cyan-400 hover:bg-cyan-500/10 text-transparent hover:text-cyan-400 flex items-center justify-center transition active:scale-95 disabled:opacity-50 touch-manipulation before:absolute before:-inset-2 before:content-['']"
                                    title="Commit Set (One-tap)"
                                    aria-label={`Commit set ${setIndex} for ${exName}`}
                                    data-testid={`commit-set-btn-${exIndex}-${rowIdx}`}
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                  </button>
                                </div>
                              </div>
                            );
                          }
                        })}

                        {/* Batch Log Button inside accordion if unlogged sets remain */}
                        {!isCompleted && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => handleBatchLogExercise(exName, targetCount, ghostValues, setsToday)}
                              disabled={batchLogSetsMutation.isPending}
                              className="text-xs font-bold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-3 py-1.5 rounded-full transition flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 touch-manipulation"
                              data-testid={`batch-log-exercise-btn-${exIndex}`}
                            >
                              <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5]" />
                              <span>Log All ({unloggedCount})</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Exercise to Workout Picker */}
          <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-4 shadow-xl overflow-hidden">
            <div className="text-xs font-extrabold uppercase tracking-widest text-zinc-400 mb-2.5 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-cyan-400" /> Add Exercise
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedExerciseToAdd}
                onChange={(e) => setSelectedExerciseToAdd(e.target.value)}
                className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none truncate"
                data-testid="add-exercise-select"
              >
                <option value="">-- Choose Exercise --</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.name}>
                    {ex.name} {ex.body_part ? `(${ex.body_part})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddExercise}
                disabled={!selectedExerciseToAdd}
                className="shrink-0 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black px-4 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-wider shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all active:scale-95 disabled:opacity-50"
                data-testid="add-exercise-btn"
              >
                Add
              </button>
            </div>
          </div>

          {/* Master Batch Finish Workout Button */}
          {activeExercises.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleFinishWorkout}
                disabled={batchLogSetsMutation.isPending || isWholeWorkoutCompleted}
                className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-2xl ${
                  isWholeWorkoutCompleted
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                    : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-neon-cyan active:scale-95'
                }`}
                data-testid="finish-workout-btn"
              >
                {isWholeWorkoutCompleted ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Workout Completed</span>
                  </>
                ) : batchLogSetsMutation.isPending ? (
                  <span>Logging All Sets...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-cyan-300" />
                    <span>Finish Workout & Log Remaining Sets</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

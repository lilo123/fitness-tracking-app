import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { WorkoutSet, Exercise, RoutineTemplate } from '../../types/database';
import {
  normalizeDateStr,
  getLocalDateStr,
  getDayOfWeekAbbr,
  DEFAULT_EXERCISES_LIST,
  DEFAULT_WORKOUT_TEMPLATES,
} from '../../utils/ghostSets';
import { workoutSessionStore, type SetDraftInput } from '../../utils/workoutSessionStore';
import {
  isUUID,
  resolveRoutineAndExercises,
  checkIsScheduledRoutineDirty,
} from './workoutEngineHelpers';
import { fetchTemplateDetail } from './useWorkoutQueries';
import { cleanSessionUUIDs, findMatchingTemplate, extractTemplateDetails } from './useWorkoutSessionHelpers';

export interface UseWorkoutSessionOptions {
  targetUserId: string;
  exercises: Exercise[];
  exercisesFetched: boolean;
  customTemplates: RoutineTemplate[];
  templatesFetched: boolean;
  userLogs: (WorkoutSet & { workout_date: string; workout_name?: string })[];
  logsFetched: boolean;
  onSessionRoutineChange?: () => void;
}

export function useWorkoutSession({
  targetUserId,
  exercises,
  exercisesFetched,
  customTemplates,
  templatesFetched,
  userLogs,
  logsFetched,
}: UseWorkoutSessionOptions) {
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

  const [inputDrafts, setInputDrafts] = useState<Record<string, SetDraftInput>>(
    () => initialSession?.inputDrafts ?? {}
  );

  const resolvedKeyRef = useRef<string | null>(null);
  const manualSelectionDateRef = useRef<string | null>(null);
  const lastTargetUserRef = useRef<string>(targetUserId);

  const todaySets = useMemo(() => {
    return userLogs.filter((s) => normalizeDateStr(s.workout_date) === workoutDate);
  }, [userLogs, workoutDate]);

  const getSetsForExerciseToday = useCallback((exName: string) => {
    const norm = exName.trim().toLowerCase();
    return todaySets.filter((s) => {
      if (s.exercise_id === exName) return true;
      if (s.exercise?.name && s.exercise.name.trim().toLowerCase() === norm) return true;
      if (s.exercise_name && s.exercise_name.trim().toLowerCase() === norm) return true;
      const matchedEx = exercises.find((e) => e.name.toLowerCase() === norm || e.id === exName);
      if (matchedEx && (s.exercise_id === matchedEx.id || s.exercise?.id === matchedEx.id)) return true;
      const defEx = DEFAULT_EXERCISES_LIST.find((e) => e.name.toLowerCase() === norm || e.id === exName);
      if (defEx && (s.exercise_id === defEx.id || s.exercise?.id === defEx.id)) return true;
      return false;
    });
  }, [exercises, todaySets]);

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (lastTargetUserRef.current !== targetUserId) {
      lastTargetUserRef.current = targetUserId;
      workoutSessionStore.flushPendingWrites();
      setInputDrafts({});
      setActiveExercises([]);
      setTargetSetCounts({});
      setTargetRepCounts({});
      resolvedKeyRef.current = null;
      manualSelectionDateRef.current = null;
    }

    if (!templatesFetched || !logsFetched || !exercisesFetched) return;

    if (manualSelectionDateRef.current && manualSelectionDateRef.current !== workoutDate) {
      manualSelectionDateRef.current = null;
    }

    if (manualSelectionDateRef.current === workoutDate) return;

    const resolutionKey = `${targetUserId}_${workoutDate}`;
    if (resolvedKeyRef.current === resolutionKey) return;
    resolvedKeyRef.current = resolutionKey;

    const existingSession = workoutSessionStore.getActiveSession(targetUserId, workoutDate);
    if (existingSession) {
      const hasUUIDs =
        existingSession.exercises.some(isUUID) ||
        existingSession.expandedExercises.some(isUUID) ||
        Object.keys(existingSession.inputDrafts || {}).some((k) => {
          const idx = k.lastIndexOf('_');
          const prefix = idx > 0 ? k.slice(0, idx) : k;
          return isUUID(prefix);
        });

      let sessionToApply = existingSession;

      if (hasUUIDs) {
        sessionToApply = cleanSessionUUIDs(existingSession, exercises, todaySets);
        workoutSessionStore.saveSession(sessionToApply, true);
      }

      const updatedTargets = { ...sessionToApply.targetSetCounts };
      sessionToApply.exercises.forEach((exName) => {
        const loggedCount = getSetsForExerciseToday(exName).length;
        if ((updatedTargets[exName] || 0) < loggedCount) {
          updatedTargets[exName] = loggedCount;
        }
      });

      setActiveRoutineName(sessionToApply.routineName);
      setActiveExercises(sessionToApply.exercises);
      setTargetSetCounts(updatedTargets);
      setTargetRepCounts(sessionToApply.targetRepCounts);
      setInputDrafts(sessionToApply.inputDrafts || {});
      setExpandedExercises(new Set(sessionToApply.expandedExercises));
      return;
    }

    const resolved = resolveRoutineAndExercises(
      workoutDate,
      todaySets,
      customTemplates,
      exercises
    );

    const isToday = workoutDate === getLocalDateStr(new Date());
    if (isToday) {
      const newSession = workoutSessionStore.getOrInitSession(targetUserId, workoutDate, {
        routineName: resolved.routineName,
        exercises: resolved.exercises,
        targetSetCounts: resolved.targetSets,
        targetRepCounts: resolved.targetReps,
      });
      setActiveRoutineName(newSession.routineName);
      setActiveExercises(newSession.exercises);
      setTargetSetCounts(newSession.targetSetCounts);
      setTargetRepCounts(newSession.targetRepCounts);
      setInputDrafts(newSession.inputDrafts || {});
      setExpandedExercises(new Set(newSession.expandedExercises));
    } else {
      setActiveRoutineName(resolved.routineName);
      setActiveExercises(resolved.exercises);
      setTargetSetCounts(resolved.targetSets);
      setTargetRepCounts(resolved.targetReps);
      setInputDrafts({});
      setExpandedExercises(resolved.exercises.length > 0 ? new Set([resolved.exercises[0]]) : new Set());
    }
  }, [workoutDate, targetUserId, templatesFetched, logsFetched, exercisesFetched, customTemplates, todaySets, exercises, getSetsForExerciseToday]);

  const toggleAccordion = useCallback((exName: string) => {
    setExpandedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(exName)) next.delete(exName);
      else next.add(exName);
      workoutSessionStore.setExpandedExercises(targetUserId, workoutDate, Array.from(next));
      return next;
    });
  }, [targetUserId, workoutDate]);

  const collapseExercise = useCallback((exName: string) => {
    setExpandedExercises((prev) => {
      const next = new Set(prev);
      next.delete(exName);
      workoutSessionStore.setExpandedExercises(targetUserId, workoutDate, Array.from(next));
      return next;
    });
  }, [targetUserId, workoutDate]);

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

  const handleSelectRoutine = async (routineName: string, selectedTemplate?: RoutineTemplate) => {
    manualSelectionDateRef.current = workoutDate;

    let resolvedExList: string[] = [];
    let resolvedTargets: Record<string, number> = {};
    let resolvedReps: Record<string, number> = {};

    if (routineName === 'Rest Day' || routineName === 'Free Workout') {
      setActiveRoutineName(routineName);
      setActiveExercises([]);
      setTargetSetCounts({});
      setTargetRepCounts({});
      setExpandedExercises(new Set());
    } else {
      const customTpl = selectedTemplate || findMatchingTemplate(customTemplates, routineName);
      const defTpl = findMatchingTemplate(DEFAULT_WORKOUT_TEMPLATES, routineName);

      let templateExercises = customTpl?.exercises;
      if (customTpl && templateExercises === undefined) {
        try {
          const detail = await fetchTemplateDetail(customTpl.id);
          templateExercises = detail?.exercises || [];
        } catch (err) {
          console.error('Failed to fetch template detail for selection:', err);
          templateExercises = [];
        }
      }

      const extracted = extractTemplateDetails(customTpl, defTpl, templateExercises, exercises);
      resolvedExList = extracted.resolvedExList;
      resolvedTargets = extracted.resolvedTargets;
      resolvedReps = extracted.resolvedReps;

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
      Promise.resolve(supabase.from('workouts').update({ name: routineName }).eq('id', workoutId))
        .catch((err: unknown) => {
          console.error('Failed to update workout name:', err);
        });
    }
  };

  const handleReloadScheduledRoutine = async () => {
    workoutSessionStore.deleteSession(targetUserId, workoutDate);
    manualSelectionDateRef.current = null;
    resolvedKeyRef.current = null;

    const dayAbbr = getDayOfWeekAbbr(workoutDate);
    const scheduledCustom = customTemplates.find((t) => t.days_of_week?.includes(dayAbbr));
    let customWithExercises = customTemplates;
    if (scheduledCustom && (!scheduledCustom.exercises || scheduledCustom.exercises.length === 0)) {
      try {
        const detail = await fetchTemplateDetail(scheduledCustom.id);
        if (detail?.exercises) {
          customWithExercises = customTemplates.map((t) =>
            t.id === scheduledCustom.id ? { ...t, exercises: detail.exercises } : t
          );
        }
      } catch (err) {
        console.error('Failed to fetch scheduled template detail on reload:', err);
      }
    }

    const resolved = resolveRoutineAndExercises(
      workoutDate,
      todaySets,
      customWithExercises,
      exercises
    );

    const isToday = workoutDate === getLocalDateStr(new Date());
    if (isToday) {
      const newSession = workoutSessionStore.getOrInitSession(targetUserId, workoutDate, {
        routineName: resolved.routineName,
        exercises: resolved.exercises,
        targetSetCounts: resolved.targetSets,
        targetRepCounts: resolved.targetReps,
      });
      setActiveRoutineName(newSession.routineName);
      setActiveExercises(newSession.exercises);
      setTargetSetCounts(newSession.targetSetCounts);
      setTargetRepCounts(newSession.targetRepCounts);
      setInputDrafts(newSession.inputDrafts || {});
      setExpandedExercises(new Set(newSession.expandedExercises));
    } else {
      setActiveRoutineName(resolved.routineName);
      setActiveExercises(resolved.exercises);
      setTargetSetCounts(resolved.targetSets);
      setTargetRepCounts(resolved.targetReps);
      setInputDrafts({});
      setExpandedExercises(resolved.exercises.length > 0 ? new Set([resolved.exercises[0]]) : new Set());
    }
  };

  const ensureSession = useCallback(() => {
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
  }, [targetUserId, workoutDate, activeRoutineName, activeExercises, targetSetCounts, targetRepCounts]);

  const handleAddExercise = (exerciseToAdd: string) => {
    if (!exerciseToAdd) return;
    ensureSession();
    setActiveExercises((prev) => {
      if (prev.includes(exerciseToAdd)) return prev;
      const next = [...prev, exerciseToAdd];
      workoutSessionStore.addExercise(targetUserId, workoutDate, exerciseToAdd, 3);
      return next;
    });
    setTargetSetCounts((prev) => ({ ...prev, [exerciseToAdd]: 3 }));
    setExpandedExercises((prev) => new Set(prev).add(exerciseToAdd));
  };

  const moveExercise = useCallback((index: number, direction: number) => {
    ensureSession();
    setActiveExercises((prev) => {
      const newIdx = index + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      const item = copy[index];
      copy[index] = copy[newIdx];
      copy[newIdx] = item;
      workoutSessionStore.reorderExercises(targetUserId, workoutDate, copy);
      return copy;
    });
  }, [ensureSession, targetUserId, workoutDate]);

  const removeExercise = useCallback((index: number) => {
    const exName = activeExercises[index];
    if (!exName) return;
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
  }, [activeExercises, ensureSession, targetUserId, workoutDate]);

  const restoreExercise = useCallback((removed: {
    exerciseName: string;
    index: number;
    targetSetCount: number;
    targetRepCount?: number;
    drafts: Record<string, SetDraftInput>;
  }) => {
    ensureSession();
    setActiveExercises((prev) => {
      if (prev.includes(removed.exerciseName)) return prev;
      const next = [...prev];
      const insertIdx = Math.min(Math.max(0, removed.index), next.length);
      next.splice(insertIdx, 0, removed.exerciseName);
      workoutSessionStore.reorderExercises(targetUserId, workoutDate, next);
      return next;
    });
    setTargetSetCounts((prev) => ({
      ...prev,
      [removed.exerciseName]: removed.targetSetCount,
    }));
    if (removed.targetRepCount !== undefined) {
      setTargetRepCounts((prev) => ({
        ...prev,
        [removed.exerciseName]: removed.targetRepCount!,
      }));
    }
    setInputDrafts((prev) => {
      const next = { ...prev, ...removed.drafts };
      Object.entries(removed.drafts).forEach(([k, d]) => {
        const idx = k.lastIndexOf('_');
        const sIdx = idx > 0 ? parseInt(k.slice(idx + 1), 10) : 1;
        workoutSessionStore.setDraftInput(targetUserId, workoutDate, removed.exerciseName, sIdx, d);
      });
      return next;
    });
  }, [ensureSession, targetUserId, workoutDate]);

  const adjustTargetSets = useCallback((exName: string, delta: number) => {
    const minSets = Math.max(1, getSetsForExerciseToday(exName).length);
    ensureSession();
    setTargetSetCounts((prev) => {
      const current = prev[exName] || 3;
      const next = Math.min(20, Math.max(minSets, current + delta));
      workoutSessionStore.updateTargetSets(targetUserId, workoutDate, exName, next);
      return { ...prev, [exName]: next };
    });
  }, [ensureSession, getSetsForExerciseToday, targetUserId, workoutDate]);

  const updateDraft = useCallback((
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
      const existing = prev[draftKey];
      const updated: SetDraftInput = {
        weight: field === 'weight' ? sanitized : existing?.weight,
        reps: field === 'reps' ? sanitized : existing?.reps,
      } as SetDraftInput;
      workoutSessionStore.setDraftInput(targetUserId, workoutDate, exName, setIndex, updated);
      return {
        ...prev,
        [draftKey]: updated,
      };
    });
  }, [ensureSession, targetUserId, workoutDate]);

  const handleClearWorkout = useCallback(() => {
    setActiveRoutineName('Free Workout');
    setActiveExercises([]);
    setTargetSetCounts({});
    setTargetRepCounts({});
    setInputDrafts({});
    manualSelectionDateRef.current = workoutDate;
    workoutSessionStore.clearWorkout(targetUserId, workoutDate);
  }, [targetUserId, workoutDate]);

  const isScheduledRoutineDirty = useMemo(() => {
    return checkIsScheduledRoutineDirty({
      workoutDate,
      activeRoutineName,
      activeExercises,
      customTemplates,
      exercises,
      inputDrafts,
      targetSetCounts,
      targetRepCounts,
    });
  }, [workoutDate, activeRoutineName, activeExercises, customTemplates, exercises, inputDrafts, targetSetCounts, targetRepCounts]);

  const isWholeWorkoutCompleted =
    activeExercises.length > 0 &&
    activeExercises.every((exName) => getSetsForExerciseToday(exName).length >= (targetSetCounts[exName] || 3));

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
      if (session.completedAt) {
        workoutSessionStore.reopenSession(targetUserId, workoutDate);
      }
    }
  }, [isWholeWorkoutCompleted, logsFetched, activeExercises.length, todaySets.length, workoutDate, targetUserId]);

  // Synchronous teardown on date switch or unmount
  useEffect(() => {
    return () => {
      workoutSessionStore.flushPendingWrites();
    };
  }, [workoutDate, targetUserId]);

  return {
    workoutDate,
    setWorkoutDate,
    activeRoutineName,
    setActiveRoutineName,
    activeExercises,
    setActiveExercises,
    targetSetCounts,
    setTargetSetCounts,
    targetRepCounts,
    setTargetRepCounts,
    expandedExercises,
    setExpandedExercises,
    inputDrafts,
    setInputDrafts,
    todaySets,
    getSetsForExerciseToday,
    toggleAccordion,
    collapseExercise,
    collapseCompleted,
    toggleAllAccordions,
    handleSelectRoutine,
    handleReloadScheduledRoutine,
    handleAddExercise,
    moveExercise,
    removeExercise,
    adjustTargetSets,
    updateDraft,
    handleClearWorkout,
    restoreExercise,
    isScheduledRoutineDirty,
    isWholeWorkoutCompleted,
  };
}

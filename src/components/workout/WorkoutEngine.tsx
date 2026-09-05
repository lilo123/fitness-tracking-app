import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type {
  WorkoutSet,
  Exercise,
  SetType,
  RoutineTemplate,
} from '../../types/database';
import {
  computeGhostSets,
  getExerciseBenchmarks,
  normalizeDateStr,
  formatShortDate,
  DEFAULT_EXERCISES_LIST,
  DEFAULT_WORKOUT_TEMPLATES,
} from '../../utils/ghostSets';
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
  Play,
  Pause,
  RotateCw,
  Trophy,
  Dumbbell,
  Bed,
  AlertCircle,
} from 'lucide-react';

export const WorkoutEngine: React.FC = () => {
  const { user } = useAuth();
  const { selectedAthleteId } = useCoach();
  const queryClient = useQueryClient();

  const targetUserId = selectedAthleteId || user?.id || '';

  const [workoutDate, setWorkoutDate] = useState<string>(() => {
    return normalizeDateStr(new Date().toISOString());
  });

  const [activeRoutineName, setActiveRoutineName] = useState<string>('Workout A (Push, Quads & Core)');
  const [activeExercises, setActiveExercises] = useState<string[]>([
    'Incline Bench Press',
    'Cable Lateral Raises',
    'Dips',
    'Leg Extension Machine',
    'Overhead Tricep Cable Pull',
    'Leg Raise',
  ]);

  const [targetSetCounts, setTargetSetCounts] = useState<Record<string, number>>({
    'Incline Bench Press': 4,
    'Cable Lateral Raises': 3,
    'Dips': 3,
    'Leg Extension Machine': 3,
    'Overhead Tricep Cable Pull': 3,
    'Leg Raise': 3,
  });

  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(
    () => new Set(['Incline Bench Press'])
  );

  // Ghost set form input drafts: { [exerciseName_setIndex]: { weight, reps, setType, rpe } }
  const [inputDrafts, setInputDrafts] = useState<
    Record<string, { weight: string; reps: string; setType: SetType; rpe: string }>
  >({});

  // Routine Selector Modal
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [selectedExerciseToAdd, setSelectedExerciseToAdd] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Rest Timer State (Timestamp-based drift calculation & background resilience)
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const timerEndTimestampRef = useRef<number | null>(null);

  const updateTimerDelta = useCallback(() => {
    if (!timerEndTimestampRef.current) return;
    const remainingMs = timerEndTimestampRef.current - Date.now();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    setTimerSeconds(remainingSec);
    if (remainingSec <= 0) {
      timerEndTimestampRef.current = null;
      setTimerActive(false);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!timerActive || !timerEndTimestampRef.current) return;
    const interval = setInterval(updateTimerDelta, 250);
    return () => clearInterval(interval);
  }, [timerActive, updateTimerDelta]);

  useEffect(() => {
    const handleSync = () => {
      if (timerActive && timerEndTimestampRef.current) {
        updateTimerDelta();
      }
    };
    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
    return () => {
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [timerActive, updateTimerDelta]);

  const startTimer = (seconds: number) => {
    timerEndTimestampRef.current = Date.now() + seconds * 1000;
    setTimerSeconds(seconds);
    setTimerActive(true);
  };

  const pauseTimer = () => {
    if (timerActive && timerEndTimestampRef.current) {
      const remainingMs = timerEndTimestampRef.current - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      timerEndTimestampRef.current = null;
      setTimerSeconds(remainingSec);
      setTimerActive(false);
    } else if (!timerActive && timerSeconds > 0) {
      timerEndTimestampRef.current = Date.now() + timerSeconds * 1000;
      setTimerActive(true);
    }
  };

  const addTimerSeconds = (additionalSeconds: number) => {
    const base = timerEndTimestampRef.current
      ? Math.max(0, Math.ceil((timerEndTimestampRef.current - Date.now()) / 1000))
      : timerSeconds;
    const newTotal = base + additionalSeconds;
    timerEndTimestampRef.current = Date.now() + newTotal * 1000;
    setTimerSeconds(newTotal);
    setTimerActive(true);
  };

  const stopTimer = () => {
    timerEndTimestampRef.current = null;
    setTimerSeconds(0);
    setTimerActive(false);
  };

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
  const { data: customTemplates = [] } = useQuery({
    queryKey: ['routine_templates', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      try {
        const { data, error } = await supabase
          .from('routine_templates')
          .select('*, exercises:template_exercises(*, exercise:exercises(name))')
          .or(`user_id.eq.${targetUserId},is_master.eq.true,assigned_to.eq.${targetUserId}`);
        if (error || !data) return [];
        return data as RoutineTemplate[];
      } catch {
        return [];
      }
    },
  });

  // Fetch workouts and sets for target user
  const { data: userLogs = [] } = useQuery({
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
            exercise_name: matched ? matched.name : s.exercise_id,
          };
        }) as (WorkoutSet & { workout_date: string })[];
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
      setType: SetType;
      rpe?: number | null;
      setIndex: number;
    }) => {
      const workoutId = await getOrCreateWorkout();

      // Resolve exercise ID
      const matchedEx = exercises.find(
        (e) => e.name.toLowerCase() === payload.exerciseName.toLowerCase() || e.id === payload.exerciseName
      );
      const exerciseId = matchedEx ? matchedEx.id : payload.exerciseName;

      // Insert set
      const { data: loggedSet, error: sErr } = await supabase
        .from('sets')
        .insert([
          {
            workout_id: workoutId,
            exercise_id: exerciseId,
            set_index: payload.setIndex,
            set_type: payload.setType,
            weight: payload.weight,
            reps: payload.reps,
            rpe: payload.rpe || null,
          },
        ])
        .select()
        .single();

      if (sErr) throw sErr;
      return loggedSet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      // Start a convenient 90s rest timer automatically
      startTimer(90);
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
        setType: SetType;
        rpe?: number | null;
        setIndex: number;
      }[]
    ) => {
      if (setsToLog.length === 0) return [];
      const workoutId = await getOrCreateWorkout();

      const payloads = setsToLog.map((s) => {
        const matchedEx = exercises.find(
          (e) => e.name.toLowerCase() === s.exerciseName.toLowerCase() || e.id === s.exerciseName
        );
        const exerciseId = matchedEx ? matchedEx.id : s.exerciseName;
        return {
          workout_id: workoutId,
          exercise_id: exerciseId,
          set_index: s.setIndex,
          set_type: s.setType,
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe || null,
        };
      });

      const { data, error } = await supabase.from('sets').insert(payloads).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_sets', targetUserId] });
      startTimer(90);
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

  const toggleAccordion = (exName: string) => {
    setExpandedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(exName)) next.delete(exName);
      else next.add(exName);
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
    setExpandedExercises(next);
  };

  const toggleAllAccordions = (expand: boolean) => {
    if (expand) {
      setExpandedExercises(new Set(activeExercises));
    } else {
      setExpandedExercises(new Set());
    }
  };

  const handleSelectRoutine = (routineName: string) => {
    setActiveRoutineName(routineName);
    setShowRoutineModal(false);

    if (routineName === 'Rest Day') {
      setActiveExercises([]);
      setTargetSetCounts({});
      return;
    }

    if (routineName === 'Free Workout') {
      setActiveExercises([]);
      setTargetSetCounts({});
      return;
    }

    // Check default templates
    const defTpl = DEFAULT_WORKOUT_TEMPLATES.find((t) => t.name === routineName);
    if (defTpl) {
      setActiveExercises([...defTpl.exercises]);
      setTargetSetCounts({ ...defTpl.targetSets });
      setExpandedExercises(new Set([defTpl.exercises[0]]));
      return;
    }

    // Check custom DB templates
    const customTpl = customTemplates.find((t) => t.name === routineName);
    if (customTpl && customTpl.exercises) {
      const exList = customTpl.exercises
        .sort((a, b) => a.order_index - b.order_index)
        .map((e) => e.exercise?.name || e.exercise_name || exercises.find((ex) => ex.id === e.exercise_id)?.name || e.exercise_id);
      const targets: Record<string, number> = {};
      customTpl.exercises.forEach((e) => {
        const resolvedName = e.exercise?.name || e.exercise_name || exercises.find((ex) => ex.id === e.exercise_id)?.name || e.exercise_id;
        targets[resolvedName] = e.target_sets || 3;
      });
      setActiveExercises(exList);
      setTargetSetCounts(targets);
      if (exList.length > 0) setExpandedExercises(new Set([exList[0]]));
    }
  };

  const handleAddExercise = () => {
    if (!selectedExerciseToAdd) return;
    if (!activeExercises.includes(selectedExerciseToAdd)) {
      setActiveExercises((prev) => [...prev, selectedExerciseToAdd]);
      setTargetSetCounts((prev) => ({ ...prev, [selectedExerciseToAdd]: 3 }));
      setExpandedExercises((prev) => new Set(prev).add(selectedExerciseToAdd));
    }
    setSelectedExerciseToAdd('');
  };

  const moveExercise = (index: number, direction: number) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= activeExercises.length) return;
    const copy = [...activeExercises];
    const item = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = item;
    setActiveExercises(copy);
  };

  const removeExercise = (index: number) => {
    const exName = activeExercises[index];
    setActiveExercises((prev) => prev.filter((_, i) => i !== index));
    setTargetSetCounts((prev) => {
      const copy = { ...prev };
      delete copy[exName];
      return copy;
    });
  };

  const adjustTargetSets = (exName: string, delta: number) => {
    setTargetSetCounts((prev) => {
      const current = prev[exName] || 3;
      const next = Math.max(1, current + delta);
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

    const weightVal = draft?.weight !== undefined && draft.weight !== ''
      ? Number(draft.weight)
      : typeof ghostValues.weight === 'number'
      ? ghostValues.weight
      : 0;

    const repsVal = draft?.reps !== undefined && draft.reps !== ''
      ? Number(draft.reps)
      : typeof ghostValues.reps === 'number'
      ? ghostValues.reps
      : 0;

    if (weightVal <= 0 && repsVal <= 0) {
      setMutationError('Please enter weight and reps or use previous set values.');
      return;
    }

    const setType: SetType = draft?.setType || 'working';
    const rpe = draft?.rpe ? Number(draft.rpe) : null;

    logSetMutation.mutate({
      exerciseName: exName,
      weight: weightVal,
      reps: repsVal,
      setType,
      rpe,
      setIndex,
    });

    // Clear draft
    setInputDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const updateDraft = (
    exName: string,
    setIndex: number,
    field: 'weight' | 'reps' | 'setType' | 'rpe',
    value: string
  ) => {
    const draftKey = `${exName}_${setIndex}`;
    setInputDrafts((prev) => ({
      ...prev,
      [draftKey]: {
        weight: prev[draftKey]?.weight || '',
        reps: prev[draftKey]?.reps || '',
        setType: prev[draftKey]?.setType || 'working',
        rpe: prev[draftKey]?.rpe || '',
        [field]: value,
      },
    }));
  };

  const handleBatchLogExercise = (
    exName: string,
    targetCount: number,
    ghostValues: { weight: number | ''; reps: number | '' }[],
    setsToday: WorkoutSet[]
  ) => {
    const unloggedSets = [];
    for (let rowIdx = setsToday.length; rowIdx < targetCount; rowIdx++) {
      const setIndex = rowIdx + 1;
      const ghost = ghostValues[rowIdx] || { weight: '', reps: '' };
      const draftKey = `${exName}_${setIndex}`;
      const draft = inputDrafts[draftKey];

      const weightVal = draft?.weight !== undefined && draft.weight !== ''
        ? Number(draft.weight)
        : typeof ghost.weight === 'number'
        ? ghost.weight
        : 100;

      const repsVal = draft?.reps !== undefined && draft.reps !== ''
        ? Number(draft.reps)
        : typeof ghost.reps === 'number'
        ? ghost.reps
        : 10;

      const setType: SetType = draft?.setType || 'working';
      const rpe = draft?.rpe ? Number(draft.rpe) : null;

      unloggedSets.push({
        exerciseName: exName,
        weight: weightVal,
        reps: repsVal,
        setType,
        rpe,
        setIndex,
      });
    }

    if (unloggedSets.length > 0) {
      batchLogSetsMutation.mutate(unloggedSets);
    }
  };

  const handleFinishWorkout = () => {
    const allPendingSets: {
      exerciseName: string;
      weight: number;
      reps: number;
      setType: SetType;
      rpe?: number | null;
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

        const weightVal = draft?.weight !== undefined && draft.weight !== ''
          ? Number(draft.weight)
          : typeof ghost.weight === 'number'
          ? ghost.weight
          : 100;

        const repsVal = draft?.reps !== undefined && draft.reps !== ''
          ? Number(draft.reps)
          : typeof ghost.reps === 'number'
          ? ghost.reps
          : 10;

        const setType: SetType = draft?.setType || 'working';
        const rpe = draft?.rpe ? Number(draft.rpe) : null;

        allPendingSets.push({
          exerciseName: exName,
          weight: weightVal,
          reps: repsVal,
          setType,
          rpe,
          setIndex,
        });
      }
    }

    if (allPendingSets.length > 0) {
      batchLogSetsMutation.mutate(allPendingSets);
    }
  };

  const allExpanded =
    activeExercises.length > 0 && activeExercises.every((e) => expandedExercises.has(e));

  const isWholeWorkoutCompleted =
    activeExercises.length > 0 &&
    activeExercises.every((exName) => getSetsForExerciseToday(exName).length >= (targetSetCounts[exName] || 3));

  const todayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

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
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">
              Routine:
            </span>
            <button
              onClick={() => setShowRoutineModal(true)}
              className="bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/80 hover:border-cyan-500/50 text-white text-xs font-bold px-3 py-1.5 min-h-[44px] rounded-xl flex items-center gap-2 transition-all shadow-sm"
              data-testid="routine-select-btn"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="truncate max-w-[150px] sm:max-w-[200px]">{activeRoutineName}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400 ml-0.5" />
            </button>

            <button
              type="button"
              onClick={() => (timerSeconds > 0 ? pauseTimer() : startTimer(90))}
              className="bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/80 hover:border-cyan-500/50 text-cyan-300 text-xs font-bold px-3 py-1.5 min-h-[44px] rounded-xl flex items-center gap-1.5 transition-all shadow-sm touch-manipulation"
              title="Rest Timer"
              data-testid="rest-timer-btn"
            >
              <Timer className="w-3.5 h-3.5 text-cyan-400" />
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
              onChange={(e) => setWorkoutDate(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-cyan-400 rounded-xl px-2.5 py-1.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none shadow-inner cursor-pointer"
              data-testid="workout-date-input"
            />
            <button
              onClick={() => {
                if (confirm("Clear all exercises from today's workout?")) {
                  setActiveExercises([]);
                  setTargetSetCounts({});
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

              {DEFAULT_WORKOUT_TEMPLATES.map((tpl) => (
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
                      {tpl.days.includes(todayAbbr) && (
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

              {customTemplates.map((tpl) => {
                const isScheduledToday = tpl.days_of_week && tpl.days_of_week.includes(todayAbbr);
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
                        <span>{tpl.name} (Custom)</span>
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

                // Compute ghost set placeholders for this exercise
                const ghostValues = computeGhostSets(exName, targetCount, userLogs, workoutDate);
                const totalRows = Math.max(targetCount, setsToday.length);

                return (
                  <div
                    key={exName}
                    className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-4 shadow-xl text-white transition-all"
                    data-testid={`exercise-card-${exIndex}`}
                  >
                    {/* Card Header */}
                    <div
                      onClick={() => toggleAccordion(exName)}
                      className="flex items-center justify-between cursor-pointer select-none pb-1"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span className="w-7 h-7 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-xs font-bold text-cyan-400 shrink-0 shadow-sm">
                          {exIndex + 1}
                        </span>
                        <span className="font-extrabold text-white text-base tracking-tight truncate block">
                          {exName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {isCompleted ? (
                          <span className="inline-flex items-center text-xs font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-full shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                            <Check className="w-3 h-3 mr-1" />
                            <span>
                              {setsToday.length}/{targetCount} Sets
                            </span>
                          </span>
                        ) : setsToday.length > 0 ? (
                          <span className="inline-flex items-center text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-1 rounded-full shrink-0">
                            <span>
                              {setsToday.length}/{targetCount} Sets
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-bold bg-zinc-800 border border-zinc-700/80 text-zinc-400 px-2.5 py-1 rounded-full shrink-0">
                            <span>0/{targetCount} Sets</span>
                          </span>
                        )}

                        {/* Reorder and Delete controls */}
                        {exIndex > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveExercise(exIndex, -1);
                            }}
                            className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation"
                            title="Move up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                        )}

                        {exIndex < activeExercises.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveExercise(exIndex, 1);
                            }}
                            className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition touch-manipulation"
                            title="Move down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeExercise(exIndex);
                          }}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-800/80 hover:bg-rose-500/20 border border-zinc-700/80 text-zinc-500 hover:text-rose-400 flex items-center justify-center transition touch-manipulation"
                          title="Remove from workout"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <ChevronDown
                          className={`w-4 h-4 text-zinc-400 transition-transform ${
                            isExpanded ? 'rotate-180 text-cyan-400' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Benchmark & Target Set Sub-bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-zinc-800/60 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {benchmarks.lastSession ? (
                          <span
                            className="inline-flex items-center text-[11px] bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 px-2.5 py-0.5 rounded-full font-medium"
                            title={`Last session (${formatShortDate(benchmarks.lastSession.date)})`}
                          >
                            Last ({formatShortDate(benchmarks.lastSession.date)}):{' '}
                            {benchmarks.lastSession.summaryText}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500 font-mono">No prior session</span>
                        )}

                        {benchmarks.pr && (
                          <span className="inline-flex items-center text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-full font-bold">
                            <Trophy className="w-3 h-3 mr-1 text-amber-400" />
                            PR: {benchmarks.pr.weight}×{benchmarks.pr.reps}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Target:</span>
                        <button
                          type="button"
                          onClick={() => adjustTargetSets(exName, -1)}
                          className="min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center font-bold text-sm touch-manipulation"
                          title="Decrease target sets"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold text-white text-xs px-1">{targetCount}</span>
                        <button
                          type="button"
                          onClick={() => adjustTargetSets(exName, 1)}
                          className="min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center font-bold text-sm touch-manipulation"
                          title="Increase target sets"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Accordion Body: Sets & Ghost Placeholders */}
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
                        <div className="grid grid-cols-12 gap-1 text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 px-2">
                          <div className="col-span-1 text-center">Set</div>
                          <div className="col-span-2 text-center">Previous</div>
                          <div className="col-span-2 text-center">Type</div>
                          <div className="col-span-5 text-center">Weight × Reps × RPE</div>
                          <div className="col-span-2 text-right">Action</div>
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
                            setType: 'working' as SetType,
                            rpe: '',
                          };

                          if (loggedSet) {
                            return (
                              <div
                                key={loggedSet.id || rowIdx}
                                className="grid grid-cols-12 gap-1 sm:gap-2 py-2.5 px-2 rounded-xl items-center bg-zinc-950/60 border border-zinc-800/80 text-xs transition"
                              >
                                <div className="col-span-1 font-mono font-bold text-cyan-400 text-center flex items-center justify-center">
                                  <span className="w-6 h-6 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                                    {setIndex}
                                  </span>
                                </div>
                                <div className="col-span-2 text-zinc-500 font-mono text-center truncate px-0.5 text-[11px]">
                                  {ghost.hintText}
                                </div>
                                <div className="col-span-2 flex items-center justify-center">
                                  {loggedSet.set_type === 'warmup' ? (
                                    <span className="text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded uppercase">
                                      Warm
                                    </span>
                                  ) : loggedSet.set_type === 'drop' ? (
                                    <span className="text-[10px] font-bold bg-purple-500/15 border border-purple-500/30 text-purple-400 px-1.5 py-0.5 rounded uppercase">
                                      Drop
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium text-zinc-500 font-mono">
                                      Work
                                    </span>
                                  )}
                                </div>
                                <div className="col-span-5 font-mono font-bold text-white text-center flex items-center justify-center gap-1.5">
                                  <span className="text-sm text-cyan-300 font-extrabold">
                                    {loggedSet.weight}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 uppercase">lbs</span>
                                  <span className="text-zinc-600 font-normal">×</span>
                                  <span className="text-sm text-cyan-300 font-extrabold">
                                    {loggedSet.reps}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 uppercase">reps</span>
                                  {loggedSet.rpe && (
                                    <span className="text-[10px] bg-zinc-800 text-amber-300 px-1.5 py-0.5 rounded font-mono">
                                      @{loggedSet.rpe}
                                    </span>
                                  )}
                                </div>
                                <div className="col-span-2 flex justify-end">
                                  <button
                                    onClick={() => loggedSet.id && deleteSetMutation.mutate(loggedSet.id)}
                                    className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:w-8 sm:h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center transition active:scale-95 touch-manipulation"
                                    title="Delete set"
                                    data-testid={`delete-set-btn-${exIndex}-${rowIdx}`}
                                  >
                                    <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div
                                key={rowIdx}
                                className="grid grid-cols-12 gap-1 sm:gap-2 py-2 px-2 rounded-xl items-center bg-zinc-900/40 border border-dashed border-zinc-800/80 text-xs hover:border-zinc-700/80 transition"
                              >
                                <div className="col-span-1 font-mono font-bold text-zinc-500 text-center flex items-center justify-center">
                                  <span className="w-6 h-6 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
                                    {setIndex}
                                  </span>
                                </div>
                                <div className="col-span-2 text-zinc-500 font-mono text-center truncate px-0.5 text-[11px]">
                                  {ghost.hintText}
                                </div>
                                <div className="col-span-2 flex items-center justify-center">
                                  <select
                                    value={draft.setType}
                                    onChange={(e) =>
                                      updateDraft(exName, setIndex, 'setType', e.target.value as SetType)
                                    }
                                    className="bg-zinc-950 border border-zinc-800 rounded-lg text-base sm:text-xs font-bold text-zinc-300 py-1.5 px-1 outline-none cursor-pointer"
                                    data-testid={`set-type-select-${exIndex}-${rowIdx}`}
                                    title="Set Type"
                                  >
                                    <option value="working">Work</option>
                                    <option value="warmup">Warm</option>
                                    <option value="drop">Drop</option>
                                  </select>
                                </div>
                                <div className="col-span-5 flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder={ghost.weight ? ghost.weight.toString() : 'lbs'}
                                    value={draft.weight}
                                    onChange={(e) =>
                                      updateDraft(exName, setIndex, 'weight', e.target.value)
                                    }
                                    className="w-14 sm:w-14 bg-zinc-950 border border-zinc-800 focus:border-cyan-500 text-white rounded-lg py-1.5 px-1 text-center font-mono font-bold text-base sm:text-xs outline-none shadow-inner"
                                    data-testid={`ghost-weight-${exIndex}-${rowIdx}`}
                                  />
                                  <span className="text-zinc-600 font-bold">×</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    placeholder={ghost.reps ? ghost.reps.toString() : 'reps'}
                                    value={draft.reps}
                                    onChange={(e) =>
                                      updateDraft(exName, setIndex, 'reps', e.target.value)
                                    }
                                    className="w-12 sm:w-12 bg-zinc-950 border border-zinc-800 focus:border-cyan-500 text-white rounded-lg py-1.5 px-1 text-center font-mono font-bold text-base sm:text-xs outline-none shadow-inner"
                                    data-testid={`ghost-reps-${exIndex}-${rowIdx}`}
                                  />
                                  <input
                                    type="number"
                                    step="0.5"
                                    inputMode="decimal"
                                    placeholder="RPE"
                                    value={draft.rpe}
                                    onChange={(e) =>
                                      updateDraft(exName, setIndex, 'rpe', e.target.value)
                                    }
                                    className="w-12 sm:w-12 bg-zinc-950 border border-zinc-800 focus:border-cyan-500 text-amber-300 rounded-lg py-1.5 px-1 text-center font-mono font-semibold text-base sm:text-xs outline-none shadow-inner"
                                    data-testid={`rpe-input-${exIndex}-${rowIdx}`}
                                    title="RPE (Rate of Perceived Exertion 1-10)"
                                  />
                                </div>
                                <div className="col-span-2 flex justify-end">
                                  <button
                                    onClick={() => handleCommitSet(exName, setIndex, ghost)}
                                    disabled={logSetMutation.isPending || batchLogSetsMutation.isPending}
                                    className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:w-auto sm:h-8 sm:px-2.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-bold border border-cyan-500/40 flex items-center justify-center gap-1 transition shadow-[0_0_10px_rgba(6,182,212,0.1)] active:scale-95 shrink-0 disabled:opacity-50 touch-manipulation"
                                    title="Commit Set (One-tap)"
                                    data-testid={`commit-set-btn-${exIndex}-${rowIdx}`}
                                  >
                                    <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    <span className="hidden sm:inline text-xs">Log</span>
                                  </button>
                                </div>
                              </div>
                            );
                          }
                        })}

                        {/* Batch Log Button inside accordion if unlogged sets remain */}
                        {!isCompleted && (
                          <div className="pt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleBatchLogExercise(exName, targetCount, ghostValues, setsToday)}
                              disabled={batchLogSetsMutation.isPending}
                              className="text-xs font-bold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-3 py-2 min-h-[36px] rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                              data-testid={`batch-log-exercise-btn-${exIndex}`}
                            >
                              <Check className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Log All Sets for {exName}</span>
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
          <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-4 shadow-xl">
            <div className="text-xs font-extrabold uppercase tracking-widest text-zinc-400 mb-2.5 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-cyan-400" /> Add Exercise
            </div>
            <div className="flex gap-2">
              <select
                value={selectedExerciseToAdd}
                onChange={(e) => setSelectedExerciseToAdd(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
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
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black px-4 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-wider shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all active:scale-95 disabled:opacity-50"
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

      {/* Rest Timer Sticky Floating Bottom Pill */}
      {timerSeconds > 0 && (
        <div
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-50 max-w-lg mx-auto bg-zinc-900/95 backdrop-blur-xl border border-cyan-500/50 rounded-2xl p-3 flex items-center justify-between shadow-[0_4px_25px_rgba(6,182,212,0.3)] animate-pulse"
          data-testid="rest-timer-pill"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <Timer className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 font-bold">
                Rest Timer
              </div>
              <div className="text-xl font-black font-mono text-white" data-testid="rest-timer-display">
                {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={pauseTimer}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-cyan-300 flex items-center justify-center transition"
              title={timerActive ? 'Pause timer' : 'Resume timer'}
            >
              {timerActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => addTimerSeconds(90)}
              className="min-w-[44px] min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition"
              title="Add 90 seconds"
            >
              +90s
            </button>
            <button
              type="button"
              onClick={stopTimer}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center transition"
              title="Stop timer"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

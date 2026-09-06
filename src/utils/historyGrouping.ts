import type { WorkoutSet, Exercise } from '../types/database';

export interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  bodyPart: string;
  sets: (WorkoutSet & { workout_date: string; workout_name: string })[];
  totalVolume: number;
}

export function groupSessionSetsByExercise(
  sets: (WorkoutSet & { workout_date: string; workout_name: string })[],
  exercises: Exercise[]
): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  const groupMap = new Map<string, ExerciseGroup>();

  sets.forEach((set) => {
    const rawExId = set.exercise_id || '';
    const rawExName = (set as any).exercise_name || '';
    const matched = exercises.find(
      (e) =>
        (rawExId && (e.id === rawExId || e.name.toLowerCase() === rawExId.toLowerCase())) ||
        (rawExName && e.name.toLowerCase() === rawExName.toLowerCase())
    );
    const exName = matched ? matched.name : rawExName || rawExId || 'Unknown Exercise';
    const bodyPart = matched?.body_part || 'Other';
    const volume = (Number(set.weight) || 0) * (Number(set.reps) || 0);

    if (!groupMap.has(exName)) {
      const group: ExerciseGroup = {
        exerciseId: rawExId || (matched ? matched.id : exName),
        exerciseName: exName,
        bodyPart,
        sets: [],
        totalVolume: 0,
      };
      groupMap.set(exName, group);
      groups.push(group);
    }

    const group = groupMap.get(exName)!;
    group.sets.push(set);
    group.totalVolume += volume;
  });

  groups.forEach((g) => {
    g.sets.sort((a, b) => {
      const idxDiff = (a.set_index ?? 0) - (b.set_index ?? 0);
      if (idxDiff !== 0) return idxDiff;
      if (a.created_at && b.created_at) return a.created_at.localeCompare(b.created_at);
      return 0;
    });
  });

  return groups;
}

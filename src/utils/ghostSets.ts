import type { WorkoutSet, GhostSetValues, ExerciseBenchmarks } from '../types/database';

export function normalizeDateStr(val: string | Date | null | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return val.slice(0, 10);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val);
}

/**
 * Returns local YYYY-MM-DD string for a given Date or today.
 */
export function getLocalDateStr(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Timezone-safe local day of week abbreviation extractor.
 * Avoids UTC date parsing shifts where UTC midnight becomes previous day in US time zones.
 */
export function getDayOfWeekAbbr(dateStr: string): string {
  const norm = normalizeDateStr(dateStr);
  if (!norm) return '';
  const [year, month, day] = norm.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';
  const localDate = new Date(year, month - 1, day);
  if (
    isNaN(localDate.getTime()) ||
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return '';
  }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[localDate.getDay()] || '';
}

export function formatShortDate(isoDateStr: string): string {
  if (!isoDateStr || typeof isoDateStr !== 'string') return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = parseInt(parts[1], 10) - 1;
  const monthStr = months[mIdx] || parts[1];
  const dayStr = parseInt(parts[2], 10);
  return `${monthStr} ${dayStr}`;
}

export function computeGhostSets(
  exerciseId: string,
  targetSetCount: number,
  allSets: (WorkoutSet & { workout_date?: string; date?: string })[],
  currentDateStr?: string
): GhostSetValues[] {
  const normCurrentDate = currentDateStr ? normalizeDateStr(currentDateStr) : '';

  // Filter sets for this exercise occurring before or on previous dates (excluding today's active session if specified)
  const pastSets = allSets.filter((s) => {
    const matchesId = s.exercise_id === exerciseId;
    const matchesName = Boolean(s.exercise_name && s.exercise_name.toLowerCase() === exerciseId.toLowerCase());
    if (!matchesId && !matchesName) return false;
    if (s.weight == null || s.reps == null || isNaN(Number(s.weight)) || isNaN(Number(s.reps))) return false;
    const setDate = normalizeDateStr(s.workout_date || s.date || s.created_at);
    if (!setDate) return false;
    if (normCurrentDate && setDate >= normCurrentDate) return false;
    return true;
  });

  if (pastSets.length === 0) {
    return Array.from({ length: targetSetCount }, () => ({
      weight: '',
      reps: '',
      hintText: '—',
      isFromPrevious: false,
    }));
  }

  // Sort dates descending to find most recent session
  const dates = Array.from(
    new Set(pastSets.map((s) => normalizeDateStr(s.workout_date || s.date || s.created_at)))
  ).sort((a, b) => b.localeCompare(a));

  const mostRecentDate = dates[0];
  const sessionSets = pastSets
    .filter((s) => normalizeDateStr(s.workout_date || s.date || s.created_at) === mostRecentDate)
    .sort((a, b) => (a.set_index || 0) - (b.set_index || 0));

  // Prefer working sets, but fallback to all sets if no working sets
  const workingSets = sessionSets.filter((s) => s.set_type === 'working' || !s.set_type);
  const candidateSets = workingSets.length > 0 ? workingSets : sessionSets;

  const results: GhostSetValues[] = [];

  for (let i = 0; i < targetSetCount; i++) {
    if (i < candidateSets.length) {
      const prev = candidateSets[i];
      results.push({
        weight: prev.weight,
        reps: prev.reps,
        hintText: `${prev.weight} lbs × ${prev.reps}`,
        isFromPrevious: true,
      });
    } else if (candidateSets.length > 0) {
      // Set expansion: inherit the last available set's values
      const lastAvailable = candidateSets[candidateSets.length - 1];
      results.push({
        weight: lastAvailable.weight,
        reps: lastAvailable.reps,
        hintText: `${lastAvailable.weight} lbs × ${lastAvailable.reps}`,
        isFromPrevious: true,
      });
    } else {
      results.push({
        weight: '',
        reps: '',
        hintText: '—',
        isFromPrevious: false,
      });
    }
  }

  return results;
}

export function getExerciseBenchmarks(
  exerciseId: string,
  allSets: (WorkoutSet & { workout_date?: string; date?: string })[],
  currentDateStr?: string
): ExerciseBenchmarks {
  const normCurrentDate = currentDateStr ? normalizeDateStr(currentDateStr) : '';

  const validSets = allSets.filter((s) => {
    const matchesId = s.exercise_id === exerciseId;
    const matchesName = Boolean(s.exercise_name && s.exercise_name.toLowerCase() === exerciseId.toLowerCase());
    if (!matchesId && !matchesName) return false;
    if (s.weight == null || s.reps == null) return false;
    return true;
  });

  // Strict session boundary: prior sessions only (excluding today)
  const priorSets = validSets.filter((s) => {
    const setDate = normalizeDateStr(s.workout_date || s.date || s.created_at);
    if (!setDate) return false;
    if (normCurrentDate && setDate >= normCurrentDate) return false;
    return true;
  });

  // All historical sets up to and including today for PR calculation
  const allTimeSets = validSets.filter((s) => {
    const setDate = normalizeDateStr(s.workout_date || s.date || s.created_at);
    if (!setDate) return false;
    if (normCurrentDate && setDate > normCurrentDate) return false;
    return true;
  });

  // Find last session from priorSets
  const dates = Array.from(
    new Set(priorSets.map((s) => normalizeDateStr(s.workout_date || s.date || s.created_at)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  let lastSession: ExerciseBenchmarks['lastSession'] = null;
  if (dates.length > 0) {
    const lastDate = dates[0];
    const sessionSets = priorSets
      .filter((s) => normalizeDateStr(s.workout_date || s.date || s.created_at) === lastDate)
      .sort((a, b) => (a.set_index || 0) - (b.set_index || 0));

    const summaryText = sessionSets.map((s) => `${s.weight}×${s.reps}`).join(', ');
    lastSession = {
      date: lastDate,
      summaryText,
      sets: sessionSets,
    };
  }

  // Compute PR from allTimeSets (max weight, tie-break max reps)
  let bestSet: (WorkoutSet & { workout_date?: string; date?: string }) | null = null;
  for (const s of allTimeSets) {
    const weight = Number(s.weight) || 0;
    const reps = Number(s.reps) || 0;
    if (!bestSet) {
      bestSet = s;
      continue;
    }
    const bestWeight = Number(bestSet.weight) || 0;
    const bestReps = Number(bestSet.reps) || 0;

    if (weight > bestWeight || (weight === bestWeight && reps > bestReps)) {
      bestSet = s;
    }
  }

  const pr = bestSet
    ? {
        weight: Number(bestSet.weight),
        reps: Number(bestSet.reps),
        date: normalizeDateStr(bestSet.workout_date || bestSet.date || bestSet.created_at),
      }
    : null;

  return { lastSession, pr };
}

export const DEFAULT_EXERCISES_LIST = [
  { id: 'e0000000-0000-0000-0000-000000000001', name: 'Incline Bench Press', body_part: 'Chest' },
  { id: 'e0000000-0000-0000-0000-000000000002', name: 'Cable Lateral Raises', body_part: 'Shoulders' },
  { id: 'e0000000-0000-0000-0000-000000000003', name: 'Dips', body_part: 'Chest / Triceps' },
  { id: 'e0000000-0000-0000-0000-000000000004', name: 'Leg Extension Machine', body_part: 'Legs' },
  { id: 'e0000000-0000-0000-0000-000000000005', name: 'Overhead Tricep Cable Pull', body_part: 'Arms' },
  { id: 'e0000000-0000-0000-0000-000000000006', name: 'Leg Raise', body_part: 'Core' },
  { id: 'e0000000-0000-0000-0000-000000000007', name: 'Lat Pull Down', body_part: 'Back' },
  { id: 'e0000000-0000-0000-0000-000000000008', name: 'Seated Cable Row', body_part: 'Back' },
  { id: 'e0000000-0000-0000-0000-000000000009', name: 'Inclined Bicep Curl', body_part: 'Arms' },
  { id: 'e0000000-0000-0000-0000-000000000010', name: 'Leg Curl', body_part: 'Legs' },
  { id: 'e0000000-0000-0000-0000-000000000011', name: 'Face Pulls', body_part: 'Shoulders' },
  { id: 'e0000000-0000-0000-0000-000000000012', name: 'Weighted Sit-Up', body_part: 'Core' },
];

export interface WorkoutTemplateDefinition {
  name: string;
  days: string[];
  exercises: string[];
  targetSets: Record<string, number>;
  targetReps?: Record<string, number>;
}

export const DEFAULT_WORKOUT_TEMPLATES: WorkoutTemplateDefinition[] = [
  {
    name: 'Push, Quads, & Core - Reduced',
    days: ['Mon', 'Thu'],
    exercises: [
      'Incline Bench Press',
      'Cable Lateral Raises',
      'Dips',
      'Leg Extension Machine',
      'Overhead Tricep Cable Pull',
    ],
    targetSets: {
      'Incline Bench Press': 4,
      'Cable Lateral Raises': 3,
      'Dips': 3,
      'Leg Extension Machine': 3,
      'Overhead Tricep Cable Pull': 3,
    },
    targetReps: {
      'Incline Bench Press': 8,
      'Cable Lateral Raises': 12,
      'Dips': 10,
      'Leg Extension Machine': 12,
      'Overhead Tricep Cable Pull': 12,
    },
  },
  {
    name: 'Pull, Hamstring, & Core - Reduced',
    days: ['Tue', 'Fri'],
    exercises: [
      'Lat Pull Down',
      'Seated Cable Row',
      'Inclined Bicep Curl',
      'Leg Curl',
      'Face Pulls',
    ],
    targetSets: {
      'Lat Pull Down': 4,
      'Seated Cable Row': 3,
      'Inclined Bicep Curl': 3,
      'Leg Curl': 3,
      'Face Pulls': 3,
    },
    targetReps: {
      'Lat Pull Down': 10,
      'Seated Cable Row': 10,
      'Inclined Bicep Curl': 12,
      'Leg Curl': 12,
      'Face Pulls': 15,
    },
  },
  {
    name: 'Workout A (Push, Quads & Core)',
    days: [],
    exercises: [
      'Incline Bench Press',
      'Cable Lateral Raises',
      'Dips',
      'Leg Extension Machine',
      'Overhead Tricep Cable Pull',
      'Leg Raise',
    ],
    targetSets: {
      'Incline Bench Press': 4,
      'Cable Lateral Raises': 3,
      'Dips': 3,
      'Leg Extension Machine': 3,
      'Overhead Tricep Cable Pull': 3,
      'Leg Raise': 3,
    },
    targetReps: {
      'Incline Bench Press': 8,
      'Cable Lateral Raises': 12,
      'Dips': 10,
      'Leg Extension Machine': 12,
      'Overhead Tricep Cable Pull': 12,
      'Leg Raise': 15,
    },
  },
  {
    name: 'Workout B (Pull, Hamstrings & Core)',
    days: [],
    exercises: [
      'Lat Pull Down',
      'Seated Cable Row',
      'Inclined Bicep Curl',
      'Leg Curl',
      'Face Pulls',
      'Weighted Sit-Up',
    ],
    targetSets: {
      'Lat Pull Down': 4,
      'Seated Cable Row': 3,
      'Inclined Bicep Curl': 3,
      'Leg Curl': 3,
      'Face Pulls': 3,
      'Weighted Sit-Up': 3,
    },
    targetReps: {
      'Lat Pull Down': 10,
      'Seated Cable Row': 10,
      'Inclined Bicep Curl': 12,
      'Leg Curl': 12,
      'Face Pulls': 15,
      'Weighted Sit-Up': 15,
    },
  },
];

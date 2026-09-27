/**
 * Sets & Workouts Data Layer Writers (P2 / RD-4 / RD-5 / W19 / W40 / W41)
 *
 * Guarantees:
 * 1. Sets are always resolved and written by exercise_id UUID (never by name).
 * 2. Next set_index is derived as max(set_index)+1 from existing sets (W19).
 * 3. Workouts are strictly scoped to the user's local civil date (YYYY-MM-DD).
 * 4. Concurrent getOrCreateWorkout calls safely resolve to a single row via
 *    the unique (user_id, workout_date) constraint and select-after-23505 recovery (W41).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface InsertSetPayload {
  exerciseId: string;
  weight: number;
  reps: number;
  setIndex?: number;
  setType?: 'working' | 'warmup' | 'drop';
  rpe?: number | null;
}

export interface LoggedSetResult {
  id: string;
  workout_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  set_index: number;
  set_type: string;
  rpe: number | null;
  created_at: string;
}

/**
 * Derives the next set_index as max(set_index) + 1 from logged sets.
 * Prevents duplicate set_index when earlier sets in the session were deleted (W19).
 */
export function getNextSetIndex(existingSets: Array<{ set_index?: number | null }>): number {
  if (!existingSets || existingSets.length === 0) return 1;
  let maxIndex = 0;
  for (const s of existingSets) {
    const idx = Number(s?.set_index);
    if (!isNaN(idx) && idx > maxIndex) {
      maxIndex = idx;
    }
  }
  return maxIndex + 1;
}

/**
 * Gets or creates the unique workout session row for a user on a given civil date.
 * Handles concurrent insert races (PostgreSQL error 23505) by recovering the existing row (W41).
 */
export async function getOrCreateWorkout(
  client: SupabaseClient,
  userId: string,
  workoutDate: string,
  routineName: string = 'Free Workout'
): Promise<string> {
  if (!userId) throw new Error('Authenticated user required to log workout');
  if (!workoutDate) throw new Error('Workout date required');

  const startOfDay = `${workoutDate}T00:00:00.000Z`;
  const endOfDay = `${workoutDate}T23:59:59.999Z`;

  // Helper to query workout session by civil date (M2 workout_date column with pre-M2 date-window fallback)
  async function findWorkoutSession(): Promise<{ data: { id: string } | null; error?: any }> {
    const primary = await client
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .eq('workout_date', workoutDate)
      .limit(1)
      .maybeSingle();

    if (!primary.error) {
      return primary;
    }

    const errCode = String(primary.error?.code || '');
    const isMissingColumn =
      errCode.includes('PGRST') ||
      errCode === '42703' ||
      primary.error?.message?.includes('workout_date');

    if (isMissingColumn) {
      return await client
        .from('workouts')
        .select('id')
        .eq('user_id', userId)
        .gte('date', startOfDay)
        .lte('date', endOfDay)
        .limit(1)
        .maybeSingle();
    }

    return primary;
  }

  // 1. Check for existing workout row for this user on this civil date
  const { data: existingWorkout } = await findWorkoutSession();

  if (existingWorkout?.id) {
    return existingWorkout.id;
  }

  // 2. Insert new workout session row
  // Includes both M2 workout_date and legacy date column for expand-first compatibility
  const insertPayload: Record<string, any> = {
    user_id: userId,
    name: routineName,
    date: workoutDate,
    workout_date: workoutDate,
  };

  let { data: newWorkout, error: insertError } = await client
    .from('workouts')
    .insert([insertPayload])
    .select('id')
    .single();

  // If workout_date column does not exist yet (pre-M2 local DB fallback)
  if (
    insertError &&
    (insertError.code === 'PGRST204' ||
      insertError.code === '42703' ||
      String(insertError.code).includes('PGRST') ||
      insertError.message?.includes('workout_date'))
  ) {
    delete insertPayload.workout_date;
    const retry = await client
      .from('workouts')
      .insert([insertPayload])
      .select('id')
      .single();
    newWorkout = retry.data;
    insertError = retry.error;
  }

  // 3. Handle concurrent creation collision (23505 unique constraint violation)
  if (insertError) {
    const isConflict =
      insertError.code === '23505' ||
      insertError.message?.includes('duplicate key') ||
      insertError.message?.includes('unique constraint');

    if (isConflict) {
      const { data: winningWorkout } = await findWorkoutSession();

      if (winningWorkout?.id) {
        return winningWorkout.id;
      }
    }
    throw new Error(insertError.message || 'Failed to create workout');
  }

  if (!newWorkout?.id) {
    throw new Error('Failed to create workout: no ID returned');
  }

  return newWorkout.id;
}

/**
 * Inserts a single set record into the sets table, resolved strictly by exercise_id UUID.
 */
export async function insertSet(
  client: SupabaseClient,
  workoutId: string,
  payload: InsertSetPayload
): Promise<LoggedSetResult> {
  if (!workoutId) throw new Error('workoutId is required');
  if (!payload.exerciseId) throw new Error('exerciseId UUID is required');

  const { data, error } = await client
    .from('sets')
    .insert([
      {
        workout_id: workoutId,
        exercise_id: payload.exerciseId,
        weight: payload.weight,
        reps: payload.reps,
        set_index: payload.setIndex ?? 1,
        set_type: payload.setType || 'working',
        rpe: payload.rpe ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('Failed to insert set: no data returned');
  return data as LoggedSetResult;
}

/**
 * Batch inserts multiple sets into the sets table.
 */
export async function batchInsertSets(
  client: SupabaseClient,
  workoutId: string,
  payloads: InsertSetPayload[]
): Promise<LoggedSetResult[]> {
  if (!workoutId) throw new Error('workoutId is required');
  if (payloads.length === 0) return [];

  const rows = payloads.map((p) => {
    if (!p.exerciseId) throw new Error('exerciseId UUID is required for each set');
    return {
      workout_id: workoutId,
      exercise_id: p.exerciseId,
      weight: p.weight,
      reps: p.reps,
      set_index: p.setIndex ?? 1,
      set_type: p.setType || 'working',
      rpe: p.rpe ?? null,
    };
  });

  const { data, error } = await client.from('sets').insert(rows).select();
  if (error) throw error;
  return (data || []) as LoggedSetResult[];
}

/**
 * Updates an existing set record.
 */
export async function updateSet(
  client: SupabaseClient,
  setId: string,
  updates: Partial<InsertSetPayload>
): Promise<LoggedSetResult> {
  if (!setId) throw new Error('setId is required');
  const patch: Record<string, any> = {};
  if (updates.weight !== undefined) patch.weight = updates.weight;
  if (updates.reps !== undefined) patch.reps = updates.reps;
  if (updates.setIndex !== undefined) patch.set_index = updates.setIndex;
  if (updates.setType !== undefined) patch.set_type = updates.setType;
  if (updates.rpe !== undefined) patch.rpe = updates.rpe;

  const { data, error } = await client
    .from('sets')
    .update(patch)
    .eq('id', setId)
    .select()
    .single();

  if (error) throw error;
  return data as LoggedSetResult;
}

/**
 * Deletes a set record by ID.
 */
export async function deleteSet(client: SupabaseClient, setId: string): Promise<void> {
  if (!setId) throw new Error('setId is required');
  const { error } = await client.from('sets').delete().eq('id', setId);
  if (error) throw error;
}

import { supabase as defaultSupabase } from '../lib/supabase';
import type { OutboxOp } from './types';
import { resolveWorkoutRef } from './idmap';

export interface ReplayResult {
  canonicalId?: string;
  alreadyApplied?: boolean;
}

function numbersEqual(a: any, b: any, tolerance = 1e-6): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const numA = Number(a);
  const numB = Number(b);
  if (isNaN(numA) || isNaN(numB)) {
    return String(a) === String(b);
  }
  return Math.abs(numA - numB) < tolerance;
}

function fieldsMatch(serverRow: Record<string, any>, fields: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const serverVal = serverRow[key];
    if (typeof value === 'number' || typeof serverVal === 'number') {
      if (!numbersEqual(serverVal, value)) return false;
    } else if (serverVal !== value) {
      return false;
    }
  }
  return true;
}

/**
 * Replays a single outbox operation against the Supabase database.
 * Designed to be idempotent.
 */
export async function executeReplayOp(
  op: OutboxOp,
  client = defaultSupabase
): Promise<ReplayResult> {
  switch (op.kind) {
    case 'workout.ensure': {
      const { clientWorkoutId, workout_date, name } = op.payload;
      // Step 1: Upsert with ignoreDuplicates on (user_id, workout_date)
      const { error: upsertErr } = await (client.from('workouts') as any).upsert(
        {
          id: clientWorkoutId,
          user_id: op.userId,
          date: workout_date,
          workout_date,
          name: name ?? null,
        },
        { onConflict: 'user_id,workout_date', ignoreDuplicates: true }
      );
      if (upsertErr) throw upsertErr;

      // Step 2: Query the canonical workout id by (user_id, workout_date)
      const { data: canonicalRow, error: selErr } = await (client.from('workouts') as any)
        .select('id')
        .eq('user_id', op.userId)
        .eq('workout_date', workout_date)
        .single();

      if (selErr) throw selErr;
      if (!canonicalRow?.id) {
        throw new Error(`Failed to resolve canonical workout for date ${workout_date}`);
      }

      return { canonicalId: canonicalRow.id };
    }

    case 'workout.rename': {
      const { workoutRef, name } = op.payload;
      const workoutId = await resolveWorkoutRef(op.userId, workoutRef);

      const { error } = await (client.from('workouts') as any)
        .update({ name })
        .eq('id', workoutId);

      if (error) throw error;
      return {};
    }

    case 'set.create': {
      const { id, workoutRef, exercise_id, weight, reps, set_index, set_type, rpe, created_at } =
        op.payload;
      const workoutId = await resolveWorkoutRef(op.userId, workoutRef);

      const { error } = await (client.from('sets') as any).upsert(
        {
          id,
          workout_id: workoutId,
          exercise_id,
          weight,
          reps,
          set_index,
          set_type: set_type || 'working',
          rpe: rpe ?? null,
          created_at,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );

      if (error) throw error;
      return {};
    }

    case 'set.update': {
      const { id, patch, expected } = op.payload;

      // Step 1: Select existing row from server
      const { data: existingRow, error: selErr } = await (client.from('sets') as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (selErr) throw selErr;

      // Missing row -> deleted elsewhere
      if (!existingRow) {
        throw new Error('deleted elsewhere');
      }

      // Step 2: Check if patch is already applied
      if (fieldsMatch(existingRow, patch)) {
        return { alreadyApplied: true };
      }

      // Step 3: Check pre-image (expected)
      if (expected && !fieldsMatch(existingRow, expected)) {
        throw new Error('changed elsewhere');
      }

      // Step 4: Apply update
      const { error: upErr } = await (client.from('sets') as any)
        .update(patch)
        .eq('id', id);

      if (upErr) throw upErr;
      return {};
    }

    case 'set.delete': {
      const { id } = op.payload;
      const { error } = await (client.from('sets') as any).delete().eq('id', id);
      if (error) throw error;
      return {};
    }

    default:
      throw new Error(`Unknown op kind: ${(op as any).kind}`);
  }
}

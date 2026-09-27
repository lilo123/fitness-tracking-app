-- Migration: 20260927010000_workouts_civil_date.sql
-- Description: Add civil workout_date column to public.workouts, deterministic timezone backfill,
-- legacy compatibility trigger, unique (user_id, workout_date) constraint, and additive civil_date
-- return columns for get_ghost_sets and get_history_sessions.
-- Reference: 20260923000000_user_timezone.sql for users.timezone definition.

-- 1. Add workout_date column
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS workout_date date;

-- 2. Deterministic backfill based on user's timezone (validated; fallback to UTC if null or invalid)
UPDATE public.workouts w
SET workout_date = (
  w.date AT TIME ZONE CASE
    WHEN u.timezone IS NOT NULL AND length(trim(u.timezone)) > 0
         AND EXISTS (SELECT 1 FROM pg_timezone_names tz WHERE tz.name = trim(u.timezone))
    THEN trim(u.timezone)
    ELSE 'UTC'
  END
)::date
FROM public.users u
WHERE w.user_id = u.id
  AND w.workout_date IS NULL;

-- Fallback for any workouts without matching user row
UPDATE public.workouts
SET workout_date = (date AT TIME ZONE 'UTC')::date
WHERE workout_date IS NULL;

-- 3. Set NOT NULL constraint on workout_date
ALTER TABLE public.workouts
  ALTER COLUMN workout_date SET NOT NULL;

-- 4. Trigger on workouts for legacy writers
CREATE OR REPLACE FUNCTION public.set_workouts_civil_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_tz text;
  v_effective_tz text := 'UTC';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.workout_date IS NULL THEN
      SELECT timezone INTO v_user_tz FROM public.users WHERE id = NEW.user_id;
      IF v_user_tz IS NOT NULL AND length(trim(v_user_tz)) > 0 THEN
        BEGIN
          PERFORM (COALESCE(NEW.date, now()) AT TIME ZONE v_user_tz);
          v_effective_tz := v_user_tz;
        EXCEPTION WHEN OTHERS THEN
          v_effective_tz := 'UTC';
        END;
      END IF;
      NEW.workout_date := (COALESCE(NEW.date, now()) AT TIME ZONE v_effective_tz)::date;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.workout_date IS NULL OR (NEW.date IS DISTINCT FROM OLD.date AND NEW.workout_date IS NOT DISTINCT FROM OLD.workout_date) THEN
      SELECT timezone INTO v_user_tz FROM public.users WHERE id = NEW.user_id;
      IF v_user_tz IS NOT NULL AND length(trim(v_user_tz)) > 0 THEN
        BEGIN
          PERFORM (COALESCE(NEW.date, now()) AT TIME ZONE v_user_tz);
          v_effective_tz := v_user_tz;
        EXCEPTION WHEN OTHERS THEN
          v_effective_tz := 'UTC';
        END;
      END IF;
      NEW.workout_date := (COALESCE(NEW.date, now()) AT TIME ZONE v_effective_tz)::date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_workouts_civil_date ON public.workouts;
CREATE TRIGGER trg_set_workouts_civil_date
  BEFORE INSERT OR UPDATE ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workouts_civil_date();

-- 5. UNIQUE (user_id, workout_date) constraint (W41)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workouts'::regclass
      AND conname = 'workouts_user_id_workout_date_key'
  ) THEN
    ALTER TABLE public.workouts
      ADD CONSTRAINT workouts_user_id_workout_date_key UNIQUE (user_id, workout_date);
  END IF;
END $$;

-- 6. Update get_history_sessions: return civil_date additively
DROP FUNCTION IF EXISTS public.get_history_sessions(uuid, int, int);

CREATE OR REPLACE FUNCTION public.get_history_sessions(
  p_user_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  date timestamp with time zone,
  name text,
  set_count bigint,
  total_volume numeric,
  civil_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.date,
    w.name,
    COUNT(s.id)::bigint AS set_count,
    COALESCE(SUM(s.weight * s.reps), 0)::numeric AS total_volume,
    w.workout_date AS civil_date
  FROM public.workouts w
  LEFT JOIN public.sets s ON s.workout_id = w.id
  WHERE w.user_id = p_user_id
  GROUP BY w.id, w.date, w.name, w.workout_date
  ORDER BY w.workout_date DESC, w.date DESC, w.id DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT LEAST(GREATEST(p_limit, 0), 500);
$$;

GRANT EXECUTE ON FUNCTION public.get_history_sessions(uuid, int, int) TO authenticated, anon;

-- 7. Update get_ghost_sets: return civil_date additively preserving workout_date timestamptz
DROP FUNCTION IF EXISTS public.get_ghost_sets(uuid, date);

CREATE OR REPLACE FUNCTION public.get_ghost_sets(
  p_user_id uuid,
  p_date date
)
RETURNS TABLE (
  id uuid,
  workout_id uuid,
  exercise_id uuid,
  exercise_name text,
  weight numeric,
  reps integer,
  set_index integer,
  set_type text,
  workout_date timestamptz,
  workout_name text,
  created_at timestamptz,
  civil_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH user_workouts AS (
    SELECT w.id, w.date, w.workout_date, w.name, w.created_at
    FROM public.workouts w
    WHERE w.user_id = p_user_id
      AND w.workout_date < p_date
      AND w.workout_date >= (p_date - INTERVAL '90 days')::date
  ),
  valid_sets AS (
    SELECT
      s.id,
      s.workout_id,
      s.exercise_id,
      COALESCE(e.name, s.exercise_id::text) AS exercise_name,
      s.weight,
      s.reps,
      s.set_index,
      s.set_type,
      s.created_at,
      uw.date AS workout_date,
      uw.name AS workout_name,
      uw.created_at AS workout_created_at,
      uw.workout_date AS civil_date
    FROM public.sets s
    JOIN user_workouts uw ON uw.id = s.workout_id
    LEFT JOIN public.exercises e ON e.id = s.exercise_id
    WHERE s.weight IS NOT NULL
      AND s.reps IS NOT NULL
  ),
  ranked_sessions AS (
    SELECT
      vs.*,
      DENSE_RANK() OVER (
        PARTITION BY lower(vs.exercise_name)
        ORDER BY vs.civil_date DESC, vs.workout_created_at DESC, vs.workout_id DESC
      ) AS session_rank
    FROM valid_sets vs
  ),
  exercise_sets AS (
    SELECT
      rs.*,
      ROW_NUMBER() OVER (
        PARTITION BY lower(rs.exercise_name)
        ORDER BY rs.set_index ASC, rs.created_at ASC, rs.id ASC
      ) AS set_num
    FROM ranked_sessions rs
    WHERE rs.session_rank = 1
  )
  SELECT
    es.id,
    es.workout_id,
    es.exercise_id,
    es.exercise_name,
    es.weight,
    es.reps,
    es.set_index,
    es.set_type,
    es.workout_date,
    es.workout_name,
    es.created_at,
    es.civil_date
  FROM exercise_sets es
  WHERE es.set_num <= 20
  ORDER BY es.exercise_name ASC, es.set_index ASC
  LIMIT 1000;
$$;

GRANT EXECUTE ON FUNCTION public.get_ghost_sets(uuid, date) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

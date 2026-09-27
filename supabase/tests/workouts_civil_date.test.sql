BEGIN;
SELECT plan(9);

-- 1. Table & Column assertions
SELECT has_table('public', 'workouts', 'workouts table exists');
SELECT has_column('public', 'workouts', 'workout_date', 'workouts table has workout_date column');
SELECT col_not_null('public', 'workouts', 'workout_date', 'workouts.workout_date is NOT NULL');
SELECT col_type_is('public', 'workouts', 'workout_date', 'date', 'workouts.workout_date is type date');

-- 2. Timezone handling and backfill / legacy trigger tests
DO $$
DECLARE
  v_user_la uuid := gen_random_uuid();
  v_user_tokyo uuid := gen_random_uuid();
  v_user_utc uuid := gen_random_uuid();
  v_user_null_tz uuid := gen_random_uuid();
  v_user_inv_tz uuid := gen_random_uuid();
  v_wid uuid;
  v_wid_null uuid;
  v_wid_inv uuid;
  v_wdate date;
BEGIN
  -- Create test users with various timezones
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (v_user_la, 'user_la@test.com', '{"role":"athlete","timezone":"America/Los_Angeles"}'::jsonb),
    (v_user_tokyo, 'user_tokyo@test.com', '{"role":"athlete","timezone":"Asia/Tokyo"}'::jsonb),
    (v_user_utc, 'user_utc@test.com', '{"role":"athlete","timezone":"UTC"}'::jsonb),
    (v_user_null_tz, 'user_null_tz@test.com', '{"role":"athlete"}'::jsonb),
    (v_user_inv_tz, 'user_inv_tz@test.com', '{"role":"athlete","timezone":"Invalid/Zone"}'::jsonb);

  UPDATE public.users SET timezone = 'America/Los_Angeles' WHERE id = v_user_la;
  UPDATE public.users SET timezone = 'Asia/Tokyo' WHERE id = v_user_tokyo;
  UPDATE public.users SET timezone = 'UTC' WHERE id = v_user_utc;
  UPDATE public.users SET timezone = NULL WHERE id = v_user_null_tz;
  UPDATE public.users SET timezone = 'Invalid/Zone' WHERE id = v_user_inv_tz;

  -- Test Case 1: LA athlete works out at 23:30 local time on 2026-09-15.
  -- In America/Los_Angeles (EDT/PDT is UTC-7), 23:30 on 2026-09-15 is 06:30 UTC on 2026-09-16.
  -- The civil workout_date must be 2026-09-15!
  INSERT INTO public.workouts (id, user_id, name, date)
  VALUES (gen_random_uuid(), v_user_la, 'LA Late Night', '2026-09-16 06:30:00+00')
  RETURNING workout_date INTO v_wdate;

  IF v_wdate <> '2026-09-15'::date THEN
    RAISE EXCEPTION 'Expected LA 23:30 workout (06:30 UTC next day) to have workout_date 2026-09-15, got %', v_wdate;
  END IF;

  -- Test Case 2: Tokyo athlete works out at 02:00 local time on 2026-09-16.
  -- In Asia/Tokyo (UTC+9), 02:00 on 2026-09-16 is 17:00 UTC on 2026-09-15.
  -- The civil workout_date must be 2026-09-16!
  INSERT INTO public.workouts (id, user_id, name, date)
  VALUES (gen_random_uuid(), v_user_tokyo, 'Tokyo Early Morning', '2026-09-15 17:00:00+00')
  RETURNING workout_date INTO v_wdate;

  IF v_wdate <> '2026-09-16'::date THEN
    RAISE EXCEPTION 'Expected Tokyo 02:00 workout (17:00 UTC prev day) to have workout_date 2026-09-16, got %', v_wdate;
  END IF;

  -- Test Case 3: UTC user
  INSERT INTO public.workouts (id, user_id, name, date)
  VALUES (gen_random_uuid(), v_user_utc, 'UTC Noon', '2026-09-15 12:00:00+00')
  RETURNING workout_date INTO v_wdate;

  IF v_wdate <> '2026-09-15'::date THEN
    RAISE EXCEPTION 'Expected UTC 12:00 workout to have workout_date 2026-09-15, got %', v_wdate;
  END IF;

  -- Test Case 4: Null timezone user falls back to UTC
  INSERT INTO public.workouts (id, user_id, name, date)
  VALUES (gen_random_uuid(), v_user_null_tz, 'Null TZ Workout', '2026-09-15 20:00:00+00')
  RETURNING id, workout_date INTO v_wid_null, v_wdate;

  IF v_wdate <> '2026-09-15'::date THEN
    RAISE EXCEPTION 'Expected Null TZ workout to fallback to UTC date 2026-09-15, got %', v_wdate;
  END IF;

  -- Test Case 5: Invalid timezone user falls back to UTC
  INSERT INTO public.workouts (id, user_id, name, date)
  VALUES (gen_random_uuid(), v_user_inv_tz, 'Invalid TZ Workout', '2026-09-15 20:00:00+00')
  RETURNING id, workout_date INTO v_wid_inv, v_wdate;

  IF v_wdate <> '2026-09-15'::date THEN
    RAISE EXCEPTION 'Expected Invalid TZ workout to fallback to UTC date 2026-09-15, got %', v_wdate;
  END IF;

  -- Test Case 6: Legacy writer update of date triggers workout_date recalculation (LA user)
  INSERT INTO public.workouts (id, user_id, name, date)
  VALUES (gen_random_uuid(), v_user_la, 'Initial Workout', '2026-09-10 12:00:00+00')
  RETURNING id, workout_date INTO v_wid, v_wdate;

  IF v_wdate <> '2026-09-10'::date THEN
    RAISE EXCEPTION 'Initial workout_date wrong: %', v_wdate;
  END IF;

  UPDATE public.workouts
  SET date = '2026-09-11 12:00:00+00'
  WHERE id = v_wid
  RETURNING workout_date INTO v_wdate;

  IF v_wdate <> '2026-09-11'::date THEN
    RAISE EXCEPTION 'Updated workout_date was not recalculated: %', v_wdate;
  END IF;

  -- Test Case 7: Legacy writer update of date for user with NO timezone (null) updates workout_date via UTC fallback
  UPDATE public.workouts
  SET date = '2026-09-18 12:00:00+00'
  WHERE id = v_wid_null
  RETURNING workout_date INTO v_wdate;

  IF v_wdate <> '2026-09-18'::date THEN
    RAISE EXCEPTION 'Null timezone date update failed: expected 2026-09-18, got %', v_wdate;
  END IF;

  -- Test Case 8: Legacy writer update of date for user with INVALID timezone updates workout_date via UTC fallback
  UPDATE public.workouts
  SET date = '2026-09-19 12:00:00+00'
  WHERE id = v_wid_inv
  RETURNING workout_date INTO v_wdate;

  IF v_wdate <> '2026-09-19'::date THEN
    RAISE EXCEPTION 'Invalid timezone date update failed: expected 2026-09-19, got %', v_wdate;
  END IF;

  -- Test Case 9: Explicit workout_date is preserved on update
  UPDATE public.workouts
  SET workout_date = '2026-09-08'::date
  WHERE id = v_wid
  RETURNING workout_date INTO v_wdate;

  IF v_wdate <> '2026-09-08'::date THEN
    RAISE EXCEPTION 'Explicit workout_date not preserved: %', v_wdate;
  END IF;
END;
$$;

SELECT pass('Civil workout_date derived correctly for LA/Tokyo/UTC/null/invalid timezones and legacy updates');

-- 3. Unique day constraint rejects second workout for same user and day
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_user, 'uniq@test.com', '{"role":"athlete"}'::jsonb);

  INSERT INTO public.workouts (id, user_id, name, date, workout_date)
  VALUES (gen_random_uuid(), v_user, 'First Daily Workout', '2026-09-15 10:00:00+00', '2026-09-15');

  BEGIN
    INSERT INTO public.workouts (id, user_id, name, date, workout_date)
    VALUES (gen_random_uuid(), v_user, 'Second Daily Workout', '2026-09-15 16:00:00+00', '2026-09-15');
    RAISE EXCEPTION 'Duplicate (user_id, workout_date) was accepted unexpectedly!';
  EXCEPTION WHEN unique_violation THEN
    -- Expected unique violation
    NULL;
  END;
END;
$$;

SELECT pass('workouts unique(user_id, workout_date) constraint correctly rejects duplicate day');

-- 4. get_ghost_sets and get_history_sessions expose civil_date
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_wid uuid := gen_random_uuid();
  v_eid uuid;
  v_res_gh record;
  v_res_hist record;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_user, 'rpctest@test.com', '{"role":"athlete"}'::jsonb);
  SELECT id INTO v_eid FROM public.exercises WHERE is_master = true LIMIT 1;

  INSERT INTO public.workouts (id, user_id, name, date, workout_date)
  VALUES (v_wid, v_user, 'RPC Test Workout', '2026-09-10 10:00:00+00', '2026-09-10');

  INSERT INTO public.sets (workout_id, exercise_id, weight, reps, set_index, set_type)
  VALUES (v_wid, v_eid, 100, 5, 1, 'working');

  -- Query get_history_sessions: verify civil_date
  SELECT * INTO v_res_hist FROM public.get_history_sessions(v_user, 0, 10) LIMIT 1;
  IF v_res_hist.civil_date <> '2026-09-10'::date THEN
    RAISE EXCEPTION 'get_history_sessions did not return expected civil_date: %', v_res_hist.civil_date;
  END IF;

  -- Query get_ghost_sets: verify civil_date and preserved workout_date timestamptz
  SELECT * INTO v_res_gh FROM public.get_ghost_sets(v_user, '2026-09-15'::date) LIMIT 1;
  IF v_res_gh.civil_date <> '2026-09-10'::date THEN
    RAISE EXCEPTION 'get_ghost_sets did not return expected civil_date: %', v_res_gh.civil_date;
  END IF;
  IF v_res_gh.workout_date <> '2026-09-10 10:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'get_ghost_sets did not preserve workout_date timestamptz: %', v_res_gh.workout_date;
  END IF;
END;
$$;

SELECT pass('get_history_sessions exposes civil_date date');
SELECT pass('get_ghost_sets exposes civil_date date and preserves workout_date timestamptz');
SELECT pass('all M2 civil date tests completed');

SELECT * FROM finish();
ROLLBACK;

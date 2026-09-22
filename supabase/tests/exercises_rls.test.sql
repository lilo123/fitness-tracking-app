BEGIN;
SELECT plan(4);

-- Regression coverage for the exercises RLS gap left by multi-coach linking.
--
-- The SELECT policy on public.exercises relied solely on public.is_coach(), which tests
-- users.role = 'coach'. Multi-coach accounts keep role = 'athlete' and are marked with
-- is_coach_mode = true, so is_coach() returns false for them and custom exercises were
-- invisible in both directions across an active coach/athlete link.
--
-- Tests 1 and 2 fail against the pre-migration policy. Test 3 is the security guard and must
-- pass both before and after: widening visibility must not leak to unlinked accounts.

-- 1. A linked coach can read their athlete's custom exercise.
DO $$
DECLARE
  v_coach_id uuid := gen_random_uuid();
  v_ath_id uuid := gen_random_uuid();
  v_ex_id uuid;
  v_seen int;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_coach_id, 'exrls_coach1@test.com', '{"role":"athlete"}'::jsonb);
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_ath_id, 'exrls_ath1@test.com', '{"role":"athlete"}'::jsonb);
  UPDATE public.users SET coach_code = 'CYBER-EXRLS1', is_coach_mode = true WHERE id = v_coach_id;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_ath_id || '"}', true);
  PERFORM public.link_to_coach('CYBER-EXRLS1');

  PERFORM set_config('role', 'postgres', true);
  INSERT INTO public.exercises (name, body_part, is_master, user_id)
  VALUES ('Athlete Custom Zercher Carry', 'Legs', false, v_ath_id)
  RETURNING id INTO v_ex_id;

  -- Confirm the coach really is the multi-coach shape this bug depends on.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_coach_id AND role = 'coach') THEN
    RAISE EXCEPTION 'Fixture invalid: coach has role = coach, so is_coach() would mask the defect';
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_coach_id || '"}', true);
  SELECT count(*) INTO v_seen FROM public.exercises WHERE id = v_ex_id;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'Linked coach cannot read athlete custom exercise (saw % rows)', v_seen;
  END IF;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.exercises WHERE id = v_ex_id;
  DELETE FROM auth.users WHERE id IN (v_coach_id, v_ath_id);
END;
$$;
SELECT pass('Linked coach can read their athlete custom exercise');

-- 2. A linked athlete can read a coach-authored custom exercise their sets reference.
DO $$
DECLARE
  v_coach_id uuid := gen_random_uuid();
  v_ath_id uuid := gen_random_uuid();
  v_ex_id uuid;
  v_seen int;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_coach_id, 'exrls_coach2@test.com', '{"role":"athlete"}'::jsonb);
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_ath_id, 'exrls_ath2@test.com', '{"role":"athlete"}'::jsonb);
  UPDATE public.users SET coach_code = 'CYBER-EXRLS2', is_coach_mode = true WHERE id = v_coach_id;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_ath_id || '"}', true);
  PERFORM public.link_to_coach('CYBER-EXRLS2');

  PERFORM set_config('role', 'postgres', true);
  INSERT INTO public.exercises (name, body_part, is_master, user_id)
  VALUES ('Coach Prescribed Landmine Press', 'Shoulders', false, v_coach_id)
  RETURNING id INTO v_ex_id;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_ath_id || '"}', true);
  SELECT count(*) INTO v_seen FROM public.exercises WHERE id = v_ex_id;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'Linked athlete cannot read coach-authored custom exercise (saw % rows)', v_seen;
  END IF;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.exercises WHERE id = v_ex_id;
  DELETE FROM auth.users WHERE id IN (v_coach_id, v_ath_id);
END;
$$;
SELECT pass('Linked athlete can read coach-authored custom exercise');

-- 3. SECURITY GUARD: an unlinked stranger can read neither party's custom exercise.
DO $$
DECLARE
  v_coach_id uuid := gen_random_uuid();
  v_ath_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_ath_ex_id uuid;
  v_coach_ex_id uuid;
  v_seen int;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_coach_id, 'exrls_coach3@test.com', '{"role":"athlete"}'::jsonb);
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_ath_id, 'exrls_ath3@test.com', '{"role":"athlete"}'::jsonb);
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_stranger_id, 'exrls_stranger@test.com', '{"role":"athlete"}'::jsonb);
  UPDATE public.users SET coach_code = 'CYBER-EXRLS3', is_coach_mode = true WHERE id = v_coach_id;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_ath_id || '"}', true);
  PERFORM public.link_to_coach('CYBER-EXRLS3');

  PERFORM set_config('role', 'postgres', true);
  INSERT INTO public.exercises (name, body_part, is_master, user_id)
  VALUES ('Athlete Private Movement', 'Back', false, v_ath_id) RETURNING id INTO v_ath_ex_id;
  INSERT INTO public.exercises (name, body_part, is_master, user_id)
  VALUES ('Coach Private Movement', 'Chest', false, v_coach_id) RETURNING id INTO v_coach_ex_id;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_stranger_id || '"}', true);

  SELECT count(*) INTO v_seen FROM public.exercises WHERE id = v_ath_ex_id;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'Security breach: unlinked stranger can read athlete custom exercise!';
  END IF;

  SELECT count(*) INTO v_seen FROM public.exercises WHERE id = v_coach_ex_id;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'Security breach: unlinked stranger can read coach custom exercise!';
  END IF;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.exercises WHERE id IN (v_ath_ex_id, v_coach_ex_id);
  DELETE FROM auth.users WHERE id IN (v_coach_id, v_ath_id, v_stranger_id);
END;
$$;
SELECT pass('Unlinked stranger cannot read either party custom exercise');

-- 4. Master exercises remain readable by any authenticated user.
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_master_id uuid;
  v_seen int;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_user_id, 'exrls_plain@test.com', '{"role":"athlete"}'::jsonb);

  SELECT id INTO v_master_id FROM public.exercises WHERE is_master = true LIMIT 1;
  IF v_master_id IS NULL THEN
    RAISE EXCEPTION 'Fixture invalid: no master exercise present to test against';
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_user_id || '"}', true);
  SELECT count(*) INTO v_seen FROM public.exercises WHERE id = v_master_id;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'Master exercise not readable by plain authenticated user';
  END IF;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;
SELECT pass('Master exercises remain readable by any authenticated user');

SELECT * FROM finish();
ROLLBACK;

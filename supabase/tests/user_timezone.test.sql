BEGIN;
SELECT plan(6);

-- 1. Table & column assertions
SELECT has_table('public', 'users', 'users table exists');
SELECT has_column('public', 'users', 'timezone', 'users table has timezone column');
SELECT col_is_null('public', 'users', 'timezone', 'users.timezone column is nullable');
SELECT col_type_is('public', 'users', 'timezone', 'text', 'users.timezone column is type text');

-- 2. RLS UPDATE policy: user A cannot update user B's timezone
DO $$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_updated_rows int;
BEGIN
  -- Insert test users directly into auth.users (handle_new_user trigger creates public.users rows)
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_user_a, 'user_a_tz@example.com', '{"role":"athlete","username":"UserA"}'::jsonb),
    (v_user_b, 'user_b_tz@example.com', '{"role":"athlete","username":"UserB"}'::jsonb);

  -- Impersonate User A
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"' || v_user_a || '"}', true);

  -- User A updates own timezone -> succeeds (1 row affected)
  UPDATE public.users SET timezone = 'America/New_York' WHERE id = v_user_a;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION 'User A should be able to update own timezone, updated rows: %', v_updated_rows;
  END IF;

  -- User A attempts to update User B's timezone -> blocked by RLS (0 rows affected)
  UPDATE public.users SET timezone = 'Asia/Tokyo' WHERE id = v_user_b;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 0 THEN
    RAISE EXCEPTION 'User A must not be able to update User B timezone, updated rows: %', v_updated_rows;
  END IF;
END;
$$;

SELECT pass('User A successfully updated own timezone');
SELECT pass('User A was blocked from updating User B timezone by RLS');

SELECT * FROM finish();
ROLLBACK;

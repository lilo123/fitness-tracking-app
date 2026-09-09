-- Seed Demo Users in local development
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'coach@cybergym.io',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"],"role":"coach"}',
  '{"username":"Coach Duy","role":"coach"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
), (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'athlete@cybergym.io',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"],"role":"athlete"}',
  '{"username":"Alex Athlete","role":"athlete"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Seed Demo Coach metadata and link to Demo Athlete
UPDATE public.users
SET is_coach_mode = true,
    coach_code = 'CYBER-DEMO01',
    coach_tier = 'free',
    max_athletes = 3
WHERE id = 'a0000000-0000-0000-0000-000000000001';

INSERT INTO public.coach_athlete_links (coach_id, athlete_id, status, linked_at)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'active',
  now()
) ON CONFLICT (athlete_id) WHERE status = 'active' DO NOTHING;

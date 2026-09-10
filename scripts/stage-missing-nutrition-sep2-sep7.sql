-- CyberGym V2: Missing Nutrition Logs Staging (Sep 2, 2026 - Sep 7, 2026)
-- Target User: Coach Duy (diehard643@gmail.com / id: 2d444ce2-c0cf-483f-a82e-43c8fb9807b1)
-- Timestamp Anchor: Noon UTC (12:00:00Z) consistent with historical seed data and date normalization

BEGIN;

INSERT INTO public.nutrition_logs (
  id,
  user_id,
  food_name,
  calories,
  protein,
  carbs,
  fat,
  fiber,
  meal_type,
  serving_size,
  serving_unit,
  logged_at,
  created_at
) VALUES
  (
    'db536cf6-d5ce-54fe-b4cf-5469b86aaa14',
    '2d444ce2-c0cf-483f-a82e-43c8fb9807b1',
    'Daily Macro Summary',
    1873,
    165,
    125,
    69,
    37,
    'meal',
    1,
    'serving',
    '2026-09-02T12:00:00Z'::timestamptz,
    '2026-09-02T12:00:00Z'::timestamptz
  ),
  (
    '9ef844ea-b79f-566a-af7f-94886b480906',
    '2d444ce2-c0cf-483f-a82e-43c8fb9807b1',
    'Daily Macro Summary',
    1854,
    134,
    105,
    106,
    38,
    'meal',
    1,
    'serving',
    '2026-09-03T12:00:00Z'::timestamptz,
    '2026-09-03T12:00:00Z'::timestamptz
  ),
  (
    'b1936f1e-29fd-536f-b45e-e5665396d48f',
    '2d444ce2-c0cf-483f-a82e-43c8fb9807b1',
    'Daily Macro Summary',
    1735,
    143,
    140,
    71,
    38,
    'meal',
    1,
    'serving',
    '2026-09-04T12:00:00Z'::timestamptz,
    '2026-09-04T12:00:00Z'::timestamptz
  ),
  (
    'a4b41236-0a2b-5ed2-8e94-43836b4c3732',
    '2d444ce2-c0cf-483f-a82e-43c8fb9807b1',
    'Daily Macro Summary',
    1554,
    135,
    141,
    56,
    41,
    'meal',
    1,
    'serving',
    '2026-09-05T12:00:00Z'::timestamptz,
    '2026-09-05T12:00:00Z'::timestamptz
  ),
  (
    'b0c1bec9-b3b4-5b2e-abf9-c865ca43420a',
    '2d444ce2-c0cf-483f-a82e-43c8fb9807b1',
    'Daily Macro Summary',
    1801,
    127,
    149,
    82,
    38,
    'meal',
    1,
    'serving',
    '2026-09-06T12:00:00Z'::timestamptz,
    '2026-09-06T12:00:00Z'::timestamptz
  ),
  (
    '2980838b-5fbc-570c-9b13-a3e00ea2bd8c',
    '2d444ce2-c0cf-483f-a82e-43c8fb9807b1',
    'Daily Macro Summary',
    1609,
    138,
    130,
    59,
    34,
    'meal',
    1,
    'serving',
    '2026-09-07T12:00:00Z'::timestamptz,
    '2026-09-07T12:00:00Z'::timestamptz
  )
ON CONFLICT (id) DO UPDATE SET
  calories = EXCLUDED.calories,
  protein = EXCLUDED.protein,
  carbs = EXCLUDED.carbs,
  fat = EXCLUDED.fat,
  fiber = EXCLUDED.fiber,
  meal_type = EXCLUDED.meal_type,
  serving_size = EXCLUDED.serving_size,
  serving_unit = EXCLUDED.serving_unit,
  logged_at = EXCLUDED.logged_at;

COMMIT;

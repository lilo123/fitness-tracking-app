#!/usr/bin/env python3
"""
Production Historical Data Migration Script
CyberGym V1 (Google Apps Script & Google Drive) -> CyberGym V2 (Supabase PostgreSQL)

Target User: Coach Duy (diehard643@gmail.com / id: 2d444ce2-c0cf-483f-a82e-43c8fb9807b1)
Remote Supabase Project: erqhtucitatzhcqwtvce
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import uuid
from typing import Any, Dict, List

# Fixed Namespace for Deterministic UUIDv5
ROOT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, 'cybergym.app')
COACH_UID = '2d444ce2-c0cf-483f-a82e-43c8fb9807b1'
APPS_SCRIPT_BASE_URL = (
    'https://script.google.com/macros/s/'
    'AKfycbyZbnG3jv37Af1pKFOZIEAamQRHFzIKSQN4IvwdxsWCjWb_NCJV0NGSpOThNN7sqOGwnQ/exec'
)
NUTRITION_SPREADSHEET_ID = '1rw9-oRPhYdnnqBbeqAGWhnSHrwD4vfjPp_Kbv7GNPIE'

# 12 Master Exercises pre-seeded in public.exercises (+ push alias)
MASTER_EXERCISE_NAMES = {
    'incline bench press',
    'cable lateral raises',
    'dips',
    'leg extension machine',
    'overhead tricep cable pull',
    'overhead tricep cable push',
    'leg raise',
    'lat pull down',
    'seated cable row',
    'inclined bicep curl',
    'leg curl',
    'face pulls',
    'weighted sit-up',
}

# 2 Phantom Duplicate Client IDs to Purge
PURGED_CLIENT_IDS = {
    'C-1786658684370-z2ebzn',  # 2026-08-13 Lat Pull Down duplicate Set 1 (190 lbs x 7)
    'C-1787598085077-nsksze',  # 2026-08-24 Dips duplicate Set 3 (170 lbs x 11, 14s after flyes)
}


def fetch_apps_script_data(sheet_type: str, athlete: str = 'duy') -> List[Dict[str, Any]]:
    """Fetch live data from the Google Apps Script web endpoint."""
    url = f'{APPS_SCRIPT_BASE_URL}?type={sheet_type}'
    if athlete:
        url += f'&athlete={athlete}'
    print(f'Fetching {sheet_type} from {url}...')
    req = urllib.request.Request(url, headers={'User-Agent': 'CyberGymMigration/2.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        if not data.get('success'):
            raise RuntimeError(f'Failed to fetch {sheet_type}: {data.get("error")}')
        items = data.get('data', [])
        print(f'Successfully fetched {len(items)} {sheet_type} records.')
        return items


def fetch_nutrition_csv(out_path: str = '/tmp/live_nutrition_log.csv', force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Export or read Google Drive nutrition spreadsheet CSV."""
    need_export = force_refresh or not os.path.exists(out_path)
    if need_export:
        print(f'Exporting nutrition log {NUTRITION_SPREADSHEET_ID} via gdrive CLI...')
        cmd = [
            '/google/bin/releases/gemini-agents-gdrive/gdrive',
            '--target_user', 'duynguyenn',
            'readonly', 'export',
            NUTRITION_SPREADSHEET_ID,
            out_path,
            '--format', 'csv'
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f'gdrive export error: {res.stderr}')
            if os.path.exists(out_path):
                print(f'Falling back to cached nutrition log at {out_path}...')
            else:
                raise RuntimeError(f'Failed to export nutrition sheet from Drive: {res.stderr}')
        else:
            print(f'Exported nutrition log to {out_path}.')
    else:
        print(f'Using existing nutrition log file at {out_path}.')

    with open(out_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        print(f'Loaded {len(rows)} daily nutrition records.')
        return rows


def run_remote_query(sql: str) -> Dict[str, Any]:
    """Execute a query against the linked remote Supabase database via Supabase CLI using a temp SQL file."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
        f.write(sql)
        temp_sql_path = f.name

    try:
        return run_remote_file(temp_sql_path)
    finally:
        if os.path.exists(temp_sql_path):
            os.remove(temp_sql_path)


def run_remote_file(sql_file_path: str) -> Dict[str, Any]:
    """Execute a SQL file against the linked remote Supabase database."""
    full_cmd = (
        'source ~/.nvm/nvm.sh && export PATH="$HOME/.deno/bin:$PATH" && '
        f'npx supabase db query --linked -f "{sql_file_path}"'
    )
    res = subprocess.run(
        ['bash', '-c', full_cmd],
        cwd='/usr/local/google/home/duynguyenn/fitness-tracking',
        capture_output=True,
        text=True
    )
    if res.returncode != 0:
        raise RuntimeError(f'Supabase CLI execution error: {res.stderr}\n{res.stdout}')
    out = res.stdout.strip()
    json_start = out.find('{')
    if json_start != -1:
        return json.loads(out[json_start:])
    return {'output': out}


def escape_sql_str(val: Any) -> str:
    """Escape single quotes for PostgreSQL string literals."""
    if val is None:
        return 'NULL'
    s = str(val).replace("'", "''")
    return f"'{s}'"


def build_migration_sql(
    existing_exercises: List[Dict[str, Any]],
    legacy_exercises: List[Dict[str, Any]],
    legacy_templates: List[Dict[str, Any]],
    legacy_logs: List[Dict[str, Any]],
    nutrition_rows: List[Dict[str, Any]]
) -> str:
    """Build atomic, deterministic, idempotent SQL migration."""
    statements: List[str] = []
    statements.append('-- CyberGym V1 to V2 Production Historical Data Migration')
    statements.append('-- Target User: Coach Duy (2d444ce2-c0cf-483f-a82e-43c8fb9807b1)')
    statements.append('BEGIN;\n')

    # 1. Resolve Exercise IDs Map
    name_to_id: Dict[str, str] = {}
    for ex in existing_exercises:
        norm = ex['name'].strip().lower()
        if norm in MASTER_EXERCISE_NAMES:
            name_to_id[norm] = ex['id']

    # Alias 'overhead tricep cable push' in legacy templates/catalog to master 'overhead tricep cable pull'
    if 'overhead tricep cable pull' in name_to_id:
        name_to_id['overhead tricep cable push'] = name_to_id['overhead tricep cable pull']

    # Deterministically identify and upsert all 11 custom exercises
    custom_exercises_to_insert: List[Dict[str, Any]] = []
    for ex in legacy_exercises:
        norm_name = ex['Name'].strip().lower()
        if norm_name in MASTER_EXERCISE_NAMES:
            continue
        ex_id = str(uuid.uuid5(ROOT_NAMESPACE, f'exercise:{norm_name}'))
        name_to_id[norm_name] = ex_id
        custom_exercises_to_insert.append({
            'id': ex_id,
            'name': ex['Name'].strip(),
            'body_part': ex.get('Category', 'Other').strip()
        })

    # User Decision 1: Alias 'Lat Cable Pulldown' to existing catalog exercise 'Lat Cable Prayer'
    lat_prayer_norm = 'lat cable prayer'
    lat_pulldown_norm = 'lat cable pulldown'
    if lat_prayer_norm in name_to_id:
        name_to_id[lat_pulldown_norm] = name_to_id[lat_prayer_norm]
    else:
        raise RuntimeError('Lat Cable Prayer not found in exercise map!')

    statements.append(f'-- 1. Insert {len(custom_exercises_to_insert)} Custom Exercises')
    for ex in custom_exercises_to_insert:
        statements.append(
            f"INSERT INTO public.exercises (id, name, body_part, is_master, is_archived, created_at) "
            f"VALUES ('{ex['id']}', {escape_sql_str(ex['name'])}, {escape_sql_str(ex['body_part'])}, true, false, timezone('utc'::text, now())) "
            f"ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, body_part = EXCLUDED.body_part, is_master = EXCLUDED.is_master;"
        )
    statements.append('')

    statements.append(f'-- 2. Insert Routine Templates & Template Exercises')
    template_exercises_to_insert: List[Dict[str, Any]] = []

    for tpl in legacy_templates:
        tpl_name = tpl['Template_Name'].strip()
        tpl_id = str(uuid.uuid5(ROOT_NAMESPACE, f'template:{COACH_UID}:{tpl_name}'))

        days_str = tpl.get('Day_Of_Week', '').strip()
        if days_str:
            days = [f"'{d.strip()}'" for d in days_str.split(',') if d.strip()]
            days_sql = f"ARRAY[{', '.join(days)}]::text[]"
        else:
            days_sql = "'{}'::text[]"

        statements.append(
            f"INSERT INTO public.routine_templates (id, user_id, name, is_master, assigned_to, days_of_week, created_at) "
            f"VALUES ('{tpl_id}', '{COACH_UID}', {escape_sql_str(tpl_name)}, true, '{COACH_UID}', {days_sql}, timezone('utc'::text, now())) "
            f"ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_master = EXCLUDED.is_master, assigned_to = EXCLUDED.assigned_to, days_of_week = EXCLUDED.days_of_week;"
        )

        seq = [s.strip() for s in tpl.get('Exercise_Sequence', '').split(',') if s.strip()]
        target_sets_str = tpl.get('Target_Sets', '').strip()
        t_sets = [int(s.strip()) for s in target_sets_str.split(',') if s.strip()] if target_sets_str else []

        for idx, ex_name in enumerate(seq):
            norm_ex = ex_name.lower()
            if norm_ex not in name_to_id:
                raise RuntimeError(f'Exercise "{ex_name}" in template "{tpl_name}" could not be resolved!')
            target_set_count = t_sets[idx] if idx < len(t_sets) else 3
            te_id = str(uuid.uuid5(ROOT_NAMESPACE, f'template_exercise:{tpl_id}:{idx}'))
            template_exercises_to_insert.append({
                'id': te_id,
                'template_id': tpl_id,
                'exercise_id': name_to_id[norm_ex],
                'order_index': idx,
                'target_sets': target_set_count,
                'target_reps': 10
            })

    statements.append(f'-- Insert {len(template_exercises_to_insert)} Template Exercises')
    for te in template_exercises_to_insert:
        statements.append(
            f"INSERT INTO public.template_exercises (id, template_id, exercise_id, order_index, target_sets, target_reps, created_at) "
            f"VALUES ('{te['id']}', '{te['template_id']}', '{te['exercise_id']}', {te['order_index']}, {te['target_sets']}, {te['target_reps']}, timezone('utc'::text, now())) "
            f"ON CONFLICT (id) DO UPDATE SET exercise_id = EXCLUDED.exercise_id, order_index = EXCLUDED.order_index, target_sets = EXCLUDED.target_sets, target_reps = EXCLUDED.target_reps;"
        )
    statements.append('')

    clean_logs = [l for l in legacy_logs if l.get('Client_ID') not in PURGED_CLIENT_IDS]
    print(f'Filtered logs: {len(legacy_logs)} raw -> {len(clean_logs)} clean sets (purged 2 duplicates).')

    sessions_by_date: Dict[str, Dict[str, Any]] = {}
    for l in clean_logs:
        d = l['Date']
        if d not in sessions_by_date:
            sessions_by_date[d] = {
                'name': l['Workout_ID'],
                'date': d,
                'first_timestamp': l.get('Timestamp', f'{d}T00:00:00Z'),
                'sets': []
            }
        sessions_by_date[d]['sets'].append(l)

    statements.append(f'-- 3. Insert {len(sessions_by_date)} Workouts')
    for d, sess in sorted(sessions_by_date.items()):
        workout_id = str(uuid.uuid5(ROOT_NAMESPACE, f'workout:{COACH_UID}:{d}'))
        sess_name = sess['name']
        ts = sess['first_timestamp']
        statements.append(
            f"INSERT INTO public.workouts (id, user_id, name, date, created_at) "
            f"VALUES ('{workout_id}', '{COACH_UID}', {escape_sql_str(sess_name)}, '{d}T00:00:00Z'::timestamptz, '{ts}'::timestamptz) "
            f"ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, date = EXCLUDED.date;"
        )
    statements.append('')

    statements.append(f'-- 4. Insert {len(clean_logs)} Workout Sets')
    total_tonnage = 0.0
    for l in clean_logs:
        d = l['Date']
        workout_id = str(uuid.uuid5(ROOT_NAMESPACE, f'workout:{COACH_UID}:{d}'))
        client_id = l['Client_ID']
        set_id = str(uuid.uuid5(ROOT_NAMESPACE, f'set:{client_id}'))
        raw_ex_name = l['Exercise_ID'].strip()
        norm_ex_name = raw_ex_name.lower()
        if norm_ex_name not in name_to_id:
            raise RuntimeError(f'Logged exercise "{raw_ex_name}" cannot be resolved!')
        exercise_id = name_to_id[norm_ex_name]
        reps = int(l['Reps'])
        weight = float(l['Weight'])
        set_index = int(l['Set_Index'])
        ts = l.get('Timestamp', f'{d}T00:00:00Z')
        total_tonnage += (weight * reps)

        statements.append(
            f"INSERT INTO public.sets (id, workout_id, exercise_id, reps, weight, set_index, set_type, rpe, created_at) "
            f"VALUES ('{set_id}', '{workout_id}', '{exercise_id}', {reps}, {weight}, {set_index}, 'working', NULL, '{ts}'::timestamptz) "
            f"ON CONFLICT (id) DO UPDATE SET workout_id = EXCLUDED.workout_id, exercise_id = EXCLUDED.exercise_id, reps = EXCLUDED.reps, weight = EXCLUDED.weight, set_index = EXCLUDED.set_index, set_type = EXCLUDED.set_type, rpe = EXCLUDED.rpe;"
        )
    print(f'Total historical volume calculated: {total_tonnage:.1f} lbs across {len(clean_logs)} sets.')
    statements.append('')

    statements.append(f'-- 5. Insert {len(nutrition_rows)} Daily Nutrition Logs')
    for r in nutrition_rows:
        d = r['Date'].strip()
        nid = str(uuid.uuid5(ROOT_NAMESPACE, f'nutrition:{COACH_UID}:{d}'))
        cal = float(r['Calories (kcal)'])
        protein = float(r['Protein (g)'])
        fat = float(r['Fat (g)'])
        carbs = float(r['Carbs (g)'])
        logged_at = f'{d}T12:00:00Z'

        statements.append(
            f"INSERT INTO public.nutrition_logs (id, user_id, food_name, calories, protein, carbs, fat, fiber, meal_type, serving_size, serving_unit, logged_at, created_at) "
            f"VALUES ('{nid}', '{COACH_UID}', 'Daily Macro Summary', {cal}, {protein}, {carbs}, {fat}, 0, 'meal', 1, 'serving', '{logged_at}'::timestamptz, '{logged_at}'::timestamptz) "
            f"ON CONFLICT (id) DO UPDATE SET calories = EXCLUDED.calories, protein = EXCLUDED.protein, carbs = EXCLUDED.carbs, fat = EXCLUDED.fat, fiber = EXCLUDED.fiber, meal_type = EXCLUDED.meal_type, serving_size = EXCLUDED.serving_size, serving_unit = EXCLUDED.serving_unit, logged_at = EXCLUDED.logged_at;"
        )
    statements.append('')

    statements.append('COMMIT;\n')
    return '\n'.join(statements)


def run_post_migration_verification():
    """Run all verification queries and assert exact schema integrity and counts."""
    print('\n================ POST-MIGRATION VERIFICATION ================')
    verification_sql = """
    SELECT 
      (SELECT count(*) FROM public.workouts WHERE user_id = '2d444ce2-c0cf-483f-a82e-43c8fb9807b1') as workouts_count,
      (SELECT count(*) FROM public.sets WHERE workout_id IN (SELECT id FROM public.workouts WHERE user_id = '2d444ce2-c0cf-483f-a82e-43c8fb9807b1')) as sets_count,
      (SELECT coalesce(sum(weight * reps), 0) FROM public.sets WHERE workout_id IN (SELECT id FROM public.workouts WHERE user_id = '2d444ce2-c0cf-483f-a82e-43c8fb9807b1')) as total_volume,
      (SELECT count(*) FROM public.routine_templates WHERE user_id = '2d444ce2-c0cf-483f-a82e-43c8fb9807b1') as templates_count,
      (SELECT count(*) FROM public.template_exercises WHERE template_id IN (SELECT id FROM public.routine_templates WHERE user_id = '2d444ce2-c0cf-483f-a82e-43c8fb9807b1')) as template_ex_count,
      (SELECT count(*) FROM public.nutrition_logs WHERE user_id = '2d444ce2-c0cf-483f-a82e-43c8fb9807b1') as nutrition_count,
      (SELECT count(*) FROM public.exercises WHERE is_master = true) as exercises_count;
    """
    res = run_remote_query(verification_sql)
    rows = res.get('rows', [])
    if not rows:
        raise RuntimeError(f'Post-migration verification returned no rows! Full result: {res}')

    v = rows[0]
    print('Verification Results:')
    for k, val in v.items():
        print(f'  {k}: {val}')

    workouts_count = int(v['workouts_count'])
    sets_count = int(v['sets_count'])
    total_volume = round(float(v['total_volume']), 1)
    templates_count = int(v['templates_count'])
    template_ex_count = int(v['template_ex_count'])
    nutrition_count = int(v['nutrition_count'])
    exercises_count = int(v['exercises_count'])

    assert workouts_count == 21, f'Expected 21 workouts, got {workouts_count}'
    assert sets_count == 283, f'Expected 283 sets, got {sets_count}'
    assert abs(total_volume - 242973.2) < 0.01, f'Expected 242973.2 lbs volume, got {total_volume}'
    assert templates_count == 4, f'Expected 4 routine templates, got {templates_count}'
    assert template_ex_count == 22, f'Expected 22 template exercises, got {template_ex_count}'
    assert nutrition_count == 46, f'Expected 46 nutrition logs, got {nutrition_count}'
    assert exercises_count == 23, f'Expected 23 exercises in catalog (12 master + 11 custom), got {exercises_count}'

    print('✅ ALL POST-MIGRATION ASSERTIONS PASSED WITH 100% PRECISION!')


def main():
    parser = argparse.ArgumentParser(description='CyberGym Historical Data Migration')
    parser.add_argument('--dry-run', action='store_true', help='Generate SQL without executing')
    parser.add_argument('--refresh-nutrition', action='store_true', help='Force re-export nutrition CSV from Google Drive')
    parser.add_argument('--sql-out', default='/tmp/production_migration.sql', help='Output SQL file path')
    args = parser.parse_args()

    print('Starting CyberGym Historical Data Migration Pipeline...')

    # 1. Fetch Source Data
    legacy_exercises = fetch_apps_script_data('Exercises')
    legacy_templates = fetch_apps_script_data('Templates', athlete='duy')
    legacy_logs = fetch_apps_script_data('Logs', athlete='duy')
    nutrition_rows = fetch_nutrition_csv('/tmp/live_nutrition_log.csv', force_refresh=args.refresh_nutrition)

    # 2. Query Existing Exercises from Remote DB
    print('Querying existing exercises from remote Supabase...')
    ex_res = run_remote_query('SELECT id, name, is_master FROM public.exercises;')
    existing_exercises = ex_res.get('rows', [])
    print(f'Found {len(existing_exercises)} existing exercises in remote database.')

    # 3. Build Migration SQL
    sql_content = build_migration_sql(
        existing_exercises=existing_exercises,
        legacy_exercises=legacy_exercises,
        legacy_templates=legacy_templates,
        legacy_logs=legacy_logs,
        nutrition_rows=nutrition_rows
    )

    with open(args.sql_out, 'w', encoding='utf-8') as f:
        f.write(sql_content)
    print(f'Generated migration SQL saved to {args.sql_out} ({len(sql_content)} bytes).')

    if args.dry_run:
        print('Dry run complete. No database modifications made.')
        return

    # 4. Apply Transaction to Remote Supabase Database
    print(f'Executing migration transaction on remote database via Supabase CLI...')
    exec_res = run_remote_file(args.sql_out)
    print('Migration transaction executed successfully.')

    # 5. Run Post-Migration Verification
    run_post_migration_verification()


if __name__ == '__main__':
    main()

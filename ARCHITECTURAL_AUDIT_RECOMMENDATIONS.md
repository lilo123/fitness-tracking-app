# Cyber-Gym V2: Architectural Audit & Agent Recommendations

**Author:** Jetski Orchestrator / DeepInvestigator Review  
**Date:** August 31, 2026  
**Target Audience:** Development Agents executing Phase 3 (Capacitor), Phase 4 (React Offline UI / Dexie), and Phase 5 (Supabase Edge AI)

---

## 1. Executive Summary & Critical Bugs Caught

An independent architectural and empirical audit of the PRD, technical stack, and database schema was conducted against the local environment. **Do not proceed with standard execution without adopting the following corrections:**

### 🚨 Blocker 1: PostgreSQL RLS Infinite Recursion
* **The Bug:** Checking `role = 'coach'` using an inline subquery against `public.users` within `public.users` policies creates an immediate infinite loop:
  `ERROR: infinite recursion detected in policy for relation "users"`
  Because every subsequent table (`workouts`, `sets`, `nutrition_logs`, `hydration_logs`, `routine_templates`) evaluated permissions with this subquery, **every single database query in the entire application failed**.
* **The Resolution:** Role checks must be encapsulated in a `SECURITY DEFINER` function with `SET search_path = public` (`public.is_coach()`). This executes with database-owner permissions to inspect `public.users` safely without triggering RLS recursively.

### 🚨 Blocker 2: Health Connect Plugin Capabilities
* **`@devmaxime/capacitor-health-connect`:** Read-only; lacks insert methods for nutrition and hydration. **Unusable.**
* **`@capgo/capacitor-health`:** Only supports `dietaryEnergyConsumed` (calories) and `dietaryWater`. Has **no support** for Protein, Carbs, Fat, or Fiber in its `HealthDataType`. **Unusable for Epic 2.**
* **Approved Solution:** Use **`@kiwi-health/capacitor-health-connect@0.0.42`**, which natively supports complete nutrition payloads (`energy`, `protein`, `totalCarbohydrate`, `totalFat`, `dietaryFiber`), `Hydration`, and `ExerciseSession`.

### 🚨 Blocker 3: Capacitor 7 Dependency Pinning
* `@kiwi-health/capacitor-health-connect` strictly specifies `peerDependencies: { "@capacitor/core": "^7.0.0" }`. 
* Installing Capacitor 8 triggers fatal npm `ERESOLVE` peer dependency errors. 
* **Pin Capacitor to version 7:** (`@capacitor/core@^7.0.0`, `@capacitor/cli@^7.0.0`, `@capacitor/android@^7.0.0`).

### 🚨 Blocker 4: Athlete Access to Master Workout Routines (Epic 1)
* Policies defining `user_id = auth.uid() or is_coach()` prevent athletes from seeing master routine templates created by Coach Duy (`user_id = coach_id`).
* The athlete would receive 0 templates upon logging in.
* **The Resolution:** Update `routine_templates` and `template_exercises` SELECT policies to include `or is_master = true or assigned_to = auth.uid()`.

### 🚨 Blocker 5: Missing Macro Progress Targets (Epic 2)
* The PRD requires daily progress rings for Calories, Protein, Carbs, Fat, Fiber, and Water.
* A progress ring cannot render without target goals (denominator). Target columns (`target_calories`, `target_protein`, `target_carbs`, `target_fat`, `target_fiber`, `target_water_ml`) have been added to `public.users`.

### 🚨 Blocker 6: Missing Health Connect Sync ID on Workouts
* `workouts` lacked a `health_connect_record_id` column. Re-syncing would duplicate exercise sessions in Health Connect.

---

## 2. Phase-by-Phase Directives for Agents

### 📌 Phase 3: Capacitor Foundation & Health Connect

1. **Install Core Dependencies:**
   ```bash
   source ~/.nvm/nvm.sh
   npm install @capacitor/core@^7.0.0 @kiwi-health/capacitor-health-connect@0.0.42
   npm install -D @capacitor/cli@^7.0.0 @capacitor/android@^7.0.0
   npx cap init "CyberGym" "com.cybergym.app" --web-dir dist
   npx cap add android
   ```

2. **Configure `android/app/src/main/AndroidManifest.xml`:**
   Add required permissions, package queries, and Android 14+ permission usage activity aliases:
   ```xml
   <manifest xmlns:android="http://schemas.android.com/apk/res/android">
       <!-- Queries declaration for Health Connect on Android 13- -->
       <queries>
           <package android:name="com.google.android.apps.healthdata" />
       </queries>

       <uses-permission android:name="android.permission.health.READ_NUTRITION"/>
       <uses-permission android:name="android.permission.health.WRITE_NUTRITION"/>
       <uses-permission android:name="android.permission.health.READ_EXERCISE"/>
       <uses-permission android:name="android.permission.health.WRITE_EXERCISE"/>
       <uses-permission android:name="android.permission.health.READ_HYDRATION"/>
       <uses-permission android:name="android.permission.health.WRITE_HYDRATION"/>

       <application ...>
           <activity android:name=".MainActivity" ...>
               <intent-filter>
                   <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
               </intent-filter>
           </activity>
           <activity-alias
               android:name="ViewPermissionUsageActivity"
               android:targetActivity=".MainActivity"
               android:permission="android.permission.START_VIEW_PERMISSION_USAGE"
               android:exported="true">
               <intent-filter>
                   <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                   <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
               </intent-filter>
           </activity-alias>
       </application>
   </manifest>
   ```

3. **Web Mock Service Abstraction (`src/services/health/index.ts`):**
   Wrap native calls in an interface checking `Capacitor.isNativePlatform()`. When in web dev mode, log calls to the console and return mock UUIDs. This prevents blockers due to missing local Android SDK/`adb` in shell PATH.

---

### 📌 Phase 4: React Offline UI & Dexie Outbox Engine

1. **Apply Migration:**
   Apply the SQL provided in Section 3 via `npx supabase migration new schema_refinements`.

2. **Dexie & React Hooks:**
   ```bash
   source ~/.nvm/nvm.sh
   npm install dexie-react-hooks@^4.4.0
   ```
   * Set up local Dexie tables: `workouts`, `sets`, `nutrition_logs`, `hydration_logs`, `exercises`, `routine_templates`, `outbox`.
   * Bind the UI reactively via `useLiveQuery()`.
   * Generate entity IDs client-side using `crypto.randomUUID()`.

3. **Outbox Synchronization:**
   * Listen to `window.addEventListener('online', flushOutbox)`.
   * Upsert in strict foreign key order: parent `workouts` first, child `sets` second, then `nutrition_logs` and `hydration_logs`.

4. **Mobile Layout Cleaning:**
   * In `src/index.css`, delete lines 55–65 (`#root { width: 1126px; ... }`).
   * Apply mobile viewport styles (`w-full min-h-dvh select-none`) and safe-area padding:
     ```css
     padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
     ```
   * In `index.html`, set viewport metadata to `viewport-fit=cover, user-scalable=no`.

---

### 📌 Phase 5: Supabase Edge AI Function

1. **Deno SDK Import:**
   * Do NOT run `npm install @google/genai` in the React frontend.
   * In the Edge Function, import directly:
     ```typescript
     import { GoogleGenAI } from "npm:@google/genai@^2.19.0";
     ```

2. **Model Parameterization:**
   * Read the model string dynamically from secrets:
     ```typescript
     const modelId = Deno.env.get("GEMINI_MODEL_ID") ?? "gemini-3.7-flash";
     ```
   * This guarantees seamless switching between `gemini-3.7-flash` and `gemini-2.5-flash` with zero frontend or native app redeployments.

---

## 3. Verified & Tested Supabase Migration SQL

Execute this script in Supabase:

```sql
-- 1. Helper function to check coach role safely without RLS infinite recursion
create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'coach'
  );
$$;

-- 2. Add role and target macro goals to public.users
alter table public.users add column if not exists role text not null default 'athlete' check (role in ('coach', 'athlete'));
alter table public.users add column if not exists target_calories numeric default 2200;
alter table public.users add column if not exists target_protein numeric default 160;
alter table public.users add column if not exists target_carbs numeric default 220;
alter table public.users add column if not exists target_fat numeric default 70;
alter table public.users add column if not exists target_fiber numeric default 30;
alter table public.users add column if not exists target_water_ml numeric default 3000;

-- 3. Auto-create public.users row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, username, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'athlete')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Set ordering and attributes on sets
alter table public.sets add column if not exists set_index int not null default 1;
alter table public.sets add column if not exists set_type text not null default 'working' check (set_type in ('warmup', 'working', 'drop', 'failure'));
alter table public.sets add column if not exists rpe numeric;

-- 5. Add fiber & nutrition enhancements
alter table public.nutrition_logs add column if not exists fiber numeric;
alter table public.nutrition_logs add column if not exists meal_type text;
alter table public.nutrition_logs add column if not exists serving_size numeric;
alter table public.nutrition_logs add column if not exists serving_unit text;
alter table public.custom_dishes add column if not exists fiber numeric;

-- 6. Health Connect sync tracking on workouts
alter table public.workouts add column if not exists health_connect_record_id text;

-- 7. Dedicated hydration_logs table
create table if not exists public.hydration_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  amount_ml numeric not null,
  health_connect_record_id text,
  logged_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Routine templates and template exercises
create table if not exists public.routine_templates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  assigned_to uuid references public.users(id) on delete set null,
  name text not null,
  description text,
  days_of_week text[],
  is_master boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.template_exercises (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references public.routine_templates(id) on delete cascade not null,
  exercise_id uuid references public.exercises(id) on delete cascade not null,
  order_index int not null default 1,
  target_sets int not null default 3,
  target_reps text not null default '8-12',
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. Performance Indexes
create index if not exists idx_workouts_user_date on public.workouts(user_id, date desc);
create index if not exists idx_sets_workout on public.sets(workout_id);
create index if not exists idx_sets_exercise on public.sets(exercise_id);
create index if not exists idx_nutrition_user_date on public.nutrition_logs(user_id, logged_at desc);
create index if not exists idx_hydration_user_date on public.hydration_logs(user_id, logged_at desc);
create index if not exists idx_routine_templates_user on public.routine_templates(user_id, assigned_to);
create index if not exists idx_template_exercises_tpl on public.template_exercises(template_id);

-- 10. Enable Row Level Security
alter table public.users enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.sets enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.custom_dishes enable row level security;
alter table public.hydration_logs enable row level security;
alter table public.routine_templates enable row level security;
alter table public.template_exercises enable row level security;

-- 11. Recursion-Free RLS Policies
create policy "Users viewable by self or coach"
  on public.users for select to authenticated
  using (auth.uid() = id or public.is_coach());

create policy "Users modifiable by self or coach"
  on public.users for update to authenticated
  using (auth.uid() = id or public.is_coach());

create policy "Exercises viewable by authenticated users"
  on public.exercises for select to authenticated
  using (true);

create policy "Exercises modifiable by coach"
  on public.exercises for all to authenticated
  using (public.is_coach());

create policy "Workouts viewable by owner or coach"
  on public.workouts for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

create policy "Sets accessible by workout owner or coach"
  on public.sets for all to authenticated
  using (exists (
    select 1 from public.workouts w
    where w.id = sets.workout_id and (w.user_id = auth.uid() or public.is_coach())
  ));

-- Nutrition Logs: Owner or coach
create policy "Nutrition logs accessible by owner or coach"
  on public.nutrition_logs for all to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- Hydration Logs: Owner or coach
create policy "Hydration logs accessible by owner or coach"
  on public.hydration_logs for all to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- Custom Dishes: Owner or coach
create policy "Custom dishes accessible by owner or coach"
  on public.custom_dishes for all to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- Routine Templates: Master routines & assigned routines are viewable by athlete
create policy "Routine templates viewable by assigned, owner, master, or coach"
  on public.routine_templates for select to authenticated
  using (user_id = auth.uid() or assigned_to = auth.uid() or is_master = true or public.is_coach());

create policy "Routine templates mutable by owner or coach"
  on public.routine_templates for all to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- Template Exercises: Viewable if parent template is viewable
create policy "Template exercises viewable if template is viewable"
  on public.template_exercises for select to authenticated
  using (exists (
    select 1 from public.routine_templates t
    where t.id = template_exercises.template_id
      and (t.user_id = auth.uid() or t.assigned_to = auth.uid() or t.is_master = true or public.is_coach())
  ));

create policy "Template exercises mutable by template owner or coach"
  on public.template_exercises for all to authenticated
  using (exists (
    select 1 from public.routine_templates t
    where t.id = template_exercises.template_id
      and (t.user_id = auth.uid() or public.is_coach())
  ));

-- 12. Seed Default Exercises from Legacy V1
insert into public.exercises (name, body_part) values
  ('Incline Bench Press', 'Chest'),
  ('Cable Lateral Raises', 'Shoulders'),
  ('Dips', 'Chest / Triceps'),
  ('Leg Extension Machine', 'Legs'),
  ('Overhead Tricep Cable Pull', 'Arms'),
  ('Leg Raise', 'Core'),
  ('Lat Pull Down', 'Back'),
  ('Seated Cable Row', 'Back'),
  ('Inclined Bicep Curl', 'Arms'),
  ('Leg Curl', 'Legs'),
  ('Face Pulls', 'Shoulders'),
  ('Weighted Sit-Up', 'Core')
on conflict do nothing;
```

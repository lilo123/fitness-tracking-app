import type { NutritionItem } from '../utils/itemModel';

export type UserRole = 'coach' | 'athlete';

export interface UserProfile {
  id: string;
  email: string | null;
  username: string | null;
  role: UserRole;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_fiber?: number;
  auto_rest_timer?: boolean;
  is_coach_mode?: boolean;
  coach_code?: string | null;
  coach_tier?: 'free' | 'pro' | 'enterprise';
  max_athletes?: number;
  created_at?: string;
}

export interface CoachAthleteLink {
  id: string;
  coach_id: string;
  athlete_id: string;
  status: 'active' | 'disconnected';
  linked_at: string;
  disconnected_at?: string | null;
  coach?: UserProfile;
  athlete?: UserProfile;
}

export interface Exercise {
  id: string;
  name: string;
  body_part: string | null;
  user_id?: string | null;
  is_master?: boolean;
  is_archived?: boolean;
  created_at?: string;
}

export type SetType = 'warmup' | 'working' | 'drop';

export interface WorkoutSet {
  id?: string;
  workout_id?: string;
  exercise_id: string;
  exercise_name?: string;
  exercise?: {
    id?: string;
    name: string;
    body_part?: string | null;
  } | null;
  workouts?: {
    date?: string;
    name?: string | null;
  } | null;
  workout_date?: string;
  workout_name?: string;
  set_index: number;
  set_type: SetType;
  weight: number;
  reps: number;
  rpe?: number | null;
  client_id?: string;
  created_at?: string;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string | null;
  date: string;
  created_at?: string;
  sets?: WorkoutSet[];
}

export interface NutritionLog {
  id: string;
  user_id: string;
  food_name: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  meal_type?: string | null;
  serving_size?: number | null;
  serving_unit?: string | null;
  healthConnectRecordId?: string | null;
  logged_at: string;
  created_at?: string;
  /**
   * Level-2 breakdown. NULL (not `[]`) when the log has no meaningful
   * hierarchy — a one-component meal is not a hierarchy. When present, the
   * five parent macros above are Σ(items) and the DB enforces it.
   */
  items?: NutritionItem[] | null;
  /**
   * Maintained automatically by DB as a stored generated column.
   * True if items has >= 2 components (level 1 / expandable).
   */
  has_components?: boolean | null;
}

export interface CustomDishRow {
  id: string;
  user_id: string;
  name: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  created_at?: string;
}

export type CustomDish = CustomDishRow;

export interface CustomDishDetail extends CustomDishRow {
  /** @deprecated Legacy free-text breakdown. Read for backfill only; never write it. */
  ingredients?: string | null;
  /** See {@link NutritionLog.items}. */
  items?: NutritionItem[] | null;
}


export interface RoutineTemplate {
  id: string;
  user_id: string;
  name: string;
  is_master: boolean;
  assigned_to: string | null;
  days_of_week?: string[] | null;
  created_at?: string;
  exercises?: TemplateExercise[];
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  exercise_id: string;
  exercise?: { name: string } | null;
  exercise_name?: string;
  order_index: number;
  target_sets: number;
  target_reps: number | null;
  created_at?: string;
}

export interface GhostSetValues {
  weight: number | '';
  reps: number | '';
  hintText: string;
  isFromPrevious: boolean;
}

export interface ExerciseBenchmarks {
  lastSession: {
    date: string;
    summaryText: string;
    sets: WorkoutSet[];
  } | null;
  pr: {
    weight: number;
    reps: number;
    date: string;
  } | null;
}

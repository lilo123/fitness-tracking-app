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
  created_at?: string;
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
}

export interface CustomDish {
  id: string;
  user_id: string;
  name: string;
  ingredients: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  created_at?: string;
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
  exercise?: { name: string };
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

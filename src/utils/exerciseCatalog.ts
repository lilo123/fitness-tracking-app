export interface DefaultExercise {
  id: string;
  name: string;
  body_part: string;
}

export const DEFAULT_EXERCISES_LIST: DefaultExercise[] = [
  { id: 'e0000000-0000-0000-0000-000000000001', name: 'Incline Bench Press', body_part: 'Chest' },
  { id: 'e0000000-0000-0000-0000-000000000002', name: 'Cable Lateral Raises', body_part: 'Shoulders' },
  { id: 'e0000000-0000-0000-0000-000000000003', name: 'Dips', body_part: 'Chest / Triceps' },
  { id: 'e0000000-0000-0000-0000-000000000004', name: 'Leg Extension Machine', body_part: 'Legs' },
  { id: 'e0000000-0000-0000-0000-000000000005', name: 'Overhead Tricep Cable Pull', body_part: 'Arms' },
  { id: 'e0000000-0000-0000-0000-000000000006', name: 'Leg Raise', body_part: 'Core' },
  { id: 'e0000000-0000-0000-0000-000000000007', name: 'Lat Pull Down', body_part: 'Back' },
  { id: 'e0000000-0000-0000-0000-000000000008', name: 'Seated Cable Row', body_part: 'Back' },
  { id: 'e0000000-0000-0000-0000-000000000009', name: 'Inclined Bicep Curl', body_part: 'Arms' },
  { id: 'e0000000-0000-0000-0000-000000000010', name: 'Leg Curl', body_part: 'Legs' },
  { id: 'e0000000-0000-0000-0000-000000000011', name: 'Face Pulls', body_part: 'Shoulders' },
  { id: 'e0000000-0000-0000-0000-000000000012', name: 'Weighted Sit-Up', body_part: 'Core' },
];

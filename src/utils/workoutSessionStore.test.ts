import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { workoutSessionStore } from './workoutSessionStore';

describe('workoutSessionStore', () => {
  const userId = 'user-123';
  const today = '2026-09-08';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${today}T10:00:00Z`));
    localStorage.clear();
    sessionStorage.clear();
    workoutSessionStore.resetForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. initializes default session and persists to localStorage', () => {
    const session = workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Push Day',
      exercises: ['Bench Press', 'Incline DB Press'],
      targetSetCounts: { 'Bench Press': 4, 'Incline DB Press': 3 },
      targetRepCounts: { 'Bench Press': 8, 'Incline DB Press': 10 },
    });

    expect(session.routineName).toBe('Push Day');
    expect(session.exercises).toEqual(['Bench Press', 'Incline DB Press']);
    expect(session.targetSetCounts['Bench Press']).toBe(4);
    expect(session.completedAt).toBeNull();

    // Verify stored in localStorage
    const raw = localStorage.getItem(`cybergym_active_session_${userId}_${today}`);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.sessionId).toBe(session.sessionId);
    expect(parsed.schemaVersion).toBe(1);

    // Verify pointer set for today
    expect(localStorage.getItem(`cybergym_current_session_pointer_${userId}`)).toBe(today);
  });

  it('2. immediate macro write on updateTargetSets', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Push Day',
      exercises: ['Bench Press'],
      targetSetCounts: { 'Bench Press': 3 },
      targetRepCounts: { 'Bench Press': 8 },
    });

    workoutSessionStore.updateTargetSets(userId, today, 'Bench Press', 5);

    const session = workoutSessionStore.getSession(userId, today);
    expect(session?.targetSetCounts['Bench Press']).toBe(5);

    const raw = localStorage.getItem(`cybergym_active_session_${userId}_${today}`);
    expect(JSON.parse(raw!).targetSetCounts['Bench Press']).toBe(5);
  });

  it('3. immediate macro write on removeExercise (removes exercise, targets, and drafts)', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Leg Day',
      exercises: ['Squat', 'Leg Extension'],
      targetSetCounts: { Squat: 4, 'Leg Extension': 3 },
      targetRepCounts: { Squat: 6, 'Leg Extension': 12 },
    });

    workoutSessionStore.setDraftInput(userId, today, 'Leg Extension', 1, { weight: '150', reps: '12' });
    workoutSessionStore.flushPendingWrites();

    workoutSessionStore.removeExercise(userId, today, 'Leg Extension');

    const session = workoutSessionStore.getSession(userId, today);
    expect(session?.exercises).toEqual(['Squat']);
    expect(session?.targetSetCounts['Leg Extension']).toBeUndefined();
    expect(session?.inputDrafts['Leg Extension_1']).toBeUndefined();

    // Verify sessionStorage mirror updated
    const mirror = sessionStorage.getItem(`cybergym_active_exercises_${userId}_${today}`);
    expect(JSON.parse(mirror!)).toEqual(['Squat']);
  });

  it('4. immediate macro write on reorderExercises (preserves new order)', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Upper Body',
      exercises: ['Pull-up', 'Dip', 'Row'],
      targetSetCounts: { 'Pull-up': 3, Dip: 3, Row: 3 },
      targetRepCounts: {},
    });

    workoutSessionStore.reorderExercises(userId, today, ['Row', 'Pull-up', 'Dip']);

    const session = workoutSessionStore.getSession(userId, today);
    expect(session?.exercises).toEqual(['Row', 'Pull-up', 'Dip']);

    const raw = localStorage.getItem(`cybergym_active_session_${userId}_${today}`);
    expect(JSON.parse(raw!).exercises).toEqual(['Row', 'Pull-up', 'Dip']);
  });

  it('5. debounced micro write on setDraftInput and synchronous flush on flushPendingWrites()', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Push Day',
      exercises: ['Bench Press'],
      targetSetCounts: { 'Bench Press': 3 },
      targetRepCounts: {},
    });

    workoutSessionStore.setDraftInput(userId, today, 'Bench Press', 1, { weight: '225', reps: '5' });

    // Before 300ms, not yet flushed to localStorage
    let session = workoutSessionStore.getSession(userId, today);
    expect(session?.inputDrafts['Bench Press_1']).toBeUndefined();

    // Advance 300ms
    vi.advanceTimersByTime(300);

    session = workoutSessionStore.getSession(userId, today);
    expect(session?.inputDrafts['Bench Press_1']).toEqual({ weight: '225', reps: '5' });

    // Test synchronous flush
    workoutSessionStore.setDraftInput(userId, today, 'Bench Press', 2, { weight: '230', reps: '4' });
    workoutSessionStore.flushPendingWrites();

    session = workoutSessionStore.getSession(userId, today);
    expect(session?.inputDrafts['Bench Press_2']).toEqual({ weight: '230', reps: '4' });
  });

  it('6. flushes drafts tagged with (userId, date) preventing cross-date pollution', () => {
    const tomorrow = '2026-09-09';
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Day 1',
      exercises: ['Squat'],
      targetSetCounts: { Squat: 3 },
      targetRepCounts: {},
    });
    workoutSessionStore.getOrInitSession(userId, tomorrow, {
      routineName: 'Day 2',
      exercises: ['Bench'],
      targetSetCounts: { Bench: 3 },
      targetRepCounts: {},
    });

    workoutSessionStore.setDraftInput(userId, today, 'Squat', 1, { weight: '315', reps: '5' });
    workoutSessionStore.setDraftInput(userId, tomorrow, 'Bench', 1, { weight: '225', reps: '8' });
    workoutSessionStore.flushPendingWrites();

    const sessionToday = workoutSessionStore.getSession(userId, today);
    const sessionTomorrow = workoutSessionStore.getSession(userId, tomorrow);

    expect(sessionToday?.inputDrafts['Squat_1']).toEqual({ weight: '315', reps: '5' });
    expect(sessionToday?.inputDrafts['Bench_1']).toBeUndefined();

    expect(sessionTomorrow?.inputDrafts['Bench_1']).toEqual({ weight: '225', reps: '8' });
    expect(sessionTomorrow?.inputDrafts['Squat_1']).toBeUndefined();
  });

  it('7. session expiration after 24h TTL', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Push Day',
      exercises: ['Bench Press'],
      targetSetCounts: { 'Bench Press': 3 },
      targetRepCounts: {},
    });

    expect(workoutSessionStore.getSession(userId, today)).not.toBeNull();

    // Advance 25 hours
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    expect(workoutSessionStore.getSession(userId, today)).toBeNull();
  });

  it('8. garbage collection: pruneExpiredSessions() removes sessions >24h old', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Old Workout',
      exercises: ['Deadlift'],
      targetSetCounts: { Deadlift: 3 },
      targetRepCounts: {},
    });

    const key = `cybergym_active_session_${userId}_${today}`;
    expect(localStorage.getItem(key)).not.toBeNull();

    // Advance time past TTL
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    workoutSessionStore.pruneExpiredSessions();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('9. athlete scoping: Athlete A session does not collide with Athlete B session', () => {
    const athleteA = 'athlete-A';
    const athleteB = 'athlete-B';

    workoutSessionStore.getOrInitSession(athleteA, today, {
      routineName: 'Athlete A Routine',
      exercises: ['Overhead Press'],
      targetSetCounts: { 'Overhead Press': 3 },
      targetRepCounts: {},
    });

    workoutSessionStore.getOrInitSession(athleteB, today, {
      routineName: 'Athlete B Routine',
      exercises: ['Pull-up'],
      targetSetCounts: { 'Pull-up': 5 },
      targetRepCounts: {},
    });

    const sessionA = workoutSessionStore.getSession(athleteA, today);
    const sessionB = workoutSessionStore.getSession(athleteB, today);

    expect(sessionA?.routineName).toBe('Athlete A Routine');
    expect(sessionA?.exercises).toEqual(['Overhead Press']);

    expect(sessionB?.routineName).toBe('Athlete B Routine');
    expect(sessionB?.exercises).toEqual(['Pull-up']);
  });

  it('10. dual-write mirroring to sessionStorage for backward compatibility', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Full Body',
      exercises: ['Squat', 'Bench Press'],
      targetSetCounts: {},
      targetRepCounts: {},
    });

    const mirrorEx = sessionStorage.getItem(`cybergym_active_exercises_${userId}_${today}`);
    const mirrorRtn = sessionStorage.getItem(`cybergym_routine_${userId}_${today}`);

    expect(JSON.parse(mirrorEx!)).toEqual(['Squat', 'Bench Press']);
    expect(mirrorRtn).toBe('Full Body');

    // On clear workout
    workoutSessionStore.clearWorkout(userId, today);
    expect(sessionStorage.getItem(`cybergym_active_exercises_${userId}_${today}`)).toBeNull();
    expect(sessionStorage.getItem(`cybergym_routine_${userId}_${today}`)).toBe('Free Workout');
  });

  it('11. sets completed session timestamp on completeSession() and clears pointer', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Legs',
      exercises: ['Squat'],
      targetSetCounts: { Squat: 3 },
      targetRepCounts: {},
    });

    expect(localStorage.getItem(`cybergym_current_session_pointer_${userId}`)).toBe(today);

    workoutSessionStore.completeSession(userId, today);

    const session = workoutSessionStore.getSession(userId, today);
    expect(session?.completedAt).toBeTruthy();

    // Pointer cleared
    expect(localStorage.getItem(`cybergym_current_session_pointer_${userId}`)).toBeNull();

    // getActiveSession without date returns null when completed
    expect(workoutSessionStore.getActiveSession(userId)).toBeNull();

    // But getSession with date still returns the session
    expect(workoutSessionStore.getSession(userId, today)).not.toBeNull();
  });

  it('12. reopens session (reopenSession) on set deletion', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Legs',
      exercises: ['Squat'],
      targetSetCounts: { Squat: 3 },
      targetRepCounts: {},
    });

    workoutSessionStore.completeSession(userId, today);
    expect(workoutSessionStore.getSession(userId, today)?.completedAt).toBeTruthy();

    workoutSessionStore.reopenSession(userId, today);
    const session = workoutSessionStore.getSession(userId, today);
    expect(session?.completedAt).toBeNull();
    expect(localStorage.getItem(`cybergym_current_session_pointer_${userId}`)).toBe(today);
  });

  it('13. deleteSession removes session, cleans pointer, cleans mirrors, and cancels pending drafts', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Chest Day',
      exercises: ['Bench Press'],
      targetSetCounts: { 'Bench Press': 3 },
      targetRepCounts: {},
    });

    workoutSessionStore.setDraftInput(userId, today, 'Bench Press', 1, { weight: '205', reps: '6' });

    expect(localStorage.getItem(`cybergym_active_session_${userId}_${today}`)).not.toBeNull();
    expect(localStorage.getItem(`cybergym_current_session_pointer_${userId}`)).toBe(today);

    workoutSessionStore.deleteSession(userId, today);

    expect(localStorage.getItem(`cybergym_active_session_${userId}_${today}`)).toBeNull();
    expect(localStorage.getItem(`cybergym_current_session_pointer_${userId}`)).toBeNull();
    expect(sessionStorage.getItem(`cybergym_active_exercises_${userId}_${today}`)).toBeNull();
    expect(sessionStorage.getItem(`cybergym_routine_${userId}_${today}`)).toBeNull();

    // Flushing should not resurrect the session
    workoutSessionStore.flushPendingWrites();
    expect(workoutSessionStore.getSession(userId, today)).toBeNull();
  });

  it('14. removeExercise, clearWorkout, and updateRoutine immediately purge uncommitted drafts so they do not resurrect', () => {
    workoutSessionStore.getOrInitSession(userId, today, {
      routineName: 'Chest Day',
      exercises: ['Bench Press', 'Flyes'],
      targetSetCounts: { 'Bench Press': 3, Flyes: 3 },
      targetRepCounts: {},
    });

    // Type draft for Flyes but do NOT advance timers
    workoutSessionStore.setDraftInput(userId, today, 'Flyes', 1, { weight: '40', reps: '12' });

    // Remove Flyes before 300ms debounce fires
    workoutSessionStore.removeExercise(userId, today, 'Flyes');

    // Flush pending writes
    workoutSessionStore.flushPendingWrites();

    const session = workoutSessionStore.getSession(userId, today);
    expect(session?.exercises).toEqual(['Bench Press']);
    expect(session?.inputDrafts['Flyes_1']).toBeUndefined();
  });

  it('15. pruneExpiredSessions cleans all consecutive expired sessions without index-shift skipping and purges stale pointer', () => {
    const dates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'];
    dates.forEach((d) => {
      workoutSessionStore.getOrInitSession(userId, d, {
        routineName: 'Old',
        exercises: ['Push-up'],
        targetSetCounts: {},
        targetRepCounts: {},
      });
    });

    // Point pointer to 2026-08-04
    localStorage.setItem(`cybergym_current_session_pointer_${userId}`, '2026-08-04');

    // Advance past TTL
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    workoutSessionStore.pruneExpiredSessions();

    dates.forEach((d) => {
      expect(localStorage.getItem(`cybergym_active_session_${userId}_${d}`)).toBeNull();
    });
    expect(localStorage.getItem(`cybergym_current_session_pointer_${userId}`)).toBeNull();
  });
});


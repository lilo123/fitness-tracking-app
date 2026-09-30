import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { workoutSessionStore, type ActiveWorkoutSession } from '../utils/workoutSessionStore';
import {
  canApplyUpdate,
  registerUpdateBlocker,
  unregisterUpdateBlocker,
  markFormDirty,
  resetUpdateSafetyForTesting,
} from './updateSafety';

describe('PWA updateSafety blockers', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const testDate = '2026-09-30';

  beforeEach(() => {
    localStorage.clear();
    resetUpdateSafetyForTesting();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    localStorage.clear();
    resetUpdateSafetyForTesting();
    document.body.innerHTML = '';
  });

  it('reports ok: true when no blockers are present', () => {
    const result = canApplyUpdate();
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  describe('Active workout session blocker', () => {
    it('blocks update when an active uncompleted workout session pointer exists', () => {
      const activeSession: ActiveWorkoutSession = {
        schemaVersion: 1,
        sessionId: 'sess_123',
        userId,
        workoutDate: testDate,
        routineName: 'Chest Day',
        exercises: ['Bench Press'],
        targetSetCounts: { 'Bench Press': 3 },
        targetRepCounts: { 'Bench Press': 10 },
        expandedExercises: ['Bench Press'],
        inputDrafts: {},
        startedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
        completedAt: null,
      };

      // Save session with setPointer=true to simulate active session
      workoutSessionStore.saveSession(activeSession, true);

      const result = canApplyUpdate();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Finish your workout and sync first');
    });

    it('does not block update if the session is completed', () => {
      const completedSession: ActiveWorkoutSession = {
        schemaVersion: 1,
        sessionId: 'sess_123',
        userId,
        workoutDate: testDate,
        routineName: 'Chest Day',
        exercises: ['Bench Press'],
        targetSetCounts: { 'Bench Press': 3 },
        targetRepCounts: { 'Bench Press': 10 },
        expandedExercises: [],
        inputDrafts: {},
        startedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      workoutSessionStore.saveSession(completedSession, false);
      localStorage.setItem(`cybergym_current_session_pointer_${userId}`, testDate);

      const result = canApplyUpdate();
      expect(result.ok).toBe(true);
    });
  });

  describe('Open modal blocker', () => {
    it('blocks update when a role="dialog" aria-modal="true" element is in the document', () => {
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);

      const result = canApplyUpdate();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Close open dialog before updating');

      // Once closed/removed from DOM, update is unblocked
      modal.remove();
      expect(canApplyUpdate().ok).toBe(true);
    });
  });

  describe('Dirty-form registry blocker', () => {
    it('blocks update when a form is marked dirty and unblocks when cleaned', () => {
      markFormDirty('exercise-create-form', true);

      const blockedResult = canApplyUpdate();
      expect(blockedResult.ok).toBe(false);
      expect(blockedResult.reason).toBe('Save changes before updating');

      // Cleaning the form unblocks
      markFormDirty('exercise-create-form', false);
      expect(canApplyUpdate().ok).toBe(true);
    });

    it('handles multiple dirty forms correctly', () => {
      markFormDirty('form-1', true);
      markFormDirty('form-2', true);
      expect(canApplyUpdate().ok).toBe(false);

      markFormDirty('form-1', false);
      expect(canApplyUpdate().ok).toBe(false);

      markFormDirty('form-2', false);
      expect(canApplyUpdate().ok).toBe(true);
    });
  });

  describe('Custom registered blockers', () => {
    it('allows registering and unregistering custom blockers (e.g. outbox)', () => {
      registerUpdateBlocker('outbox', () => '3 pending changes syncing');

      const blocked = canApplyUpdate();
      expect(blocked.ok).toBe(false);
      expect(blocked.reason).toBe('3 pending changes syncing');

      unregisterUpdateBlocker('outbox');
      expect(canApplyUpdate().ok).toBe(true);
    });

    it('handles blockers returning boolean false with fallback reason', () => {
      registerUpdateBlocker('busy-task', () => false);

      const result = canApplyUpdate();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Update currently blocked');
    });

    it('handles throwing blockers safely', () => {
      registerUpdateBlocker('faulty', () => {
        throw new Error('Boom');
      });

      const result = canApplyUpdate();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Safety check error');
    });
  });
});

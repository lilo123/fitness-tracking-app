import { workoutSessionStore } from '../utils/workoutSessionStore';

export type UpdateBlockerFn = () => string | null | undefined | boolean;

const POINTER_PREFIX = 'yourbody_current_session_pointer_';
const customBlockers = new Map<string, UpdateBlockerFn>();
const dirtyForms = new Set<string>();

/**
 * Register a custom update blocker.
 * Returning a non-empty string or boolean false blocks the update with that reason.
 */
export function registerUpdateBlocker(id: string, blocker: UpdateBlockerFn): void {
  customBlockers.set(id, blocker);
}

/**
 * Unregister a custom update blocker.
 */
export function unregisterUpdateBlocker(id: string): void {
  customBlockers.delete(id);
}

/**
 * Track dirty/unsaved form state.
 */
export function markFormDirty(id: string, dirty: boolean): void {
  if (dirty) {
    dirtyForms.add(id);
  } else {
    dirtyForms.delete(id);
  }
}

/**
 * Read-only check for active workout sessions via workoutSessionStore pointer API.
 */
function checkActiveWorkoutSession(): string | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const userIdsToCheck: string[] = [];

    // Scan pointer keys in localStorage (yourbody_current_session_pointer_<userId>)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(POINTER_PREFIX)) {
        const uId = key.slice(POINTER_PREFIX.length);
        if (uId && !userIdsToCheck.includes(uId)) {
          userIdsToCheck.push(uId);
        }
      }
    }

    // Also check cached user ID if present
    try {
      const rawUser = localStorage.getItem('yourbody_user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed?.id && !userIdsToCheck.includes(parsed.id)) {
          userIdsToCheck.push(parsed.id);
        }
      }
    } catch {
      // Ignore JSON parse error
    }

    for (const userId of userIdsToCheck) {
      const activeSession = workoutSessionStore.getActiveSession(userId);
      if (activeSession && activeSession.completedAt === null) {
        return 'Finish your workout and sync first';
      }
    }
  } catch {
    // Ignore storage errors
  }

  return null;
}

/**
 * Built-in check for open accessible modals.
 */
function checkOpenModal(): string | null {
  if (typeof document === 'undefined') return null;

  const openModal = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (openModal) {
    return 'Close open dialog before updating';
  }

  return null;
}

/**
 * Built-in check for unsaved form state.
 */
function checkDirtyForms(): string | null {
  if (dirtyForms.size > 0) {
    return 'Save changes before updating';
  }
  return null;
}

/**
 * Evaluates all built-in and registered update blockers.
 * Returns { ok: true } if safe to reload, or { ok: false, reason: string } if blocked.
 */
export function canApplyUpdate(): { ok: boolean; reason?: string } {
  // 1. Built-in: Active workout session
  const workoutReason = checkActiveWorkoutSession();
  if (workoutReason) {
    return { ok: false, reason: workoutReason };
  }

  // 2. Built-in: Open modal
  const modalReason = checkOpenModal();
  if (modalReason) {
    return { ok: false, reason: modalReason };
  }

  // 3. Built-in: Dirty forms
  const dirtyReason = checkDirtyForms();
  if (dirtyReason) {
    return { ok: false, reason: dirtyReason };
  }

  // 4. Custom registered blockers
  for (const [, blocker] of customBlockers) {
    try {
      const result = blocker();
      if (typeof result === 'string' && result.trim().length > 0) {
        return { ok: false, reason: result };
      }
      if (result === false) {
        return { ok: false, reason: 'Update currently blocked' };
      }
    } catch {
      // Blocker threw; fail safe by blocking update
      return { ok: false, reason: 'Safety check error' };
    }
  }

  return { ok: true };
}

/**
 * Test helper to reset blocker registry and dirty forms.
 */
export function resetUpdateSafetyForTesting(): void {
  customBlockers.clear();
  dirtyForms.clear();
}

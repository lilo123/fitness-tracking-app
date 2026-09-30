import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { workoutSessionStore } from './utils/workoutSessionStore';
import { restTimerStore } from './utils/restTimerStore';
import { resetAudioContextForTesting } from './utils/sound';
import { stopPersisting } from './offline/persistController';
import { closeAllOfflineDbs } from './offline/db';
import { resetOutboxForTesting } from './offline/outbox';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
  stopPersisting();
  closeAllOfflineDbs();
  if (typeof indexedDB !== 'undefined') {
    const idb = indexedDB as any;
    if (idb._databases) idb._databases.clear();
  }
  resetOutboxForTesting();
  workoutSessionStore.resetForTesting();
  restTimerStore.resetForTesting();
  resetAudioContextForTesting();
});


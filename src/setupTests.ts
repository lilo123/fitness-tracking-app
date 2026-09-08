import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import { workoutSessionStore } from './utils/workoutSessionStore';
import { restTimerStore } from './utils/restTimerStore';
import { resetAudioContextForTesting } from './utils/sound';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
  workoutSessionStore.resetForTesting();
  restTimerStore.resetForTesting();
  resetAudioContextForTesting();
});


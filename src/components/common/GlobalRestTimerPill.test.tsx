import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GlobalRestTimerPill } from './GlobalRestTimerPill';
import { restTimerStore } from '../../utils/restTimerStore';

describe('GlobalRestTimerPill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    restTimerStore.resetForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders null when timer is stopped/idle', () => {
    render(<GlobalRestTimerPill />);
    expect(screen.queryByTestId('rest-timer-pill')).toBeNull();
  });

  it('renders floating pill with correct formatted time (M:SS) when running', () => {
    render(<GlobalRestTimerPill />);

    act(() => {
      restTimerStore.start(90);
    });

    expect(screen.getByTestId('rest-timer-pill')).toBeDefined();
    expect(screen.getByTestId('rest-timer-display').textContent).toBe('1:30');
  });

  it('toggles play/pause when toggle button is clicked', () => {
    render(<GlobalRestTimerPill />);

    act(() => {
      restTimerStore.start(90);
    });

    const pauseBtn = screen.getByTitle('Pause timer');
    fireEvent.click(pauseBtn);

    expect(screen.getByTitle('Resume timer')).toBeDefined();
    expect(restTimerStore.getSnapshot().isPaused).toBe(true);

    const resumeBtn = screen.getByTitle('Resume timer');
    fireEvent.click(resumeBtn);

    expect(screen.getByTitle('Pause timer')).toBeDefined();
    expect(restTimerStore.getSnapshot().isRunning).toBe(true);
  });

  it('extends duration by 90s on +90s button click', () => {
    render(<GlobalRestTimerPill />);

    act(() => {
      restTimerStore.start(30);
    });

    const add90Btn = screen.getByTitle('Add 90 seconds');
    fireEvent.click(add90Btn);

    expect(screen.getByTestId('rest-timer-display').textContent).toBe('2:00');
    expect(restTimerStore.getSnapshot().remainingSeconds).toBe(120);
  });

  it('stops and unmounts pill on stop button click', () => {
    render(<GlobalRestTimerPill />);

    act(() => {
      restTimerStore.start(90);
    });

    expect(screen.getByTestId('rest-timer-pill')).toBeDefined();

    const stopBtn = screen.getByTitle('Stop timer');
    fireEvent.click(stopBtn);

    expect(screen.queryByTestId('rest-timer-pill')).toBeNull();
    expect(restTimerStore.getSnapshot().isRunning).toBe(false);
  });
});

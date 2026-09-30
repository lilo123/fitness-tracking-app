import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';
import {
  setUpdateAvailableForTesting,
  setUpdateSWFnForTesting,
  resetAppUpdateForTesting,
} from './useAppUpdate';
import {
  registerUpdateBlocker,
  resetUpdateSafetyForTesting,
} from './updateSafety';

describe('UpdateBanner Component', () => {
  beforeEach(() => {
    resetAppUpdateForTesting();
    resetUpdateSafetyForTesting();
  });

  afterEach(() => {
    resetAppUpdateForTesting();
    resetUpdateSafetyForTesting();
  });

  it('renders nothing when no update is available', () => {
    const { container } = render(<UpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders persistent update banner when update is available', () => {
    render(<UpdateBanner />);

    act(() => {
      setUpdateAvailableForTesting(true);
    });

    expect(screen.getByTestId('update-banner')).toBeInTheDocument();
    expect(screen.getByText(/Update available/i)).toBeInTheDocument();
    expect(screen.getByText(/Reload/i)).toBeInTheDocument();
  });

  it('when blocked: shows reason inline and does not call applyUpdate', async () => {
    const mockApplyUpdate = vi.fn().mockResolvedValue(undefined);
    setUpdateSWFnForTesting(mockApplyUpdate);

    registerUpdateBlocker('workout-session', () => 'Finish your workout and sync first');

    render(<UpdateBanner />);

    act(() => {
      setUpdateAvailableForTesting(true);
    });

    const reloadBtn = screen.getByTestId('update-reload-btn');
    await act(async () => {
      fireEvent.click(reloadBtn);
    });

    // Does NOT call applyUpdate
    expect(mockApplyUpdate).not.toHaveBeenCalled();

    // Shows reason inline and keeps banner visible
    expect(screen.getByTestId('update-banner')).toBeInTheDocument();
    expect(screen.getByTestId('update-block-reason')).toHaveTextContent(
      'Finish your workout and sync first'
    );
  });

  it('when safe: calls applyUpdate exactly once', async () => {
    const mockApplyUpdate = vi.fn().mockResolvedValue(undefined);
    setUpdateSWFnForTesting(mockApplyUpdate);

    render(<UpdateBanner />);

    act(() => {
      setUpdateAvailableForTesting(true);
    });

    const reloadBtn = screen.getByTestId('update-reload-btn');
    await act(async () => {
      fireEvent.click(reloadBtn);
    });

    expect(mockApplyUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('update-block-reason')).toBeNull();
  });
});

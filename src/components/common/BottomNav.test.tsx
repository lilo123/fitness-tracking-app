import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { expectNoA11yViolations } from '../../test/a11y';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('BottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderNav = () =>
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

  it('renders nothing when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isCoachMode: false,
    });

    const { container } = renderNav();
    expect(container.firstChild).toBeNull();
  });

  it('renders exactly 5 navigation tabs and no Coach tab when coach mode is active', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'coach-user-id' },
      isCoachMode: true,
    });

    const { container } = renderNav();

    // 5 tabs expected
    const tabs = screen.getAllByTestId(/^nav-/);
    expect(tabs).toHaveLength(5);
    expect(screen.getByTestId('nav-workout')).toBeDefined();
    expect(screen.getByTestId('nav-nutrition')).toBeDefined();
    expect(screen.getByTestId('nav-exercises')).toBeDefined();
    expect(screen.getByTestId('nav-history')).toBeDefined();
    expect(screen.getByTestId('nav-settings')).toBeDefined();

    // Coach tab must not be present in bottom nav
    expect(screen.queryByTestId('nav-coach')).toBeNull();

    // Max width container must be max-w-xl (B3 shell alignment)
    const innerContainer = container.querySelector('nav > div');
    expect(innerContainer?.className).toContain('max-w-xl');

    // Nav element must preserve safe-area-pb
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('safe-area-pb');

    // Axe a11y verification
    await expectNoA11yViolations(container);
  });

  it('5 tabs fit the 320px floor by width arithmetic (VER-01)', async () => {
    // NOTE: Real layout overflow verification requires the deferred Playwright pass (task 0.5),
    // because jsdom does not perform CSS layout or calculate getBoundingClientRect() geometries.
    // However, jsdom can inspect the rendered DOM elements and verify width arithmetic against the 320px floor:
    mockUseAuth.mockReturnValue({
      user: { id: 'athlete-user-id' },
      isCoachMode: false,
    });

    const { container } = renderNav();

    // 1. Count rendered tabs from DOM
    const tabs = screen.getAllByTestId(/^nav-/);
    expect(tabs).toHaveLength(5);

    // 2. Read min-width from each rendered tab's class attribute
    let totalTabMinWidth = 0;
    for (const tab of tabs) {
      const minWidthMatch = tab.className.match(/min-w-\[(\d+)px\]/);
      expect(minWidthMatch).not.toBeNull();
      totalTabMinWidth += parseInt(minWidthMatch![1], 10);
    }
    expect(totalTabMinWidth).toBe(5 * 60); // 300px

    // 3. Read horizontal padding from nav container (px-2 = 8px * 2 = 16px)
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('px-2');
    const horizontalPaddingPx = 16;

    // 4. Compute width arithmetic: 5 * 60 + 16 = 316px <= 320px
    const totalRequiredFloorWidth = totalTabMinWidth + horizontalPaddingPx;
    expect(totalRequiredFloorWidth).toBe(316);
    expect(totalRequiredFloorWidth).toBeLessThanOrEqual(320);

    await expectNoA11yViolations(container);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyCoachCard } from './MyCoachCard';
import { expectNoA11yViolations } from '../../test/a11y';
import type { UserProfile } from '../../types/database';
import { createSupabaseBuilder, clearMockHistory, getRecordedTables, getRecordedSelects } from '../../test/supabaseBuilderMock';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => createSupabaseBuilder(table, { data: null, error: null })),
    rpc: vi.fn().mockImplementation((fn: string, args: any) => {
      if (fn === 'link_to_coach') {
        if (args?.input_code === 'INVALID') {
          return Promise.resolve({ data: { success: false, error: 'Invalid coach code.' }, error: null });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    }),
  },
}));

describe('MyCoachCard accessibility and live regions', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockHistory();
  });

  const mockProfile: UserProfile = {
    id: 'athlete-123',
    email: 'athlete@test.com',
    username: 'Athlete Test',
    role: 'athlete',
    is_coach_mode: false,
    coach_code: null,
    coach_tier: undefined,
    max_athletes: undefined,
    target_calories: 2200,
    target_protein: 160,
    target_carbs: 220,
    target_fat: 70,
    target_fiber: 30,
    created_at: new Date().toISOString(),
  };

  const renderCard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MyCoachCard profile={mockProfile} />
      </QueryClientProvider>
    );

  it('passes axe accessibility audits with no violations', async () => {
    const { container } = renderCard();
    await expectNoA11yViolations(container);
  });

  it('mounts live regions while idle and mutates in place on coach linking status (WCAG SC 4.1.3)', async () => {
    const { container } = renderCard();

    const polite = container.querySelector('[role="status"]');
    const assertive = container.querySelector('[role="alert"]');

    // Both live regions must exist while idle and be empty
    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    expect(polite!.textContent).toBe('');
    expect(assertive!.textContent).toBe('');
    expect(screen.queryByTestId('link-coach-status')).toBeNull();

    // Trigger error by submitting INVALID code
    const input = screen.getByTestId('link-coach-code-input');
    const form = input.closest('form')!;

    fireEvent.change(input, { target: { value: 'INVALID' } });
    fireEvent.submit(form);

    expect(await screen.findByTestId('link-coach-status')).toBeDefined();

    // Node identity preserved across transition (no unmount/remount)
    expect(container.querySelector('[role="status"]')).toBe(polite);
    expect(container.querySelector('[role="alert"]')).toBe(assertive);
    expect(assertive!.textContent).toContain('Invalid coach code.');
    expect(polite!.textContent).toBe('');

    // Trigger success by submitting VALID code
    fireEvent.change(input, { target: { value: 'COACH1' } });
    fireEvent.submit(form);
    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => {
      expect(screen.getByTestId('link-coach-status')).toHaveTextContent('Successfully linked to coach!');
    });

    expect(container.querySelector('[role="status"]')).toBe(polite);
    expect(container.querySelector('[role="alert"]')).toBe(assertive);
    expect(polite!.textContent).toContain('Successfully linked to coach!');
    expect(assertive!.textContent).toBe('');
  });

  it('queries active coach link with exact projection', async () => {
    renderCard();
    expect(getRecordedTables()).toContain('coach_athlete_links');
    expect(getRecordedSelects()).toContainEqual({
      table: 'coach_athlete_links',
      projection: 'id, coach_id, linked_at, coach:users!coach_id(username, email, coach_code)',
    });
  });
});

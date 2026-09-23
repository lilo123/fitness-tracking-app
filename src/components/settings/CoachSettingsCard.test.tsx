import { describe, it, expect, vi , beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoachSettingsCard } from './CoachSettingsCard';
import { expectNoA11yViolations } from '../../test/a11y';
import type { UserProfile } from '../../types/database';
import { createSupabaseBuilder, clearMockHistory, getRecordedTables, getRecordedSelects } from '../../test/supabaseBuilderMock';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => createSupabaseBuilder(table, { data: [], error: null })),
    rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
  },
}));

describe('CoachSettingsCard accessibility', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockHistory();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const mockProfile: UserProfile = {
    id: 'coach-123',
    email: 'coach@test.com',
    username: 'Coach Test',
    role: 'coach',
    is_coach_mode: true,
    coach_code: 'TEST-CODE',
    coach_tier: 'pro',
    max_athletes: 10,
    target_calories: 2000,
    target_protein: 150,
    target_carbs: 200,
    target_fat: 65,
    target_fiber: 30,
    created_at: new Date().toISOString(),
  };

  const renderCard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <CoachSettingsCard
          profile={mockProfile}
          hasCoachCapability={true}
        />
      </QueryClientProvider>
    );

  it('associates label with Custom Vanity Code input', () => {
    renderCard();
    const input = screen.getByLabelText(/custom vanity code/i);
    expect(input).toBeDefined();
    expect(input.getAttribute('data-testid')).toBe('vanity-code-input');
  });

  it('passes axe accessibility audits with no violations', async () => {
    const { container } = renderCard();
    await expectNoA11yViolations(container);
  });

  it('mounts live regions while idle and mutates in place on vanity code status (hasCoachCapability=true) (WCAG SC 4.1.3)', async () => {
    const { container } = renderCard();

    const polite = container.querySelector('[role="status"]');
    const assertive = container.querySelector('[role="alert"]');

    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    expect(polite!.textContent).toBe('');
    expect(assertive!.textContent).toBe('');
    expect(screen.queryByTestId('coach-code-status')).toBeNull();

    // Trigger validation error by typing 2-char code
    const input = screen.getByTestId('vanity-code-input');
    const form = input.closest('form')!;

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: 'AB' } });
    fireEvent.submit(form);

    expect(container.querySelector('[role="status"]')).toBe(polite);
    expect(container.querySelector('[role="alert"]')).toBe(assertive);
    expect(assertive!.textContent).toContain('Code must be 4-20 characters long');
    expect(polite!.textContent).toBe('');

    const statusBanner = screen.getByTestId('coach-code-status');
    expect(statusBanner.textContent).toContain('Code must be 4-20 characters long');
  });

  it('mounts live regions while idle and mutates in place when unactivated (hasCoachCapability=false) (WCAG SC 4.1.3)', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CoachSettingsCard
          profile={mockProfile}
          hasCoachCapability={false}
        />
      </QueryClientProvider>
    );

    const polite = container.querySelector('[role="status"]');
    const assertive = container.querySelector('[role="alert"]');

    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    expect(polite!.textContent).toBe('');
    expect(assertive!.textContent).toBe('');

    const input = container.querySelector('input[type="text"]')!;
    const form = input.closest('form')!;

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: 'AB' } });
    fireEvent.submit(form);

    expect(container.querySelector('[role="status"]')).toBe(polite);
    expect(container.querySelector('[role="alert"]')).toBe(assertive);
    expect(assertive!.textContent).toContain('Code must be 4-20 characters long');
  });

  it('queries coach athlete links with exact projection when coach capability is active', async () => {
    renderCard();
    expect(getRecordedTables()).toContain('coach_athlete_links');
    expect(getRecordedSelects()).toContainEqual({
      table: 'coach_athlete_links',
      projection: 'id',
    });
  });
});

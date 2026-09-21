import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoachSettingsCard } from './CoachSettingsCard';
import { expectNoA11yViolations } from '../../test/a11y';
import type { UserProfile } from '../../types/database';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
  },
}));

describe('CoachSettingsCard accessibility', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
});

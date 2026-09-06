import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginView } from './LoginView';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('LoginView', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <LoginView />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('renders login view with Email, Password and Demo buttons', () => {
    renderComponent();
    expect(screen.getByText('CyberGym')).toBeDefined();
    expect(screen.getByPlaceholderText('athlete@cybergym.io')).toBeDefined();
    expect(screen.getByText('Demo Athlete')).toBeDefined();
    expect(screen.getByText('Demo Coach')).toBeDefined();
  });

  it('displays clear error message when quick demo credentials fail on production', async () => {
    const { fireEvent } = await import('@testing-library/react');
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid login credentials'),
    });

    renderComponent();

    const demoBtn = screen.getByText('Demo Athlete');
    fireEvent.click(demoBtn);

    expect(
      await screen.findByText(
        'Demo accounts are only available in local development. Please sign in or register above.'
      )
    ).toBeDefined();
  });
});

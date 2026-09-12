import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './AuthContext';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types/database';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const TestConsumer: React.FC = () => {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  return (
    <div>
      <div data-testid="auth-loading">{loading ? 'true' : 'false'}</div>
      <div data-testid="auth-user-id">{user?.id || 'none'}</div>
      <div data-testid="auth-user-email">{user?.email || 'none'}</div>
      <div data-testid="auth-profile-username">{profile?.username || 'none'}</div>
      <button data-testid="auth-signout-btn" onClick={() => signOut()}>
        Sign Out
      </button>
      <button data-testid="auth-refresh-btn" onClick={() => refreshProfile()}>
        Refresh Profile
      </button>
    </div>
  );
};

describe('AuthContext - iOS PWA Resilience & Lifecycle', () => {
  let queryClient: QueryClient;

  const mockProfile: UserProfile = {
    id: 'cached-user-123',
    email: 'test@cybergym.io',
    username: 'CyberRunner',
    role: 'athlete',
    target_calories: 2200,
    target_protein: 160,
    target_carbs: 220,
    target_fat: 70,
    target_fiber: 30,
    auto_rest_timer: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    (supabase.from as any).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
        }),
      }),
    }));

    (supabase.auth.getSession as any).mockResolvedValue({
      data: {
        session: {
          user: { id: mockProfile.id, email: mockProfile.email },
        },
      },
    });

    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. synchronously hydrates user and profile from localStorage on initial render', () => {
    localStorage.setItem('cybergym_user', JSON.stringify(mockProfile));

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Synchronous hydration: loading is false, cached profile and user are rendered without delay
    expect(screen.getByTestId('auth-loading').textContent).toBe('false');
    expect(screen.getByTestId('auth-user-id').textContent).toBe(mockProfile.id);
    expect(screen.getByTestId('auth-profile-username').textContent).toBe(mockProfile.username);
  });

  it('2. resolves via 3000ms timeout race when getSession hangs and clears loading', async () => {
    vi.useFakeTimers();
    // Simulate stalled network socket: getSession never resolves
    (supabase.auth.getSession as any).mockImplementation(() => new Promise(() => {}));

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Without cache, initial loading is true
    expect(screen.getByTestId('auth-loading').textContent).toBe('true');

    // Advance timers by 3000ms to trigger the timeout fallback
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });

    // Timeout triggers, loading becomes false
    expect(screen.getByTestId('auth-loading').textContent).toBe('false');
    expect(screen.getByTestId('auth-user-id').textContent).toBe('none');
  });

  it('2b. retains cached credentials when getSession fast-rejects (e.g. airplane mode / offline)', async () => {
    localStorage.setItem('cybergym_user', JSON.stringify(mockProfile));
    (supabase.auth.getSession as any).mockRejectedValue(new Error('Failed to fetch'));

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('auth-user-id').textContent).toBe(mockProfile.id);
    expect(screen.getByTestId('auth-profile-username').textContent).toBe(mockProfile.username);
    expect(localStorage.getItem('cybergym_user')).not.toBeNull();
  });

  it('3. silently revalidates session upon iOS WebKit resume (visibilitychange and pageshow)', async () => {
    const getSessionSpy = vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: 'refreshed-user-id', email: 'refreshed@cybergym.io' },
        },
      },
    });
    (supabase.auth.getSession as any).mockImplementation(getSessionSpy);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading').textContent).toBe('false');
    });

    const initialCallCount = getSessionSpy.mock.calls.length;

    // Simulate returning to app from iOS app switcher
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(getSessionSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    // Simulate WebKit pageshow event
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    await waitFor(() => {
      expect(getSessionSpy.mock.calls.length).toBeGreaterThan(initialCallCount + 1);
    });
  });

  it('4. completely cleans up cybergym storage and resets state on signOut()', async () => {
    localStorage.setItem('cybergym_user', JSON.stringify(mockProfile));
    localStorage.setItem('cybergym_view_mode', 'coach');
    localStorage.setItem('cybergym_auto_rest_timer', 'true');

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-user-id').textContent).toBe(mockProfile.id);
    });

    const signOutBtn = screen.getByTestId('auth-signout-btn');
    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    expect(localStorage.getItem('cybergym_user')).toBeNull();
    expect(localStorage.getItem('cybergym_view_mode')).toBeNull();
    expect(localStorage.getItem('cybergym_auto_rest_timer')).toBeNull();
    expect(screen.getByTestId('auth-user-id').textContent).toBe('none');
    expect(screen.getByTestId('auth-profile-username').textContent).toBe('none');
  });

  it('5. re-fetches user profile successfully on refreshProfile()', async () => {
    localStorage.setItem('cybergym_user', JSON.stringify(mockProfile));

    const updatedProfile = {
      ...mockProfile,
      username: 'UpdatedCyberWarrior',
    };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: updatedProfile, error: null }),
      }),
    });

    (supabase.from as any).mockImplementation(() => ({
      select: mockSelect,
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('auth-profile-username').textContent).toBe(mockProfile.username);

    const refreshBtn = screen.getByTestId('auth-refresh-btn');
    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-profile-username').textContent).toBe('UpdatedCyberWarrior');
    });
  });

  it('6. successfully re-authenticates and fetches profile after signOut without being blocked by signedOutRef', async () => {
    localStorage.setItem('cybergym_user', JSON.stringify(mockProfile));

    let authStateCallback: any = null;
    (supabase.auth.onAuthStateChange as any).mockImplementation((cb: any) => {
      authStateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-user-id').textContent).toBe(mockProfile.id);
    });

    // Sign out
    const signOutBtn = screen.getByTestId('auth-signout-btn');
    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    expect(screen.getByTestId('auth-user-id').textContent).toBe('none');
    expect(screen.getByTestId('auth-profile-username').textContent).toBe('none');

    // Simulate re-signing in with new credentials
    const newUserProfile: UserProfile = {
      ...mockProfile,
      id: 'new-athlete-789',
      username: 'NeoRacer',
      email: 'neo@cybergym.io',
    };

    (supabase.from as any).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newUserProfile, error: null }),
        }),
      }),
    }));

    await act(async () => {
      if (authStateCallback) {
        authStateCallback('SIGNED_IN', {
          user: { id: newUserProfile.id, email: newUserProfile.email },
        });
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-user-id').textContent).toBe(newUserProfile.id);
      expect(screen.getByTestId('auth-profile-username').textContent).toBe(newUserProfile.username);
    });
  });
});


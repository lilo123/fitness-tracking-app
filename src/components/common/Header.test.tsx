import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Header } from './Header';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';
import { CoachProvider } from '../../context/CoachContext';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-user', role: 'coach', email: 'coach@cybergym.io' },
            error: null,
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user', email: 'coach@cybergym.io' } } }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user', email: 'coach@cybergym.io' } } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('Header connection status badge', () => {
  let queryClient: QueryClient;
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      writable: true,
      value: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      writable: true,
      value: originalOnLine,
    });
  });

  const renderHeader = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <CoachProvider>
              <Header />
            </CoachProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('renders Online status badge when navigator is online', () => {
    renderHeader();

    const badge = screen.getByTestId('connection-status');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('title')).toBe('Online');
    expect(badge.textContent).toContain('Online');
  });

  it('renders Offline status badge when navigator is offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      writable: true,
      value: false,
    });

    renderHeader();

    const badge = screen.getByTestId('connection-status');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('title')).toBe('Offline');
    expect(badge.textContent).toContain('Offline');
  });

  it('updates badge dynamically when window network events fire', () => {
    renderHeader();

    const badge = screen.getByTestId('connection-status');
    expect(badge.getAttribute('title')).toBe('Online');

    act(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, writable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    expect(badge.getAttribute('title')).toBe('Offline');
    expect(badge.textContent).toContain('Offline');

    act(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, writable: true, value: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(badge.getAttribute('title')).toBe('Online');
    expect(badge.textContent).toContain('Online');
  });
});

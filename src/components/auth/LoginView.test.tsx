import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginView } from './LoginView';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';

const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockResend = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'test-user-id', role: 'athlete' }, error: null }),
        }),
      }),
    }),
    auth: {
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
      resetPasswordForEmail: (...args: any[]) => mockResetPasswordForEmail(...args),
      resend: (...args: any[]) => mockResend(...args),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('LoginView', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null });
    mockSignUp.mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null });
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mockResend.mockResolvedValue({ data: {}, error: null });
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

  it('renders login view with Email, Password inputs', () => {
    renderComponent();
    expect(screen.getByText('CyberGym')).toBeDefined();
    expect(screen.getByPlaceholderText('athlete@cybergym.io')).toBeDefined();
  });

  it('switches to register mode and displays confirm password field', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderComponent();

    const registerTab = screen.getByRole('button', { name: 'Register' });
    fireEvent.click(registerTab);

    expect(screen.getByText('Confirm Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeDefined();
  });

  it('validates password length on registration', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    const emailInput = screen.getByPlaceholderText('athlete@cybergym.io');
    const [passwordInput, confirmInput] = screen.getAllByPlaceholderText('••••••••');

    fireEvent.change(emailInput, { target: { value: 'athlete@cybergym.io' } });
    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.change(confirmInput, { target: { value: '123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Password must be at least 6 characters')).toBeDefined();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('validates password matching on registration', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    const emailInput = screen.getByPlaceholderText('athlete@cybergym.io');
    const [passwordInput, confirmInput] = screen.getAllByPlaceholderText('••••••••');

    fireEvent.change(emailInput, { target: { value: 'athlete@cybergym.io' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmInput, { target: { value: 'password456' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Passwords do not match')).toBeDefined();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('allows navigating to forgot password and submitting reset request', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderComponent();

    const forgotBtn = screen.getByRole('button', { name: /Forgot Password/i });
    fireEvent.click(forgotBtn);

    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeDefined();

    const emailInput = screen.getByPlaceholderText('athlete@cybergym.io');
    fireEvent.change(emailInput, { target: { value: 'athlete@cybergym.io' } });

    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(await screen.findByText('Password reset link sent! Check your inbox.')).toBeDefined();
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'athlete@cybergym.io',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
    );
  });
});


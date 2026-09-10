import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResetPasswordView } from './ResetPasswordView';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../context/AuthContext';

const mockUpdateUser = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    auth: {
      updateUser: (...args: any[]) => mockUpdateUser(...args),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('ResetPasswordView', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUser.mockResolvedValue({ data: { user: {} }, error: null });
    queryClient = new QueryClient();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ResetPasswordView />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('renders reset password form with password and confirm password fields', () => {
    renderComponent();
    expect(screen.getByText('Reset Password')).toBeDefined();
    expect(screen.getByText('New Password')).toBeDefined();
    expect(screen.getByText('Confirm New Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Set New Password' })).toBeDefined();
  });

  it('validates minimum password length', async () => {
    renderComponent();

    const [pwdInput, confirmPwdInput] = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(pwdInput, { target: { value: '123' } });
    fireEvent.change(confirmPwdInput, { target: { value: '123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }));

    expect(await screen.findByText('Password must be at least 6 characters')).toBeDefined();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('validates passwords match', async () => {
    renderComponent();

    const [pwdInput, confirmPwdInput] = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(pwdInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPwdInput, { target: { value: 'different123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }));

    expect(await screen.findByText('Passwords do not match')).toBeDefined();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('submits password update successfully and shows confirmation', async () => {
    renderComponent();

    const [pwdInput, confirmPwdInput] = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(pwdInput, { target: { value: 'newpassword123' } });
    fireEvent.change(confirmPwdInput, { target: { value: 'newpassword123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' });
    });

    expect(await screen.findByText('Password Updated Successfully!')).toBeDefined();
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetPasswordPage from './ResetPasswordPage.jsx';

vi.mock('../../lib/apiClient.js', () => ({
  auth: {
    resetPassword: vi.fn(),
  },
}));

import { auth } from '../../lib/apiClient.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResetPasswordPage', () => {
  it('shows error immediately when token is missing', () => {
    render(<ResetPasswordPage token={null} />);
    expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it('shows error when passwords do not match', async () => {
    render(<ResetPasswordPage token="abc123" />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password2' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByText(/do not match/i)).toBeTruthy();
    });
    expect(auth.resetPassword).not.toHaveBeenCalled();
  });

  it('calls resetPassword and shows success on valid submit', async () => {
    auth.resetPassword.mockResolvedValueOnce({ message: 'Password updated successfully' });
    render(<ResetPasswordPage token="abc123" />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword1' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByText(/password has been reset/i)).toBeTruthy();
    });
    expect(auth.resetPassword).toHaveBeenCalledWith('abc123', 'newpassword1');
  });

  it('shows error on invalid or expired token from API', async () => {
    const err = Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
    auth.resetPassword.mockRejectedValueOnce(err);
    render(<ResetPasswordPage token="expiredtoken" />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword1' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    });
  });

  it('scrubs token from URL on mount', () => {
    const spy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    render(<ResetPasswordPage token="abc123" />);
    expect(spy).toHaveBeenCalledWith(null, '', '/reset-password');
    spy.mockRestore();
  });

  it('does not call replaceState when token is missing', () => {
    const spy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    render(<ResetPasswordPage token={null} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

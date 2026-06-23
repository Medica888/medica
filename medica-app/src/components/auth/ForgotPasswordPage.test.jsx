import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage.jsx';

vi.mock('../../lib/apiClient.js', () => ({
  auth: {
    forgotPassword: vi.fn(),
  },
}));

import { auth } from '../../lib/apiClient.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordPage', () => {
  it('requires an email before submitting', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText(/enter the email address/i)).toBeTruthy();
    });
    expect(auth.forgotPassword).not.toHaveBeenCalled();
  });

  it('sends forgotPassword request and shows generic success', async () => {
    auth.forgotPassword.mockResolvedValueOnce({
      message: 'If that email is registered, you will receive a reset link',
    });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: ' user@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText(/if that email is registered/i)).toBeTruthy();
    });
    expect(auth.forgotPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('shows safe retry message on request failure', async () => {
    auth.forgotPassword.mockRejectedValueOnce(new Error('network'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText(/could not send/i)).toBeTruthy();
    });
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VerifyEmailPage from './VerifyEmailPage.jsx';

vi.mock('../../lib/apiClient.js', () => ({
  auth: {
    verifyEmail: vi.fn(),
  },
}));

import { auth } from '../../lib/apiClient.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VerifyEmailPage', () => {
  it('shows success after successful verification', async () => {
    auth.verifyEmail.mockResolvedValueOnce({ message: 'Email verified successfully' });
    render(<VerifyEmailPage token="validtoken" />);
    await waitFor(() => {
      expect(screen.getByText(/email address has been verified/i)).toBeTruthy();
    });
    expect(auth.verifyEmail).toHaveBeenCalledWith('validtoken');
  });

  it('shows invalid link immediately when token is missing', () => {
    render(<VerifyEmailPage token={null} />);
    expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    expect(auth.verifyEmail).not.toHaveBeenCalled();
  });

  it('shows invalid link on expired or invalid token from API', async () => {
    const err = Object.assign(new Error('Invalid or expired verification token'), { status: 400 });
    auth.verifyEmail.mockRejectedValueOnce(err);
    render(<VerifyEmailPage token="expiredtoken" />);
    await waitFor(() => {
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    });
  });

  it('scrubs token from URL on mount', () => {
    auth.verifyEmail.mockResolvedValueOnce({ message: 'ok' });
    const spy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    render(<VerifyEmailPage token="validtoken" />);
    expect(spy).toHaveBeenCalledWith(null, '', '/verify-email');
    spy.mockRestore();
  });

  it('does not call replaceState when token is missing', () => {
    const spy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    render(<VerifyEmailPage token={null} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

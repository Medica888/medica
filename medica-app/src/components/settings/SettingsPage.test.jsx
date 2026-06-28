import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import SettingsPage from './SettingsPage.jsx';

vi.mock('../../lib/apiClient.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, auth: { ...real.auth, register: vi.fn(), login: vi.fn() } };
});

import { auth } from '../../lib/apiClient.js';

describe('SettingsPage auth recovery entry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows a forgot-password link on the login form', () => {
    render(<SettingsPage authUser={null} onLogin={() => {}} onLogout={() => {}} />);
    const link = screen.getByRole('link', { name: /forgot password/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/forgot-password');
  });

  it('does not show forgot-password link when already connected', () => {
    render(
      <SettingsPage
        authUser={{ id: 'u1', email: 'user@example.com' }}
        onLogin={() => {}}
        onLogout={() => {}}
      />,
    );
    expect(screen.queryByRole('link', { name: /forgot password/i })).toBeNull();
  });

  it('asks before importing anonymous study data and imports on approval', () => {
    const onDataMigration = vi.fn();
    localStorage.setItem('medica_session_history', JSON.stringify([
      { id: 'anonymous-session', completedAt: '2026-06-24T10:00:00.000Z' },
    ]));

    render(
      <SettingsPage
        authUser={{ id: 'u1', email: 'user@example.com' }}
        onLogin={() => {}}
        onLogout={() => {}}
        onDataMigration={onDataMigration}
      />,
    );

    expect(screen.getByText('Local study data found')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /import to this account/i }));

    expect(localStorage.getItem('medica_session_history')).toBeNull();
    expect(JSON.parse(localStorage.getItem('medica_session_history:user:u1'))[0].id)
      .toBe('anonymous-session');
    expect(onDataMigration).toHaveBeenCalledTimes(1);
  });

  it('keeps anonymous study data untouched when import is declined', () => {
    localStorage.setItem('medica_session_history', JSON.stringify([
      { id: 'anonymous-session', completedAt: '2026-06-24T10:00:00.000Z' },
    ]));

    render(
      <SettingsPage
        authUser={{ id: 'u1', email: 'user@example.com' }}
        onLogin={() => {}}
        onLogout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /keep separate/i }));
    expect(localStorage.getItem('medica_session_history')).not.toBeNull();
    expect(screen.queryByText('Local study data found')).toBeNull();
  });
});

describe('SettingsPage form submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fillRegisterForm() {
    fireEvent.click(screen.getByRole('tab', { name: 'Register' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1!' } });
  }

  it('calls auth.register with trimmed fields and invokes onLogin on success', async () => {
    const user = { id: '1', email: 'alice@example.com', name: 'Alice' };
    auth.register.mockResolvedValueOnce({ user, token: 'tok' });
    const onLogin = vi.fn();

    render(<SettingsPage authUser={null} onLogin={onLogin} onLogout={() => {}} />);
    fillRegisterForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(auth.register).toHaveBeenCalledWith('alice@example.com', 'Alice', 'Password1!');
      expect(onLogin).toHaveBeenCalledWith('tok', user);
    });
  });

  it('shows a friendly message when the backend is unreachable (Chrome)', async () => {
    auth.register.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<SettingsPage authUser={null} onLogin={() => {}} onLogout={() => {}} />);
    fillRegisterForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/cannot reach the server/i)).toBeTruthy();
    });
  });

  it('shows a friendly message when the backend is unreachable (Firefox)', async () => {
    auth.register.mockRejectedValueOnce(
      new TypeError('NetworkError when attempting to fetch resource.'),
    );

    render(<SettingsPage authUser={null} onLogin={() => {}} onLogout={() => {}} />);
    fillRegisterForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/cannot reach the server/i)).toBeTruthy();
    });
  });

  it('shows the server error message for application-level errors', async () => {
    auth.register.mockRejectedValueOnce(
      Object.assign(new Error('Email already registered'), { status: 409 }),
    );

    render(<SettingsPage authUser={null} onLogin={() => {}} onLogout={() => {}} />);
    fillRegisterForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeTruthy();
    });
  });

  it('register route 401 does not trigger session expiry', async () => {
    auth.register.mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
    );

    render(<SettingsPage authUser={null} onLogin={() => {}} onLogout={() => {}} />);
    fillRegisterForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeTruthy();
    });
  });
});

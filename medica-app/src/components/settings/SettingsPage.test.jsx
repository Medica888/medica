import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import SettingsPage from './SettingsPage.jsx';

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

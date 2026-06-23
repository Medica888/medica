import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SettingsPage from './SettingsPage.jsx';

describe('SettingsPage auth recovery entry', () => {
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
});

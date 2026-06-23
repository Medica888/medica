import { useState, useEffect } from 'react';
import { auth } from '../../lib/apiClient.js';

export default function ResetPasswordPage({ token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (token) history.replaceState(null, '', '/reset-password');
  }, [token]);

  if (!token) {
    return (
      <div className="stg-page">
        <div className="stg-card">
          <h2>Reset Password</h2>
          <p className="stg-error" role="alert">
            This reset link is invalid or has expired. Please request a new one.
          </p>
          <a href="/">Return to login</a>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="stg-page">
        <div className="stg-card">
          <h2>Password Updated</h2>
          <p className="stg-success">
            Your password has been reset. You can now log in with your new password.
          </p>
          <a href="/">Return to login</a>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    if (password !== confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }

    setStatus('loading');
    try {
      await auth.resetPassword(token, password);
      setStatus('success');
    } catch (err) {
      setStatus('idle');
      if (err.status === 400) {
        setErrorMsg('This reset link is invalid or has expired. Please request a new one.');
      } else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    }
  }

  return (
    <div className="stg-page">
      <div className="stg-card">
        <h2>Reset Password</h2>
        <form className="stg-form" onSubmit={handleSubmit}>
          <label className="stg-label" htmlFor="rp-password">New Password</label>
          <input
            id="rp-password"
            type="password"
            className="stg-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <label className="stg-label" htmlFor="rp-confirm">Confirm Password</label>
          <input
            id="rp-confirm"
            type="password"
            className="stg-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {errorMsg && (
            <p className="stg-error" role="alert">{errorMsg}</p>
          )}
          <button
            type="submit"
            className="stg-submit-btn"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

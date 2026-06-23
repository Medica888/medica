import { useState } from 'react';
import { auth } from '../../lib/apiClient.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMsg('Enter the email address connected to your Medica account.');
      return;
    }

    setStatus('loading');
    try {
      await auth.forgotPassword(normalizedEmail);
      setStatus('success');
    } catch {
      setStatus('idle');
      setErrorMsg('We could not send the reset email. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className="stg-page">
        <div className="stg-card">
          <h2>Password Reset</h2>
          <p className="stg-success">
            If that email is registered, a reset link has been sent.
          </p>
          <a href="/">Return to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="stg-page">
      <div className="stg-card">
        <h2>Forgot Password</h2>
        <p className="stg-card-desc">
          Enter your account email and Medica will send a secure reset link.
        </p>
        <form className="stg-form" onSubmit={handleSubmit} noValidate>
          <label className="stg-label" htmlFor="fp-email">Email</label>
          <input
            id="fp-email"
            type="email"
            className="stg-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="your@email.com"
          />
          {errorMsg && <p className="stg-error" role="alert">{errorMsg}</p>}
          <button
            type="submit"
            className="stg-submit-btn"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
        <a href="/">Return to login</a>
      </div>
    </div>
  );
}

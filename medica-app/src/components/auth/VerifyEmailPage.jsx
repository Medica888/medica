import { useState, useEffect, useRef } from 'react';
import { auth } from '../../lib/apiClient.js';

export default function VerifyEmailPage({ token }) {
  const [status, setStatus] = useState(token ? 'verifying' : 'invalid');
  const fired = useRef(false);

  useEffect(() => {
    if (token) history.replaceState(null, '', '/verify-email');
  }, [token]);

  useEffect(() => {
    if (fired.current || !token) return;
    fired.current = true;
    auth.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        if (err.status === 400) {
          setStatus('invalid');
        } else {
          setStatus('error');
        }
      });
  }, [token]);

  if (status === 'verifying') {
    return (
      <div className="stg-page">
        <div className="stg-card">
          <h2>Verifying Email</h2>
          <p>Please wait…</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="stg-page">
        <div className="stg-card">
          <h2>Email Verified</h2>
          <p className="stg-success">Your email address has been verified.</p>
          <a href="/">Go to dashboard</a>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="stg-page">
        <div className="stg-card">
          <h2>Verification Failed</h2>
          <p className="stg-error" role="alert">Something went wrong. Please try again later.</p>
          <a href="/">Return to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="stg-page">
      <div className="stg-card">
        <h2>Invalid Link</h2>
        <p className="stg-error" role="alert">
          This verification link is invalid or has expired.
        </p>
        <a href="/">Return to login</a>
      </div>
    </div>
  );
}

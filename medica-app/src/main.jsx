import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import './quiz-v2.css'
import App from './App.jsx'
import ResetPasswordPage from './components/auth/ResetPasswordPage.jsx'
import VerifyEmailPage from './components/auth/VerifyEmailPage.jsx'

const urlPath = window.location.pathname;
const urlToken = new URLSearchParams(window.location.search).get('token');

let root;
if (urlPath === '/reset-password') {
  root = <ResetPasswordPage token={urlToken} />;
} else if (urlPath === '/verify-email') {
  root = <VerifyEmailPage token={urlToken} />;
} else {
  root = <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {root}
  </StrictMode>,
)

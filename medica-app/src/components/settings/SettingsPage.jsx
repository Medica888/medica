import { useState } from 'react'
import { auth } from '../../lib/apiClient'
import {
  hasPendingAnonymousDataMigration,
  importAnonymousStudyData,
  keepAnonymousStudyDataSeparate,
} from '../../lib/storage'

export default function SettingsPage({ authUser, onLogin, onLogout, onDataMigration }) {
  const [tab,      setTab]      = useState('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(null)
  const [migrationRevision, setMigrationRevision] = useState(0)
  const [migrationMessage, setMigrationMessage] = useState(null)
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [verificationLoading, setVerificationLoading] = useState(false)

  const isConnected = !!authUser
  const isEmailVerified = authUser?.email_verified === true
  const migrationNeeded = migrationRevision >= 0
    && !!authUser?.id
    && hasPendingAnonymousDataMigration(authUser.id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null); setSuccess(null); setLoading(true)
    try {
      let result
      if (tab === 'login') {
        result = await auth.login(email.trim(), password)
      } else {
        result = await auth.register(email.trim(), name.trim(), password)
      }
      if (result?.user) {
        onLogin(result.token, result.user)
        setSuccess(result.user?.email_verified
          ? `Connected as ${result.user?.email || email}`
          : `Account created. Check ${result.user?.email || email} to verify your email.`)
        setEmail(''); setPassword(''); setName('')
      }
    } catch (err) {
      const isNetworkError = err instanceof TypeError
      setError(isNetworkError
        ? 'Cannot reach the server. Please check your connection and try again.'
        : err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleImportAnonymousData = () => {
    const result = importAnonymousStudyData(authUser?.id)
    if (result.error) {
      setMigrationMessage(result.error)
      return
    }
    setMigrationRevision(value => value + 1)
    setMigrationMessage(`Imported ${result.importedItems} local study item${result.importedItems === 1 ? '' : 's'} into this account.`)
    onDataMigration?.()
  }

  const handleKeepAnonymousDataSeparate = () => {
    keepAnonymousStudyDataSeparate(authUser?.id)
    setMigrationRevision(value => value + 1)
    setMigrationMessage('Local study data will remain separate and available when signed out.')
  }

  const handleResendVerification = async () => {
    setVerificationStatus(null)
    setVerificationLoading(true)
    try {
      await auth.resendVerification()
      setVerificationStatus('Verification email sent. Check your inbox.')
    } catch (err) {
      const isNetworkError = err instanceof TypeError
      setVerificationStatus(isNetworkError
        ? 'Cannot reach the server. Please check your connection and try again.'
        : err.message || 'Could not send verification email.')
    } finally {
      setVerificationLoading(false)
    }
  }

  return (
    <div className="stg-page">
      <div className="stg-scroll">
        <div className="stg-hdr">
          <h1 className="stg-title">Settings</h1>
          <p className="stg-sub">Account, sync, and study preferences</p>
        </div>

        {/* ── Backend account ───────────────────────────────────────────── */}
        <div className="stg-card">
          <div className="stg-card-title">Medica Account</div>
          <p className="stg-card-desc">
            Connect your account to enable mastery tracking, adaptive learning, and cloud sync across sessions.
          </p>

          {isConnected ? (
            <div className="stg-connected">
              <div className="stg-connected-badge">
                <span className="stg-connected-dot" />
                Connected
              </div>
              <p className="stg-connected-info">
                Adaptive learning and mastery tracking are active.
              </p>
              {!isEmailVerified && (
                <div className="stg-verification" role="status">
                  <div className="stg-migration-title">Verify your email</div>
                  <p className="stg-connected-info">
                    Verification protects report quality and unlocks trusted question-review features.
                  </p>
                  <button
                    type="button"
                    className="stg-secondary-btn"
                    onClick={handleResendVerification}
                    disabled={verificationLoading}
                  >
                    {verificationLoading ? 'Sending...' : 'Resend verification email'}
                  </button>
                  {verificationStatus && <p className="stg-connected-info">{verificationStatus}</p>}
                </div>
              )}
              {migrationNeeded && (
                <div className="stg-migration" role="status">
                  <div className="stg-migration-title">Local study data found</div>
                  <p className="stg-connected-info">
                    Choose whether to import the anonymous sessions and flashcards stored in this browser. Nothing is merged automatically.
                  </p>
                  <div className="stg-migration-actions">
                    <button type="button" className="stg-submit-btn" onClick={handleImportAnonymousData}>
                      Import to this account
                    </button>
                    <button type="button" className="stg-secondary-btn" onClick={handleKeepAnonymousDataSeparate}>
                      Keep separate
                    </button>
                  </div>
                </div>
              )}
              {migrationMessage && <p className="stg-success" role="status">{migrationMessage}</p>}
              <button
                type="button"
                className="stg-logout-btn"
                onClick={onLogout}
              >
                Log Out
              </button>
            </div>
          ) : (
            <div className="stg-auth-wrap">
              <div className="stg-tabs" role="tablist">
                {['login', 'register'].map(t => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    className={`stg-tab${tab === t ? ' active' : ''}`}
                    onClick={() => { setTab(t); setError(null); setSuccess(null) }}
                  >
                    {t === 'login' ? 'Log In' : 'Register'}
                  </button>
                ))}
              </div>

              <form className="stg-form" onSubmit={handleSubmit} noValidate>
                {tab === 'register' && (
                  <div className="stg-field">
                    <label className="stg-label" htmlFor="stg-name">Name</label>
                    <input
                      id="stg-name"
                      className="stg-input"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </div>
                )}
                <div className="stg-field">
                  <label className="stg-label" htmlFor="stg-email">Email</label>
                  <input
                    id="stg-email"
                    className="stg-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <div className="stg-field">
                  <label className="stg-label" htmlFor="stg-password">Password</label>
                  <input
                    id="stg-password"
                    className="stg-input"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    minLength={8}
                  />
                </div>

                {tab === 'login' && (
                  <a className="stg-inline-link" href="/forgot-password">
                    Forgot password?
                  </a>
                )}

                {error   && <p className="stg-error">{error}</p>}
                {success && <p className="stg-success">{success}</p>}

                <button
                  type="submit"
                  className="stg-submit-btn"
                  disabled={loading}
                >
                  {loading ? 'Connecting...' : tab === 'login' ? 'Log In' : 'Create Account'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* ── App info ─────────────────────────────────────────────────── */}
        <div className="stg-card">
          <div className="stg-card-title">About</div>
          <div className="stg-info-rows">
            <div className="stg-info-row">
              <span className="stg-info-label">Version</span>
              <span className="stg-info-val">Current</span>
            </div>
            <div className="stg-info-row">
              <span className="stg-info-label">Adaptive learning</span>
              <span className={`stg-info-val ${isConnected ? 'stg-info-val--on' : ''}`}>
                {isConnected ? 'Active' : 'Requires account'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

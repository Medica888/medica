import { createContext, useContext, useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react'
import { auth, setAuthSession, subscribeAuthState, getAuthStateSnapshot } from '../lib/apiClient.js'

const AuthContext = createContext(null)

const ANONYMOUS_CTX = {
  authStatus: 'anonymous',
  authUser: null,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
}

export function AuthProvider({ children }) {
  // Subscribe to apiClient's reactive auth state machine.
  // When apiClient calls setAuthSession (including on 401 expiry), React re-renders.
  const snapshot    = useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot)
  const authStatus  = snapshot.split(':')[0]

  // Stored user data — only exposed via authUser when status is authenticated
  const [_storedUser, setStoredUser] = useState(null)
  const authUser = authStatus === 'authenticated' ? _storedUser : null

  // On mount: clean up legacy JWT key and restore session via HttpOnly cookie
  useEffect(() => {
    try { localStorage.removeItem('medica_jwt') } catch { /* ignore */ }
    auth.me()
      .then(({ user, isAdmin }) => {
        setStoredUser({ ...user, isAdmin: !!isAdmin })
        setAuthSession('authenticated', user.id)
      })
      .catch(() => {
        setAuthSession('anonymous')
      })
  }, [])

  // Called by SettingsPage after login/register — signature kept as (token, user)
  // token is the HttpOnly cookie, not used here. We call auth.me() for the full profile.
  const login = useCallback(async (_token, user) => {
    setStoredUser(user)
    setAuthSession('authenticated', user.id)
    try {
      const { user: fullUser, isAdmin } = await auth.me()
      setStoredUser({ ...fullUser, isAdmin: !!isAdmin })
      setAuthSession('authenticated', fullUser.id)
    } catch { /* keep the basic user from login response */ }
  }, [])

  const logout = useCallback(async () => {
    try { await auth.logout() } catch { /* ignore network errors */ }
    setStoredUser(null)
    setAuthSession('anonymous')
  }, [])

  const value = useMemo(() => ({
    authStatus,
    authUser,
    isAuthenticated: authStatus === 'authenticated',
    login,
    logout,
  }), [authStatus, authUser, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext) ?? ANONYMOUS_CTX
}

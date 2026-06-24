import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, renderHook } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { setAuthSession, setAuthRestoring } from '../lib/apiClient.js'

// Use the real apiClient state machine so subscribeAuthState/useSyncExternalStore works.
// Only mock the network calls (auth.me, auth.logout).
vi.mock('../lib/apiClient.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    auth: {
      ...real.auth,
      me:     vi.fn(),
      logout: vi.fn(() => Promise.resolve(null)),
    },
  }
})

import { auth } from '../lib/apiClient.js'

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}

// Renders authStatus / isAuthenticated / authUser inside a provider
function AuthDisplay() {
  const { authStatus, isAuthenticated, authUser } = useAuth()
  return (
    <div>
      <span data-testid="status">{authStatus}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="email">{authUser?.email ?? 'none'}</span>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset apiClient state between tests so useSyncExternalStore starts fresh
  setAuthRestoring()
  try { localStorage.removeItem('medica_jwt') } catch { /* ignore */ }
})

describe('AuthProvider — cookie restoration', () => {
  it('starts in restoring state while auth.me() is pending', async () => {
    let resolveMe
    auth.me.mockReturnValueOnce(new Promise(r => { resolveMe = r }))

    render(<AuthProvider><AuthDisplay /></AuthProvider>)

    expect(screen.getByTestId('status').textContent).toBe('restoring')

    await act(async () => {
      resolveMe({ user: { id: 'u1', email: 'test@test.com' }, isAdmin: false })
    })
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
  })

  it('transitions to authenticated when cookie restoration succeeds', async () => {
    auth.me.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'restored@example.com' },
      isAdmin: false,
    })

    render(<AuthProvider><AuthDisplay /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('email').textContent).toBe('restored@example.com')
    expect(screen.getByTestId('authenticated').textContent).toBe('true')
  })

  it('transitions to anonymous when cookie restoration fails', async () => {
    auth.me.mockRejectedValueOnce(new Error('No active session'))

    render(<AuthProvider><AuthDisplay /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'))
    expect(screen.getByTestId('authenticated').textContent).toBe('false')
    expect(screen.getByTestId('email').textContent).toBe('none')
  })

  it('removes legacy medica_jwt from localStorage on mount', async () => {
    localStorage.setItem('medica_jwt', 'legacy-token')
    auth.me.mockRejectedValueOnce(new Error('No session'))

    render(<AuthProvider><AuthDisplay /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'))
    expect(localStorage.getItem('medica_jwt')).toBeNull()
  })
})

describe('AuthProvider — login', () => {
  it('sets authenticated state and calls auth.me() after login', async () => {
    auth.me
      .mockRejectedValueOnce(new Error('No session'))  // initial restore
      .mockResolvedValueOnce({ user: { id: 'u1', email: 'full@example.com' }, isAdmin: true }) // after login

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.authStatus).toBe('anonymous'))

    await act(async () => {
      await result.current.login('ignored-token', { id: 'u1', email: 'initial@example.com' })
    })

    expect(result.current.authStatus).toBe('authenticated')
    expect(result.current.isAuthenticated).toBe(true)
    // auth.me called once for restore (rejected) and once after login
    expect(auth.me).toHaveBeenCalledTimes(2)
  })
})

describe('AuthProvider — logout', () => {
  it('clears auth state and calls auth.logout()', async () => {
    auth.me.mockResolvedValueOnce({ user: { id: 'u1', email: 'u@u.com' }, isAdmin: false })
    auth.logout.mockResolvedValueOnce(null)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.authStatus).toBe('authenticated'))

    await act(async () => { await result.current.logout() })

    expect(result.current.authStatus).toBe('anonymous')
    expect(auth.logout).toHaveBeenCalledTimes(1)
  })

  it('transitions to anonymous even if auth.logout() throws', async () => {
    auth.me.mockResolvedValueOnce({ user: { id: 'u1', email: 'u@u.com' }, isAdmin: false })
    auth.logout.mockRejectedValueOnce(new Error('network error'))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.authStatus).toBe('authenticated'))

    await act(async () => { await result.current.logout() })

    expect(result.current.authStatus).toBe('anonymous')
  })
})

describe('AuthProvider — 401 session expiry signaling', () => {
  it('transitions to anonymous when apiClient fires setAuthSession(anonymous)', async () => {
    auth.me.mockResolvedValueOnce({ user: { id: 'u1', email: 'u@u.com' }, isAdmin: false })

    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))

    // Simulate apiClient detecting a 401 session expiry — it calls setAuthSession('anonymous')
    act(() => { setAuthSession('anonymous') })

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'))
    expect(screen.getByTestId('email').textContent).toBe('none')
  })
})

describe('useAuth outside provider', () => {
  it('returns anonymous defaults when no AuthProvider is present', () => {
    function Standalone() {
      const { authStatus, isAuthenticated, authUser } = useAuth()
      return (
        <div>
          <span data-testid="status">{authStatus}</span>
          <span data-testid="authenticated">{String(isAuthenticated)}</span>
          <span data-testid="user">{String(authUser)}</span>
        </div>
      )
    }
    render(<Standalone />)
    expect(screen.getByTestId('status').textContent).toBe('anonymous')
    expect(screen.getByTestId('authenticated').textContent).toBe('false')
    expect(screen.getByTestId('user').textContent).toBe('null')
  })
})

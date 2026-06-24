import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthState } from './useAuthState.js'
import { setAuthRestoring, setAuthSession } from '../lib/apiClient.js'

describe('useAuthState', () => {
  beforeEach(() => {
    setAuthSession('anonymous')
  })

  it('reacts to restore, authentication, account, and logout transitions', () => {
    const { result } = renderHook(() => useAuthState())
    expect(result.current.status).toBe('anonymous')

    act(() => setAuthRestoring())
    expect(result.current.isRestoring).toBe(true)

    act(() => setAuthSession('authenticated', 'user-1'))
    expect(result.current).toMatchObject({
      status: 'authenticated',
      userId: 'user-1',
      isAuthenticated: true,
    })

    act(() => setAuthSession('authenticated', 'user-2'))
    expect(result.current.userId).toBe('user-2')

    act(() => setAuthSession('anonymous'))
    expect(result.current).toMatchObject({
      status: 'anonymous',
      userId: '',
      isAuthenticated: false,
    })
  })
})

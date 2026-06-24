import { useSyncExternalStore } from 'react'
import {
  getAuthStateSnapshot,
  subscribeAuthState,
} from '../lib/apiClient.js'

function parseSnapshot(snapshot) {
  const separator = snapshot.indexOf(':')
  const status = separator >= 0 ? snapshot.slice(0, separator) : 'anonymous'
  const userId = separator >= 0 ? snapshot.slice(separator + 1) : ''
  return {
    status,
    userId,
    isAuthenticated: status === 'authenticated',
    isRestoring: status === 'restoring',
    scopeKey: `${status}:${userId}`,
  }
}

export function useAuthState() {
  const snapshot = useSyncExternalStore(
    subscribeAuthState,
    getAuthStateSnapshot,
    getAuthStateSnapshot,
  )
  return parseSnapshot(snapshot)
}

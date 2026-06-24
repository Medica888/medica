import { getCurrentUserId } from './apiClient.js'

export function getScopedStorageKey(baseKey, userId = getCurrentUserId()) {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return baseKey
  return `${baseKey}:user:${encodeURIComponent(normalizedUserId)}`
}

export function getAnonymousStorageKey(baseKey) {
  return baseKey
}

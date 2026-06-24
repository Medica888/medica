import { getScopedStorageKey } from './storageScope.js'

const GROUPS_KEY = 'medica:flashcardGroups'

function groupsKey() {
  return getScopedStorageKey(GROUPS_KEY)
}

export function getFlashcardGroups() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(groupsKey())
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveFlashcardGroups(groups) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(groupsKey(), JSON.stringify(groups)) } catch { /* quota */ }
}

export function createFlashcardGroup(name, description = '') {
  const groups = getFlashcardGroups()
  const newGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    description: description.trim(),
    cardIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  saveFlashcardGroups([...groups, newGroup])
  return newGroup
}

export function renameFlashcardGroup(groupId, name) {
  const groups = getFlashcardGroups()
  saveFlashcardGroups(groups.map(g =>
    g.id === groupId ? { ...g, name: name.trim(), updatedAt: new Date().toISOString() } : g
  ))
}

export function deleteFlashcardGroup(groupId) {
  saveFlashcardGroups(getFlashcardGroups().filter(g => g.id !== groupId))
}

export function addCardsToGroup(groupId, cardIds) {
  const groups = getFlashcardGroups()
  saveFlashcardGroups(groups.map(g => {
    if (g.id !== groupId) return g
    const existing = new Set(g.cardIds)
    cardIds.forEach(id => existing.add(id))
    return { ...g, cardIds: [...existing], updatedAt: new Date().toISOString() }
  }))
}

export function removeCardsFromGroup(groupId, cardIds) {
  const toRemove = new Set(cardIds)
  const groups = getFlashcardGroups()
  saveFlashcardGroups(groups.map(g =>
    g.id === groupId
      ? { ...g, cardIds: g.cardIds.filter(id => !toRemove.has(id)), updatedAt: new Date().toISOString() }
      : g
  ))
}

export function getCardsInGroup(cards, groupId) {
  const group = getFlashcardGroups().find(g => g.id === groupId)
  if (!group) return []
  const idSet = new Set(group.cardIds)
  return cards.filter(c => idSet.has(c.id))
}

export function getGroupsForCard(cardId) {
  return getFlashcardGroups().filter(g => g.cardIds.includes(cardId))
}

export function clearAllFlashcardGroups() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(groupsKey()) } catch { /* ignore */ }
}

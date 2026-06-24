// Per-user concurrency slots for AI generation endpoints.
// Limits how many simultaneous AI generation requests a single user can issue.
// In-memory only — resets on restart (acceptable for this use case).

const MAX_SLOTS_PER_USER = 3;
const active = new Map<string, number>();

export function tryAcquireSlot(userId: string): boolean {
  const n = active.get(userId) ?? 0;
  if (n >= MAX_SLOTS_PER_USER) return false;
  active.set(userId, n + 1);
  return true;
}

export function releaseSlot(userId: string): void {
  const n = (active.get(userId) ?? 1) - 1;
  if (n <= 0) active.delete(userId);
  else active.set(userId, n);
}

// Test helper — clears all slots between test runs.
export function _resetSlots(): void {
  active.clear();
}

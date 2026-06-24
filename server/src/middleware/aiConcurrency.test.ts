import { describe, it, expect, beforeEach } from 'vitest';
import { tryAcquireSlot, releaseSlot, _resetSlots } from './aiConcurrency.js';

describe('aiConcurrency', () => {
  beforeEach(() => _resetSlots());

  it('acquires up to MAX_SLOTS_PER_USER slots', () => {
    expect(tryAcquireSlot('user-a')).toBe(true);
    expect(tryAcquireSlot('user-a')).toBe(true);
    expect(tryAcquireSlot('user-a')).toBe(true);
  });

  it('blocks the 4th concurrent slot', () => {
    tryAcquireSlot('user-a');
    tryAcquireSlot('user-a');
    tryAcquireSlot('user-a');
    expect(tryAcquireSlot('user-a')).toBe(false);
  });

  it('slots are independent per user', () => {
    tryAcquireSlot('user-a');
    tryAcquireSlot('user-a');
    tryAcquireSlot('user-a');
    expect(tryAcquireSlot('user-b')).toBe(true);
  });

  it('releasing a slot allows a new acquisition', () => {
    tryAcquireSlot('user-a');
    tryAcquireSlot('user-a');
    tryAcquireSlot('user-a');
    expect(tryAcquireSlot('user-a')).toBe(false);
    releaseSlot('user-a');
    expect(tryAcquireSlot('user-a')).toBe(true);
  });

  it('releasing all slots clears the entry', () => {
    tryAcquireSlot('user-a');
    releaseSlot('user-a');
    // Should be acquirable again from zero
    expect(tryAcquireSlot('user-a')).toBe(true);
    expect(tryAcquireSlot('user-a')).toBe(true);
    expect(tryAcquireSlot('user-a')).toBe(true);
    expect(tryAcquireSlot('user-a')).toBe(false);
  });

  it('releasing below zero does not go negative', () => {
    releaseSlot('never-acquired');
    // Should still be acquirable
    expect(tryAcquireSlot('never-acquired')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { CircuitBreaker } from './circuitBreaker.js';

function makeBreaker(threshold = 3, cooldownMs = 10_000, now?: () => number) {
  return new CircuitBreaker({ failureThreshold: threshold, cooldownMs, now });
}

describe('CircuitBreaker', () => {
  describe('initial state', () => {
    it('starts closed', () => {
      const cb = makeBreaker();
      expect(cb.currentState).toBe('closed');
    });

    it('isTripped returns false when closed', () => {
      const cb = makeBreaker();
      expect(cb.isTripped()).toBe(false);
    });
  });

  describe('failure accumulation', () => {
    it('stays closed below the failure threshold', () => {
      const cb = makeBreaker(3);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.currentState).toBe('closed');
      expect(cb.isTripped()).toBe(false);
    });

    it('opens at exactly the failure threshold', () => {
      const cb = makeBreaker(3);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.currentState).toBe('open');
      expect(cb.isTripped()).toBe(true);
    });

    it('stays open above the failure threshold', () => {
      const cb = makeBreaker(3);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.currentState).toBe('open');
      expect(cb.isTripped()).toBe(true);
    });
  });

  describe('success resets failure counter', () => {
    it('resets below-threshold failures on success', () => {
      const cb = makeBreaker(3);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.currentState).toBe('closed');
    });

    it('closes after threshold failures then success in half-open', () => {
      let t = 0;
      const cb = makeBreaker(2, 1000, () => t);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.currentState).toBe('open');

      t = 1001;
      expect(cb.isTripped()).toBe(false);
      expect(cb.currentState).toBe('half-open');

      cb.recordSuccess();
      expect(cb.currentState).toBe('closed');
      expect(cb.isTripped()).toBe(false);
    });
  });

  describe('cooldown and half-open transitions', () => {
    it('remains open during cooldown', () => {
      let t = 0;
      const cb = makeBreaker(1, 5000, () => t);
      cb.recordFailure();
      expect(cb.currentState).toBe('open');

      t = 4999;
      expect(cb.isTripped()).toBe(true);
      expect(cb.currentState).toBe('open');
    });

    it('transitions to half-open after cooldown elapses', () => {
      let t = 0;
      const cb = makeBreaker(1, 5000, () => t);
      cb.recordFailure();
      expect(cb.currentState).toBe('open');

      t = 5000;
      expect(cb.isTripped()).toBe(false);
      expect(cb.currentState).toBe('half-open');
    });

    it('re-opens from half-open on another failure and resets cooldown', () => {
      let t = 0;
      const cb = makeBreaker(1, 5000, () => t);
      cb.recordFailure();

      t = 5000;
      expect(cb.currentState).toBe('half-open');

      cb.recordFailure();
      expect(cb.currentState).toBe('open');
      expect(cb.isTripped()).toBe(true);

      t = 5000 + 4999;
      expect(cb.isTripped()).toBe(true);

      t = 5000 + 5000;
      expect(cb.isTripped()).toBe(false);
      expect(cb.currentState).toBe('half-open');
    });
  });

  describe('threshold of 1', () => {
    it('trips immediately on first failure', () => {
      const cb = makeBreaker(1);
      cb.recordFailure();
      expect(cb.currentState).toBe('open');
      expect(cb.isTripped()).toBe(true);
    });
  });

  describe('half-open probe transitions', () => {
    it('successful probe closes the breaker', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      t = 1001;
      expect(cb.isTripped()).toBe(false); // transitions to half-open
      expect(cb.currentState).toBe('half-open');
      cb.recordSuccess();
      expect(cb.currentState).toBe('closed');
    });

    it('failed probe re-opens and resets cooldown', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      t = 1001;
      cb.isTripped(); // transitions to half-open
      cb.recordFailure();
      expect(cb.currentState).toBe('open');
      // Cooldown restarts from the time of re-open (t=1001)
      t = 2001;
      expect(cb.isTripped()).toBe(false);
      expect(cb.currentState).toBe('half-open');
    });

    it('aborted probe: calling recordFailure from probe abandonment re-arms cooldown', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      t = 1001;
      cb.isTripped(); // transitions to half-open — probe starts
      // Simulate callWithBreaker's probe-abort path: recordFailure for non-4xx error
      cb.recordFailure();
      // Breaker must be open (not stuck in half-open)
      expect(cb.currentState).toBe('open');
      expect(cb.isTripped()).toBe(true);
      // After a new cooldown it should allow another probe
      t = 2002;
      expect(cb.isTripped()).toBe(false);
      expect(cb.currentState).toBe('half-open');
    });

    it('probe with 4xx: recordSuccess closes the breaker', () => {
      let t = 0;
      const cb = makeBreaker(2, 1000, () => t);
      cb.recordFailure();
      cb.recordFailure();
      t = 1001;
      cb.isTripped(); // transitions to half-open
      // 4xx response during probe means provider is up — close the breaker
      cb.recordSuccess();
      expect(cb.currentState).toBe('closed');
    });
  });

  describe('half-open probe serialization', () => {
    it('only the first tryStartProbe call claims the slot; concurrent callers are rejected', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      t = 1001;
      cb.isTripped(); // transitions to half-open
      expect(cb.tryStartProbe()).toBe(true);  // first caller claims the slot
      expect(cb.tryStartProbe()).toBe(false); // concurrent caller rejected
      expect(cb.tryStartProbe()).toBe(false); // third caller also rejected
    });

    it('probe slot is released on recordSuccess, allowing a new probe cycle', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      t = 1001;
      cb.isTripped(); // half-open
      expect(cb.tryStartProbe()).toBe(true);
      cb.recordSuccess(); // closes breaker, releases slot
      expect(cb.currentState).toBe('closed');
      // After a new failure sequence, probe slot is available again
      cb.recordFailure();
      t = 2002;
      cb.isTripped(); // half-open again
      expect(cb.tryStartProbe()).toBe(true);
    });

    it('probe slot is released on recordFailure, allowing re-open and cooldown', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      t = 1001;
      cb.isTripped(); // half-open
      expect(cb.tryStartProbe()).toBe(true);
      cb.recordFailure(); // probe fails — re-opens breaker, releases slot
      expect(cb.currentState).toBe('open');
      // After new cooldown, slot is claimable again
      t = 2002;
      cb.isTripped(); // half-open again
      expect(cb.tryStartProbe()).toBe(true);
    });

    it('tryStartProbe returns false when breaker is closed', () => {
      const cb = makeBreaker();
      expect(cb.tryStartProbe()).toBe(false);
    });

    it('tryStartProbe returns false when breaker is open (cooldown not elapsed)', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      expect(cb.currentState).toBe('open');
      expect(cb.tryStartProbe()).toBe(false);
    });
  });

  describe('currentState vs isTripped consistency', () => {
    it('currentState and isTripped agree on open state', () => {
      const cb = makeBreaker(1);
      cb.recordFailure();
      expect(cb.currentState === 'open').toBe(cb.isTripped());
    });

    it('currentState and isTripped agree on half-open state', () => {
      let t = 0;
      const cb = makeBreaker(1, 1000, () => t);
      cb.recordFailure();
      t = 2000;
      expect(cb.isTripped()).toBe(false);
      expect(cb.currentState).toBe('half-open');
    });
  });
});

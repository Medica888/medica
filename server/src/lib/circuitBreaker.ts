export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of consecutive PROVIDER_UNAVAILABLE failures before opening. */
  failureThreshold: number;
  /** Milliseconds the breaker stays open before transitioning to half-open. */
  cooldownMs: number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Simple three-state circuit breaker (closed → open → half-open → closed).
 *
 * Only PROVIDER_UNAVAILABLE errors should be recorded as failures — HTTP 4xx
 * errors from Anthropic (auth, bad request) are not outage signals and must
 * not trip the breaker.
 *
 * Half-open allows the next call through as a probe. A successful probe closes
 * the breaker; another failure re-opens it and resets the cooldown.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private _probing = false;
  private readonly threshold: number;
  private readonly cooldown: number;
  private readonly clock: () => number;

  constructor(opts: CircuitBreakerOptions) {
    this.threshold = opts.failureThreshold;
    this.cooldown  = opts.cooldownMs;
    this.clock     = opts.now ?? (() => Date.now());
  }

  /** Returns the logical current state, transitioning open→half-open when cooldown elapses. */
  get currentState(): CircuitState {
    if (this.state === 'open' && this.clock() - this.openedAt >= this.cooldown) {
      return 'half-open';
    }
    return this.state;
  }

  /**
   * Returns true when the breaker is open and the cooldown has NOT yet elapsed.
   * Transitions open→half-open transparently when the cooldown elapses.
   */
  isTripped(): boolean {
    if (this.state !== 'open') return false;
    if (this.clock() - this.openedAt >= this.cooldown) {
      this.state = 'half-open';
      return false;
    }
    return true;
  }

  /**
   * Attempts to claim the single probe slot when in half-open state.
   * Returns true if this call claimed the slot (caller may proceed as the probe).
   * Returns false if another probe is already in flight (caller must treat as tripped).
   * Must only be called after isTripped() returned false and currentState === 'half-open'.
   */
  tryStartProbe(): boolean {
    if (this.state !== 'half-open') return false;
    if (this._probing) return false;
    this._probing = true;
    return true;
  }

  recordSuccess(): void {
    this.failures  = 0;
    this.state     = 'closed';
    this._probing  = false;
  }

  recordFailure(): void {
    this._probing = false;
    this.failures++;
    if (this.state === 'half-open' || this.failures >= this.threshold) {
      this.state    = 'open';
      this.openedAt = this.clock();
      this.failures = 0;
    }
  }
}

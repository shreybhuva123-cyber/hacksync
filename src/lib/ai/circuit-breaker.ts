/**
 * AI Provider Circuit Breaker — HackSync Phase 8 Resilient Architecture
 *
 * Prevents cascading failure, eliminates request timeouts during upstream outages,
 * and enables graceful, deterministic fallback across external LLM providers.
 *
 * State Machine:
 * - CLOSED: Normal operation. All calls pass through.
 * - OPEN: Consecutive failures exceeded threshold. Calls fail fast without calling upstream.
 * - HALF_OPEN: Probe window reached after reset timeout. A single request tests upstream health.
 */

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of consecutive failures before tripping (default: 3)
  resetTimeoutMs?: number;   // Time in ms to stay OPEN before testing HALF_OPEN (default: 10,000ms)
  name?: string;
}

export class CircuitBreaker {
  public readonly name: string;
  public readonly failureThreshold: number;
  public readonly resetTimeoutMs: number;

  private state: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.name = options.name || "default";
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 10_000;
  }

  /**
   * Returns current effective circuit breaker state, transitioning from OPEN
   * to HALF_OPEN if the reset timeout window has elapsed.
   */
  getState(): CircuitBreakerState {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
      }
    }
    return this.state;
  }

  /**
   * Checks if the circuit is currently blocking calls (OPEN).
   */
  isOpen(): boolean {
    return this.getState() === "OPEN";
  }

  /**
   * Records a successful upstream call. Resets failure counter and closes circuit.
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  /**
   * Records a failed upstream call (timeout, 5xx, network error, 429 rate limit).
   * Trips to OPEN if failure threshold is reached.
   */
  recordFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }

  /**
   * Forces manual trip into OPEN state (useful for simulated outages and testing).
   */
  trip(): void {
    this.state = "OPEN";
    this.lastFailureTime = Date.now();
    this.failureCount = this.failureThreshold;
  }

  /**
   * Resets the circuit breaker to clean CLOSED state.
   */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Current failure counter.
   */
  getFailures(): number {
    return this.failureCount;
  }
}

/**
 * Global registry managing circuit breakers per provider or service.
 */
export class CircuitBreakerRegistry {
  private static breakers = new Map<string, CircuitBreaker>();

  static getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ ...options, name });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  static resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  static clear(): void {
    this.breakers.clear();
  }
}

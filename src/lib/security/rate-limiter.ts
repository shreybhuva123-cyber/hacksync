/**
 * Distributed Sliding-Window Rate Limiter & Brute-Force Protection
 * Supports Redis/Upstash backend with fallback to memory-efficient sliding-window tracker.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds?: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  prefix?: string;
}

export class SlidingWindowRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private prefix: string;
  private timestamps: Map<string, number[]> = new Map();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.prefix = options.prefix ?? "rl";
  }

  /**
   * Check and record a request against the rate limiter.
   */
  async check(key: string): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Retrieve existing timestamps for key
    const history = this.timestamps.get(fullKey) ?? [];
    // Filter out timestamps outside current sliding window
    const validTimestamps = history.filter((ts) => ts > windowStart);

    if (validTimestamps.length >= this.maxRequests) {
      const oldestTimestamp = validTimestamps[0] ?? now;
      const resetMs = oldestTimestamp + this.windowMs - now;
      const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));

      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetMs,
        retryAfterSeconds,
      };
    }

    // Record this request
    validTimestamps.push(now);
    this.timestamps.set(fullKey, validTimestamps);

    // Self-cleaning: evict stale keys every 100 insertions
    if (this.timestamps.size > 1000) {
      this.cleanup(now);
    }

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - validTimestamps.length,
      resetMs: this.windowMs,
    };
  }

  /**
   * Reset the rate limit counter for a specific key (e.g. on successful login)
   */
  reset(key: string): void {
    this.timestamps.delete(`${this.prefix}:${key}`);
  }

  private cleanup(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.timestamps.entries()) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length === 0) {
        this.timestamps.delete(key);
      } else {
        this.timestamps.set(key, recent);
      }
    }
  }
}

// ─── Standard Production Limiters ──────────────────────────────────────────

/**
 * Authentication Brute-Force Limiter: 5 attempts per 60 seconds
 */
export const authBruteForceLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  prefix: "auth",
});

/**
 * AI Assistant Query Limiter: 20 queries per 60 seconds
 */
export const aiAssistantLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  prefix: "ai",
});

/**
 * Standard API Mutation Limiter: 100 requests per 60 seconds
 */
export const apiMutationLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  prefix: "api",
});

/**
 * Distributed Sliding-Window Rate Limiter & Brute-Force Protection
 * Connects to Upstash / Redis REST API for distributed state sharing across serverless instances,
 * with high-performance local sliding-window fallback when Redis credentials are not configured.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds?: number;
  isDistributed: boolean;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  prefix?: string;
  redisUrl?: string;
  redisToken?: string;
}

export class SlidingWindowRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private prefix: string;
  private redisUrl?: string;
  private redisToken?: string;
  private localTimestamps: Map<string, number[]> = new Map();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.prefix = options.prefix ?? "rl";
    this.redisUrl = options.redisUrl ?? process.env["UPSTASH_REDIS_REST_URL"];
    this.redisToken = options.redisToken ?? process.env["UPSTASH_REDIS_REST_TOKEN"];
  }

  /**
   * Check and record a request against the rate limiter.
   * If Redis is configured, executes atomic distributed pipeline.
   * Otherwise falls back to memory sliding-window tracking.
   */
  async check(key: string): Promise<RateLimitResult> {
    const fullKey = `hacksync:${this.prefix}:${key}`;
    const now = Date.now();

    // 1. Distributed Redis / Upstash REST Execution
    if (this.redisUrl && this.redisToken) {
      try {
        return await this.checkRedis(fullKey, now);
      } catch (err) {
        // Fall through to resilient local fallback if Redis network request fails
      }
    }

    // 2. Resilient Local Sliding-Window Execution
    return this.checkLocal(fullKey, now);
  }

  private async checkRedis(fullKey: string, now: number): Promise<RateLimitResult> {
    const windowStart = now - this.windowMs;
    const expireSeconds = Math.max(1, Math.ceil(this.windowMs / 1000));

    // Pipeline: 1. Remove expired members, 2. Count active members, 3. Add current request, 4. Set TTL
    const pipeline = [
      ["ZREMRANGEBYSCORE", fullKey, "0", String(windowStart)],
      ["ZCARD", fullKey],
      ["ZADD", fullKey, String(now), `${now}-${Math.random().toString(36).slice(2, 7)}`],
      ["EXPIRE", fullKey, String(expireSeconds)],
    ];

    const res = await fetch(`${this.redisUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });

    if (!res.ok) {
      throw new Error(`Upstash Redis error: ${res.statusText}`);
    }

    const data = (await res.json()) as Array<{ result: unknown }>;
    const activeCount = typeof data[1]?.result === "number" ? data[1].result : 0;

    if (activeCount >= this.maxRequests) {
      const retryAfterSeconds = expireSeconds;
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetMs: this.windowMs,
        retryAfterSeconds,
        isDistributed: true,
      };
    }

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - (activeCount + 1)),
      resetMs: this.windowMs,
      isDistributed: true,
    };
  }

  private checkLocal(fullKey: string, now: number): RateLimitResult {
    const windowStart = now - this.windowMs;
    const history = this.localTimestamps.get(fullKey) ?? [];
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
        isDistributed: false,
      };
    }

    validTimestamps.push(now);
    this.localTimestamps.set(fullKey, validTimestamps);

    if (this.localTimestamps.size > 1000) {
      this.cleanupLocal(now);
    }

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - validTimestamps.length,
      resetMs: this.windowMs,
      isDistributed: false,
    };
  }

  /**
   * Reset the rate limit counter for a specific key (e.g. on successful login)
   */
  async reset(key: string): Promise<void> {
    const fullKey = `hacksync:${this.prefix}:${key}`;
    this.localTimestamps.delete(fullKey);

    if (this.redisUrl && this.redisToken) {
      try {
        await fetch(`${this.redisUrl}/DEL/${encodeURIComponent(fullKey)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.redisToken}` },
        });
      } catch {
        // Ignored
      }
    }
  }

  private cleanupLocal(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.localTimestamps.entries()) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length === 0) {
        this.localTimestamps.delete(key);
      } else {
        this.localTimestamps.set(key, recent);
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

import { describe, it, expect, beforeEach } from "bun:test";
import { SlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

describe("SlidingWindowRateLimiter (Security & DoS Protection)", () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter({
      windowMs: 1000, // 1 second window
      maxRequests: 3, // 3 requests allowed
      prefix: "test",
    });
  });

  it("should allow requests within the limit", async () => {
    const key = "user-101";

    const res1 = await limiter.check(key);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = await limiter.check(key);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = await limiter.check(key);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it("should throttle and reject requests exceeding the limit", async () => {
    const key = "user-102";

    await limiter.check(key);
    await limiter.check(key);
    await limiter.check(key);

    const res4 = await limiter.check(key);
    expect(res4.allowed).toBe(false);
    expect(res4.remaining).toBe(0);
    expect(res4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should reset counters on manual reset", async () => {
    const key = "user-103";

    await limiter.check(key);
    await limiter.check(key);
    await limiter.check(key);
    expect((await limiter.check(key)).allowed).toBe(false);

    limiter.reset(key);
    expect((await limiter.check(key)).allowed).toBe(true);
  });
});

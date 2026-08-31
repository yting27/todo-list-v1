import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthRateLimiter } from "../src/auth/rate-limit.js";
import { SessionStore } from "../src/auth/session-store.js";
import { loadConfig } from "../src/config.js";
import type { RedisClient } from "../src/platform/redis.js";

class MemoryRedis {
  readonly values = new Map<string, string>();
  readonly counts = new Map<string, number>();

  async setEx(key: string, _seconds: number, value: string) {
    this.values.set(key, value);
    return "OK";
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async del(key: string) {
    return this.values.delete(key) ? 1 : 0;
  }

  async incr(key: string) {
    const value = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, value);
    return value;
  }

  async expire(_key: string, _seconds: number) {
    void _key;
    void _seconds;
    return true;
  }
}

afterEach(() => vi.useRealTimers());

describe("Redis-backed sessions", () => {
  it("uses opaque digested keys, validates CSRF, revokes, and enforces absolute expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const redis = new MemoryRedis();
    const store = new SessionStore(
      redis as unknown as RedisClient,
      loadConfig({ NODE_ENV: "test" }),
    );
    const session = await store.create("user-1");
    const storedKey = [...redis.values.keys()][0]!;
    expect(storedKey).toMatch(/^session:[a-f0-9]{64}$/);
    expect(storedKey).not.toContain(session.token);
    expect(store.verifyCsrf(session, session.csrfToken)).toBe(true);
    expect(store.verifyCsrf(session, "wrong")).toBe(false);
    expect(await store.get(session.token)).toMatchObject({ userId: "user-1" });

    vi.setSystemTime(new Date("2026-02-01T00:00:01Z"));
    expect(await store.get(session.token)).toBeNull();
    expect(redis.values.size).toBe(0);
  });

  it("revokes only the selected token", async () => {
    const redis = new MemoryRedis();
    const store = new SessionStore(
      redis as unknown as RedisClient,
      loadConfig({ NODE_ENV: "test" }),
    );
    const first = await store.create("user-1");
    const second = await store.create("user-1");
    await store.revoke(first.token);
    expect(await store.get(first.token)).toBeNull();
    expect(await store.get(second.token)).not.toBeNull();
  });
});

describe("authentication rate limiting", () => {
  it("limits repeated attempts by normalized email or IP", async () => {
    const redis = new MemoryRedis();
    const limiter = new AuthRateLimiter(
      redis as unknown as RedisClient,
      loadConfig({ NODE_ENV: "test", AUTH_RATE_LIMIT: "2" }),
    );
    await limiter.check("127.0.0.1", "person@example.com");
    await limiter.check("127.0.0.1", "person@example.com");
    await expect(
      limiter.check("127.0.0.1", "person@example.com"),
    ).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });
});

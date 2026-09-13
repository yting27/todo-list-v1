import { createHash } from "node:crypto";

import type { Config } from "../config.js";
import { ProblemError } from "../domain/errors.js";
import type { RedisClient } from "../platform/redis.js";

export class AuthRateLimiter {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: Config,
  ) {}

  async check(ip: string, normalizedEmail: string): Promise<void> {
    const emailDigest = createHash("sha256")
      .update(normalizedEmail)
      .digest("hex")
      .slice(0, 24);
    // Count by IP and account independently so either limit can reject an attempt.
    const keys = [`rate:auth:ip:${ip}`, `rate:auth:email:${emailDigest}`];
    const counts = await Promise.all(
      keys.map(async (key) => {
        // Atomically create the key with its TTL on the first attempt so a
        // crash between commands can never leave an orphaned counter.
        const created = await this.redis.set(key, 1, {
          EX: this.config.AUTH_RATE_WINDOW_SECONDS,
          NX: true,
        });
        if (created === "OK") return 1;
        // Key already exists with its TTL set; increment without touching it.
        return await this.redis.incr(key);
      }),
    );
    if (counts.some((count) => count > this.config.AUTH_RATE_LIMIT)) {
      throw new ProblemError({
        status: 429,
        code: "rate_limited",
        title: "Too many requests",
        detail: "Too many authentication attempts. Try again later.",
      });
    }
  }
}

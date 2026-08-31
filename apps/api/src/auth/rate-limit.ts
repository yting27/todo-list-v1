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
    const keys = [`rate:auth:ip:${ip}`, `rate:auth:email:${emailDigest}`];
    const counts = await Promise.all(
      keys.map(async (key) => {
        const value = await this.redis.incr(key);
        if (value === 1)
          await this.redis.expire(key, this.config.AUTH_RATE_WINDOW_SECONDS);
        return value;
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

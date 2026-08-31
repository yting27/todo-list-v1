import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { Config } from "../config.js";
import type { RedisClient } from "../platform/redis.js";

export interface SessionRecord {
  userId: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
}

export interface NewSession extends SessionRecord {
  token: string;
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function key(token: string): string {
  return `session:${digest(token)}`;
}

export class SessionStore {
  private readonly idleSeconds: number;
  private readonly absoluteMilliseconds: number;

  constructor(
    private readonly redis: RedisClient,
    config: Config,
  ) {
    this.idleSeconds = config.SESSION_IDLE_DAYS * 24 * 60 * 60;
    this.absoluteMilliseconds =
      config.SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000;
  }

  async create(userId: string): Promise<NewSession> {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const record: SessionRecord = {
      userId,
      csrfToken: randomBytes(32).toString("base64url"),
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: now + this.absoluteMilliseconds,
    };
    await this.redis.setEx(
      key(token),
      this.idleSeconds,
      JSON.stringify(record),
    );
    return { token, ...record };
  }

  async get(token: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(key(token));
    if (!raw) return null;
    const record = JSON.parse(raw) as SessionRecord;
    const now = Date.now();
    if (record.absoluteExpiresAt <= now) {
      await this.revoke(token);
      return null;
    }
    record.lastSeenAt = now;
    const remainingAbsoluteSeconds = Math.max(
      1,
      Math.floor((record.absoluteExpiresAt - now) / 1000),
    );
    await this.redis.setEx(
      key(token),
      Math.min(this.idleSeconds, remainingAbsoluteSeconds),
      JSON.stringify(record),
    );
    return record;
  }

  async revoke(token: string): Promise<void> {
    await this.redis.del(key(token));
  }

  verifyCsrf(record: SessionRecord, supplied: string | undefined): boolean {
    if (!supplied) return false;
    const expected = Buffer.from(record.csrfToken);
    const received = Buffer.from(supplied);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
}

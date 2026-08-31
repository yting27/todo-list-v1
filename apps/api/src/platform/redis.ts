import { createClient } from "redis";

import type { Config } from "../config.js";
import type { Logger } from "./logger.js";

export type RedisClient = ReturnType<typeof createClient>;

export function makeRedisClient(config: Config, logger: Logger): RedisClient {
  const client = createClient({ url: config.REDIS_URL });
  client.on("error", (error) => logger.error({ error }, "redis client error"));
  return client;
}

import { createServer } from "node:http";

import { AuthRateLimiter } from "./auth/rate-limit.js";
import { AuthService } from "./auth/service.js";
import { SessionStore } from "./auth/session-store.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SseHub } from "./http/sse.js";
import { TodoService } from "./modules/todos/service.js";
import { WorkspaceService } from "./modules/workspaces/service.js";
import { createPool } from "./platform/db.js";
import { createLogger } from "./platform/logger.js";
import { makeRedisClient } from "./platform/redis.js";

const config = loadConfig();
const logger = createLogger(config);
const pool = createPool(config);
const redis = makeRedisClient(config, logger);
const subscriber = makeRedisClient(config, logger);

await Promise.all([redis.connect(), subscriber.connect()]);

const sessions = new SessionStore(redis, config);
const workspaces = new WorkspaceService(pool);
const auth = new AuthService(pool, sessions, workspaces);
const todos = new TodoService(pool, workspaces);
const rateLimiter = new AuthRateLimiter(redis, config);
const sse = new SseHub(logger);
await sse.subscribe(subscriber);
sse.startHeartbeats();

const app = createApp({
  config,
  logger,
  pool,
  redis,
  sessions,
  rateLimiter,
  auth,
  workspaces,
  todos,
  sse,
});
const server = createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 30_000;

server.listen(config.API_PORT, "0.0.0.0", () => {
  logger.info({ port: config.API_PORT }, "API listening");
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "graceful shutdown started");
  const force = setTimeout(() => process.exit(1), 15_000);
  force.unref();
  sse.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([subscriber.quit(), redis.quit(), pool.end()]);
  clearTimeout(force);
  logger.info("graceful shutdown complete");
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

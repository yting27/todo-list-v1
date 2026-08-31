import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import type { AuthRateLimiter } from "./auth/rate-limit.js";
import type { AuthService } from "./auth/service.js";
import type { SessionStore } from "./auth/session-store.js";
import type { Config } from "./config.js";
import {
  errorHandler,
  notFoundHandler,
  requireTrustedOrigin,
} from "./http/middleware.js";
import { createApiRouter } from "./http/routes.js";
import type { SseHub } from "./http/sse.js";
import type { TodoService } from "./modules/todos/service.js";
import type { WorkspaceService } from "./modules/workspaces/service.js";
import { httpMetrics, registry } from "./observability/metrics.js";
import type { DbPool } from "./platform/db.js";
import type { Logger } from "./platform/logger.js";
import type { RedisClient } from "./platform/redis.js";

export interface AppDependencies {
  config: Config;
  logger: Logger;
  pool: DbPool;
  redis: RedisClient;
  sessions: SessionStore;
  rateLimiter: AuthRateLimiter;
  auth: AuthService;
  workspaces: WorkspaceService;
  todos: TodoService;
  sse: SseHub;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const openapiPath = fileURLToPath(
    new URL("../../../api/openapi.yaml", import.meta.url),
  );
  const openapiSource = readFileSync(openapiPath, "utf8");
  const openapi = YAML.parse(openapiSource) as swaggerUi.JsonObject;

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    pinoHttp({
      logger: dependencies.logger,
      genReqId: (request, response) => {
        const id = request.headers["x-request-id"]?.toString() ?? randomUUID();
        response.setHeader("x-request-id", id);
        return id;
      },
      customProps: (request) => ({ traceparent: request.headers.traceparent }),
      autoLogging: {
        ignore: (request) => request.url?.startsWith("/health/") ?? false,
      },
    }),
  );
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(httpMetrics);
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use(requireTrustedOrigin(dependencies.config));

  app.get("/health/live", (_request, response) =>
    response.json({ status: "ok" }),
  );
  app.get("/health/ready", async (_request, response) => {
    try {
      await Promise.all([
        dependencies.pool.query("SELECT 1"),
        dependencies.redis.ping(),
      ]);
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "not_ready" });
    }
  });
  app.get("/metrics", async (_request, response) => {
    response.type(registry.contentType).send(await registry.metrics());
  });
  app.get("/api/openapi.yaml", (_request, response) =>
    response.type("text/yaml").send(openapiSource),
  );
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.use(
    "/api/v1",
    createApiRouter({
      auth: dependencies.auth,
      rateLimiter: dependencies.rateLimiter,
      sessions: dependencies.sessions,
      workspaces: dependencies.workspaces,
      todos: dependencies.todos,
      sse: dependencies.sse,
      config: dependencies.config,
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler(dependencies.logger));
  return app;
}

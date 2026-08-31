import pino from "pino";

import type { Config } from "../config.js";

export function createLogger(config: Config) {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: "todo-api", environment: config.NODE_ENV },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-csrf-token",
        "res.headers.set-cookie",
        "password",
        "passwordHash",
      ],
      censor: "[REDACTED]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;

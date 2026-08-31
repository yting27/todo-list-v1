import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://user0:todo_local_usr_password@127.0.0.1:5432/todo"),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  TRUSTED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  COOKIE_SECURE: booleanFromString,
  SESSION_IDLE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  AUTH_RATE_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(source);
  return {
    ...config,
    trustedOrigins: new Set(
      config.TRUSTED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    sessionCookieName: config.COOKIE_SECURE
      ? "__Host-todo_session"
      : "todo_session",
  };
}

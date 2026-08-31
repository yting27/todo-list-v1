import { createHash } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuthRateLimiter } from "../../src/auth/rate-limit.js";
import { AuthService } from "../../src/auth/service.js";
import { SessionStore } from "../../src/auth/session-store.js";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { SseHub } from "../../src/http/sse.js";
import { TodoService } from "../../src/modules/todos/service.js";
import { WorkspaceService } from "../../src/modules/workspaces/service.js";
import { createPool } from "../../src/platform/db.js";
import { createLogger } from "../../src/platform/logger.js";
import { makeRedisClient } from "../../src/platform/redis.js";

const config = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  AUTH_RATE_LIMIT: "100",
});
const logger = createLogger(config);
const pool = createPool(config);
const redis = makeRedisClient(config, logger);
const sessions = new SessionStore(redis, config);
const workspaces = new WorkspaceService(pool);
const auth = new AuthService(pool, sessions, workspaces);
const todos = new TodoService(pool, workspaces);
const rateLimiter = new AuthRateLimiter(redis, config);
const sse = new SseHub(logger);
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
const origin = "http://localhost:3000";

beforeAll(async () => redis.connect());
beforeEach(async () => {
  await pool.query(
    "TRUNCATE outbox_events, todo_dependencies, todos, recurrence_series, workspace_members, workspaces, users CASCADE",
  );
  await redis.flushDb();
});
afterAll(async () => {
  await Promise.all([redis.quit(), pool.end()]);
});

function registration(email = "owner@example.com") {
  return {
    email,
    password: "correct-horse-battery-staple",
    displayName: "Owner",
    workspaceName: "Team",
    timezone: "Asia/Kuala_Lumpur",
  };
}

function sessionCookie(response: request.Response): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error("Missing session cookie");
  return value.split(";", 1)[0]!;
}

describe.sequential("authentication and HTTP protections", () => {
  it("hashes passwords, stores only the session digest, rotates sessions, and revokes logout", async () => {
    const agent = request.agent(app);
    const registered = await agent
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send(registration())
      .expect(201);
    const firstCookie = sessionCookie(registered);
    const token = firstCookie.split("=", 2)[1]!;
    const digest = createHash("sha256").update(token).digest("hex");
    expect(await redis.exists(`session:${digest}`)).toBe(1);
    expect(await redis.exists(`session:${token}`)).toBe(0);

    const user = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      ["owner@example.com"],
    );
    expect(user.rows[0]!.password_hash).toMatch(/^\$argon2id\$/);

    const second = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: "owner@example.com", password: registration().password })
      .expect(200);
    expect(sessionCookie(second)).not.toBe(firstCookie);

    await agent
      .post("/api/v1/auth/logout")
      .set("Origin", origin)
      .set("X-CSRF-Token", registered.body.csrfToken as string)
      .expect(204);
    await agent.get("/api/v1/auth/me").expect(401);
  });

  it("uses generic duplicate-registration and invalid-credential responses", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send(registration())
      .expect(201);
    const duplicate = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send(registration())
      .expect(409);
    expect(duplicate.body.code).toBe("registration_conflict");
    const existing = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: "owner@example.com", password: "wrong" })
      .expect(401);
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: "unknown@example.com", password: "wrong" })
      .expect(401);
    expect(existing.body).toMatchObject({
      code: "invalid_credentials",
      detail: unknown.body.detail,
    });
  });

  it("rejects untrusted origins and missing CSRF tokens", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", "https://attacker.invalid")
      .send(registration())
      .expect(403);
    const agent = request.agent(app);
    const registered = await agent
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send(registration())
      .expect(201);
    const workspaceId = registered.body.workspaces[0].id as string;
    const todo = {
      name: "Protected",
      description: "",
      dueAt: "2026-09-01T10:00:00Z",
      status: "NotStarted",
      priority: "Medium",
      dependencyIds: [],
    };
    await agent
      .post(`/api/v1/workspaces/${workspaceId}/todos`)
      .set("Origin", origin)
      .send(todo)
      .expect(403);
    await agent
      .post(`/api/v1/workspaces/${workspaceId}/todos`)
      .set("Origin", origin)
      .set("X-CSRF-Token", registered.body.csrfToken as string)
      .send(todo)
      .expect(201);
  });

  it("enforces viewer authorization at the server boundary", async () => {
    const owner = request.agent(app);
    const ownerRegistration = await owner
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send(registration())
      .expect(201);
    const viewer = request.agent(app);
    const viewerRegistration = await viewer
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send(registration("viewer@example.com"))
      .expect(201);
    const ownerWorkspace = ownerRegistration.body.workspaces[0].id as string;
    await owner
      .post(`/api/v1/workspaces/${ownerWorkspace}/members`)
      .set("Origin", origin)
      .set("X-CSRF-Token", ownerRegistration.body.csrfToken as string)
      .send({ email: "viewer@example.com", role: "viewer" })
      .expect(201);
    await viewer
      .post(`/api/v1/workspaces/${ownerWorkspace}/todos`)
      .set("Origin", origin)
      .set("X-CSRF-Token", viewerRegistration.body.csrfToken as string)
      .send({
        name: "Forbidden",
        description: "",
        dueAt: "2026-09-01T10:00:00Z",
        status: "NotStarted",
        priority: "Medium",
        dependencyIds: [],
      })
      .expect(403);
  });
});

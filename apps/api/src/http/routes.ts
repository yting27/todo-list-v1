import { Router, type Response } from "express";
import { z } from "zod";

import type { AuthRateLimiter } from "../auth/rate-limit.js";
import type { AuthService } from "../auth/service.js";
import type { SessionStore } from "../auth/session-store.js";
import type { Config } from "../config.js";
import { parseIfMatch, formatEtag } from "./etag.js";
import { authenticate, parse, requireCsrf } from "./middleware.js";
import type { SseHub } from "./sse.js";
import type { AuthenticatedRequest } from "./types.js";
import type { TodoService } from "../modules/todos/service.js";
import {
  createTodoSchema,
  listQuerySchema,
  updateTodoSchema,
} from "../modules/todos/schemas.js";
import type { WorkspaceService } from "../modules/workspaces/service.js";

const registerSchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(120),
    workspaceName: z.string().trim().min(1).max(120),
    timezone: z.string().min(1).max(100),
  })
  .strict();
const loginSchema = z
  .object({ email: z.email().max(320), password: z.string().min(1).max(128) })
  .strict();
const workspaceSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    timezone: z.string().min(1).max(100),
  })
  .strict();
const memberSchema = z
  .object({ email: z.email(), role: z.enum(["editor", "viewer"]) })
  .strict();
const roleSchema = z.object({ role: z.enum(["editor", "viewer"]) }).strict();
const dependencySchema = z.object({ dependsOnId: z.uuid() }).strict();
const idSchema = z.uuid();

interface RouteDependencies {
  auth: AuthService;
  rateLimiter: AuthRateLimiter;
  sessions: SessionStore;
  workspaces: WorkspaceService;
  todos: TodoService;
  sse: SseHub;
  config: Config;
}

function authRequest(request: unknown) {
  return request as AuthenticatedRequest;
}

function setSessionCookie(response: Response, config: Config, token: string) {
  response.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: config.SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function createApiRouter(dependencies: RouteDependencies) {
  const router = Router();
  const { auth, rateLimiter, sessions, workspaces, todos, sse, config } =
    dependencies;

  router.post("/auth/register", async (request, response) => {
    const input = parse(registerSchema, request.body);
    await rateLimiter.check(
      request.ip ?? "unknown",
      input.email.trim().toLowerCase(),
    );
    const result = await auth.register(input);
    setSessionCookie(response, config, result.token);
    response.status(201).json(result.body);
  });

  router.post("/auth/login", async (request, response) => {
    const input = parse(loginSchema, request.body);
    await rateLimiter.check(
      request.ip ?? "unknown",
      input.email.trim().toLowerCase(),
    );
    const result = await auth.login(input.email, input.password);
    setSessionCookie(response, config, result.token);
    response.json(result.body);
  });

  router.use(authenticate(sessions, config.sessionCookieName));

  router.get("/auth/me", async (request, response) => {
    const { auth: session } = authRequest(request);
    response.json(await auth.current(session.userId, session.csrfToken));
  });

  router.use(requireCsrf(sessions));

  router.post("/auth/logout", async (request, response) => {
    await sessions.revoke(authRequest(request).auth.token);
    response.clearCookie(config.sessionCookieName, { path: "/" });
    response.status(204).end();
  });

  router.get("/workspaces", async (request, response) => {
    response.json({
      items: await workspaces.list(authRequest(request).auth.userId),
    });
  });
  router.post("/workspaces", async (request, response) => {
    response
      .status(201)
      .json(
        await workspaces.create(
          authRequest(request).auth.userId,
          parse(workspaceSchema, request.body),
        ),
      );
  });
  router.patch("/workspaces/:workspaceId", async (request, response) => {
    response.json(
      await workspaces.update(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(workspaceSchema, request.body),
      ),
    );
  });
  router.get("/workspaces/:workspaceId/members", async (request, response) => {
    response.json({
      items: await workspaces.listMembers(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
      ),
    });
  });
  router.post("/workspaces/:workspaceId/members", async (request, response) => {
    const input = parse(memberSchema, request.body);
    response
      .status(201)
      .json(
        await workspaces.addMember(
          authRequest(request).auth.userId,
          parse(idSchema, request.params.workspaceId),
          input.email,
          input.role,
        ),
      );
  });
  router.patch(
    "/workspaces/:workspaceId/members/:userId",
    async (request, response) => {
      response.json(
        await workspaces.updateMember(
          authRequest(request).auth.userId,
          parse(idSchema, request.params.workspaceId),
          parse(idSchema, request.params.userId),
          parse(roleSchema, request.body).role,
        ),
      );
    },
  );
  router.delete(
    "/workspaces/:workspaceId/members/:userId",
    async (request, response) => {
      await workspaces.removeMember(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(idSchema, request.params.userId),
      );
      response.status(204).end();
    },
  );

  router.get("/workspaces/:workspaceId/todos", async (request, response) => {
    response.json(
      await todos.list(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(listQuerySchema, request.query),
      ),
    );
  });
  router.post("/workspaces/:workspaceId/todos", async (request, response) => {
    const todo = await todos.create(
      authRequest(request).auth.userId,
      parse(idSchema, request.params.workspaceId),
      parse(createTodoSchema, request.body),
    );
    response.set("ETag", formatEtag(todo.version)).status(201).json(todo);
  });
  router.get(
    "/workspaces/:workspaceId/todos/:todoId",
    async (request, response) => {
      const todo = await todos.get(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(idSchema, request.params.todoId),
      );
      response.set("ETag", formatEtag(todo.version)).json(todo);
    },
  );
  router.patch(
    "/workspaces/:workspaceId/todos/:todoId",
    async (request, response) => {
      const result = await todos.update(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(idSchema, request.params.todoId),
        parseIfMatch(request.get("if-match")),
        parse(updateTodoSchema, request.body),
      );
      response.set("ETag", formatEtag(result.todo.version)).json(result);
    },
  );
  router.delete(
    "/workspaces/:workspaceId/todos/:todoId",
    async (request, response) => {
      await todos.delete(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(idSchema, request.params.todoId),
        parseIfMatch(request.get("if-match")),
      );
      response.status(204).end();
    },
  );
  router.post(
    "/workspaces/:workspaceId/todos/:todoId/dependencies",
    async (request, response) => {
      const todo = await todos.addDependency(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(idSchema, request.params.todoId),
        parse(dependencySchema, request.body).dependsOnId,
        parseIfMatch(request.get("if-match")),
      );
      response.set("ETag", formatEtag(todo.version)).json(todo);
    },
  );
  router.delete(
    "/workspaces/:workspaceId/todos/:todoId/dependencies/:dependsOnId",
    async (request, response) => {
      const todo = await todos.removeDependency(
        authRequest(request).auth.userId,
        parse(idSchema, request.params.workspaceId),
        parse(idSchema, request.params.todoId),
        parse(idSchema, request.params.dependsOnId),
        parseIfMatch(request.get("if-match")),
      );
      response.set("ETag", formatEtag(todo.version)).json(todo);
    },
  );

  // EventSource cannot send the CSRF header; GET is safe and membership is checked here.
  router.get("/workspaces/:workspaceId/events", async (request, response) => {
    const workspaceId = parse(idSchema, request.params.workspaceId);
    await workspaces.requireRole(
      authRequest(request).auth.userId,
      workspaceId,
      ["owner", "editor", "viewer"],
    );
    response.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    sse.add(workspaceId, response);
  });

  return router;
}

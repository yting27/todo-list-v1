import type { Response } from "express";

import type { Logger } from "../platform/logger.js";
import type { RedisClient } from "../platform/redis.js";

export interface WorkspaceEvent {
  eventId: string;
  eventType: "todo.created" | "todo.updated" | "todo.deleted";
  workspaceId: string;
  todoId: string;
  version: number;
}

export class SseHub {
  private readonly clients = new Map<string, Set<Response>>();
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(private readonly logger: Logger) {}

  add(workspaceId: string, response: Response) {
    const clients = this.clients.get(workspaceId) ?? new Set<Response>();
    clients.add(response);
    this.clients.set(workspaceId, clients);
    response.write("retry: 3000\n\n");
    response.on("close", () => {
      clients.delete(response);
      if (clients.size === 0) this.clients.delete(workspaceId);
    });
  }

  publish(event: WorkspaceEvent) {
    for (const response of this.clients.get(event.workspaceId) ?? []) {
      response.write(
        `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    }
  }

  startHeartbeats() {
    this.heartbeat = setInterval(() => {
      for (const responses of this.clients.values()) {
        for (const response of responses) response.write(": heartbeat\n\n");
      }
    }, 20_000);
    this.heartbeat.unref();
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const responses of this.clients.values()) {
      for (const response of responses) response.end();
    }
    this.clients.clear();
  }

  async subscribe(redis: RedisClient) {
    await redis.pSubscribe("workspace:*", (message) => {
      try {
        this.publish(JSON.parse(message) as WorkspaceEvent);
      } catch (error) {
        this.logger.warn({ error }, "ignored malformed workspace event");
      }
    });
  }
}

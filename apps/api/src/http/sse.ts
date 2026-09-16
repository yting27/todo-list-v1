import type { WorkspaceEvent } from "@todo/contracts";
import type { Response } from "express";

import type { Logger } from "../platform/logger.js";
import type { RedisClient } from "../platform/redis.js";

export class SseHub {
  // Group authorized connections by workspace for scoped event fan-out.
  private readonly clients = new Map<string, Set<Response>>();
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(private readonly logger: Logger) {}

  add(workspaceId: string, response: Response) {
    const clients = this.clients.get(workspaceId) ?? new Set<Response>();
    clients.add(response);
    this.clients.set(workspaceId, clients);
    // Tell EventSource to wait three seconds before reconnecting.
    response.write("retry: 3000\n\n");
    response.on("close", () => {
      // Remove closed sockets and empty workspace buckets.
      clients.delete(response);
      if (clients.size === 0) this.clients.delete(workspaceId);
    });
  }

  publish(event: WorkspaceEvent) {
    for (const response of this.clients.get(event.workspaceId) ?? []) {
      // The blank line terminates one named SSE event frame.
      response.write(
        `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    }
  }

  startHeartbeats() {
    this.heartbeat = setInterval(() => {
      for (const responses of this.clients.values()) {
        // SSE comments keep idle connections open without dispatching an event.
        for (const response of responses) response.write(": heartbeat\n\n");
      }
    }, 20_000 /* milliseconds */);
    // The heartbeat timer alone must not keep the Node process alive.
    this.heartbeat.unref();
  }

  close() {
    // End every stream during graceful shutdown and release all references.
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const responses of this.clients.values()) {
      for (const response of responses) response.end();
    }
    this.clients.clear();
  }

  // Pub/Sub forwards live notifications only; this hub does not replay missed event IDs.
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

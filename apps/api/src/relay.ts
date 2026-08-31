import { hostname } from "node:os";

import { loadConfig } from "./config.js";
import { inTransaction, createPool } from "./platform/db.js";
import { createLogger } from "./platform/logger.js";
import { makeRedisClient } from "./platform/redis.js";

interface OutboxRow {
  id: string;
  workspace_id: string;
  payload: Record<string, unknown>;
}

const config = loadConfig();
const logger = createLogger(config).child({ service: "todo-outbox-relay" });
const pool = createPool(config);
const redis = makeRedisClient(config, logger);
const relayId = `${hostname()}:${process.pid}`;
await redis.connect();

let stopping = false;
let wake: (() => void) | undefined;

function stop(signal: string) {
  logger.info({ signal }, "outbox relay stopping");
  stopping = true;
  wake?.();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

async function claimBatch(): Promise<OutboxRow[]> {
  return inTransaction(pool, async (client) => {
    const result = await client.query<OutboxRow>(
      `WITH candidates AS (
         SELECT id FROM outbox_events
         WHERE published_at IS NULL
           AND (claimed_at IS NULL OR claimed_at < clock_timestamp() - interval '1 minute')
         ORDER BY created_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 100
       )
       UPDATE outbox_events o
       SET claimed_at = clock_timestamp(), claimed_by = $1, attempts = attempts + 1
       FROM candidates c WHERE o.id = c.id
       RETURNING o.id, o.workspace_id, o.payload`,
      [relayId],
    );
    return result.rows;
  });
}

async function publish(row: OutboxRow) {
  await redis.publish(
    `workspace:${row.workspace_id}`,
    JSON.stringify(row.payload),
  );
  await pool.query(
    `UPDATE outbox_events SET published_at = clock_timestamp()
     WHERE id = $1 AND claimed_by = $2 AND published_at IS NULL`,
    [row.id, relayId],
  );
}

while (!stopping) {
  try {
    const rows = await claimBatch();
    for (const row of rows) {
      if (stopping) break;
      await publish(row);
    }
    if (rows.length === 0) {
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, 500).unref();
      });
      wake = undefined;
    }
  } catch (error) {
    logger.error({ error }, "outbox relay iteration failed");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

await Promise.allSettled([redis.quit(), pool.end()]);

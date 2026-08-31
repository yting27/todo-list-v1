import pg from "pg";

import type { Config } from "../config.js";

const { Pool } = pg;

// PostgreSQL "timestamp without time zone" values are recurrence wall-clock anchors,
// not instants. Keep them as strings so the runtime never applies the host timezone.
pg.types.setTypeParser(1114, (value: string) => value);

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;
export type Queryable = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">;

export function createPool(config: Config): DbPool {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.NODE_ENV === "test" ? 5 : 20,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    maxUses: 10_000,
    application_name: "todo-api",
  });
}

export async function inTransaction<T>(
  pool: DbPool,
  fn: (client: DbClient) => Promise<T>,
  isolation: "READ COMMITTED" | "SERIALIZABLE" = "READ COMMITTED",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function serializable<T>(
  pool: DbPool,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await inTransaction(pool, fn, "SERIALIZABLE");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "40001" ||
        attempt === attempts
      ) {
        throw error;
      }
    }
  }
  throw new Error("unreachable");
}

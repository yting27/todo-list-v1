import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config.js";
import { createPool } from "../platform/db.js";

const direction = process.argv[2] === "down" ? "down" : "up";
const migrationsDirectory =
  process.env.MIGRATIONS_DIR ??
  fileURLToPath(new URL("../../../../migrations/", import.meta.url));
const config = loadConfig();
const pool = createPool(config);
const client = await pool.connect();

try {
  await client.query(
    "SELECT pg_advisory_lock(hashtext('todo-schema-migrations'))",
  );
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  )`);
  const files = (await readdir(migrationsDirectory)).sort();
  if (direction === "up") {
    for (const file of files.filter((name) => name.endsWith(".up.sql"))) {
      const version = file.replace(".up.sql", "");
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (exists.rowCount) continue;
      const sql = await readFile(`${migrationsDirectory}/${file}`, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version],
        );
        await client.query("COMMIT");
        process.stdout.write(`applied ${version}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } else {
    const applied = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    );
    const version = applied.rows[0]?.version;
    if (!version) process.stdout.write("no migration to roll back\n");
    else {
      const file = `${version}.down.sql`;
      if (!files.includes(file))
        throw new Error(`Missing down migration: ${file}`);
      const sql = await readFile(`${migrationsDirectory}/${file}`, "utf8");
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM schema_migrations WHERE version = $1", [
          version,
        ]);
        await client.query(sql);
        await client.query("COMMIT");
        process.stdout.write(`rolled back ${version}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  }
} finally {
  await client
    .query("SELECT pg_advisory_unlock(hashtext('todo-schema-migrations'))")
    .catch(() => undefined);
  client.release();
  await pool.end();
}

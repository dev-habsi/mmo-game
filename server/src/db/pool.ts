import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { ServerConfig } from "../config.js";

const { Pool } = pg;

export function createPool(config: ServerConfig): pg.Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10
  });
}

export async function applySchema(pool: pg.Pool): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = resolve(here, "../../../database/schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
}

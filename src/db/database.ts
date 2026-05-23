import pg from "pg";
import { config } from "../config";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout: 10_000,
});

export async function close(): Promise<void> {
  await pool.end();
}

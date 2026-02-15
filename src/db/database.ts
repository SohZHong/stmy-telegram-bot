import pg from "pg";
import { config } from "../config";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function close(): Promise<void> {
  await pool.end();
}

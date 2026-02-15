import { pool } from "../db/database.js";

export interface Setting {
  key: string;
  value: string;
  updated_by: number | null;
  updated_at: Date;
}

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query<Setting>(
    `SELECT value FROM settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(
  key: string,
  value: string,
  updatedBy: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [key, value, updatedBy],
  );
}

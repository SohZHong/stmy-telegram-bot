import pg from 'pg';
import { config } from '../config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export interface Member {
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  group_id: string;
  intro_completed: boolean;
  joined_at: Date;
  intro_completed_at: Date | null;
}

export async function upsertMember(
  telegramId: number,
  username: string | undefined,
  firstName: string | undefined,
  groupId: number
): Promise<void> {
  await pool.query(
    `INSERT INTO members (telegram_id, username, first_name, group_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET username = $2, first_name = $3`,
    [telegramId, username ?? null, firstName ?? null, groupId]
  );
}

export async function getMember(telegramId: number): Promise<Member | null> {
  const { rows } = await pool.query<Member>(
    `SELECT * FROM members WHERE telegram_id = $1`,
    [telegramId]
  );
  return rows[0] ?? null;
}

export async function markIntroCompleted(telegramId: number): Promise<void> {
  await pool.query(
    `UPDATE members SET intro_completed = TRUE, intro_completed_at = NOW() WHERE telegram_id = $1`,
    [telegramId]
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query<{ value: string }>(
    `SELECT value FROM settings WHERE key = $1`,
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string, updatedBy: number): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [key, value, updatedBy]
  );
}

export async function close(): Promise<void> {
  await pool.end();
}

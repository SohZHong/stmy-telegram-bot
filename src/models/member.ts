import { pool } from "../db/database";

export interface Member {
  id: number;
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
  groupId: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO members (telegram_id, username, first_name, group_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET username = $2, first_name = $3`,
    [telegramId, username ?? null, firstName ?? null, groupId],
  );
}

export async function getMember(telegramId: number): Promise<Member | null> {
  const { rows } = await pool.query<Member>(
    `SELECT * FROM members WHERE telegram_id = $1`,
    [telegramId],
  );
  return rows[0] ?? null;
}

export async function markIntroCompleted(telegramId: number): Promise<void> {
  await pool.query(
    `UPDATE members SET intro_completed = TRUE, intro_completed_at = NOW() WHERE telegram_id = $1`,
    [telegramId],
  );
}

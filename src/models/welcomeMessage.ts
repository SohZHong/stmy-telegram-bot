import { pool } from "../db/database";

export interface WelcomeMessage {
  id: number;
  message: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getAllWelcomeMessages(): Promise<WelcomeMessage[]> {
  const { rows } = await pool.query<WelcomeMessage>(
    `SELECT * FROM welcome_messages ORDER BY id`,
  );
  return rows;
}

export async function getWelcomeMessage(
  id: number,
): Promise<WelcomeMessage | null> {
  const { rows } = await pool.query<WelcomeMessage>(
    `SELECT * FROM welcome_messages WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getRandomWelcomeMessage(): Promise<WelcomeMessage | null> {
  const { rows } = await pool.query<WelcomeMessage>(
    `SELECT * FROM welcome_messages ORDER BY RANDOM() LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function addWelcomeMessage(
  message: string,
  createdBy: number,
): Promise<WelcomeMessage> {
  const { rows } = await pool.query<WelcomeMessage>(
    `INSERT INTO welcome_messages (message, created_by) VALUES ($1, $2) RETURNING *`,
    [message, createdBy],
  );
  return rows[0];
}

export async function updateWelcomeMessage(
  id: number,
  message: string,
): Promise<WelcomeMessage | null> {
  const { rows } = await pool.query<WelcomeMessage>(
    `UPDATE welcome_messages SET message = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, message],
  );
  return rows[0] ?? null;
}

export async function deleteWelcomeMessage(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM welcome_messages WHERE id = $1`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function countWelcomeMessages(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM welcome_messages`,
  );
  return parseInt(rows[0].count, 10);
}

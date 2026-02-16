import { pool } from "../db/database";

export interface BlockedWord {
  id: number;
  word: string;
  created_by: string | null;
  created_at: Date;
}

export async function getAllBlockedWords(): Promise<BlockedWord[]> {
  const { rows } = await pool.query<BlockedWord>(
    `SELECT * FROM blocked_words ORDER BY id`,
  );
  return rows;
}

export async function getBlockedWord(
  id: number,
): Promise<BlockedWord | null> {
  const { rows } = await pool.query<BlockedWord>(
    `SELECT * FROM blocked_words WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function addBlockedWord(
  word: string,
  createdBy: number,
): Promise<BlockedWord> {
  const { rows } = await pool.query<BlockedWord>(
    `INSERT INTO blocked_words (word, created_by) VALUES ($1, $2) RETURNING *`,
    [word, createdBy],
  );
  return rows[0];
}

export async function updateBlockedWord(
  id: number,
  word: string,
): Promise<BlockedWord | null> {
  const { rows } = await pool.query<BlockedWord>(
    `UPDATE blocked_words SET word = $2 WHERE id = $1 RETURNING *`,
    [id, word],
  );
  return rows[0] ?? null;
}

export async function deleteBlockedWord(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM blocked_words WHERE id = $1`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function countBlockedWords(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM blocked_words`,
  );
  return parseInt(rows[0].count, 10);
}

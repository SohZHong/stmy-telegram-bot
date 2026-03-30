import { pool } from "../db/database";

export type MemberStatus = "lurker" | "contributor" | "member";

export interface Member {
  id: number;
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  group_id: string;
  intro_completed: boolean;
  is_ns_longtimer: boolean;
  status: MemberStatus;
  discord_id: string | null;
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

export async function resetIntroStatus(telegramId: number): Promise<void> {
  await pool.query(
    `UPDATE members SET intro_completed = FALSE, intro_completed_at = NULL WHERE telegram_id = $1`,
    [telegramId],
  );
}

export async function getPendingMembers(
  limit: number,
  offset: number,
): Promise<Member[]> {
  const { rows } = await pool.query<Member>(
    `SELECT * FROM members WHERE intro_completed = FALSE ORDER BY joined_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

export async function countPendingMembers(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM members WHERE intro_completed = FALSE`,
  );
  return parseInt(rows[0].count, 10);
}

export async function searchMembers(query: string): Promise<Member[]> {
  const cleaned = query.replace(/^@/, "");
  // Escape ILIKE wildcards in user input
  const escaped = cleaned.replace(/[%_\\]/g, "\\$&");
  const { rows } = await pool.query<Member>(
    `SELECT * FROM members
     WHERE telegram_id::text = $1
        OR username ILIKE '%' || $2 || '%' ESCAPE '\\'
        OR first_name ILIKE '%' || $2 || '%' ESCAPE '\\'
     ORDER BY joined_at DESC
     LIMIT 10`,
    [cleaned, escaped],
  );
  return rows;
}

export async function deleteMember(telegramId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM members WHERE telegram_id = $1`,
    [telegramId],
  );
  return (rowCount ?? 0) > 0;
}

export interface MemberStats {
  total: number;
  pending: number;
  completed: number;
  completed_today: number;
  completed_this_week: number;
}

export async function getMemberStats(): Promise<MemberStats> {
  const { rows } = await pool.query<MemberStats>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE intro_completed = FALSE)::int AS pending,
      COUNT(*) FILTER (WHERE intro_completed = TRUE)::int AS completed,
      COUNT(*) FILTER (WHERE intro_completed_at >= CURRENT_DATE)::int AS completed_today,
      COUNT(*) FILTER (WHERE intro_completed_at >= date_trunc('week', CURRENT_DATE))::int AS completed_this_week
    FROM members
  `);
  return rows[0];
}

export async function getAllMembers(): Promise<Member[]> {
  const { rows } = await pool.query<Member>(`SELECT * FROM members`);
  return rows;
}

export async function flagNsLongtimer(telegramId: number): Promise<void> {
  await pool.query(
    `UPDATE members SET is_ns_longtimer = TRUE, status = 'contributor' WHERE telegram_id = $1`,
    [telegramId],
  );
}

export async function setDiscordId(telegramId: number, discordId: string): Promise<void> {
  await pool.query(
    `UPDATE members SET discord_id = $2 WHERE telegram_id = $1`,
    [telegramId, discordId],
  );
}

export async function setMemberStatus(telegramId: number, status: MemberStatus): Promise<void> {
  await pool.query(
    `UPDATE members SET status = $2 WHERE telegram_id = $1`,
    [telegramId, status],
  );
}

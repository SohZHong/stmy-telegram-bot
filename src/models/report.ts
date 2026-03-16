import { pool } from "../db/database";

export interface Report {
  id: number;
  reporter_telegram_id: string;
  reported_telegram_id: string;
  reason_id: number;
  details: string | null;
  status: string;
  created_at: Date;
}

export interface MostReportedUser {
  reported_telegram_id: string;
  count: number;
}

export async function createReport(reporterId: number, reportedId: number, reasonId: number, details?: string | null): Promise<Report> {
  const { rows } = await pool.query<Report>(
    `INSERT INTO reports (reporter_telegram_id, reported_telegram_id, reason_id, details) VALUES ($1, $2, $3, $4) RETURNING *`,
    [reporterId, reportedId, reasonId, details ?? null],
  );
  return rows[0];
}

export async function countPendingReportsAgainst(reportedId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM reports WHERE reported_telegram_id = $1 AND status = 'pending'`,
    [reportedId],
  );
  return parseInt(rows[0].count, 10);
}

export async function getReportsAgainst(reportedId: number, limit: number, offset: number): Promise<Report[]> {
  const { rows } = await pool.query<Report>(
    `SELECT * FROM reports WHERE reported_telegram_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [reportedId, limit, offset],
  );
  return rows;
}

export async function getReportById(id: number): Promise<Report | null> {
  const { rows } = await pool.query<Report>(`SELECT * FROM reports WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateReportStatus(id: number, status: string): Promise<Report | null> {
  const { rows } = await pool.query<Report>(
    `UPDATE reports SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
}

export async function bulkUpdateReportStatus(reportedId: number, status: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE reports SET status = $2 WHERE reported_telegram_id = $1 AND status = 'pending'`,
    [reportedId, status],
  );
  return rowCount ?? 0;
}

export async function hasRecentReport(reporterId: number, reportedId: number, withinHours: number): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM reports WHERE reporter_telegram_id = $1 AND reported_telegram_id = $2 AND created_at > NOW() - INTERVAL '1 hour' * $3`,
    [reporterId, reportedId, withinHours],
  );
  return parseInt(rows[0].count, 10) > 0;
}

export async function getMostReportedUsers(limit: number): Promise<MostReportedUser[]> {
  const { rows } = await pool.query<MostReportedUser>(
    `SELECT reported_telegram_id, COUNT(*)::int as count FROM reports WHERE status = 'pending' GROUP BY reported_telegram_id ORDER BY count DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function countAllPendingReports(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) as count FROM reports WHERE status = 'pending'`);
  return parseInt(rows[0].count, 10);
}

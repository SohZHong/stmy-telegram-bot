import { pool } from "../db/database";

export interface ReportReason {
  id: number;
  label: string;
  created_by: string | null;
  created_at: Date;
}

export async function getAllReportReasons(): Promise<ReportReason[]> {
  const { rows } = await pool.query<ReportReason>(
    `SELECT * FROM report_reasons ORDER BY id`,
  );
  return rows;
}

export async function getReportReason(
  id: number,
): Promise<ReportReason | null> {
  const { rows } = await pool.query<ReportReason>(
    `SELECT * FROM report_reasons WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function addReportReason(
  label: string,
  createdBy: number,
): Promise<ReportReason> {
  const { rows } = await pool.query<ReportReason>(
    `INSERT INTO report_reasons (label, created_by) VALUES ($1, $2) RETURNING *`,
    [label, createdBy],
  );
  return rows[0];
}

export async function updateReportReason(
  id: number,
  label: string,
): Promise<ReportReason | null> {
  const { rows } = await pool.query<ReportReason>(
    `UPDATE report_reasons SET label = $2 WHERE id = $1 RETURNING *`,
    [id, label],
  );
  return rows[0] ?? null;
}

export async function deleteReportReason(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM report_reasons WHERE id = $1`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function countReportReasons(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM report_reasons`,
  );
  return parseInt(rows[0].count, 10);
}

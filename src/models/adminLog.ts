import { pool } from "../db/database";

export type AdminLogAction =
  | "approve_member"
  | "ban_member"
  | "kick_member"
  | "add_welcome_message"
  | "edit_welcome_message"
  | "delete_welcome_message"
  | "edit_intro_guide"
  | "edit_admin_guide"
  | "reset_intro"
  | "add_blocked_word"
  | "edit_blocked_word"
  | "delete_blocked_word"
  | "send_announcement"
  | "submit_report"
  | "autoban_report"
  | "dismiss_report"
  | "add_report_reason"
  | "edit_report_reason"
  | "delete_report_reason"
  | "delete_member";

export interface AdminLog {
  id: number;
  action: AdminLogAction;
  admin_telegram_id: string;
  target_id: string | null;
  details: string | null;
  created_at: Date;
}

export async function createAdminLog(
  action: AdminLogAction,
  adminTelegramId: number,
  targetId?: number | null,
  details?: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_logs (action, admin_telegram_id, target_id, details)
     VALUES ($1, $2, $3, $4)`,
    [action, adminTelegramId, targetId ?? null, details ?? null],
  );
}

export async function getRecentLogs(
  limit: number,
  action?: AdminLogAction,
): Promise<AdminLog[]> {
  if (action) {
    const { rows } = await pool.query<AdminLog>(
      `SELECT * FROM admin_logs WHERE action = $1 ORDER BY created_at DESC LIMIT $2`,
      [action, limit],
    );
    return rows;
  }
  const { rows } = await pool.query<AdminLog>(
    `SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function getLogsByDateRange(
  start: Date,
  end: Date,
  action?: AdminLogAction,
): Promise<AdminLog[]> {
  if (action) {
    const { rows } = await pool.query<AdminLog>(
      `SELECT * FROM admin_logs
       WHERE action = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at DESC`,
      [action, start, end],
    );
    return rows;
  }
  const { rows } = await pool.query<AdminLog>(
    `SELECT * FROM admin_logs
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC`,
    [start, end],
  );
  return rows;
}

export async function getLogById(id: number): Promise<AdminLog | null> {
  const { rows } = await pool.query<AdminLog>(
    `SELECT * FROM admin_logs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getLogsPaginated(
  limit: number,
  offset: number,
  action?: AdminLogAction,
): Promise<AdminLog[]> {
  if (action) {
    const { rows } = await pool.query<AdminLog>(
      `SELECT * FROM admin_logs WHERE action = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [action, limit, offset],
    );
    return rows;
  }
  const { rows } = await pool.query<AdminLog>(
    `SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

export async function countLogs(action?: AdminLogAction): Promise<number> {
  if (action) {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM admin_logs WHERE action = $1`,
      [action],
    );
    return parseInt(rows[0].count, 10);
  }
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM admin_logs`,
  );
  return parseInt(rows[0].count, 10);
}

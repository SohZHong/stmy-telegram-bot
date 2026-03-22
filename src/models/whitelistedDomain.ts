import { pool } from "../db/database";

export interface WhitelistedDomain {
  id: number;
  domain: string;
  created_by: string | null;
  created_at: Date;
}

export async function getAllWhitelistedDomains(): Promise<WhitelistedDomain[]> {
  const { rows } = await pool.query<WhitelistedDomain>(
    `SELECT * FROM whitelisted_domains ORDER BY id`,
  );
  return rows;
}

export async function getWhitelistedDomain(id: number): Promise<WhitelistedDomain | null> {
  const { rows } = await pool.query<WhitelistedDomain>(
    `SELECT * FROM whitelisted_domains WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function addWhitelistedDomain(domain: string, createdBy: number): Promise<WhitelistedDomain> {
  const { rows } = await pool.query<WhitelistedDomain>(
    `INSERT INTO whitelisted_domains (domain, created_by) VALUES ($1, $2) RETURNING *`,
    [domain.toLowerCase(), createdBy],
  );
  return rows[0];
}

export async function deleteWhitelistedDomain(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM whitelisted_domains WHERE id = $1`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function countWhitelistedDomains(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM whitelisted_domains`,
  );
  return parseInt(rows[0].count, 10);
}

export async function isDomainWhitelisted(domain: string): Promise<boolean> {
  const lower = domain.toLowerCase();
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM whitelisted_domains WHERE $1 = domain OR $1 LIKE '%.' || domain`,
    [lower],
  );
  return parseInt(rows[0].count, 10) > 0;
}

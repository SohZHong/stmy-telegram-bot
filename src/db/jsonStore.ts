import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function load<T>(file: string): T[] {
  ensureDir();
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function save<T>(file: string, data: T[]): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export function nextId<T extends { id: number }>(data: T[]): number {
  if (data.length === 0) return 1;
  return Math.max(...data.map((d) => d.id)) + 1;
}

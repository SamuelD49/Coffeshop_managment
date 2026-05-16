import { resolve, join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { _legacySqliteDb } from "./db";

function backupDir(): string {
  const dir = resolve(process.cwd(), process.env.BACKUP_DIR ?? "./data/backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${HH}${MM}`;
}

export async function runBackup(): Promise<string> {
  const dir = backupDir();
  const filename = `shop-${timestamp()}.db`;
  const dest = join(dir, filename);
  // better-sqlite3's backup() is a Promise-returning method that uses SQLite's online backup API.
  await _legacySqliteDb().backup(dest);
  return dest;
}

export function pruneOldBackups(retainDays: number): string[] {
  const dir = backupDir();
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!/^shop-.*\.db$/.test(f)) continue;
    const full = join(dir, f);
    const st = statSync(full);
    if (st.mtimeMs < cutoff) {
      unlinkSync(full);
      removed.push(full);
    }
  }
  return removed;
}

export function listBackups(): Array<{ name: string; size: number; mtime: Date }> {
  const dir = backupDir();
  return readdirSync(dir)
    .filter(f => /^shop-.*\.db$/.test(f))
    .map(f => {
      const st = statSync(join(dir, f));
      return { name: f, size: st.size, mtime: st.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

export function backupDirPath(): string {
  return backupDir();
}

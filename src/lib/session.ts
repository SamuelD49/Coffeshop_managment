import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";

const SQLiteStore = connectSqlite3(session);

export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");

  // The SQLite session store opens its file on first session use. The data/
  // directory might not exist yet (e.g. after `rm -rf data`), so make sure
  // it's there before the store tries to write to it.
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  return session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: dataDir,
    }) as session.Store,
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  });
}

declare module "express-session" {
  interface SessionData {
    employeeId?: number;
    role?: "owner" | "employee";
    csrfToken?: string;
    flash?: { type: "success" | "error" | "info"; text: string }[];
  }
}

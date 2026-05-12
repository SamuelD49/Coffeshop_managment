import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import { resolve } from "path";

const SQLiteStore = connectSqlite3(session);

export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");

  return session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: resolve(process.cwd(), "data"),
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

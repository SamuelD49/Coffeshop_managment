import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { currentDriver } from "./kysely";

let _pgSessionPool: Pool | null = null;

export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");

  const driver = currentDriver();
  let store: session.Store;

  if (driver === "sqlite") {
    const SQLiteStore = connectSqlite3(session);
    const dataDir = resolve(process.cwd(), "data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    store = new SQLiteStore({ db: "sessions.db", dir: dataDir }) as session.Store;
  } else {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required when DB_DRIVER=supabase");
    const PgSessionStore = pgSession(session);
    if (!_pgSessionPool) {
      const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
      _pgSessionPool = new Pool({
        connectionString: url,
        max: isServerless ? 1 : 4,
        idleTimeoutMillis: isServerless ? 1_000 : 10_000,
      });
    }
    store = new PgSessionStore({
      pool: _pgSessionPool,
      createTableIfMissing: true,
      tableName: "user_sessions",
    });
  }

  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // secure: "auto" works hand-in-hand with `app.set("trust proxy", 1)`
      // — express-session looks at req.secure (set from X-Forwarded-Proto)
      // and sets the cookie's Secure flag only on HTTPS. So local HTTP dev
      // and HTTPS production both work without code changes.
      secure: "auto",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  });
}

declare module "express-session" {
  interface SessionData {
    shopId?: number;
    employeeId?: number;
    role?: "owner" | "employee";
    csrfToken?: string;
    isSuperAdmin?: boolean;
    flash?: { type: "success" | "error" | "info"; text: string }[];
  }
}

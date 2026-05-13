import "dotenv/config";
import cron from "node-cron";
import { app } from "./app";
import { runMigrations } from "./lib/db";
import { runBackup, pruneOldBackups } from "./lib/backup";

const port = Number(process.env.PORT ?? 3000);

runMigrations();

// Nightly DB backup at 02:30 local time, retain 30 days
if (process.env.NODE_ENV !== "test") {
  cron.schedule("30 2 * * *", async () => {
    try {
      const path = await runBackup();
      const removed = pruneOldBackups(30);
      console.log(`Backup written: ${path}; pruned ${removed.length} old file(s)`);
    } catch (err) {
      console.error("Backup failed:", err);
    }
  });
}

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

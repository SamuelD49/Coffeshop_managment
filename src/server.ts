import "dotenv/config";
import cron from "node-cron";
import os from "os";
import { app } from "./app";
import { runMigrations } from "./lib/db";
import { runBackup, pruneOldBackups } from "./lib/backup";

const port = Number(process.env.PORT ?? 3000);

// Lists every non-loopback IPv4 address on this machine so the startup log
// tells the operator exactly which URLs the app is reachable at — including
// the local-LAN address and the Tailscale 100.x address when present.
function listenAddresses(): string[] {
  const out: string[] = ["http://localhost:" + port];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] ?? []) {
      if (a.family === "IPv4" && !a.internal) {
        out.push("http://" + a.address + ":" + port);
      }
    }
  }
  return out;
}

(async () => {
  await runMigrations();

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
    console.log("Listening on:");
    for (const url of listenAddresses()) console.log("  " + url);
  });
})().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});

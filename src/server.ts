import "dotenv/config";
import { app } from "./app";
import { runMigrations } from "./lib/db";

const port = Number(process.env.PORT ?? 3000);

runMigrations();

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

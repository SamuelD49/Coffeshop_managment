import serverless from "serverless-http";
import { app } from "../../src/app";
import { runMigrations } from "../../src/lib/db";

let _initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!_initPromise) {
    _initPromise = runMigrations().catch((err) => {
      // If migrations fail, surface the error and let the next request retry.
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}

// We add a middleware at the beginning to ensure initialization
app.use(async (req, res, next) => {
  try {
    await ensureInit();
    next();
  } catch (err) {
    next(err);
  }
});

const handlerFunction = serverless(app);
module.exports = { handler: handlerFunction };
module.exports.handler = handlerFunction;

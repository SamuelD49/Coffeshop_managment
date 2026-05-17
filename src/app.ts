import express from "express";
import ejs from "ejs";
import { resolve } from "path";
import { sessionMiddleware } from "./lib/session";
import { csrfMiddleware } from "./lib/csrf";
import { flashMiddleware } from "./lib/flash";
import { localsMiddleware } from "./middleware/locals";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { router } from "./routes";

export const app = express();

// Vercel (and most modern hosts) terminate TLS at the edge and forward
// to the function over HTTP. Without trust proxy, Express thinks every
// request is insecure and express-session refuses to send a `secure`
// cookie — sessions silently fail to persist across redirects. trust
// proxy=1 tells Express to read X-Forwarded-Proto from the first hop.
app.set("trust proxy", 1);

// Register EJS explicitly. Express otherwise calls `require("ejs")` at the
// first render — a dynamic require that Vercel's bundler can't see, so the
// module gets stripped from the function package. The static `import ejs`
// above + the app.engine call below force the bundler to include it.
app.engine("ejs", ejs.renderFile);
app.set("view engine", "ejs");
// Views are read from src/views/ regardless of whether we're running through
// `tsx` (dev) or `node dist/server.js` (prod). tsc doesn't copy *.ejs to dist/,
// so resolving against __dirname would point at the wrong place in production.
// process.cwd() is the project root in both modes when started normally.
app.set("views", resolve(process.cwd(), "src/views"));

// CSS/JS rebuild on every deploy, so 1 hour is safe; the browser
// re-validates after that. Fonts/images are immutable so cache them hard.
app.use("/css", express.static(resolve(process.cwd(), "public/css"), { maxAge: "1h" }));
app.use("/js", express.static(resolve(process.cwd(), "public/js"), { maxAge: "1h" }));
app.use("/fonts", express.static(resolve(process.cwd(), "public/fonts"), { maxAge: "1y", immutable: true }));
app.use("/img", express.static(resolve(process.cwd(), "public/img"), { maxAge: "1y", immutable: true }));

// Signature data URLs from the canvas pad can run ~50-100 KB after base64
// encoding; the default 100 KB limit is right on the edge. Raise to 500 KB.
app.use(express.urlencoded({ extended: true, limit: "500kb" }));
app.use(express.json({ limit: "500kb" }));

// Dynamic pages must NOT be cached at Vercel's edge — every request is
// per-session and per-shop. Without this header, a 404 from an early
// deploy (or a response for shop A) could be served to shop B.
// Static handlers ran above and set their own Cache-Control already, so
// this only affects the application routes that follow.
app.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  next();
});

app.use(sessionMiddleware());
app.use(localsMiddleware);
app.use(flashMiddleware);
app.use(csrfMiddleware);

app.use(router);

app.use(notFoundHandler);
app.use(errorHandler);

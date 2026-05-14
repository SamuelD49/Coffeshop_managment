import express from "express";
import { resolve } from "path";
import { sessionMiddleware } from "./lib/session";
import { csrfMiddleware } from "./lib/csrf";
import { flashMiddleware } from "./lib/flash";
import { localsMiddleware } from "./middleware/locals";
import { requireSetup } from "./middleware/requireSetup";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { router } from "./routes";

export const app = express();

app.set("view engine", "ejs");
app.set("views", resolve(__dirname, "views"));

app.use("/css", express.static(resolve(process.cwd(), "public/css")));
app.use("/js", express.static(resolve(process.cwd(), "public/js")));
app.use("/fonts", express.static(resolve(process.cwd(), "public/fonts"), { maxAge: "1y", immutable: true }));
app.use("/img", express.static(resolve(process.cwd(), "public/img")));

// Signature data URLs from the canvas pad can run ~50-100 KB after base64
// encoding; the default 100 KB limit is right on the edge. Raise to 500 KB.
app.use(express.urlencoded({ extended: true, limit: "500kb" }));
app.use(express.json({ limit: "500kb" }));

app.use(sessionMiddleware());
app.use(localsMiddleware);
app.use(flashMiddleware);
app.use(csrfMiddleware);
app.use(requireSetup);

app.use(router);

app.use(notFoundHandler);
app.use(errorHandler);

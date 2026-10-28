import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";
import { security } from "./config/security.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { createMemoryStore } from "./repositories/memoryStore.js";
import { createAuthService } from "./services/authService.js";
import { createAccessService } from "./services/accessService.js";
import { ApiError } from "./utils/ApiError.js";
export function createApp({
  store = createMemoryStore(),
  clock = () => new Date(),
  settings = {},
} = {}) {
  settings = { ...env, ...security, ...settings };
  const app = express();
  const auth = createAuthService({ store, clock, settings });
  const origins = settings.production
    ? [settings.clientOrigin]
    : [settings.clientOrigin, "http://localhost:5173", "http://127.0.0.1:5173"];
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.get("X-Requested-With") !== "Gather" ||
        (req.get("Origin") && !origins.includes(req.get("Origin")))
      )
        return next(new ApiError(403, "Request origin could not be verified."));
    }
    next();
  });
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: settings.authLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many sign-in attempts. Try again in 15 minutes." },
  });
  app.get("/api/health", (req, res) =>
    res.json({
      status: "ok",
      storage: store.kind || "memory",
      databaseConnected: store.kind === "mongo",
    }),
  );
  app.post("/api/auth/register", limiter, async (req, res) =>
    res.status(201).json({ data: await auth.register(req.body, res) }),
  );
  app.post("/api/auth/login", limiter, async (req, res) =>
    res.json({ data: await auth.login(req.body, res) }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await auth.logout(req, res);
    res.status(204).end();
  });
  // Public booking settings. The client fetches this immediately after sign-in,
  // so it must stay reachable before the session check below.
  app.get("/api/config", (req, res) =>
    res.json({
      data: {
        defaultDurationMinutes: settings.defaultDurationMinutes,
        maxDurationMinutes: settings.maxDurationMinutes,
        maxAdvanceDays: settings.maxAdvanceDays,
        reservationStatuses: ["confirmed", "cancelled", "completed"],
      },
    }),
  );
  app.use("/api", async (req, res, next) => {
    req.auth = await auth.authenticate(req);
    next();
  });
  app.get("/api/auth/me", (req, res) => res.json({ data: req.auth.user }));
  app.put("/api/auth/profile", async (req, res) =>
    res.json({ data: await auth.profile(req, req.body, res) }),
  );
  const access = (tx, user) =>
    createAccessService({ store: tx, clock, settings, auth, user });
  const mutation = (req, work) =>
    store.transaction(async (tx) => {
      const session = await tx.get("sessions", req.auth.sessionId);
      const user = await tx.get("users", req.auth.user.id);
      if (!session || !user || new Date(session.expiresAt) <= clock())
        throw new ApiError(401, "Please sign in to continue.");
      return work(access(tx, user));
    });
  app.get("/api/availability", async (req, res) =>
    res.json(await access(store, req.auth.user).availability(req.query)),
  );
  for (const name of ["restaurants", "tables", "reservations", "users"]) {
    app.get(`/api/${name}`, async (req, res) =>
      res.json(await access(store, req.auth.user).list(name, req.query)),
    );
    app.get(`/api/${name}/:id`, async (req, res) =>
      res.json({
        data: await access(store, req.auth.user).get(name, req.params.id),
      }),
    );
    app.post(`/api/${name}`, async (req, res) => {
      const data = await mutation(req, (service) =>
        service.create(name, req.body),
      );
      res.location(`/api/${name}/${data.id}`).status(201).json({ data });
    });
    const update = async (req, res) =>
      res.json({
        data: await mutation(req, (service) =>
          service.update(name, req.params.id, req.body),
        ),
      });
    app.put(`/api/${name}/:id`, update);
    app.patch(`/api/${name}/:id`, update);
    app.delete(`/api/${name}/:id`, async (req, res) => {
      await mutation(req, (service) => service.remove(name, req.params.id));
      res.status(204).end();
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
export default createApp();

import { randomBytes } from "node:crypto";
import { env } from "./env.js";
const production = env.nodeEnv === "production";
const secret = process.env.JWT_SECRET;
if (production && (!secret || secret.length < 32))
  throw new Error("Set a JWT_SECRET of at least 32 characters in production.");
const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
};

export const security = {
  jwtSecret: secret || randomBytes(48).toString("hex"),
  sessionSeconds: positiveInteger("SESSION_SECONDS", 8 * 60 * 60),
  production,
  cookieName: production ? "__Host-gather_session" : "gather_session",
  authLimit: positiveInteger("AUTH_RATE_LIMIT", 30),
};
export const storageDriver = process.env.STORAGE_DRIVER || "memory";
if (!["memory", "mongo"].includes(storageDriver))
  throw new Error("STORAGE_DRIVER must be memory or mongo.");
if (production && storageDriver !== "mongo")
  throw new Error("Production requires MongoDB storage.");

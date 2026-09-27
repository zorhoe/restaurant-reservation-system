import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve .env relative to this file, regardless of the terminal directory.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
};

export const env = {
  port,
  mongoUri: process.env.MONGO_URI?.trim(),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  defaultDurationMinutes: positiveInteger('DEFAULT_DURATION_MINUTES', 90),
  maxDurationMinutes: positiveInteger('MAX_DURATION_MINUTES', 240),
  maxAdvanceDays: positiveInteger('MAX_ADVANCE_DAYS', 90),
};

if (env.defaultDurationMinutes > env.maxDurationMinutes) {
  throw new Error('DEFAULT_DURATION_MINUTES cannot exceed MAX_DURATION_MINUTES.');
}

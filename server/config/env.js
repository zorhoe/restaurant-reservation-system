import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve .env relative to this file, regardless of the terminal directory.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!process.env.MONGO_URI?.trim()) {
  throw new Error('MONGO_URI is required. Configure server/.env using server/.env.example.');
}

export const env = {
  port,
  mongoUri: process.env.MONGO_URI.trim(),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};

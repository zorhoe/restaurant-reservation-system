import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import { env } from './config/env.js';

try {
  // Only accept requests once the database is available.
  await connectDB();
  const server = app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });

  server.on('error', async (error) => {
    console.error(`HTTP server failed (${error.code || error.name}).`);
    await mongoose.disconnect();
    process.exitCode = 1;
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(timeout);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  // Avoid printing connection strings or credentials from driver errors.
  console.error(`Backend startup failed (${error.name}). Check MONGO_URI and MongoDB availability.`);
  await mongoose.disconnect();
  process.exitCode = 1;
}

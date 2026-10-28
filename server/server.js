import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import connectDB from './config/db.js';

try {
  if (env.mongoUri) {
    await connectDB();
  } else {
    console.log('MONGODB_URI is not set; starting without a MongoDB connection.');
  }

  const server = app.listen(env.port, env.host, () => {
    console.log(`Server running on http://${env.host}:${env.port}`);
    console.log('Reservation storage: memory. Data resets on restart.');
  });

  server.on('error', (error) => {
    console.error(`HTTP server failed (${error.code || error.name}).`);
    process.exitCode = 1;
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      try {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      } catch (error) {
        console.error(`MongoDB shutdown failed (${error.name}).`);
      }
      clearTimeout(timeout);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Backend startup failed (${error.name}).`);
  process.exitCode = 1;
}

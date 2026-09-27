import app from './app.js';
import { env } from './config/env.js';

try {
  // Database connections are disabled during this development stage.
  const server = app.listen(env.port, env.host, () => {
    console.log(`Server running on http://${env.host}:${env.port}`);
    console.log('Development storage: memory. Data resets on restart.');
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
    server.close(() => {
      clearTimeout(timeout);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Backend startup failed (${error.name}).`);
  process.exitCode = 1;
}

import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { createMemoryStore } from './repositories/memoryStore.js';
import { createReservationService } from './services/reservationService.js';
import { createApiRouter } from './routes/api.js';

export function createApp({ store = createMemoryStore(), clock = () => new Date(), settings = env } = {}) {
  const app = express();
  const service = createReservationService({ store, clock, settings });
  app.disable('x-powered-by');
  app.use(cors({ origin: settings.clientOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter(service, settings));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();

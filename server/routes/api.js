import { Router } from 'express';
import { resourceController } from '../controllers/resourceController.js';

export function createApiRouter(service, settings) {
  const router = Router();
  router.get('/health', (req, res) => res.json({ status: 'ok', storage: 'memory', databaseConnected: false }));
  router.get('/config', (req, res) => res.json({ data: {
    defaultDurationMinutes: settings.defaultDurationMinutes,
    maxDurationMinutes: settings.maxDurationMinutes,
    maxAdvanceDays: settings.maxAdvanceDays,
    reservationStatuses: ['confirmed', 'cancelled', 'completed'],
  } }));
  router.get('/availability', (req, res) => res.json(service.availability(req.query)));
  for (const name of ['restaurants', 'tables', 'reservations']) {
    const controller = resourceController(service, name);
    router.route(`/${name}`).get(controller.list).post(controller.create);
    router.route(`/${name}/:id`).get(controller.get).patch(controller.update);
    if (name !== 'reservations') router.delete(`/${name}/:id`, controller.remove);
  }
  return router;
}

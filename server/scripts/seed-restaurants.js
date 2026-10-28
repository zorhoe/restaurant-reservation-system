import fs from 'node:fs/promises';
import { env } from '../config/env.js';
import { createMongoStore } from '../repositories/mongoStore.js';
import { createReservationService } from '../services/reservationService.js';
let store;
try {
  const restaurants = JSON.parse(await fs.readFile(new URL('../data/restaurants.json', import.meta.url), 'utf8'));
  store = await createMongoStore(env.mongoUri);
  let created = 0, updated = 0;
  await store.transaction(async tx => {
    created = 0; updated = 0;
    const service = createReservationService({ store: tx, clock: () => new Date(), settings: env });
    for (const restaurant of restaurants) {
      const existing = (await tx.list('restaurants')).find(item => item.name.toLowerCase() === restaurant.name.toLowerCase());
      if (existing) {
        const { address, active, ...details } = restaurant;
        void address; void active;
        await service.update('restaurants', existing.id, details);
        updated++;
      } else { await service.create('restaurants', restaurant); created++; }
    }
  });
  const saved = await store.list('restaurants');
  const verified = restaurants.every(row => saved.some(item => item.name === row.name && item.cuisine === row.cuisine && JSON.stringify(item.openingHours) === JSON.stringify(row.openingHours)));
  if (!verified) throw new Error('Restaurant verification failed.');
  console.log('Atlas restaurant seed verified: ' + created + ' created, ' + updated + ' updated. All 15 schedules persisted.');
} catch (error) {
  console.error('Restaurant seed failed (' + error.name + '): ' + error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted]'));
  process.exitCode = 1;
} finally {
  if (store) await store.close();
  else { const mongoose = (await import('mongoose')).default; await mongoose.disconnect(); }
}

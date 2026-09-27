import { randomUUID } from 'node:crypto';

// Synchronous storage keeps check-and-write operations in one event-loop turn.
// A future database adapter must enforce booking conflicts atomically in storage.
export function createMemoryStore() {
  const collections = Object.fromEntries(['restaurants', 'tables', 'reservations'].map(name => [name, new Map()]));
  const copy = value => value === undefined ? undefined : structuredClone(value);
  return {
    list: name => [...collections[name].values()].map(copy),
    get: (name, id) => copy(collections[name].get(id)),
    create(name, values) {
      const record = { ...copy(values), id: randomUUID() };
      collections[name].set(record.id, record);
      return copy(record);
    },
    update(name, id, values) {
      const record = { ...collections[name].get(id), ...copy(values), id };
      collections[name].set(id, record);
      return copy(record);
    },
    remove: (name, id) => collections[name].delete(id),
  };
}

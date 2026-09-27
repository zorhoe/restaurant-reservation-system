import { randomUUID } from "node:crypto";
export const collections = [
  "restaurants",
  "tables",
  "reservations",
  "users",
  "sessions",
];
export function createMemoryStore() {
  let state = Object.fromEntries(collections.map((name) => [name, new Map()]));
  let queue = Promise.resolve();
  const adapter = (data) => ({
    list: (name) => [...data[name].values()].map((v) => structuredClone(v)),
    get: (name, id) => {
      const v = data[name].get(id);
      return v ? structuredClone(v) : undefined;
    },
    create(name, values) {
      const record = { ...structuredClone(values), id: randomUUID() };
      data[name].set(record.id, record);
      return structuredClone(record);
    },
    update(name, id, values) {
      if (!data[name].has(id)) throw new Error("Missing record");
      const record = { ...data[name].get(id), ...structuredClone(values), id };
      data[name].set(id, record);
      return structuredClone(record);
    },
    remove: (name, id) => data[name].delete(id),
  });
  return {
    kind: "memory",
    list: (...args) => adapter(state).list(...args),
    get: (...args) => adapter(state).get(...args),
    create: (...args) => adapter(state).create(...args),
    update: (...args) => adapter(state).update(...args),
    remove: (...args) => adapter(state).remove(...args),
    transaction(work) {
      const job = queue.then(async () => {
        const next = structuredClone(state);
        const result = await work(adapter(next));
        state = next;
        return result;
      });
      queue = job.catch(() => {});
      return job;
    },
    close: async () => {},
  };
}

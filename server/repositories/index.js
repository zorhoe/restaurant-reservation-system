import { createMemoryStore } from "./memoryStore.js";
import { createMongoStore } from "./mongoStore.js";
import { storageDriver } from "../config/security.js";
import { env } from "../config/env.js";
export const createStore = () =>
  storageDriver === "mongo"
    ? createMongoStore(env.mongoUri)
    : Promise.resolve(createMemoryStore());

import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { models, WriteLock } from "../models/index.js";
const plain = (doc) => {
  if (!doc) return undefined;
  const result = JSON.parse(JSON.stringify(doc));
  delete result._id;
  return result;
};
export async function createMongoStore(uri) {
  if (!uri) throw new Error("MONGO_URI is required for MongoDB storage.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    await mongoose.disconnect();
    throw new Error(
      "MongoDB must be a replica set (Atlas or a local replica set) to enforce atomic bookings.",
    );
  }
  for (const model of Object.values(models)) await model.init();
  await WriteLock.updateOne(
    { _id: "writes" },
    { $setOnInsert: { version: 0 } },
    { upsert: true },
  );
  const adapter = (session) => ({
    list: async (name) =>
      (await models[name].find().session(session).lean()).map(plain),
    get: async (name, id) =>
      plain(await models[name].findById(id).session(session).lean()),
    async create(name, values) {
      const id = randomUUID();
      const [record] = await models[name].create([{ ...values, id, _id: id }], {
        session,
      });
      return plain(record.toObject());
    },
    update: async (name, id, values) =>
      plain(
        await models[name]
          .findByIdAndUpdate(
            id,
            { $set: values },
            { new: true, runValidators: true, session },
          )
          .lean(),
      ),
    remove: (name, id) => models[name].deleteOne({ _id: id }, { session }),
  });
  return {
    ...adapter(null),
    kind: "mongo",
    // Shared write fence serializes transactional business checks across processes.
    // Appropriate for this small project; replace with per-resource locks at scale.
    transaction: (work) =>
      mongoose.connection.transaction(async (session) => {
        await WriteLock.updateOne(
          { _id: "writes" },
          { $inc: { version: 1 } },
          { session },
        );
        return work(adapter(session));
      }),
    close: () => mongoose.disconnect(),
  };
}

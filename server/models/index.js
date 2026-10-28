import mongoose from "mongoose";
const { Schema } = mongoose;
const base = {
  _id: { type: String },
  id: { type: String, required: true, unique: true },
};
const options = { versionKey: false, strict: "throw" };
const schemas = {
  users: new Schema(
    {
      ...base,
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      passwordHash: { type: String, required: true },
      role: { type: String, enum: ["admin", "user"], default: "user" },
      createdAt: String,
    },
    options,
  ),
  sessions: new Schema(
    {
      ...base,
      userId: { type: String, required: true, index: true },
      expiresAt: { type: Date, required: true, expires: 0 },
    },
    options,
  ),
  restaurants: new Schema(
    {
      ...base,
      name: String,
      address: String,
      active: Boolean,
      createdAt: String,
      updatedAt: String,
    },
    options,
  ),
  tables: new Schema(
    {
      ...base,
      restaurantId: { type: String, index: true },
      label: String,
      capacity: Number,
      active: Boolean,
      createdAt: String,
      updatedAt: String,
    },
    options,
  ),
  reservations: new Schema(
    {
      ...base,
      userId: { type: String, required: true, index: true },
      restaurantId: { type: String, index: true },
      tableId: { type: String, index: true },
      guestName: String,
      guestEmail: String,
      guestCount: Number,
      startAt: String,
      endAt: String,
      durationMinutes: Number,
      notes: String,
      status: { type: String, enum: ["confirmed", "cancelled", "completed"] },
      createdAt: String,
      updatedAt: String,
    },
    options,
  ),
};
export const models = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [
    name,
    mongoose.models[name] || mongoose.model(name, schema),
  ]),
);
export const WriteLock =
  mongoose.models.WriteLock ||
  mongoose.model(
    "WriteLock",
    new Schema(
      { _id: String, version: { type: Number, default: 0 } },
      { versionKey: false },
    ),
  );

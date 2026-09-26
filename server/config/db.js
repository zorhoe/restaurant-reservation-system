import mongoose from 'mongoose';
import { env } from './env.js';

export default async function connectDB() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('MongoDB connected.');
}

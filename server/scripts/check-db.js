import mongoose from 'mongoose';
import connectDB from '../config/db.js';

try {
  await connectDB();
  await mongoose.connection.db.admin().ping();
  console.log('MongoDB ping succeeded.');
} catch (error) {
  console.error(`MongoDB check failed (${error.name}). Check server/.env and ensure MongoDB is running and reachable.`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

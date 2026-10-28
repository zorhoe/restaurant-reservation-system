import mongoose from 'mongoose';
import connectDB from '../config/db.js';

// Transactions are what keep overlapping bookings from double-booking a table,
// so a reachable server is not enough: the topology must support them.
try {
  await connectDB();
  await mongoose.connection.db.admin().ping();
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    console.error('MongoDB is reachable but is a standalone server, so it cannot run transactions.');
    console.error('Restart it as a single-node replica set before using STORAGE_DRIVER=mongo:');
    console.error('  mongod --replSet rs0 --dbpath <path>');
    console.error('  mongosh --eval "rs.initiate()"');
    process.exitCode = 1;
  } else {
    console.log(`MongoDB ping succeeded (${hello.setName || 'sharded cluster'}). Transactions available.`);
  }
} catch (error) {
  console.error(`MongoDB check failed (${error.name}). Check server/.env and ensure MongoDB is running and reachable.`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

import { env } from './env.js';
import mongoose from 'mongoose';

/**
 * Connect to MongoDB database
 * @param {string} [uri] - Optional MongoDB URI (defaults to the configured MONGODB_URI)
 */
export async function connectDB(uri = env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  try {
    const conn = await mongoose.connect(uri, { tlsAllowInvalidCertificates: true });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[Database] Connection Error: ${error.message}`);
    throw error;
  }
}

/**
 * Disconnect from MongoDB database (useful for graceful shutdown & tests)
 */
export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('[Database] MongoDB Disconnected');
  } catch (error) {
    console.error(`[Database] Disconnect Error: ${error.message}`);
    throw error;
  }
}

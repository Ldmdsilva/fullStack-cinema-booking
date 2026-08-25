import mongoose from 'mongoose';

/**
 * Health check endpoint (§C7.1, §A11, NFR-7)
 * Used for container healthchecks and monitoring database connectivity
 */
export async function getHealth(req, res) {
  const isDbConnected = mongoose.connection.readyState === 1;

  const healthData = {
    status: isDbConnected ? 'healthy' : 'unhealthy',
    db: isDbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  if (!isDbConnected) {
    return res.status(503).json(healthData);
  }

  return res.status(200).json(healthData);
}

import { env } from './config/env.js';
import http from 'http';
import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocket } from './config/socket.js';
import { registerSeatSocketGateway } from './sockets/seatSocketGateway.js';
import { startHoldReaper, stopHoldReaper } from './jobs/holdReaper.js';
import { startPaymentReconciler, stopPaymentReconciler } from './jobs/paymentReconciler.js';

const PORT = env.PORT;

async function startServer() {
  // 1. Create HTTP server wrapping Express app
  const httpServer = http.createServer(app);

  // 2. Initialize Socket.IO server (ADR-003)
  const io = initSocket(httpServer);

  // 3. Register WebSocket seat gateway (§C7.2)
  registerSeatSocketGateway(io);

  // Graceful shutdown handling
  const handleShutdown = async (signal) => {
    console.log(`\n[Server] ${signal} signal received. Closing HTTP server and database connections...`);
    stopHoldReaper();
    stopPaymentReconciler();
    httpServer.close(async () => {
      await disconnectDB();
      console.log('[Server] Graceful shutdown completed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // 4. Start listening for HTTP & WebSocket connections *before* MongoDB
  // finishes connecting, so the port stays bound across `node --watch`
  // restarts (mongoose buffers queries until the connection opens, so
  // requests just wait rather than getting refused).
  httpServer.listen(PORT, () => {
    console.log(`[Server] Encore API running in ${env.NODE_ENV} mode on port ${PORT}`);
    console.log(`[Server] Healthcheck available at: http://localhost:${PORT}/api/health`);
  });

  try {
    // 5. Connect to MongoDB (ADR-007)
    await connectDB();

    // 6. Start the seat-hold reaper (ADR-009)
    startHoldReaper();

    // 7. Start the payment reconciliation job (FR-39, ADR-014)
    startPaymentReconciler();
  } catch (error) {
    console.error(`[Server] Startup Failed: ${error.message}`);
    process.exit(1);
  }
}

startServer();

import { env } from './env.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

/**
 * Initialize Socket.IO server
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Optional authentication middleware for socket connections (ADR-005)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
      } catch {
        // Unauthenticated sockets can still join rooms read-only (§C7.2)
        socket.user = null;
      }
    }
    next();
  });

  return io;
}

/**
 * Get active Socket.IO server instance
 * @returns {Server}
 */
export function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocket first.');
  }
  return io;
}

/**
 * Directly set the active Socket.IO server instance. Intended for tests that
 * need to inject a fake/mock IO object (e.g. `{ to: () => ({ emit: jest.fn() }) }`)
 * so `getIO()` returns it instead of throwing, letting assertions run against
 * the fake's `emit` calls without a real running server.
 * @param {import('socket.io').Server|object} ioInstance
 */
export function setIO(ioInstance) {
  io = ioInstance;
}

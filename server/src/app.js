import { env } from './config/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './config/logger.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cinemaRoutes from './routes/cinemaRoutes.js';
import filmRoutes from './routes/filmRoutes.js';
import showtimeRoutes from './routes/showtimeRoutes.js';
import holdRoutes from './routes/holdRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import devRoutes from './routes/devRoutes.js';
import { errorHandler, AppError } from './middleware/errorHandler.js';

const app = express();

// Security & Parsing Middleware
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(pinoHttp({ logger, customProps: (req) => ({ userId: req.user?.id }) }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REST API Route Mounts (§C7.1)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cinemas', cinemaRoutes);
app.use('/api/films', filmRoutes);
app.use('/api/showtimes', showtimeRoutes);
app.use('/api/holds', holdRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);

// Dev-only convenience routes (e.g. reading the last email sent to an
// address, for local dev / e2e tests without a real mailbox) — never
// mounted in production.
if (env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes);
}

// Catch-all for unhandled routes
app.use((req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
});

// Global Error Handler Middleware (§C7.1, §C7.3)
app.use(errorHandler);

export default app;

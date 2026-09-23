import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { db, initializeDatabase, seedDatabase } from './db.js';
import { sendSuccess, sendError } from './types/api.js';
import authRoutes from './routes/auth.routes.js';
import teamsRoutes from './routes/teams.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import tasksRoutes from './routes/tasks.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import attachmentsRoutes from './routes/attachments.routes.js';
import { initSockets } from './sockets.js';
import { registerSocketEventHandlers } from './events/handlers/socket.handler.js';
import { registerNotificationEventHandlers } from './events/handlers/notification.handler.js';

dotenv.config();

// Ensure DB schema and initial seed
initializeDatabase();
seedDatabase();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io and register event handlers
initSockets(server);
registerSocketEventHandlers();
registerNotificationEventHandlers();

const port = process.env.PORT || 5000;
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

/**
 * Health check endpoint - PRD Phase 0 Foundation verification
 */
app.get('/api/health', (req: Request, res: Response) => {
  try {
    // Verify database liveness
    const dbCheck = db.prepare('SELECT 1 as alive').get() as { alive: number };
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    const teamCount = (db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number }).count;
    const projectCount = (db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count;
    const taskCount = (db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;

    return sendSuccess(res, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbCheck.alive === 1 ? 'connected' : 'degraded',
        engine: 'SQLite (WAL mode)',
        counts: {
          users: userCount,
          teams: teamCount,
          projects: projectCount,
          tasks: taskCount
        }
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error: any) {
    return sendError(res, 'INTERNAL_ERROR', 'Health check failed: ' + error.message, 500);
  }
});
// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/attachments', attachmentsRoutes);

// 404 Handler for unmatched routes
app.use((req: Request, res: Response) => {
  sendError(res, 'NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`, 404);
});

// Centralized error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  sendError(res, 'INTERNAL_ERROR', err.message || 'Internal server error', 500);
});

// Only start the server listener if executed directly as main script and not in test mode
const isDirectRun = process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));
if (process.env.NODE_ENV !== 'test' && isDirectRun && !server.listening) {
  server.listen(port, () => {
    console.log(`[Upsow Backend] Running on http://localhost:${port}`);
    console.log(`[Upsow Backend] Health check: http://localhost:${port}/api/health`);
  });
}

export { app, server };

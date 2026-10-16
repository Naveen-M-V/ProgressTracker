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
 * Health check endpoint - PRD Foundation verification
 */
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // Verify database liveness
    const dbCheck = await db.queryOne<{ alive: number }>('SELECT 1 as alive');
    const userCount = Number((await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users'))?.count || 0);
    const teamCount = Number((await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM teams'))?.count || 0);
    const projectCount = Number((await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM projects'))?.count || 0);
    const taskCount = Number((await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM tasks'))?.count || 0);

    return sendSuccess(res, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbCheck?.alive === 1 ? 'connected' : 'degraded',
        engine: 'PostgreSQL (Neon)',
        schema: 'upsow',
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

async function startServer() {
  // Ensure DB schema and initial seed
  await initializeDatabase();
  await seedDatabase();

  const isDirectRun = process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));
  if (process.env.NODE_ENV !== 'test' && isDirectRun && !server.listening) {
    server.listen(port, () => {
      console.log(`[Upsow Backend] Running on http://localhost:${port}`);
      console.log(`[Upsow Backend] Health check: http://localhost:${port}/api/health`);
    });
  }
}

startServer().catch(err => {
  console.error('[Upsow Backend] Startup failed:', err);
});

export { app, server };

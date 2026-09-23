import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { AuthService } from './services/auth.service.js';
import { ProjectService } from './services/project.service.js';
import { User } from './types/auth.js';

let io: SocketIOServer | null = null;

// Extend Socket to store authenticated user
interface AuthenticatedSocket extends Socket {
  user?: User;
}

/**
 * Initialize Socket.io server with JWT authentication and project rooms
 */
export function initSockets(httpServer: HttpServer): SocketIOServer {
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  // JWT Authentication middleware for Socket.io
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const payload = AuthService.verifyToken(token);
      const user = AuthService.getProfile(payload.userId);
      socket.user = user;
      next();
    } catch (err: any) {
      return next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect();
      return;
    }

    // Join personal user room for direct notifications and events
    socket.join(`user:${user.id}`);

    // Automatically join rooms for all projects the user is authorized to access
    try {
      const accessibleProjects = ProjectService.getAllProjects(user);
      for (const project of accessibleProjects) {
        socket.join(`project:${project.id}`);
      }
    } catch (err) {
      console.error(`[Socket] Error joining project rooms for user ${user.id}:`, err);
    }

    // Allow client to explicitly subscribe to a project room
    socket.on('join:project', (projectId: number) => {
      try {
        if (ProjectService.canUserAccessProject(projectId, user)) {
          socket.join(`project:${projectId}`);
        }
      } catch (err) {
        // Silently ignore if unauthorized
      }
    });

    socket.on('leave:project', (projectId: number) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return io;
}

/**
 * Get Socket.io server instance
 */
export function getIo(): SocketIOServer | null {
  return io;
}

/**
 * Broadcast event to all clients in a project room
 */
export function broadcastToProject(projectId: number, event: string, data: any): void {
  if (io) {
    io.to(`project:${projectId}`).emit(event, data);
  }
}

/**
 * Broadcast event to a specific user's private room
 */
export function broadcastToUser(userId: number, event: string, data: any): void {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

/**
 * Broadcast event globally to all connected clients
 */
export function broadcastGlobal(event: string, data: any): void {
  if (io) {
    io.emit(event, data);
  }
}

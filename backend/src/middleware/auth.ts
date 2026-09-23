import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { sendError } from '../types/api.js';
import { User, UserRole } from '../types/auth.js';

// Extend Express Request interface to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware: Verify JWT Bearer token and attach active user to req.user
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    sendError(res, 'AUTH_REQUIRED', 'Authentication token is required', 401);
    return;
  }

  try {
    const payload = AuthService.verifyToken(token);
    const user = AuthService.getProfile(payload.userId);
    req.user = user;
    next();
  } catch (error: any) {
    if (error.message === 'AUTH_TOKEN_EXPIRED') {
      sendError(res, 'AUTH_REQUIRED', 'Authentication token has expired', 401);
      return;
    }
    sendError(res, 'AUTH_REQUIRED', 'Invalid authentication token', 401);
    return;
  }
}

/**
 * Middleware: Enforce Role-Based Access Control (RBAC)
 */
export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'AUTH_REQUIRED', 'Authentication required', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(
        res,
        'FORBIDDEN',
        `Access denied. Requires one of the following roles: [${roles.join(', ')}]`,
        403
      );
      return;
    }

    next();
  };
}

/**
 * Convenience RBAC Middlewares
 */
export const requireAdmin = requireRoles('ADMIN');
export const requireProjectManagerOrAdmin = requireRoles('ADMIN', 'PROJECT_MANAGER');

import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { authenticateToken, requireAdmin, requireProjectManagerOrAdmin } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../types/api.js';

const router = Router();

/**
 * POST /api/auth/signup - Register a new user
 */
router.post('/signup', (req: Request, res: Response) => {
  try {
    const { name, email, password, role, avatar_url } = req.body;
    const result = AuthService.signup({ name, email, password, role, avatar_url });
    return sendSuccess(res, result, 201);
  } catch (error: any) {
    const code = error.code || 'VALIDATION_ERROR';
    const statusCode = code === 'CONFLICT' ? 409 : 400;
    return sendError(res, code, error.message, statusCode);
  }
});

/**
 * POST /api/auth/login - Authenticate with email and password
 */
router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = AuthService.login({ email, password });
    return sendSuccess(res, result, 200);
  } catch (error: any) {
    const code = error.code || 'AUTH_REQUIRED';
    const statusCode = code === 'VALIDATION_ERROR' ? 400 : 401;
    return sendError(res, code, error.message, statusCode);
  }
});

/**
 * POST /api/auth/logout - Logout current session
 */
router.post('/logout', (req: Request, res: Response) => {
  return sendSuccess(res, { message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me - Retrieve current authenticated user profile
 */
router.get('/me', authenticateToken, (req: Request, res: Response) => {
  return sendSuccess(res, req.user);
});

/**
 * GET /api/auth/demo-accounts - Development helper listing generic demo accounts
 */
router.get('/demo-accounts', (req: Request, res: Response) => {
  const accounts = AuthService.getDemoAccounts();
  return sendSuccess(res, accounts);
});

/**
 * GET /api/auth/users - List all users (for task assignments & team selects)
 */
router.get('/users', authenticateToken, (req: Request, res: Response) => {
  const users = AuthService.getAllUsers();
  return sendSuccess(res, users);
});

/**
 * RBAC Verification Endpoints (Used for testing and role capability checks)
 */
router.get('/test/admin', authenticateToken, requireAdmin, (req: Request, res: Response) => {
  return sendSuccess(res, { access: 'admin_granted', role: req.user?.role });
});

router.get('/test/pm', authenticateToken, requireProjectManagerOrAdmin, (req: Request, res: Response) => {
  return sendSuccess(res, { access: 'pm_granted', role: req.user?.role });
});

router.get('/test/member', authenticateToken, (req: Request, res: Response) => {
  return sendSuccess(res, { access: 'member_granted', role: req.user?.role });
});

export default router;

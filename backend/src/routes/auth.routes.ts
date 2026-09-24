import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { authenticateToken, requireAdmin, requireProjectManagerOrAdmin } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../types/api.js';

const router = Router();

/**
 * POST /api/auth/signup - Register a new user
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, avatar_url } = req.body;
    const result = await AuthService.signup({ name, email, password, role, avatar_url });
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
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login({ email, password });
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
router.get('/users', authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await AuthService.getAllUsers();
    return sendSuccess(res, users);
  } catch (error: any) {
    return sendError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

/**
 * POST /api/auth/users - Admin creates a new user or project manager
 */
router.post('/users', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, avatar_url } = req.body;
    const user = await AuthService.adminCreateUser({ name, email, password, role, avatar_url });
    return sendSuccess(res, user, 201);
  } catch (error: any) {
    const code = error.code || 'VALIDATION_ERROR';
    const statusCode = code === 'CONFLICT' ? 409 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, error.message, statusCode);
  }
});

/**
 * PATCH /api/auth/users/:id/role - Admin promotes or demotes a user role
 */
router.patch('/users/:id/role', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(String(req.params.id), 10);
    const { role } = req.body;
    if (!role) {
      return sendError(res, 'VALIDATION_ERROR', 'Role is required in request body', 400);
    }
    const updatedUser = await AuthService.updateUserRole(userId, role, req.user!.id);
    return sendSuccess(res, updatedUser);
  } catch (error: any) {
    const code = error.code || 'VALIDATION_ERROR';
    const statusCode = code === 'USER_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, error.message, statusCode);
  }
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

import { Router, Request, Response } from 'express';
import { ProjectService } from '../services/project.service.js';
import { authenticateToken, requireAdmin, requireProjectManagerOrAdmin } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../types/api.js';

const router = Router();

// All project routes require authentication
router.use(authenticateToken);

/**
 * GET /api/projects - List projects accessible to current user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const projects = await ProjectService.getAllProjects(req.user!);
    return sendSuccess(res, projects);
  } catch (err: any) {
    return sendError(res, err.code || 'INTERNAL_ERROR', err.message, 500);
  }
});

/**
 * GET /api/projects/:id - Get project details by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    const project = await ProjectService.getProjectById(projectId, req.user!);
    return sendSuccess(res, project);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/projects - Create a new project (Admin or Project Manager)
 */
router.post('/', requireProjectManagerOrAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, team_id, manager_id, status, member_ids } = req.body;
    const project = await ProjectService.createProject(
      { name, description, team_id, manager_id, status, member_ids },
      req.user!
    );
    return sendSuccess(res, project, 201);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'CONFLICT' ? 409 : code === 'FORBIDDEN' ? 403 : code === 'USER_NOT_FOUND' || code === 'TEAM_NOT_FOUND' ? 404 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PUT /api/projects/:id - Update project (Admin or assigned Manager)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    const { name, description, team_id, manager_id, status } = req.body;
    const updated = await ProjectService.updateProject(
      projectId,
      { name, description, team_id, manager_id, status },
      req.user!
    );
    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PATCH /api/projects/:id - Partial update project
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    const { name, description, team_id, manager_id, status } = req.body;
    const updated = await ProjectService.updateProject(
      projectId,
      { name, description, team_id, manager_id, status },
      req.user!
    );
    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * DELETE /api/projects/:id - Delete project (Admin only)
 */
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    await ProjectService.deleteProject(projectId, req.user!);
    return sendSuccess(res, { message: 'Project deleted successfully' });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * GET /api/projects/:id/members - Get members of project
 */
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    const members = await ProjectService.getProjectMembers(projectId, req.user!);
    return sendSuccess(res, members);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/projects/:id/members - Add member to project
 */
router.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    const { user_id, role_in_project } = req.body;
    if (!user_id) {
      return sendError(res, 'VALIDATION_ERROR', 'user_id is required', 400);
    }
    const member = await ProjectService.addMember(
      projectId,
      parseInt(user_id, 10),
      role_in_project || 'MEMBER',
      req.user!
    );
    return sendSuccess(res, member, 201);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'USER_NOT_FOUND' || code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * DELETE /api/projects/:id/members/:userId - Remove member from project
 */
router.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    const userId = parseInt(String(req.params.userId), 10);
    await ProjectService.removeMember(projectId, userId, req.user!);
    return sendSuccess(res, { message: 'Member removed from project successfully' });
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'NOT_FOUND' || code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * GET /api/projects/:id/progress - Get real-time project progress calculation
 */
router.get('/:id/progress', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.id), 10);
    await ProjectService.getProjectById(projectId, req.user!); // verify access
    const progress = await ProjectService.calculateProgress(projectId);
    return sendSuccess(res, progress);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'PROJECT_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

export default router;

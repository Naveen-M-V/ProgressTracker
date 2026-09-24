import { Router, Request, Response } from 'express';
import { TeamService } from '../services/team.service.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../types/api.js';

const router = Router();

// All team routes require authentication
router.use(authenticateToken);

/**
 * GET /api/teams - List all teams
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const teams = await TeamService.getAllTeams(req.user!);
    return sendSuccess(res, teams);
  } catch (err: any) {
    return sendError(res, err.code || 'INTERNAL_ERROR', err.message, 500);
  }
});

/**
 * GET /api/teams/:id - Get team details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(String(req.params.id), 10);
    const team = await TeamService.getTeamById(teamId, req.user!);
    return sendSuccess(res, team);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'TEAM_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/teams - Create a new team (Admin only)
 */
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, lead_id, member_ids } = req.body;
    const team = await TeamService.createTeam({ name, description, lead_id, member_ids }, req.user!);
    return sendSuccess(res, team, 201);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'CONFLICT' ? 409 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PUT /api/teams/:id - Update team details (Admin or Lead)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(String(req.params.id), 10);
    const { name, description, lead_id } = req.body;
    const updated = await TeamService.updateTeam(teamId, { name, description, lead_id }, req.user!);
    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'TEAM_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * DELETE /api/teams/:id - Delete a team (Admin only)
 */
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(String(req.params.id), 10);
    await TeamService.deleteTeam(teamId, req.user!);
    return sendSuccess(res, { message: 'Team deleted successfully' });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'TEAM_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * GET /api/teams/:id/members - Get team members
 */
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(String(req.params.id), 10);
    const members = await TeamService.getTeamMembers(teamId, req.user!);
    return sendSuccess(res, members);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'TEAM_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/teams/:id/members - Add member to team
 */
router.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(String(req.params.id), 10);
    const { user_id } = req.body;
    if (!user_id) {
      return sendError(res, 'VALIDATION_ERROR', 'user_id is required', 400);
    }
    const member = await TeamService.addMember(teamId, parseInt(user_id, 10), req.user!);
    return sendSuccess(res, member, 201);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'USER_NOT_FOUND' || code === 'TEAM_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * DELETE /api/teams/:id/members/:userId - Remove member from team
 */
router.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(String(req.params.id), 10);
    const userId = parseInt(String(req.params.userId), 10);
    await TeamService.removeMember(teamId, userId, req.user!);
    return sendSuccess(res, { message: 'Member removed from team successfully' });
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'NOT_FOUND' || code === 'TEAM_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

export default router;

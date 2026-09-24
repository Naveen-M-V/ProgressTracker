import { Router, Request, Response } from 'express';
import { TaskService } from '../services/task.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../types/api.js';
import { TaskStatus, TaskPriority, ItemType } from '../types/task.js';

const router = Router();

// All task routes require authentication
router.use(authenticateToken);

/**
 * GET /api/tasks - Query filtered tasks
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      project_id: req.query.project_id ? parseInt(String(req.query.project_id), 10) : undefined,
      team_id: req.query.team_id ? parseInt(String(req.query.team_id), 10) : undefined,
      assignee_id: req.query.assignee_id ? parseInt(String(req.query.assignee_id), 10) : undefined,
      status: req.query.status as TaskStatus,
      priority: req.query.priority as TaskPriority,
      due_date: req.query.due_date as string,
      from_date: req.query.from_date as string,
      to_date: req.query.to_date as string,
      search: req.query.search as string,
      item_type: req.query.item_type as ItemType
    };

    const tasks = await TaskService.getTasks(filters, req.user!);
    return sendSuccess(res, tasks);
  } catch (err: any) {
    return sendError(res, err.code || 'INTERNAL_ERROR', err.message, 500);
  }
});

/**
 * GET /api/tasks/:id - Get detailed task
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const task = await TaskService.getTaskById(taskId, req.user!);
    return sendSuccess(res, task);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'TASK_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/tasks - Create a new task or event
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      project_id,
      team_id,
      assignee_id,
      priority,
      status,
      start_date,
      due_date,
      position_order,
      item_type,
      subtasks
    } = req.body;

    if (!project_id) {
      return sendError(res, 'VALIDATION_ERROR', 'project_id is required', 400);
    }

    const task = await TaskService.createTask(
      {
        title,
        description,
        project_id: parseInt(String(project_id), 10),
        team_id: team_id ? parseInt(String(team_id), 10) : null,
        assignee_id: assignee_id ? parseInt(String(assignee_id), 10) : null,
        priority,
        status,
        start_date,
        due_date,
        position_order: position_order !== undefined ? parseFloat(String(position_order)) : undefined,
        item_type: item_type === 'EVENT' ? 'EVENT' : 'TASK',
        subtasks
      },
      req.user!
    );

    return sendSuccess(res, task, 201);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'FORBIDDEN' ? 403 : code === 'TASK_NOT_FOUND' || code === 'USER_NOT_FOUND' || code === 'TEAM_NOT_FOUND' ? 404 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PUT /api/tasks/:id - Update task or event properties
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const { title, description, team_id, assignee_id, priority, status, start_date, due_date, position_order, item_type } = req.body;

    const updated = await TaskService.updateTask(
      taskId,
      {
        title,
        description,
        team_id: team_id !== undefined ? (team_id ? parseInt(String(team_id), 10) : null) : undefined,
        assignee_id: assignee_id !== undefined ? (assignee_id ? parseInt(String(assignee_id), 10) : null) : undefined,
        priority,
        status,
        start_date,
        due_date,
        position_order: position_order !== undefined ? parseFloat(String(position_order)) : undefined,
        item_type
      },
      req.user!
    );

    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'TASK_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PATCH /api/tasks/:id/status - Authoritative Status Transition
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const { status, position_order } = req.body;

    if (!status) {
      return sendError(res, 'VALIDATION_ERROR', 'status is required', 400);
    }

    const updated = await TaskService.updateStatus(
      taskId,
      status as TaskStatus,
      position_order !== undefined ? parseFloat(String(position_order)) : undefined,
      req.user!
    );

    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'TASK_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PATCH /api/tasks/:id/assign - Reassign task
 */
router.patch('/:id/assign', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const { assignee_id } = req.body;

    const updated = await TaskService.assignTask(
      taskId,
      assignee_id !== undefined && assignee_id !== null ? parseInt(String(assignee_id), 10) : null,
      req.user!
    );

    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'TASK_NOT_FOUND' || code === 'USER_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * DELETE /api/tasks/:id - Delete task
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    await TaskService.deleteTask(taskId, req.user!);
    return sendSuccess(res, { message: 'Task deleted successfully' });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'TASK_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/tasks/:id/subtasks - Add a subtask
 */
router.post('/:id/subtasks', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const { title } = req.body;
    const subtask = await TaskService.addSubtask(taskId, title, req.user!);
    return sendSuccess(res, subtask, 201);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'TASK_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PUT /api/tasks/subtasks/:subtaskId - Update subtask
 */
router.put('/subtasks/:subtaskId', async (req: Request, res: Response) => {
  try {
    const subtaskId = parseInt(String(req.params.subtaskId), 10);
    const { title, is_completed } = req.body;
    const updated = await TaskService.updateSubtask(subtaskId, { title, is_completed }, req.user!);
    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * DELETE /api/tasks/subtasks/:subtaskId - Delete subtask
 */
router.delete('/subtasks/:subtaskId', async (req: Request, res: Response) => {
  try {
    const subtaskId = parseInt(String(req.params.subtaskId), 10);
    await TaskService.deleteSubtask(subtaskId, req.user!);
    return sendSuccess(res, { message: 'Subtask deleted successfully' });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/tasks/:id/comments - Add a comment
 */
router.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const { content } = req.body;
    const comment = await TaskService.addComment(taskId, content, req.user!);
    return sendSuccess(res, comment, 201);
  } catch (err: any) {
    const code = err.code || 'VALIDATION_ERROR';
    const status = code === 'TASK_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * GET /api/tasks/:id/activity - Get task activity logs
 */
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const activity = await TaskService.getTaskActivity(taskId, req.user!);
    return sendSuccess(res, activity);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'TASK_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

export default router;

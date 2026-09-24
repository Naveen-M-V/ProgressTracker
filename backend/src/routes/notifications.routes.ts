import { Router, Request, Response } from 'express';
import { NotificationService } from '../services/notification.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../types/api.js';

const router = Router();

// All notification routes require authentication
router.use(authenticateToken);

/**
 * GET /api/notifications - Get notifications for authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const notifications = await NotificationService.getUserNotifications(req.user!.id, {
      unreadOnly,
      limit,
      offset
    });

    return sendSuccess(res, notifications);
  } catch (err: any) {
    return sendError(res, err.code || 'INTERNAL_ERROR', err.message, 500);
  }
});

/**
 * GET /api/notifications/unread-count - Get count of unread notifications
 */
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await NotificationService.getUnreadCount(req.user!.id);
    return sendSuccess(res, { count });
  } catch (err: any) {
    return sendError(res, err.code || 'INTERNAL_ERROR', err.message, 500);
  }
});

/**
 * PATCH /api/notifications/:id/read - Mark a specific notification as read
 */
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const updated = await NotificationService.markAsRead(id, req.user!.id);
    return sendSuccess(res, updated);
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * PATCH /api/notifications/read-all - Mark all notifications as read for current user
 */
router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    const result = await NotificationService.markAllAsRead(req.user!.id);
    return sendSuccess(res, result);
  } catch (err: any) {
    return sendError(res, err.code || 'INTERNAL_ERROR', err.message, 500);
  }
});

/**
 * DELETE /api/notifications/:id - Delete a notification
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await NotificationService.deleteNotification(id, req.user!.id);
    return sendSuccess(res, { message: 'Notification deleted successfully' });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400;
    return sendError(res, code, err.message, status);
  }
});

/**
 * POST /api/notifications/reminders/run - Trigger the automated deadline reminder scan
 */
router.post('/reminders/run', async (req: Request, res: Response) => {
  try {
    const result = await NotificationService.checkAndCreateDeadlineReminders();
    return sendSuccess(res, result);
  } catch (err: any) {
    return sendError(res, err.code || 'INTERNAL_ERROR', err.message, 500);
  }
});

export default router;

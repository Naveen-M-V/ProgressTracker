import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { AttachmentService } from '../services/attachment.service.js';
import { sendSuccess, sendError } from '../types/api.js';
import { AttachmentEntityType } from '../types/attachment.js';

const router = Router();

/**
 * POST /api/attachments/upload
 * Upload a file attachment stored as BYTEA in PostgreSQL
 */
router.post(
  '/upload',
  authenticateToken,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        return sendError(res, 'UPLOAD_ERROR', err.message || 'File upload failed', 400);
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return sendError(res, 'FILE_MISSING', 'No file was uploaded', 400);
      }

      const entityType = req.body.entity_type as AttachmentEntityType;
      const entityId = Number(req.body.entity_id);

      if (!entityType || !['TASK', 'COMMENT', 'CHAT'].includes(entityType)) {
        return sendError(res, 'INVALID_ENTITY_TYPE', 'Valid entity_type (TASK, COMMENT, CHAT) is required', 400);
      }

      if (!entityId || isNaN(entityId)) {
        return sendError(res, 'INVALID_ENTITY_ID', 'Valid entity_id is required', 400);
      }

      const attachment = await AttachmentService.uploadAttachment(
        entityType,
        entityId,
        req.file,
        req.user!.id
      );

      return sendSuccess(res, attachment, 201);
    } catch (err: any) {
      return sendError(res, 'UPLOAD_FAILED', err.message || 'Failed to upload attachment', 400);
    }
  }
);

/**
 * GET /api/attachments/:id
 * Authenticated streaming endpoint for inline viewing or downloading
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const attachmentId = Number(req.params.id);
    if (isNaN(attachmentId)) {
      return sendError(res, 'INVALID_ID', 'Invalid attachment ID', 400);
    }

    const attachment = await AttachmentService.getAttachmentById(attachmentId);
    if (!attachment) {
      return sendError(res, 'ATTACHMENT_NOT_FOUND', 'Attachment not found', 404);
    }

    // Verify entity authorization
    const hasAccess = await AttachmentService.canUserAccessAttachment(
      attachmentId,
      req.user!
    );

    if (!hasAccess) {
      return sendError(res, 'FORBIDDEN', 'You do not have access to view this attachment', 403);
    }

    const isDownload = req.query.download === 'true';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const safeFilename = encodeURIComponent(attachment.file_name);

    const dataBuffer = Buffer.isBuffer(attachment.data) ? attachment.data : Buffer.from(attachment.data);

    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', dataBuffer.length);
    res.setHeader('Content-Disposition', `${dispositionType}; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    return res.end(dataBuffer);
  } catch (err: any) {
    return sendError(res, 'STREAM_FAILED', err.message || 'Failed to stream attachment', 500);
  }
});

/**
 * GET /api/attachments/entity/:type/:id
 * Retrieve attachment metadata list for a task or comment
 */
router.get('/entity/:type/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const rawType = Array.isArray(req.params.type) ? req.params.type[0] : req.params.type;
    const entityType = String(rawType || '').toUpperCase() as AttachmentEntityType;
    const entityId = Number(req.params.id);

    if (!['TASK', 'COMMENT', 'CHAT'].includes(entityType) || isNaN(entityId)) {
      return sendError(res, 'INVALID_PARAMS', 'Invalid entity type or ID', 400);
    }

    const attachments = await AttachmentService.getAttachmentsForEntity(entityType, entityId);
    return sendSuccess(res, attachments);
  } catch (err: any) {
    return sendError(res, 'FETCH_FAILED', err.message || 'Failed to fetch attachments', 500);
  }
});

/**
 * DELETE /api/attachments/:id
 * Delete an attachment with audit trail
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const attachmentId = Number(req.params.id);
    if (isNaN(attachmentId)) {
      return sendError(res, 'INVALID_ID', 'Invalid attachment ID', 400);
    }

    await AttachmentService.deleteAttachment(
      attachmentId,
      req.user!.id,
      req.user!.role
    );

    return sendSuccess(res, { message: 'Attachment deleted successfully' });
  } catch (err: any) {
    const status = err.message.includes('Unauthorized') ? 403 : 400;
    const code = status === 403 ? 'FORBIDDEN' : 'DELETE_FAILED';
    return sendError(res, code, err.message || 'Failed to delete attachment', status);
  }
});

export default router;

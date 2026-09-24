import { db } from '../db.js';
import { AttachmentDTO, AttachmentDetail, AttachmentEntityType } from '../types/attachment.js';
import { User, UserRole } from '../types/auth.js';
import { eventDispatcher } from '../events/dispatcher.js';
import { DomainEventType } from '../events/types.js';
import { ProjectService } from './project.service.js';
import { TaskService } from './task.service.js';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class AttachmentService {
  /**
   * Upload an attachment directly into PostgreSQL as BYTEA
   */
  static async uploadAttachment(
    entityType: AttachmentEntityType,
    entityId: number,
    file: Express.Multer.File,
    uploadedBy: number
  ): Promise<AttachmentDTO> {
    if (!file || !file.buffer) {
      throw new Error('No file buffer provided for attachment');
    }

    // Verify entity existence & metadata
    let projectId: number | null = null;
    if (entityType === 'TASK') {
      const task = await db.queryOne<{ id: number; project_id: number; title: string }>(
        'SELECT id, project_id, title FROM tasks WHERE id = ?',
        [entityId]
      );
      if (!task) {
        throw new Error(`Target task #${entityId} not found`);
      }
      projectId = task.project_id;
    } else if (entityType === 'COMMENT') {
      const comment = await db.queryOne<{ id: number; task_id: number }>(
        'SELECT id, task_id FROM task_comments WHERE id = ?',
        [entityId]
      );
      if (!comment) {
        throw new Error(`Target comment #${entityId} not found`);
      }
      const task = await db.queryOne<{ project_id: number }>(
        'SELECT project_id FROM tasks WHERE id = ?',
        [comment.task_id]
      );
      projectId = task ? task.project_id : null;
    }

    const uploader = await db.queryOne<{ id: number; name: string; avatar_url: string | null }>(
      'SELECT id, name, avatar_url FROM users WHERE id = ?',
      [uploadedBy]
    );
    const uploaderName = uploader?.name || 'Unknown User';
    const actualFileSize = file.buffer ? file.buffer.length : file.size;

    const attachmentId = await db.withTransaction(async (tx) => {
      // 1. Insert BYTEA directly into PostgreSQL attachments table
      const res = await tx.queryOne(`
        INSERT INTO attachments (entity_type, entity_id, file_name, mime_type, file_size, data, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        entityType,
        entityId,
        file.originalname,
        file.mimetype,
        actualFileSize,
        file.buffer,
        uploadedBy
      ]);

      const newAttachmentId = Number(res.id);

      // 2. Log activity audit trail for task attachments
      if (entityType === 'TASK' && projectId) {
        const readableSize = formatFileSize(actualFileSize);
        await tx.execute(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          entityId,
          projectId,
          uploadedBy,
          'ATTACHMENT_ADDED',
          null,
          file.originalname,
          `${uploaderName} attached "${file.originalname}" (${readableSize})`
        ]);
      }

      return newAttachmentId;
    });

    const createdAttachment = await this.getAttachmentMetadataById(attachmentId);
    if (!createdAttachment) {
      throw new Error('Failed to retrieve newly created attachment');
    }

    // 3. Dispatch typed domain event
    await eventDispatcher.dispatch(
      DomainEventType.ATTACHMENT_ADDED,
      uploadedBy,
      {
        attachment: createdAttachment,
        entityType,
        entityId,
        projectId
      }
    );

    return createdAttachment;
  }

  /**
   * Retrieve full attachment including binary BYTEA buffer (for authenticated streaming)
   */
  static async getAttachmentById(id: number): Promise<AttachmentDetail | null> {
    const row = await db.queryOne(`
      SELECT 
        a.id,
        a.entity_type,
        a.entity_id,
        a.file_name,
        a.mime_type,
        a.file_size,
        a.data,
        a.uploaded_by,
        a.created_at,
        u.name as uploader_name,
        u.avatar_url as uploader_avatar
      FROM attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.id = ?
    `, [id]);

    return (row as (AttachmentDetail & { data: Buffer })) || null;
  }

  /**
   * Retrieve lightweight attachment metadata without loading heavy data into memory
   */
  static async getAttachmentMetadataById(id: number): Promise<AttachmentDTO | null> {
    const row = await db.queryOne(`
      SELECT 
        a.id,
        a.entity_type,
        a.entity_id,
        a.file_name,
        a.mime_type,
        a.file_size,
        a.uploaded_by,
        a.created_at,
        u.name as uploader_name,
        u.avatar_url as uploader_avatar
      FROM attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.id = ?
    `, [id]);

    return (row as AttachmentDTO) || null;
  }

  /**
   * Retrieve all attachments for a specific entity (Task or Comment)
   */
  static async getAttachmentsForEntity(entityType: AttachmentEntityType, entityId: number): Promise<AttachmentDTO[]> {
    const rows = await db.query(`
      SELECT 
        a.id,
        a.entity_type,
        a.entity_id,
        a.file_name,
        a.mime_type,
        a.file_size,
        a.uploaded_by,
        a.created_at,
        u.name as uploader_name,
        u.avatar_url as uploader_avatar
      FROM attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.entity_type = ? AND a.entity_id = ?
      ORDER BY a.created_at DESC
    `, [entityType, entityId]);

    return rows as AttachmentDTO[];
  }

  /**
   * Delete an attachment with audit logging
   */
  static async deleteAttachment(
    attachmentId: number,
    userId: number,
    userRole: UserRole
  ): Promise<boolean> {
    const attachment = await this.getAttachmentMetadataById(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Permission check: Admin, PM, or the user who uploaded the file
    const canDelete =
      userRole === 'ADMIN' ||
      userRole === 'PROJECT_MANAGER' ||
      attachment.uploaded_by === userId;

    if (!canDelete) {
      throw new Error('Unauthorized to delete this attachment');
    }

    let projectId: number | null = null;
    if (attachment.entity_type === 'TASK') {
      const task = await db.queryOne<{ project_id: number }>(
        'SELECT project_id FROM tasks WHERE id = ?',
        [attachment.entity_id]
      );
      projectId = task ? task.project_id : null;
    }

    const actor = await db.queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]);
    const actorName = actor?.name || 'User';

    await db.withTransaction(async (tx) => {
      // 1. Delete record from attachments table
      await tx.execute('DELETE FROM attachments WHERE id = ?', [attachmentId]);

      // 2. Audit log entry for task attachment deletion
      if (attachment.entity_type === 'TASK' && projectId) {
        await tx.execute(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          attachment.entity_id,
          projectId,
          userId,
          'ATTACHMENT_DELETED',
          attachment.file_name,
          null,
          `${actorName} deleted attachment "${attachment.file_name}"`
        ]);
      }
    });

    // 3. Dispatch domain event
    await eventDispatcher.dispatch(
      DomainEventType.ATTACHMENT_DELETED,
      userId,
      {
        attachmentId,
        entityType: attachment.entity_type,
        entityId: attachment.entity_id,
        projectId
      }
    );

    return true;
  }

  /**
   * Verify if a user is authorized to view/stream an attachment based on entity permissions
   */
  static async canUserAccessAttachment(attachmentId: number, user: User): Promise<boolean> {
    if (user.role === 'ADMIN') return true;

    const attachment = await this.getAttachmentMetadataById(attachmentId);
    if (!attachment) return false;

    if (attachment.entity_type === 'TASK') {
      const task = await db.queryOne('SELECT * FROM tasks WHERE id = ?', [attachment.entity_id]);
      if (!task) return false;
      return TaskService.canUserAccessTask(task, user);
    }

    if (attachment.entity_type === 'COMMENT') {
      const comment = await db.queryOne<{ task_id: number }>(
        'SELECT task_id FROM task_comments WHERE id = ?',
        [attachment.entity_id]
      );
      if (!comment) return false;
      const task = await db.queryOne('SELECT * FROM tasks WHERE id = ?', [comment.task_id]);
      if (!task) return false;
      return TaskService.canUserAccessTask(task, user);
    }

    return true;
  }
}

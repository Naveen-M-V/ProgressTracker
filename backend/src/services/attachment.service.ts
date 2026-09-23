import { db } from '../db.js';
import { AttachmentDTO, AttachmentDetail, AttachmentEntityType } from '../types/attachment.js';
import { User, UserRole } from '../types/auth.js';
import { eventDispatcher } from '../events/dispatcher.js';
import { DomainEventType } from '../events/types.js';
import { ProjectService } from './project.service.js';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class AttachmentService {
  /**
   * Upload an attachment directly into SQLite as BLOB
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
      const task = db.prepare('SELECT id, project_id, title FROM tasks WHERE id = ?').get(entityId) as { id: number; project_id: number; title: string } | undefined;
      if (!task) {
        throw new Error(`Target task #${entityId} not found`);
      }
      projectId = task.project_id;
    } else if (entityType === 'COMMENT') {
      const comment = db.prepare('SELECT id, task_id FROM task_comments WHERE id = ?').get(entityId) as { id: number; task_id: number } | undefined;
      if (!comment) {
        throw new Error(`Target comment #${entityId} not found`);
      }
      const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(comment.task_id) as { project_id: number } | undefined;
      projectId = task ? task.project_id : null;
    }

    const uploader = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').get(uploadedBy) as { id: number; name: string; avatar_url: string | null } | undefined;
    const uploaderName = uploader?.name || 'Unknown User';
    const actualFileSize = file.buffer ? file.buffer.length : file.size;

    const insertTx = db.transaction(() => {
      // 1. Insert BLOB directly into SQLite attachments table
      const insertStmt = db.prepare(`
        INSERT INTO attachments (entity_type, entity_id, file_name, mime_type, file_size, data, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const result = insertStmt.run(
        entityType,
        entityId,
        file.originalname,
        file.mimetype,
        actualFileSize,
        file.buffer,
        uploadedBy
      );

      const attachmentId = Number(result.lastInsertRowid);

      // 2. Log activity audit trail for task attachments
      if (entityType === 'TASK' && projectId) {
        const readableSize = formatFileSize(actualFileSize);
        db.prepare(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          entityId,
          projectId,
          uploadedBy,
          'ATTACHMENT_ADDED',
          null,
          file.originalname,
          `${uploaderName} attached "${file.originalname}" (${readableSize})`
        );
      }

      return attachmentId;
    });

    const attachmentId = insertTx();

    const createdAttachment = this.getAttachmentMetadataById(attachmentId);
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
   * Retrieve full attachment including binary BLOB buffer (for authenticated streaming)
   */
  static getAttachmentById(id: number): AttachmentDetail | null {
    const row = db.prepare(`
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
    `).get(id) as (AttachmentDetail & { data: Buffer }) | undefined;

    return row || null;
  }

  /**
   * Retrieve lightweight attachment metadata without loading heavy BLOB data into memory
   */
  static getAttachmentMetadataById(id: number): AttachmentDTO | null {
    const row = db.prepare(`
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
    `).get(id) as AttachmentDTO | undefined;

    return row || null;
  }

  /**
   * Retrieve all attachments for a specific entity (Task or Comment)
   */
  static getAttachmentsForEntity(entityType: AttachmentEntityType, entityId: number): AttachmentDTO[] {
    const rows = db.prepare(`
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
    `).all(entityType, entityId) as AttachmentDTO[];

    return rows;
  }

  /**
   * Delete an attachment with audit logging
   */
  static async deleteAttachment(
    attachmentId: number,
    userId: number,
    userRole: UserRole
  ): Promise<boolean> {
    const attachment = this.getAttachmentMetadataById(attachmentId);
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
      const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(attachment.entity_id) as { project_id: number } | undefined;
      projectId = task ? task.project_id : null;
    }

    const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string } | undefined;
    const actorName = actor?.name || 'User';

    const deleteTx = db.transaction(() => {
      // 1. Delete record from attachments table
      db.prepare('DELETE FROM attachments WHERE id = ?').run(attachmentId);

      // 2. Audit log entry for task attachment deletion
      if (attachment.entity_type === 'TASK' && projectId) {
        db.prepare(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          attachment.entity_id,
          projectId,
          userId,
          'ATTACHMENT_DELETED',
          attachment.file_name,
          null,
          `${actorName} deleted attachment "${attachment.file_name}"`
        );
      }
    });

    deleteTx();

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
  static canUserAccessAttachment(attachmentId: number, user: User): boolean {
    if (user.role === 'ADMIN') return true;

    const attachment = this.getAttachmentMetadataById(attachmentId);
    if (!attachment) return false;

    if (attachment.entity_type === 'TASK') {
      const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(attachment.entity_id) as { project_id: number } | undefined;
      if (!task) return false;
      return ProjectService.canUserAccessProject(task.project_id, user);
    }

    if (attachment.entity_type === 'COMMENT') {
      const comment = db.prepare('SELECT task_id FROM task_comments WHERE id = ?').get(attachment.entity_id) as { task_id: number } | undefined;
      if (!comment) return false;
      const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(comment.task_id) as { project_id: number } | undefined;
      if (!task) return false;
      return ProjectService.canUserAccessProject(task.project_id, user);
    }

    return true;
  }
}

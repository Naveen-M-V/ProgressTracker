export type AttachmentEntityType = 'TASK' | 'COMMENT' | 'CHAT';

export interface AttachmentDTO {
  id: number;
  entity_type: AttachmentEntityType;
  entity_id: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: number;
  uploader_name?: string;
  uploader_avatar?: string | null;
  created_at: string;
}

export interface AttachmentDetail extends AttachmentDTO {
  data: Buffer;
}

export interface UploadAttachmentPayload {
  entity_type: AttachmentEntityType;
  entity_id: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  data: Buffer;
  uploaded_by: number;
}

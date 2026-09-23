import { Response } from 'express';

export type DomainErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'TEAM_NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'ATTACHMENT_TOO_LARGE'
  | 'ATTACHMENT_TYPE_NOT_ALLOWED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: Record<string, any>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: DomainErrorCode | string;
    message: string;
    details?: any;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: Record<string, any>): Response {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {})
  };
  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  code: DomainErrorCode | string,
  message: string,
  statusCode = 400,
  details?: any
): Response {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    }
  };
  return res.status(statusCode).json(payload);
}

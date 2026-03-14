import { Request } from 'express';

export type PipelineStatus =
  | 'saved'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'technical'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'hired';

export type EmailDirection = 'inbound' | 'outbound';

export type AutomationRunStatus = 'queued' | 'running' | 'success' | 'failed' | 'skipped';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

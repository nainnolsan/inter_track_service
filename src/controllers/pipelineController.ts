import { Response } from 'express';
import { query, withTransaction } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { HttpError } from '../utils/httpError';

export const addPipelineEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id: applicationId } = req.params;
  const { toStatus, notes, metadata, eventDate } = req.body;

  const result = await withTransaction(async (client) => {
    const appResult = await client.query<{ status: string }>(
      `SELECT status FROM applications WHERE id = $1 AND user_id = $2 AND archived = FALSE`,
      [applicationId, userId]
    );

    if (appResult.rows.length === 0) {
      throw new HttpError('Application not found', 404);
    }

    const fromStatus = appResult.rows[0].status;

    await client.query(
      `UPDATE applications SET status = $3 WHERE id = $1 AND user_id = $2`,
      [applicationId, userId, toStatus]
    );

    const insertResult = await client.query(
      `INSERT INTO pipeline_events (
        user_id, application_id, from_status, to_status, notes, metadata, event_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        userId,
        applicationId,
        fromStatus,
        toStatus,
        notes || null,
        metadata || {},
        eventDate || new Date().toISOString()
      ]
    );

    return insertResult.rows[0];
  });

  res.status(201).json({
    success: true,
    data: result
  });
};

export const listPipelineEvents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id: applicationId } = req.params;

  const appResult = await query(
    `SELECT id FROM applications WHERE id = $1 AND user_id = $2`,
    [applicationId, userId]
  );

  if (appResult.rows.length === 0) {
    throw new HttpError('Application not found', 404);
  }

  const result = await query(
    `SELECT *
     FROM pipeline_events
     WHERE application_id = $1 AND user_id = $2
     ORDER BY event_date DESC`,
    [applicationId, userId]
  );

  res.json({
    success: true,
    data: result.rows
  });
};

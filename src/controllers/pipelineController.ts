import { Response } from 'express';
import { query, withTransaction } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { HttpError } from '../utils/httpError';

const syncApplicationStatusFromLatestEvent = async (
  applicationId: string,
  userId: string,
): Promise<void> => {
  const latestEvent = await query<{ to_status: string }>(
    `SELECT to_status
     FROM pipeline_events
     WHERE application_id = $1 AND user_id = $2
     ORDER BY event_date DESC, created_at DESC
     LIMIT 1`,
    [applicationId, userId],
  );

  const fallbackStatus = 'applied';
  const nextStatus = latestEvent.rows[0]?.to_status ?? fallbackStatus;

  await query(
    `UPDATE applications
     SET status = $3
     WHERE id = $1 AND user_id = $2`,
    [applicationId, userId, nextStatus],
  );
};

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

export const updatePipelineEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id: applicationId, eventId } = req.params;
  const { toStatus, notes, eventDate } = req.body;

  const result = await withTransaction(async (client) => {
    const appResult = await client.query(
      `SELECT id FROM applications WHERE id = $1 AND user_id = $2 AND archived = FALSE`,
      [applicationId, userId],
    );

    if (appResult.rows.length === 0) {
      throw new HttpError('Application not found', 404);
    }

    const existingEvent = await client.query(
      `SELECT id
       FROM pipeline_events
       WHERE id = $1 AND application_id = $2 AND user_id = $3`,
      [eventId, applicationId, userId],
    );

    if (existingEvent.rows.length === 0) {
      throw new HttpError('Pipeline event not found', 404);
    }

    const updated = await client.query(
      `UPDATE pipeline_events
       SET
         to_status = COALESCE($4, to_status),
         notes = COALESCE($5, notes),
         event_date = COALESCE($6, event_date)
       WHERE id = $1 AND application_id = $2 AND user_id = $3
       RETURNING *`,
      [
        eventId,
        applicationId,
        userId,
        toStatus ?? null,
        notes ?? null,
        eventDate ?? null,
      ],
    );

    const latest = await client.query<{ to_status: string }>(
      `SELECT to_status
       FROM pipeline_events
       WHERE application_id = $1 AND user_id = $2
       ORDER BY event_date DESC, created_at DESC
       LIMIT 1`,
      [applicationId, userId],
    );

    await client.query(
      `UPDATE applications
       SET status = $3
       WHERE id = $1 AND user_id = $2`,
      [applicationId, userId, latest.rows[0]?.to_status ?? 'applied'],
    );

    return updated.rows[0];
  });

  res.json({
    success: true,
    data: result,
  });
};

export const deletePipelineEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id: applicationId, eventId } = req.params;

  const result = await query(
    `DELETE FROM pipeline_events
     WHERE id = $1 AND application_id = $2 AND user_id = $3
     RETURNING id`,
    [eventId, applicationId, userId],
  );

  if (result.rows.length === 0) {
    throw new HttpError('Pipeline event not found', 404);
  }

  await syncApplicationStatusFromLatestEvent(applicationId, userId);

  res.status(204).send();
};

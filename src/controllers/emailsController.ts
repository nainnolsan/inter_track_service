import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { HttpError } from '../utils/httpError';

export const addEmail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id: applicationId } = req.params;
  const { contactId, direction, subject, bodyPreview, providerMessageId, receivedAt, metadata } = req.body;

  const appResult = await query(
    `SELECT id FROM applications WHERE id = $1 AND user_id = $2`,
    [applicationId, userId]
  );

  if (appResult.rows.length === 0) {
    throw new HttpError('Application not found', 404);
  }

  const result = await query(
    `INSERT INTO emails (
      user_id, application_id, contact_id, direction, subject, body_preview, provider_message_id, received_at, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      userId,
      applicationId,
      contactId || null,
      direction,
      subject,
      bodyPreview || null,
      providerMessageId || null,
      receivedAt || new Date().toISOString(),
      metadata || {}
    ]
  );

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
};

export const listEmails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id: applicationId } = req.params;

  const result = await query(
    `SELECT e.*, c.full_name AS contact_name
     FROM emails e
     LEFT JOIN contacts c ON c.id = e.contact_id
     WHERE e.application_id = $1 AND e.user_id = $2
     ORDER BY e.received_at DESC`,
    [applicationId, userId]
  );

  res.json({
    success: true,
    data: result.rows
  });
};

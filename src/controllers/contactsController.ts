import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

export const createContact = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { applicationId, companyId, fullName, email, phone, role, linkedinUrl, notes } = req.body;

  const result = await query(
    `INSERT INTO contacts (
      user_id, application_id, company_id, full_name, email, phone, role, linkedin_url, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      userId,
      applicationId || null,
      companyId || null,
      fullName,
      email || null,
      phone || null,
      role || null,
      linkedinUrl || null,
      notes || null
    ]
  );

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
};

export const listContacts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { applicationId, companyId } = req.query;

  const values: unknown[] = [userId];
  const conditions: string[] = ['user_id = $1'];

  if (applicationId) {
    values.push(applicationId);
    conditions.push(`application_id = $${values.length}`);
  }

  if (companyId) {
    values.push(companyId);
    conditions.push(`company_id = $${values.length}`);
  }

  const result = await query(
    `SELECT *
     FROM contacts
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC`,
    values
  );

  res.json({
    success: true,
    data: result.rows
  });
};

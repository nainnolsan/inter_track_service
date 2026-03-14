import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

export const createCompany = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { name, website, industry, location, notes } = req.body;

  const result = await query(
    `INSERT INTO companies (user_id, name, website, industry, location, notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, name)
     DO UPDATE SET
       website = COALESCE(EXCLUDED.website, companies.website),
       industry = COALESCE(EXCLUDED.industry, companies.industry),
       location = COALESCE(EXCLUDED.location, companies.location),
       notes = COALESCE(EXCLUDED.notes, companies.notes),
       updated_at = NOW()
     RETURNING *`,
    [userId, name, website || null, industry || null, location || null, notes || null]
  );

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
};

export const listCompanies = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;

  const result = await query(
    `SELECT *
     FROM companies
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  res.json({
    success: true,
    data: result.rows
  });
};

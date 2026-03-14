import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { HttpError } from '../utils/httpError';

const toPagination = (req: Request) => {
  const page = Math.max(parseInt(String(req.query.page || '1'), 10), 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10), 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const createApplication = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { companyId, companyName, roleTitle, status, source, location, salaryRange, appliedAt, notes } = req.body;
  const userId = req.userId as string;

  let resolvedCompanyId: string | null = companyId ?? null;

  if (!resolvedCompanyId && companyName) {
    const companyResult = await query<{ id: string }>(
      `INSERT INTO companies (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, name)
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [userId, companyName]
    );
    resolvedCompanyId = companyResult.rows[0].id;
  }

  const result = await query<{ id: string; status: string } & Record<string, unknown>>(
    `INSERT INTO applications (
      user_id, company_id, role_title, status, source, location, salary_range, applied_at, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      userId,
      resolvedCompanyId,
      roleTitle,
      status || 'applied',
      source || null,
      location || null,
      salaryRange || null,
      appliedAt || null,
      notes || null
    ]
  );

  await query(
    `INSERT INTO pipeline_events (user_id, application_id, from_status, to_status, notes)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, result.rows[0].id, null, result.rows[0].status, 'Initial status']
  );

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
};

export const listApplications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { status, companyId, search } = req.query;
  const { page, limit, offset } = toPagination(req);

  const conditions = ['a.user_id = $1', 'a.archived = FALSE'];
  const values: unknown[] = [userId];

  if (status) {
    values.push(status);
    conditions.push(`a.status = $${values.length}`);
  }

  if (companyId) {
    values.push(companyId);
    conditions.push(`a.company_id = $${values.length}`);
  }

  if (search) {
    values.push(`%${String(search)}%`);
    conditions.push(`(a.role_title ILIKE $${values.length} OR c.name ILIKE $${values.length})`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM applications a
     LEFT JOIN companies c ON c.id = a.company_id
     WHERE ${whereClause}`,
    values
  );

  values.push(limit, offset);

  const dataResult = await query(
    `SELECT a.*, c.name AS company_name
     FROM applications a
     LEFT JOIN companies c ON c.id = a.company_id
     WHERE ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  res.json({
    success: true,
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total: Number(countResult.rows[0].total)
    }
  });
};

export const getApplicationById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id } = req.params;

  const result = await query(
    `SELECT a.*, c.name AS company_name
     FROM applications a
     LEFT JOIN companies c ON c.id = a.company_id
     WHERE a.id = $1 AND a.user_id = $2 AND a.archived = FALSE`,
    [id, userId]
  );

  if (result.rows.length === 0) {
    throw new HttpError('Application not found', 404);
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
};

export const updateApplication = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id } = req.params;
  const { companyId, roleTitle, status, source, location, salaryRange, appliedAt, notes, archived } = req.body;

  const existingResult = await query<{ status: string }>(
    `SELECT status
     FROM applications
     WHERE id = $1 AND user_id = $2 AND archived = FALSE`,
    [id, userId]
  );

  if (existingResult.rows.length === 0) {
    throw new HttpError('Application not found', 404);
  }

  const previousStatus = existingResult.rows[0].status;

  const result = await query(
    `UPDATE applications
     SET
       company_id = COALESCE($3, company_id),
       role_title = COALESCE($4, role_title),
       status = COALESCE($5, status),
       source = COALESCE($6, source),
       location = COALESCE($7, location),
       salary_range = COALESCE($8, salary_range),
       applied_at = COALESCE($9, applied_at),
       notes = COALESCE($10, notes),
       archived = COALESCE($11, archived)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      companyId ?? null,
      roleTitle ?? null,
      status ?? null,
      source ?? null,
      location ?? null,
      salaryRange ?? null,
      appliedAt ?? null,
      notes ?? null,
      typeof archived === 'boolean' ? archived : null
    ]
  );

  if (status && status !== previousStatus) {
    await query(
      `INSERT INTO pipeline_events (user_id, application_id, from_status, to_status, notes)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, id, previousStatus, status, 'Status updated from application endpoint']
    );
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
};

export const deleteApplication = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { id } = req.params;

  const result = await query(
    `DELETE FROM applications
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );

  if (result.rows.length === 0) {
    throw new HttpError('Application not found', 404);
  }

  res.status(204).send();
};

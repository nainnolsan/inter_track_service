import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

export const createAutomationRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { name, triggerType, condition, action, isActive } = req.body;

  const result = await query(
    `INSERT INTO automation_rules (
      user_id, name, trigger_type, condition_json, action_json, is_active
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *`,
    [userId, name, triggerType, condition || {}, action || {}, typeof isActive === 'boolean' ? isActive : true]
  );

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
};

export const listAutomationRules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;

  const result = await query(
    `SELECT *
     FROM automation_rules
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  res.json({
    success: true,
    data: result.rows
  });
};

export const createAutomationRun = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { ruleId, applicationId, status, startedAt, finishedAt, errorMessage, payload } = req.body;

  const result = await query(
    `INSERT INTO automation_runs (
      user_id, rule_id, application_id, status, started_at, finished_at, error_message, payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      userId,
      ruleId || null,
      applicationId || null,
      status || 'queued',
      startedAt || null,
      finishedAt || null,
      errorMessage || null,
      payload || {}
    ]
  );

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
};

export const listAutomationRuns = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const { ruleId, applicationId, status } = req.query;

  const values: unknown[] = [userId];
  const conditions: string[] = ['user_id = $1'];

  if (ruleId) {
    values.push(ruleId);
    conditions.push(`rule_id = $${values.length}`);
  }

  if (applicationId) {
    values.push(applicationId);
    conditions.push(`application_id = $${values.length}`);
  }

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const result = await query(
    `SELECT *
     FROM automation_runs
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC`,
    values
  );

  res.json({
    success: true,
    data: result.rows
  });
};

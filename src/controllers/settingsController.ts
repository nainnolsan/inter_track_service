import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

interface StageLayoutRow {
  stage_id: string;
  label: string;
  position: number;
  enabled: boolean;
  is_custom: boolean;
}

export const getStageLayout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;

  const result = await query<StageLayoutRow>(
    `SELECT stage_id, label, position, enabled, is_custom
     FROM user_stage_layouts
     WHERE user_id = $1
     ORDER BY position ASC`,
    [userId],
  );

  res.json({
    success: true,
    data: result.rows.map((row) => ({
      id: row.stage_id,
      label: row.label,
      position: row.position,
      enabled: row.enabled,
      isCustom: row.is_custom,
    })),
  });
};

export const saveStageLayout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const layout = Array.isArray(req.body?.layout) ? req.body.layout : [];

  await query('BEGIN');

  try {
    await query('DELETE FROM user_stage_layouts WHERE user_id = $1', [userId]);

    for (let i = 0; i < layout.length; i += 1) {
      const item = layout[i] as {
        id?: unknown;
        label?: unknown;
        enabled?: unknown;
        isCustom?: unknown;
      };

      const stageId = String(item.id ?? '').trim();
      const label = String(item.label ?? '').trim();

      if (!stageId || !label) {
        continue;
      }

      await query(
        `INSERT INTO user_stage_layouts (user_id, stage_id, label, position, enabled, is_custom)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          stageId,
          label,
          i,
          Boolean(item.enabled),
          Boolean(item.isCustom),
        ],
      );
    }

    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }

  res.json({
    success: true,
    message: 'Stage layout saved successfully',
  });
};

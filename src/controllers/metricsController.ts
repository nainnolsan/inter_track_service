import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

export const getDashboardMetrics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;

  const dateFilter = from && to ? 'AND a.created_at BETWEEN $2 AND $3' : '';
  const params = from && to ? [userId, from.toISOString(), to.toISOString()] : [userId];

  const summaryResult = await query<{
    total: string;
    active: string;
    offers: string;
    rejections: string;
  }>(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status NOT IN ('rejected', 'withdrawn', 'hired')) AS active,
      COUNT(*) FILTER (WHERE status = 'offer') AS offers,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejections
     FROM applications a
     WHERE a.user_id = $1 AND a.archived = FALSE ${dateFilter}`,
    params
  );

  const pipelineResult = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM applications a
     WHERE a.user_id = $1 AND a.archived = FALSE ${dateFilter}
     GROUP BY status
     ORDER BY count DESC`,
    params
  );

  const activityResult = await query<{ day: string; events: string }>(
    `SELECT DATE_TRUNC('day', event_date)::date::text AS day, COUNT(*)::text AS events
     FROM pipeline_events
     WHERE user_id = $1
     GROUP BY DATE_TRUNC('day', event_date)
     ORDER BY DATE_TRUNC('day', event_date) DESC
     LIMIT 30`,
    [userId]
  );

  const emailsResult = await query<{ inbound: string; outbound: string }>(
    `SELECT
      COUNT(*) FILTER (WHERE direction = 'inbound')::text AS inbound,
      COUNT(*) FILTER (WHERE direction = 'outbound')::text AS outbound
     FROM emails
     WHERE user_id = $1`,
    [userId]
  );

  res.json({
    success: true,
    data: {
      summary: {
        total: Number(summaryResult.rows[0].total),
        active: Number(summaryResult.rows[0].active),
        offers: Number(summaryResult.rows[0].offers),
        rejections: Number(summaryResult.rows[0].rejections)
      },
      byStatus: pipelineResult.rows.map((row: { status: string; count: string }) => ({
        status: row.status,
        count: Number(row.count)
      })),
      last30DaysEvents: activityResult.rows.map((row: { day: string; events: string }) => ({
        day: row.day,
        events: Number(row.events)
      })),
      emails: {
        inbound: Number(emailsResult.rows[0]?.inbound || 0),
        outbound: Number(emailsResult.rows[0]?.outbound || 0)
      }
    }
  });
};

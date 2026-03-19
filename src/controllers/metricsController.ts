import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

type TransitionRow = {
  from_status: string | null;
  to_status: string;
  total: string;
};

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

export const getPipelineFunnelFlow = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId as string;

  const totalAppsResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM applications
     WHERE user_id = $1 AND archived = FALSE`,
    [userId]
  );

  const transitionsResult = await query<TransitionRow>(
    `WITH unique_transitions AS (
       SELECT DISTINCT application_id, from_status, to_status
       FROM pipeline_events
       WHERE user_id = $1
     )
     SELECT from_status, to_status, COUNT(*)::text AS total
     FROM unique_transitions
     GROUP BY from_status, to_status`,
    [userId]
  );

  const totalApplications = Number(totalAppsResult.rows[0]?.total ?? 0);

  const countTransitions = (fromStatuses: string[], toStatuses: string[]) =>
    transitionsResult.rows
      .filter((row) => fromStatuses.includes(row.from_status ?? '') && toStatuses.includes(row.to_status))
      .reduce((acc, row) => acc + Number(row.total), 0);

  const STAGE_LINKS = [
    { source: 0, target: 1, value: countTransitions(['saved', 'applied'], ['screening']) },
    { source: 0, target: 4, value: countTransitions(['saved', 'applied'], ['rejected', 'withdrawn']) },
    { source: 1, target: 2, value: countTransitions(['screening'], ['interview', 'technical']) },
    { source: 1, target: 5, value: countTransitions(['screening'], ['rejected', 'withdrawn']) },
    { source: 2, target: 3, value: countTransitions(['interview', 'technical'], ['offer', 'hired']) },
    { source: 2, target: 6, value: countTransitions(['interview', 'technical'], ['rejected', 'withdrawn']) },
  ];

  const links = STAGE_LINKS.map((link) => ({
    ...link,
    // Keep graph topology stable even when a branch has no transitions,
    // so node columns stay aligned across renders.
    value: link.value > 0 ? link.value : totalApplications > 0 ? 0.01 : 0,
  })).filter((link) => link.value > 0);

  // If there are no transitions yet, show a minimal visible start node flow.
  if (links.length === 0 && totalApplications > 0) {
    links.push({ source: 0, target: 1, value: totalApplications });
  }

  res.json({
    success: true,
    data: {
      nodes: [
        { name: `${totalApplications} Applied` },
        { name: 'OnlineAssessment' },
        { name: 'Interview' },
        { name: 'Offer' },
        { name: 'Rejected/Ghosted (Applied)' },
        { name: 'Rejected in OA' },
        { name: 'Rejected in Interview' },
      ],
      links,
    },
  });
};

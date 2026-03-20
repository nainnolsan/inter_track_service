import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

type TransitionRow = {
  from_status: string | null;
  to_status: string;
  total: string;
};

type StageBucket = 'applied' | 'oa' | 'interview' | 'offer';

const toStageBucket = (status: string | null | undefined): StageBucket | undefined => {
  if (!status) {
    return undefined;
  }

  if (status === 'saved' || status === 'applied') return 'applied';
  if (status === 'screening') return 'oa';
  if (status === 'interview' || status === 'technical') return 'interview';
  if (status === 'offer' || status === 'hired') return 'offer';
  return undefined;
};

const isRejected = (status: string | null | undefined): boolean =>
  status === 'rejected' || status === 'withdrawn';

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

  const linksMap = new Map<string, number>();
  const addLink = (source: number, target: number, value: number) => {
    if (value <= 0) {
      return;
    }

    const key = `${source}->${target}`;
    linksMap.set(key, (linksMap.get(key) ?? 0) + value);
  };

  for (const row of transitionsResult.rows) {
    const total = Number(row.total);
    if (!Number.isFinite(total) || total <= 0) {
      continue;
    }

    const fromBucket = toStageBucket(row.from_status);
    const toBucket = toStageBucket(row.to_status);
    const toRejected = isRejected(row.to_status);

    // Rejections are represented by stage-specific rejected nodes.
    if (toRejected) {
      if (!fromBucket || fromBucket === 'applied') addLink(0, 4, total);
      else if (fromBucket === 'oa') addLink(1, 5, total);
      else if (fromBucket === 'interview') addLink(2, 6, total);
      continue;
    }

    // Direct jumps are allowed (e.g. Applied -> Interview, OA -> Offer)
    if (fromBucket === 'applied' && toBucket === 'oa') addLink(0, 1, total);
    else if (fromBucket === 'applied' && toBucket === 'interview') addLink(0, 2, total);
    else if (fromBucket === 'applied' && toBucket === 'offer') addLink(0, 3, total);
    else if (fromBucket === 'oa' && toBucket === 'interview') addLink(1, 2, total);
    else if (fromBucket === 'oa' && toBucket === 'offer') addLink(1, 3, total);
    else if (fromBucket === 'interview' && toBucket === 'offer') addLink(2, 3, total);
  }

  const links = Array.from(linksMap.entries())
    .map(([key, value]) => {
      const [sourceText, targetText] = key.split('->');
      return {
        source: Number(sourceText),
        target: Number(targetText),
        value,
      };
    })
    .sort((a, b) => {
      if (a.source !== b.source) {
        return a.source - b.source;
      }

      return a.target - b.target;
    });

  // If there are no transitions yet, show a minimal visible start node flow.
  if (!links.some((link) => link.value > 0) && totalApplications > 0) {
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

import { Response } from 'express';
import { query } from '../config/database';
import { AuthenticatedRequest } from '../types';

type TransitionRow = {
  from_status: string | null;
  to_status: string;
  total: string;
};

type ApplicationStatusRow = {
  id: string;
  status: string;
};

type PipelineEventRow = {
  application_id: string;
  to_status: string;
  event_date: string;
  created_at: string;
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

const transitionToLink = (fromBucket: StageBucket | undefined, toBucket: StageBucket | undefined): [number, number] | undefined => {
  if (!fromBucket || !toBucket || fromBucket === toBucket) {
    return undefined;
  }

  if (fromBucket === 'applied' && toBucket === 'oa') return [0, 1];
  if (fromBucket === 'applied' && toBucket === 'interview') return [0, 2];
  if (fromBucket === 'applied' && toBucket === 'offer') return [0, 3];
  if (fromBucket === 'oa' && toBucket === 'interview') return [1, 2];
  if (fromBucket === 'oa' && toBucket === 'offer') return [1, 3];
  if (fromBucket === 'interview' && toBucket === 'offer') return [2, 3];

  return undefined;
};

const rejectionToLink = (fromBucket: StageBucket | undefined): [number, number] | undefined => {
  if (!fromBucket || fromBucket === 'applied') return [0, 4];
  if (fromBucket === 'oa') return [1, 5];
  if (fromBucket === 'interview') return [2, 6];
  return undefined;
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

  const applicationsResult = await query<ApplicationStatusRow>(
    `SELECT id, status
     FROM applications
     WHERE user_id = $1 AND archived = FALSE`,
    [userId]
  );

  const eventsResult = await query<PipelineEventRow>(
    `SELECT application_id, to_status, event_date::text, created_at::text
     FROM pipeline_events
     WHERE user_id = $1
     ORDER BY application_id ASC, event_date ASC, created_at ASC`,
    [userId],
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

  const eventsByApplication = new Map<string, PipelineEventRow[]>();
  for (const event of eventsResult.rows) {
    const collection = eventsByApplication.get(event.application_id) ?? [];
    collection.push(event);
    eventsByApplication.set(event.application_id, collection);
  }

  for (const application of applicationsResult.rows) {
    const timeline = eventsByApplication.get(application.id) ?? [];
    let currentBucket: StageBucket = 'applied';
    let ended = false;

    for (const event of timeline) {
      if (isRejected(event.to_status)) {
        const rejectionLink = rejectionToLink(currentBucket);
        if (rejectionLink) {
          addLink(rejectionLink[0], rejectionLink[1], 1);
        }
        ended = true;
        break;
      }

      const nextBucket = toStageBucket(event.to_status);
      const transitionLink = transitionToLink(currentBucket, nextBucket);

      if (transitionLink) {
        addLink(transitionLink[0], transitionLink[1], 1);
      }

      if (nextBucket) {
        currentBucket = nextBucket;
      }
    }

    if (ended) {
      continue;
    }

    if (isRejected(application.status)) {
      const rejectionLink = rejectionToLink(currentBucket);
      if (rejectionLink) {
        addLink(rejectionLink[0], rejectionLink[1], 1);
      }
      continue;
    }

    const finalBucket = toStageBucket(application.status);
    const terminalTransition = transitionToLink(currentBucket, finalBucket);
    if (terminalTransition) {
      addLink(terminalTransition[0], terminalTransition[1], 1);
    }
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

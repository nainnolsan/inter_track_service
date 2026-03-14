import { Router } from 'express';
import { query } from 'express-validator';
import { getDashboardMetrics } from '../controllers/metricsController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get(
  '/dashboard',
  [query('from').optional().isISO8601(), query('to').optional().isISO8601()],
  validate,
  asyncHandler(getDashboardMetrics)
);

export default router;

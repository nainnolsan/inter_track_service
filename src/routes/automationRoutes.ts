import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  createAutomationRule,
  createAutomationRun,
  listAutomationRules,
  listAutomationRuns
} from '../controllers/automationController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const VALID_RUN_STATUS = ['queued', 'running', 'success', 'failed', 'skipped'];

const router = Router();

router.post(
  '/rules',
  [
    body('name').isString().trim().isLength({ min: 2, max: 150 }),
    body('triggerType').isString().trim().isLength({ min: 2, max: 100 }),
    body('condition').optional().isObject(),
    body('action').optional().isObject(),
    body('isActive').optional().isBoolean()
  ],
  validate,
  asyncHandler(createAutomationRule)
);

router.get('/rules', asyncHandler(listAutomationRules));

router.post(
  '/runs',
  [
    body('ruleId').optional().isUUID(),
    body('applicationId').optional().isUUID(),
    body('status').optional().isIn(VALID_RUN_STATUS),
    body('startedAt').optional().isISO8601(),
    body('finishedAt').optional().isISO8601(),
    body('errorMessage').optional().isString().trim().isLength({ max: 2000 }),
    body('payload').optional().isObject()
  ],
  validate,
  asyncHandler(createAutomationRun)
);

router.get(
  '/runs',
  [
    query('ruleId').optional().isUUID(),
    query('applicationId').optional().isUUID(),
    query('status').optional().isIn(VALID_RUN_STATUS)
  ],
  validate,
  asyncHandler(listAutomationRuns)
);

export default router;

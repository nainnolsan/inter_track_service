import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  createApplication,
  deleteApplication,
  getApplicationById,
  listApplications,
  updateApplication
} from '../controllers/applicationsController';
import {
  addPipelineEvent,
  deletePipelineEvent,
  listPipelineEvents,
  updatePipelineEvent,
} from '../controllers/pipelineController';
import { addEmail, listEmails } from '../controllers/emailsController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const VALID_STATUS = [
  'saved',
  'applied',
  'screening',
  'interview',
  'technical',
  'offer',
  'rejected',
  'withdrawn',
  'hired'
];

const router = Router();

router.post(
  '/',
  [
    body('roleTitle').isString().trim().isLength({ min: 2, max: 150 }),
    body('status').optional().isIn(VALID_STATUS),
    body('companyId').optional().isUUID(),
    body('companyName').optional().isString().trim().isLength({ min: 2, max: 150 }),
    body('source').optional().isString().trim().isLength({ max: 100 }),
    body('location').optional().isString().trim().isLength({ max: 150 }),
    body('salaryRange').optional().isString().trim().isLength({ max: 100 }),
    body('appliedAt').optional().isISO8601().toDate(),
    body('notes').optional().isString().trim().isLength({ max: 5000 })
  ],
  validate,
  asyncHandler(createApplication)
);

router.get(
  '/',
  [
    query('status').optional().isIn(VALID_STATUS),
    query('companyId').optional().isUUID(),
    query('search').optional().isString().trim().isLength({ max: 150 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  validate,
  asyncHandler(listApplications)
);

router.get('/:id', [param('id').isUUID()], validate, asyncHandler(getApplicationById));

router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('companyId').optional().isUUID(),
    body('roleTitle').optional().isString().trim().isLength({ min: 2, max: 150 }),
    body('status').optional().isIn(VALID_STATUS),
    body('source').optional().isString().trim().isLength({ max: 100 }),
    body('location').optional().isString().trim().isLength({ max: 150 }),
    body('salaryRange').optional().isString().trim().isLength({ max: 100 }),
    body('appliedAt').optional().isISO8601().toDate(),
    body('notes').optional().isString().trim().isLength({ max: 5000 }),
    body('archived').optional().isBoolean()
  ],
  validate,
  asyncHandler(updateApplication)
);

router.delete('/:id', [param('id').isUUID()], validate, asyncHandler(deleteApplication));

router.post(
  '/:id/pipeline-events',
  [
    param('id').isUUID(),
    body('toStatus').isIn(VALID_STATUS),
    body('notes').optional().isString().trim().isLength({ max: 2000 }),
    body('metadata').optional().isObject(),
    body('eventDate').optional().isISO8601()
  ],
  validate,
  asyncHandler(addPipelineEvent)
);

router.get(
  '/:id/pipeline-events',
  [param('id').isUUID()],
  validate,
  asyncHandler(listPipelineEvents)
);

router.patch(
  '/:id/pipeline-events/:eventId',
  [
    param('id').isUUID(),
    param('eventId').isUUID(),
    body('toStatus').optional().isIn(VALID_STATUS),
    body('notes').optional().isString().trim().isLength({ max: 2000 }),
    body('eventDate').optional().isISO8601(),
  ],
  validate,
  asyncHandler(updatePipelineEvent),
);

router.delete(
  '/:id/pipeline-events/:eventId',
  [param('id').isUUID(), param('eventId').isUUID()],
  validate,
  asyncHandler(deletePipelineEvent),
);

router.post(
  '/:id/emails',
  [
    param('id').isUUID(),
    body('contactId').optional().isUUID(),
    body('direction').isIn(['inbound', 'outbound']),
    body('subject').isString().trim().isLength({ min: 1, max: 250 }),
    body('bodyPreview').optional().isString().trim().isLength({ max: 10000 }),
    body('providerMessageId').optional().isString().trim().isLength({ max: 250 }),
    body('receivedAt').optional().isISO8601(),
    body('metadata').optional().isObject()
  ],
  validate,
  asyncHandler(addEmail)
);

router.get('/:id/emails', [param('id').isUUID()], validate, asyncHandler(listEmails));

export default router;

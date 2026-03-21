import { Router } from 'express';
import { body } from 'express-validator';
import { getStageLayout, saveStageLayout } from '../controllers/settingsController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/stage-layout', asyncHandler(getStageLayout));

router.patch(
  '/stage-layout',
  [
    body('layout').isArray(),
    body('layout.*.id').isString().trim().notEmpty(),
    body('layout.*.label').isString().trim().notEmpty(),
    body('layout.*.enabled').isBoolean(),
    body('layout.*.isCustom').isBoolean(),
  ],
  validate,
  asyncHandler(saveStageLayout),
);

export default router;

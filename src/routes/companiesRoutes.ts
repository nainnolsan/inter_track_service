import { Router } from 'express';
import { body } from 'express-validator';
import { createCompany, listCompanies } from '../controllers/companiesController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 2, max: 150 }),
    body('website').optional().isString().trim().isLength({ max: 250 }),
    body('industry').optional().isString().trim().isLength({ max: 150 }),
    body('location').optional().isString().trim().isLength({ max: 150 }),
    body('notes').optional().isString().trim().isLength({ max: 2000 })
  ],
  validate,
  asyncHandler(createCompany)
);

router.get('/', asyncHandler(listCompanies));

export default router;

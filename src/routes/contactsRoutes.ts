import { Router } from 'express';
import { body, query } from 'express-validator';
import { createContact, listContacts } from '../controllers/contactsController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post(
  '/',
  [
    body('applicationId').optional().isUUID(),
    body('companyId').optional().isUUID(),
    body('fullName').isString().trim().isLength({ min: 2, max: 150 }),
    body('email').optional().isEmail(),
    body('phone').optional().isString().trim().isLength({ max: 50 }),
    body('role').optional().isString().trim().isLength({ max: 150 }),
    body('linkedinUrl').optional().isURL(),
    body('notes').optional().isString().trim().isLength({ max: 2000 })
  ],
  validate,
  asyncHandler(createContact)
);

router.get(
  '/',
  [query('applicationId').optional().isUUID(), query('companyId').optional().isUUID()],
  validate,
  asyncHandler(listContacts)
);

export default router;

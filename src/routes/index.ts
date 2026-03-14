import { Router } from 'express';
import applicationsRoutes from './applicationsRoutes';
import companiesRoutes from './companiesRoutes';
import contactsRoutes from './contactsRoutes';
import metricsRoutes from './metricsRoutes';
import automationRoutes from './automationRoutes';

const router = Router();

router.use('/applications', applicationsRoutes);
router.use('/companies', companiesRoutes);
router.use('/contacts', contactsRoutes);
router.use('/metrics', metricsRoutes);
router.use('/automation', automationRoutes);

export default router;

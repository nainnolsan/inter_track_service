import { Router } from 'express';
import { getSwipeHistory, swipeJob } from '../controllers/discoveryController';

const router = Router();

// Endpoint for frontend to know which jobs to filter out of the Tinder UI
router.get('/history', getSwipeHistory as any);

// Endpoint for recording a swipe (Left/Right)
router.post('/swipe', swipeJob as any);

export default router;

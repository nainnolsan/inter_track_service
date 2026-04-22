import { Router } from 'express';
import { getSwipeHistory, swipeJob } from '../controllers/discoveryController';
import { authenticateToken } from '../middleware/auth'; // Re-use existing auth middleware

const router = Router();

// Endpoint for frontend to know which jobs to filter out of the Tinder UI
router.get('/history', authenticateToken, getSwipeHistory as any);

// Endpoint for recording a swipe (Left/Right)
router.post('/swipe', authenticateToken, swipeJob as any);

export default router;

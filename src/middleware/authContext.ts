import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';

export const attachUserContext = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const userId = req.header('x-user-id') || req.header('X-User-Id');

  if (!userId || userId.trim().length === 0) {
    res.status(401).json({
      success: false,
      message: 'Missing x-user-id header. This service expects user identity from gateway/auth.'
    });
    return;
  }

  req.userId = userId.trim();
  next();
};

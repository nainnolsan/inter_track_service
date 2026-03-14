import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/httpError';

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', error);

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
    return;
  }

  // PostgreSQL unique violation
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    res.status(409).json({
      success: false,
      message: 'Duplicate resource'
    });
    return;
  }

  // PostgreSQL foreign key violation
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
    res.status(400).json({
      success: false,
      message: 'Related resource does not exist'
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
};

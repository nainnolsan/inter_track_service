import { Request, Response } from 'express';
import { query } from '../config/database';

export const getHealth = async (req: Request, res: Response): Promise<void> => {
  await query('SELECT 1');

  res.status(200).json({
    success: true,
    message: 'Internship service is running',
    timestamp: new Date().toISOString()
  });
};

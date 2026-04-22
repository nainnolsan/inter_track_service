import { Request, Response } from 'express';
import { db } from '../database';

// Helper to execute simple Postgres queries since we use raw pg in this microservice
export const getSwipeHistory = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id; // Assuming auth middleware provides this
        if (!userId) {
            return res.status(401).json({ success: false, message: 'No autenticado' });
        }

        const result = await db.query('SELECT job_id, status FROM job_interactions WHERE user_id = $1', [userId]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching swipe history:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
};

export const swipeJob = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'No autenticado' });
        }

        const { jobId, status, companyName, roleTitle, location, url } = req.body;
        
        if (!jobId || !['liked', 'dismissed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Parámetros inválidos' });
        }

        // Insert into job_interactions
        await db.query(`
            INSERT INTO job_interactions (user_id, job_id, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, job_id) DO UPDATE SET status = EXCLUDED.status
        `, [userId, jobId, status]);

        // If liked, create an Application in the tracker pipeline!
        if (status === 'liked' && companyName && roleTitle) {
            // Check if company exists, if not create
            let companyId;
            const companyResult = await db.query('SELECT id FROM companies WHERE user_id = $1 AND name = $2', [userId, companyName]);
            
            if (companyResult.rows.length > 0) {
                companyId = companyResult.rows[0].id;
            } else {
                const insertCompany = await db.query(
                    'INSERT INTO companies (user_id, name) VALUES ($1, $2) RETURNING id',
                    [userId, companyName]
                );
                companyId = insertCompany.rows[0].id;
            }

            // Create Application with 'saved' status
            await db.query(`
                INSERT INTO applications (user_id, company_id, role_title, status, source, location, notes)
                VALUES ($1, $2, $3, 'saved', $4, $5, $6)
            `, [userId, companyId, roleTitle, url, location, 'Añadido desde Discovery (SaaS)']);
        }

        res.json({ success: true, message: `Trabajo ${status}` });
    } catch (error) {
        console.error('Error procesando swipe:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
};

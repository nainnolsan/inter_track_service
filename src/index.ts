import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { connectDatabase } from './config/database';
import { attachUserContext } from './middleware/authContext';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';
import healthRoutes from './routes/healthRoutes';
import apiRoutes from './routes';

const app: Application = express();

connectDatabase();

app.use(
  cors({
    origin: config.cors.origin,
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', healthRoutes);
app.use('/api', attachUserContext, apiRoutes);

app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Internship Tracking Service API',
    version: '1.0.0',
    database: 'PostgreSQL',
    endpoints: {
      health: '/api/health',
      applications: '/api/applications',
      pipelineEvents: '/api/applications/:id/pipeline-events',
      emails: '/api/applications/:id/emails',
      metrics: '/api/metrics/dashboard',
      contacts: '/api/contacts',
      companies: '/api/companies',
      automationRules: '/api/automation/rules',
      automationRuns: '/api/automation/runs'
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.port;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Internship Service running on port ${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log('Database: PostgreSQL (Railway compatible)');
});

export default app;

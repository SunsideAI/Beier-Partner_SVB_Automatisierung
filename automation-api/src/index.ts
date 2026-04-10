import express from 'express';
import { config } from './config';
import logger from './utils/logger';
import healthRouter from './routes/health';
import leadsRouter from './routes/leads';
import webhooksRouter from './routes/webhooks';
import { checkOpenFactoringDeals } from './services/factoring';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// Routes
app.use(healthRouter);
app.use(leadsRouter);
app.use(webhooksRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'Automation API started');

  // Factoring Cron-Job
  const intervalMs = config.factoring.intervalMinutes * 60 * 1000;
  logger.info({ intervalMinutes: config.factoring.intervalMinutes }, 'Scheduling factoring check');

  setInterval(async () => {
    try {
      await checkOpenFactoringDeals();
    } catch (error) {
      logger.error({ error }, 'Scheduled factoring check failed');
    }
  }, intervalMs);

  // Initial check nach 10s Delay
  setTimeout(async () => {
    try {
      await checkOpenFactoringDeals();
    } catch (error) {
      logger.error({ error }, 'Initial factoring check failed');
    }
  }, 10000);
});

export default app;

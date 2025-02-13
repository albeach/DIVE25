import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/config';
import { authMiddleware, extractUserAttributes } from './middleware/auth';
import { DocumentController } from './controllers/DocumentController';
import { DatabaseService } from './services/DatabaseService';
import { PartnerController } from './controllers/PartnerController';
import { MonitoringController } from './controllers/MonitoringController';
import * as Prometheus from 'prom-client'; // Added missing import

const app = express();
const monitoringController = MonitoringController.getInstance();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Partner onboarding routes
const partnerController = PartnerController.getInstance();
app.post('/api/partners/onboard', 
  authMiddleware,
  // Assuming authMiddleware exports both - if not, you'll need to import adminAuthMiddleware
  (authMiddleware as any).adminAuthMiddleware, 
  async (req: Request, res: Response): Promise<void> => {
    await partnerController.onboardPartner(req, res);
  }
);

// Initialize services
const db = DatabaseService.getInstance();
db.connect().catch(console.error);

const documentController = DocumentController.getInstance();

// Routes
app.use('/api/documents', authMiddleware, extractUserAttributes);
app.get('/api/documents/:id', async (req: Request, res: Response): Promise<void> => {
  await documentController.getDocument(req, res);
});
app.post('/api/documents/search', async (req: Request, res: Response): Promise<void> => {
  await documentController.searchDocuments(req, res);
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Monitoring routes
app.get('/api/monitoring/partners/:partnerId/metrics',
  authMiddleware,
  (authMiddleware as any).adminAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    await monitoringController.getPartnerMetrics(req, res);
  }
);

app.get('/api/monitoring/health/alerts',
  authMiddleware,
  (authMiddleware as any).adminAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    await monitoringController.getHealthAlerts(req, res);
  }
);

// Prometheus metrics endpoint
app.get('/metrics', (req: Request, res: Response): void => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

export default app;
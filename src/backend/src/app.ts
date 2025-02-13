import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/config';
import AuthMiddleware from './middleware/auth';
import { DocumentController } from './controllers/DocumentController';
import PartnerController from './controllers/PartnerController';
import { MonitoringController } from './controllers/MonitoringController';
import { DatabaseService } from './services/DatabaseService';
import { LoggerService } from './services/LoggerService';
import { MetricsService } from './services/MetricsService';
import { AuthenticatedRequest, AuthError } from './types';
import prometheus from 'prom-client';
import crypto from 'crypto';

function isAuthenticatedRequest(req: any): req is AuthenticatedRequest {
    return 'userAttributes' in req;
}

class App {
    public app: express.Application;
    private logger: LoggerService;
    private metrics: MetricsService;
    private db: DatabaseService;

    constructor() {
        this.app = express();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.db = DatabaseService.getInstance();
        this.initializeMiddleware();
        this.initializeControllers();
        this.initializeErrorHandling();
    }

    private initializeMiddleware(): void {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: config.corsOrigins || ['http://localhost:3000'],
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['X-Request-Id'],
            credentials: true
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP, please try again later'
        });
        this.app.use('/api/', limiter);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging and metrics
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            const requestId = req.headers['x-request-id'] || crypto.randomUUID();
            req.headers['x-request-id'] = requestId;
            
            this.logger.info('Incoming request', {
                method: req.method,
                path: req.path,
                requestId,
                ip: req.ip
            });

            const startTime = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                this.metrics.recordHttpRequest(req.method, req.path, res.statusCode, duration);
                
                this.logger.info('Request completed', {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration,
                    requestId
                });
            });

            next();
        });
    }

    private createAuthenticatedHandler(
        handler: (req: AuthenticatedRequest, res: Response) => Promise<void>
    ): RequestHandler {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            if (!isAuthenticatedRequest(req)) {
                res.status(401).json({ error: 'Not authenticated' });
                return;
            }
            try {
                await handler(req, res);
            } catch (error) {
                next(error);
            }
        };
    }

    private initializeControllers(): void {
        const documentController = DocumentController.getInstance();
        const partnerController = PartnerController.getInstance();
        const monitoringController = MonitoringController.getInstance();

        // Health check endpoint
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Metrics endpoint
        this.app.get('/metrics', async (req: Request, res: Response) => {
            try {
                res.set('Content-Type', prometheus.register.contentType);
                res.end(await prometheus.register.metrics());
            } catch (error) {
                res.status(500).json({ error: 'Failed to collect metrics' });
            }
        });

        // Document routes
        this.app.use('/api/documents',
            AuthMiddleware.authenticate as RequestHandler,
            AuthMiddleware.extractUserAttributes as RequestHandler
        );

        this.app.get('/api/documents/:id', 
            this.createAuthenticatedHandler((req, res) => 
                documentController.getDocument(req, res)
            )
        );

        this.app.post('/api/documents/search', 
            this.createAuthenticatedHandler((req, res) => 
                documentController.searchDocuments(req, res)
            )
        );

        this.app.post('/api/documents',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL') as RequestHandler,
            this.createAuthenticatedHandler(async (req, res) => {
                const document = await documentController.createDocument(req.body, req.userAttributes);
                res.status(201).json(document);
            })
        );

        this.app.put('/api/documents/:id',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL') as RequestHandler,
            this.createAuthenticatedHandler((req, res) => 
                documentController.updateDocument(req, res)
            )
        );

        // Partner routes
        this.app.use('/api/partners',
            AuthMiddleware.authenticate as RequestHandler,
            AuthMiddleware.requireClearance('NATO SECRET') as RequestHandler
        );

        this.app.post('/api/partners/onboard', 
            this.createAuthenticatedHandler((req, res) => 
                partnerController.onboardPartner(req, res)
            )
        );

        this.app.get('/api/partners/:partnerId', 
            this.createAuthenticatedHandler((req, res) => 
                partnerController.getPartnerDetails(req, res)
            )
        );

        this.app.put('/api/partners/:partnerId', 
            this.createAuthenticatedHandler((req, res) => 
                partnerController.updatePartner(req, res)
            )
        );

        this.app.delete('/api/partners/:partnerId', 
            this.createAuthenticatedHandler((req, res) => 
                partnerController.deactivatePartner(req, res)
            )
        );

        // Monitoring routes
        this.app.use('/api/monitoring',
            AuthMiddleware.authenticate as RequestHandler,
            AuthMiddleware.requireClearance('NATO SECRET') as RequestHandler
        );

        this.app.get('/api/monitoring/partners/:partnerId/metrics',
            this.createAuthenticatedHandler((req, res) => 
                monitoringController.getPartnerMetrics(req, res)
            )
        );

        this.app.get('/api/monitoring/health/alerts',
            this.createAuthenticatedHandler((req, res) => 
                monitoringController.getHealthAlerts(req, res)
            )
        );
    }

    private initializeErrorHandling(): void {
        // 404 handler
        this.app.use((req: Request, res: Response) => {
            res.status(404).json({
                error: 'Resource not found',
                code: 'ERR404'
            });
        });

        // Global error handler
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            const error = err as AuthError;
            
            this.logger.error('Unhandled error', {
                error,
                requestId: req.headers['x-request-id'],
                path: req.path
            });

            res.status(error.statusCode || 500).json({
                error: error.message || 'Internal server error',
                code: error.code || 'ERR500'
            });
        });
    }

    public async start(): Promise<void> {
        try {
            await this.db.connect();
            this.logger.info('Database connection established');

            const server = this.app.listen(config.port, () => {
                this.logger.info(`Server is running on port ${config.port}`);
            });

            // Graceful shutdown
            process.on('SIGTERM', () => {
                this.logger.info('SIGTERM received, shutting down gracefully');
                server.close(async () => {
                    await this.db.disconnect();
                    this.logger.info('Server closed');
                    process.exit(0);
                });
            });

        } catch (error) {
            this.logger.error('Failed to start server', { error });
            process.exit(1);
        }
    }
}

// Create and export app instance
const app = new App();
export default app;

// Start server if this file is run directly
if (require.main === module) {
    app.start().catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
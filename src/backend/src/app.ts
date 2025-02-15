import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/config';
import AuthMiddleware from './middleware/AuthMiddleware';
import { DocumentController } from './controllers/DocumentController';
import PartnerController from './controllers/PartnerController';
import { MonitoringController } from './controllers/MonitoringController';
import { DatabaseService } from './services/DatabaseService';
import { LoggerService } from './services/LoggerService';
import { MetricsService } from './services/MetricsService';
import { AuthenticatedRequest, AuthError } from './types';
import prometheus from 'prom-client';
import crypto from 'crypto';

// Security headers configuration
const securityHeaders = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' }
};

function isAuthenticatedRequest(req: any): req is AuthenticatedRequest {
    return 'userAttributes' in req;
}

class App {
    public app: express.Application;
    private logger: LoggerService;
    private metrics: MetricsService;
    private db: DatabaseService;
    private readonly requestSizeLimit = '10mb';

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
        this.app.use(helmet(securityHeaders));
        
        // CORS configuration with stricter options
        this.app.use(cors({
            origin: config.corsOrigins,
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['X-Request-Id'],
            credentials: true,
            maxAge: 600 // 10 minutes
        }));

        // Rate limiting with different tiers
        const standardLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: 'Too many requests, please try again later',
            standardHeaders: true,
            legacyHeaders: false
        });

        const authLimiter = rateLimit({
            windowMs: 60 * 60 * 1000,
            max: 5,
            message: 'Too many authentication attempts',
            standardHeaders: true,
            legacyHeaders: false
        });

        this.app.use('/api/', standardLimiter);
        this.app.use('/api/auth/', authLimiter);

        // Body parsing with size limits
        this.app.use(express.json({ 
            limit: this.requestSizeLimit,
            verify: (req, res, buf) => {
                // Store raw body for signature verification if needed
                (req as any).rawBody = buf;
            }
        }));
        
        this.app.use(express.urlencoded({ 
            extended: true,
            limit: this.requestSizeLimit 
        }));

        // Request logging and metrics with security context
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            const requestId = req.headers['x-request-id'] || crypto.randomUUID();
            req.headers['x-request-id'] = requestId;
            
            const startTime = Date.now();
            const securityContext = {
                requestId,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                origin: req.headers.origin
            };

            this.logger.info('Incoming request', {
                method: req.method,
                path: req.path,
                ...securityContext
            });

            res.on('finish', () => {
                const duration = Date.now() - startTime;
                
                this.metrics.recordHttpRequest(
                    req.method,
                    req.path,
                    res.statusCode,
                    duration
                );

                // Log security-relevant events
                if (res.statusCode >= 400) {
                    this.logger.warn('Request error', {
                        method: req.method,
                        path: req.path,
                        statusCode: res.statusCode,
                        duration,
                        ...securityContext
                    });
                }
            });

            next();
        });
    }

    private createAuthenticatedHandler(
        handler: (req: AuthenticatedRequest, res: Response) => Promise<void>
    ): RequestHandler {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            if (!isAuthenticatedRequest(req)) {
                res.status(401).json({
                    error: 'Not authenticated',
                    code: 'AUTH001',
                    requestId: req.headers['x-request-id']
                });
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

        // Health and monitoring endpoints
        this.app.get('/health', async (req: Request, res: Response) => {
            try {
                const dbStatus = await this.db.checkHealth();
                const status = {
                    status: dbStatus.isHealthy ? 'ok' : 'degraded',
                    timestamp: new Date().toISOString(),
                    version: process.env.APP_VERSION || '1.0.0',
                    components: {
                        database: dbStatus,
                        memory: process.memoryUsage(),
                        uptime: process.uptime()
                    }
                };
                
                res.json(status);
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: 'Health check failed',
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Metrics endpoint with authentication
        this.app.get('/metrics', 
            AuthMiddleware.authenticate as RequestHandler,
            AuthMiddleware.requireClearance('NATO SECRET') as RequestHandler,
            async (req: Request, res: Response) => {
                try {
                    res.set('Content-Type', prometheus.register.contentType);
                    res.end(await prometheus.register.metrics());
                } catch (error) {
                    res.status(500).json({
                        error: 'Failed to collect metrics',
                        code: 'METRICS001'
                    });
                }
            }
        );

        // Document routes with security middleware
        this.app.use('/api/documents',
            AuthMiddleware.authenticate as RequestHandler,
            AuthMiddleware.extractUserAttributes as RequestHandler
        );

        this.app.get('/api/documents/:id', 
            this.createAuthenticatedHandler(async (req, res) => {
                const startTime = Date.now();
                try {
                    await documentController.getDocument(req, res);
                } finally {
                    this.metrics.recordOperationDuration(
                        'document_access',
                        Date.now() - startTime,
                        {
                            documentId: req.params.id,
                            userId: req.userAttributes.uniqueIdentifier
                        }
                    );
                }
            })
        );

        this.app.post('/api/documents/search', 
            this.createAuthenticatedHandler(async (req, res) => {
                const startTime = Date.now();
                try {
                    await documentController.searchDocuments(req, res);
                } finally {
                    this.metrics.recordOperationDuration(
                        'document_search',
                        Date.now() - startTime,
                        {
                            userId: req.userAttributes.uniqueIdentifier,
                            criteria: JSON.stringify(req.body.query)
                        }
                    );
                }
            })
        );

        this.app.post('/api/documents',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL') as RequestHandler,
            this.createAuthenticatedHandler(async (req, res) => {
                const startTime = Date.now();
                try {
                    const document = await documentController.createDocument(
                        req.body,
                        req.userAttributes
                    );
                    res.status(201).json(document);
                } finally {
                    this.metrics.recordOperationDuration(
                        'document_create',
                        Date.now() - startTime,
                        {
                            userId: req.userAttributes.uniqueIdentifier,
                            classification: req.body.clearance
                        }
                    );
                }
            })
        );

        // Partner routes with enhanced security
        this.app.use('/api/partners',
            AuthMiddleware.authenticate as RequestHandler,
            AuthMiddleware.requireClearance('NATO SECRET') as RequestHandler
        );

        // Monitoring routes with access control
        this.app.use('/api/monitoring',
            AuthMiddleware.authenticate as RequestHandler,
            AuthMiddleware.requireClearance('NATO SECRET') as RequestHandler
        );

        // Add additional controller routes...
    }

    private initializeErrorHandling(): void {
        // 404 handler
        this.app.use((req: Request, res: Response) => {
            this.metrics.recordNotFound(req.path);
            res.status(404).json({
                error: 'Resource not found',
                code: 'ERR404',
                path: req.path
            });
        });

        // Global error handler
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            const error = err as AuthError;
            
            this.logger.error('Unhandled error', {
                error,
                requestId: req.headers['x-request-id'],
                path: req.path,
                user: (req as AuthenticatedRequest).userAttributes?.uniqueIdentifier
            });

            // Record error metrics
            this.metrics.recordError(error.code || 'UNKNOWN', req.path);

            const statusCode = error.statusCode || 500;
            const errorResponse = {
                error: error.message || 'Internal server error',
                code: error.code || 'ERR500',
                requestId: req.headers['x-request-id'],
                timestamp: new Date().toISOString()
            };

            // Don't expose error details in production
            if (process.env.NODE_ENV !== 'production' && error.details) {
                (errorResponse as any).details = error.details;
            }

            res.status(statusCode).json(errorResponse);
        });
    }

    public async start(): Promise<void> {
        try {
            // Initialize database connection
            await this.db.connect();
            this.logger.info('Database connection established');

            // Start server with graceful shutdown
            const server = this.app.listen(config.port, () => {
                this.logger.info(`Server is running on port ${config.port}`);
                this.metrics.recordServerStart();
            });

            // Graceful shutdown handling
            const gracefulShutdown = async (signal: string) => {
                this.logger.info(`${signal} received, starting graceful shutdown`);
                
                // Stop accepting new requests
                server.close(async () => {
                    try {
                        // Close database connection
                        await this.db.disconnect();
                        
                        // Record final metrics
                        await this.metrics.recordServerStop();
                        
                        this.logger.info('Graceful shutdown completed');
                        process.exit(0);
                    } catch (error) {
                        this.logger.error('Error during shutdown:', error);
                        process.exit(1);
                    }
                });

                // Force shutdown after timeout
                setTimeout(() => {
                    this.logger.error('Forced shutdown due to timeout');
                    process.exit(1);
                }, 30000); // 30 second timeout
            };

            process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
            process.on('SIGINT', () => gracefulShutdown('SIGINT'));

            // Unhandled rejection handler
            process.on('unhandledRejection', (reason: any) => {
                this.logger.error('Unhandled Promise rejection:', reason);
                this.metrics.recordUnhandledRejection();
            });

        } catch (error) {
            this.logger.error('Failed to start server:', error);
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
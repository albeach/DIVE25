import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/config';
import AuthMiddleware from './middleware/AuthMiddleware';
import DocumentRoutes from './routes/DocumentRoutes';
import { DatabaseService } from './services/DatabaseService';
import { LoggerService } from './services/LoggerService';
import { MetricsService } from './services/MetricsService';
import { OPAService } from './services/OPAService';
import { AuthenticatedRequest, AuthError } from './types';
import prometheus from 'prom-client';

class App {
    public app: express.Application;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly db: DatabaseService;
    private readonly opa: OPAService;

    constructor() {
        this.app = express();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.db = DatabaseService.getInstance();
        this.opa = OPAService.getInstance();

        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }

    private initializeMiddleware(): void {
        // Enhanced security middleware
        this.app.use(helmet({
            contentSecurityPolicy: true,
            crossOriginEmbedderPolicy: true,
            crossOriginOpenerPolicy: true,
            crossOriginResourcePolicy: true,
            dnsPrefetchControl: true,
            frameguard: true,
            hidePoweredBy: true,
            hsts: true,
            ieNoOpen: true,
            noSniff: true,
            originAgentCluster: true,
            permittedCrossDomainPolicies: true,
            referrerPolicy: true,
            xssFilter: true
        }));

        // Enhanced CORS configuration
        this.app.use(cors({
            origin: config.corsOrigins,
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
            exposedHeaders: ['x-request-id'],
            credentials: true,
            maxAge: 600 // 10 minutes
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
            const requestId = req.headers['x-request-id'] ||
                `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            req.headers['x-request-id'] = requestId;

            const startTime = Date.now();

            this.logger.info('Incoming request', {
                method: req.method,
                path: req.path,
                requestId,
                ip: req.ip
            });

            res.on('finish', () => {
                const duration = Date.now() - startTime;
                this.metrics.recordHttpRequest(
                    req.method,
                    req.path,
                    res.statusCode,
                    duration
                );
            });

            next();
        });
    }

    private initializeRoutes(): void {
        // Health check endpoint
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version
            });
        });

        // Metrics endpoint
        this.app.get('/metrics', async (req: Request, res: Response) => {
            try {
                res.set('Content-Type', prometheus.register.contentType);
                res.end(await prometheus.register.metrics());
            } catch (error) {
                this.logger.error('Error collecting metrics:', error);
                res.status(500).json({ error: 'Failed to collect metrics' });
            }
        });

        // API routes
        this.app.use(
            '/api/documents',
            AuthMiddleware.authenticate,
            DocumentRoutes.getInstance().getRouter()
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

            this.logger.error('Unhandled error:', {
                error,
                path: req.path,
                method: req.method,
                requestId: req.headers['x-request-id']
            });

            res.status(error.statusCode || 500).json({
                error: error.message || 'Internal server error',
                code: error.code || 'ERR500',
                requestId: req.headers['x-request-id']
            });
        });
    }

    public async start(): Promise<void> {
        try {
            // Initialize database connection
            await this.db.connect();
            this.logger.info('Database connection established');

            // Initialize OPA connection
            await this.opa.validateConnection();
            this.logger.info('OPA connection established');

            // Start server
            const server = this.app.listen(config.port, () => {
                this.logger.info(`Server running on port ${config.port}`);
            });

            // Graceful shutdown
            const shutdown = async () => {
                this.logger.info('Shutting down server...');

                server.close(async () => {
                    await this.db.disconnect();
                    this.logger.info('Server shutdown complete');
                    process.exit(0);
                });

                // Force shutdown after timeout
                setTimeout(() => {
                    this.logger.error('Forced shutdown due to timeout');
                    process.exit(1);
                }, 30000);
            };

            process.on('SIGTERM', shutdown);
            process.on('SIGINT', shutdown);

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
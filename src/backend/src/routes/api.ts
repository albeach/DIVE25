import express, { Router } from 'express';
import { DocumentRoutes } from './DocumentRoutes';
import { HealthRoutes } from './HealthRoutes';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import { RequestMiddleware } from '../middleware/RequestMiddleware';
import { RateLimiter } from '../middleware/RateLimiter';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';

export class APIRouter {
    private static instance: APIRouter;
    private readonly router: Router;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.router = express.Router();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }

    public static getInstance(): APIRouter {
        if (!APIRouter.instance) {
            APIRouter.instance = new APIRouter();
        }
        return APIRouter.instance;
    }

    private initializeMiddleware(): void {
        // Request tracking and security headers
        this.router.use(RequestMiddleware.getInstance().trackRequest);
        this.router.use(RequestMiddleware.getInstance().securityHeaders);

        // Rate limiting
        this.router.use(RateLimiter.getInstance().limit);

        // Authentication - skip for health checks
        this.router.use(/^(?!\/health).*$/, AuthMiddleware.getInstance().authenticate);
    }

    private initializeRoutes(): void {
        // Health check routes
        this.router.use('/health', HealthRoutes.getInstance().getRouter());

        // Document routes - protected by auth
        this.router.use('/documents', DocumentRoutes.getInstance().getRouter());

        // Add metrics endpoint for Prometheus
        this.router.get('/metrics', async (req, res) => {
            try {
                const metrics = await this.metrics.getMetrics();
                res.set('Content-Type', this.metrics.contentType);
                res.send(metrics);
            } catch (error) {
                this.logger.error('Failed to get metrics:', error);
                res.status(500).send('Failed to get metrics');
            }
        });
    }

    private initializeErrorHandling(): void {
        const errorHandler = ErrorHandler.getInstance();

        // Handle 404s
        this.router.use(errorHandler.handleNotFound);

        // Handle all other errors
        this.router.use(errorHandler.handleError);
    }

    public getRouter(): Router {
        return this.router;
    }
}

// Update app.ts to use this router
export default APIRouter.getInstance().getRouter(); 
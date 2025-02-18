import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { OPAService } from '../services/OPAService';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';

export class HealthRoutes {
    private static instance: HealthRoutes;
    private readonly router: Router;
    private readonly db: DatabaseService;
    private readonly opa: OPAService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.router = Router();
        this.db = DatabaseService.getInstance();
        this.opa = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.initializeRoutes();
    }

    public static getInstance(): HealthRoutes {
        if (!HealthRoutes.instance) {
            HealthRoutes.instance = new HealthRoutes();
        }
        return HealthRoutes.instance;
    }

    private initializeRoutes(): void {
        this.router.get('/health', this.healthCheck.bind(this));
        this.router.get('/health/detailed', this.detailedHealthCheck.bind(this));
    }

    private async healthCheck(req: Request, res: Response): Promise<void> {
        try {
            const dbHealth = await this.db.healthCheck();
            const opaHealth = await this.opa.healthCheck();

            const isHealthy = dbHealth && opaHealth;

            res.status(isHealthy ? 200 : 503).json({
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Health check failed:', error);
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString()
            });
        }
    }

    private async detailedHealthCheck(req: Request, res: Response): Promise<void> {
        try {
            const dbHealth = await this.db.healthCheck();
            const opaHealth = await this.opa.healthCheck();

            const health = {
                status: dbHealth && opaHealth ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                services: {
                    database: {
                        status: dbHealth ? 'healthy' : 'unhealthy'
                    },
                    opa: {
                        status: opaHealth ? 'healthy' : 'unhealthy'
                    }
                }
            };

            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        } catch (error) {
            this.logger.error('Detailed health check failed:', error);
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    }

    public getRouter(): Router {
        return this.router;
    }
}

export default HealthRoutes.getInstance(); 
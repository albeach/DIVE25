import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { APIRouter } from './routes/api';
import { LoggerService } from './services/LoggerService';
import { MetricsService } from './services/MetricsService';
import { config } from './config/config';

export class App {
    private readonly app: Application;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    constructor() {
        this.app = express();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();

        this.initializeMiddleware();
        this.initializeRoutes();
    }

    private initializeMiddleware(): void {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: config.cors?.allowedOrigins || '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }));

        // Performance middleware
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            const startTime = process.hrtime();

            res.on('finish', () => {
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const duration = seconds * 1000 + nanoseconds / 1000000;

                this.logger.info('Request processed', {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration: `${duration.toFixed(2)}ms`
                });

                this.metrics.recordOperationMetrics('http_request', {
                    duration,
                    success: res.statusCode < 400,
                    statusCode: res.statusCode
                });
            });

            next();
        });
    }

    private initializeRoutes(): void {
        // API routes
        this.app.use('/api', APIRouter.getInstance().getRouter());
    }

    public getApp(): Application {
        return this.app;
    }
}

export default new App().getApp();
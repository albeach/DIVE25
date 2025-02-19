import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';

export class RequestMiddleware {
    private static instance: RequestMiddleware;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public static getInstance(): RequestMiddleware {
        if (!RequestMiddleware.instance) {
            RequestMiddleware.instance = new RequestMiddleware();
        }
        return RequestMiddleware.instance;
    }

    public trackRequest = (req: Request, res: Response, next: NextFunction): void => {
        // Add request ID
        req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();

        // Track request start time
        const startTime = process.hrtime();

        // Log request
        this.logger.info('Incoming request', {
            method: req.method,
            path: req.path,
            requestId: req.headers['x-request-id'],
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });

        // Track response
        res.on('finish', () => {
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const duration = seconds * 1000 + nanoseconds / 1000000;

            this.metrics.recordOperationMetrics('http_request', {
                duration,
                success: res.statusCode < 400,
                statusCode: res.statusCode
            });

            this.logger.info('Request completed', {
                method: req.method,
                path: req.path,
                requestId: req.headers['x-request-id'],
                statusCode: res.statusCode,
                duration: `${duration.toFixed(2)}ms`
            });
        });

        next();
    };

    public securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
        // Set security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('Content-Security-Policy', "default-src 'self'");
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        next();
    };

    public rateLimiter = (req: Request, res: Response, next: NextFunction): void => {
        // Implement rate limiting logic here
        // This is a placeholder for where you'd implement your rate limiting strategy
        // You might want to use Redis or another storage mechanism to track request counts
        next();
    };
}

export default RequestMiddleware.getInstance(); 
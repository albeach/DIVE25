import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { DocumentError } from '../errors/DocumentError';
import { AuthError } from '../errors/AuthError';

export class ErrorMiddleware {
    private static instance: ErrorMiddleware;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public static getInstance(): ErrorMiddleware {
        if (!ErrorMiddleware.instance) {
            ErrorMiddleware.instance = new ErrorMiddleware();
        }
        return ErrorMiddleware.instance;
    }

    public handleError = (
        error: Error & { statusCode?: number; code?: string },
        req: Request,
        res: Response,
        _next: NextFunction
    ): void => {
        const statusCode = error.statusCode || 500;

        this.logger.error('Application error:', {
            error: error.message,
            code: error.code,
            stack: error.stack
        });

        this.metrics.recordOperationError('application_error', {
            code: error.code,
            status: statusCode
        });

        res.status(statusCode).json({
            error: error.message,
            code: error.code
        });
    };
}

export default ErrorMiddleware.getInstance(); 
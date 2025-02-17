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

    public handleError = (
        error: Error,
        req: Request,
        res: Response,
        next: NextFunction
    ): void => {
        let statusCode = 500;
        let errorResponse = {
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
            correlationId: req.headers['x-nato-correlation-id']
        };

        // Handle specific error types
        if (error instanceof DocumentError) {
            statusCode = error.statusCode;
            errorResponse = {
                error: 'Document Error',
                message: error.message,
                correlationId: req.headers['x-nato-correlation-id']
            };
        } else if (error instanceof AuthError) {
            statusCode = error.statusCode;
            errorResponse = {
                error: 'Authentication Error',
                message: error.message,
                correlationId: req.headers['x-nato-correlation-id']
            };
        }

        // Log error with proper context
        this.logger.log('error', 'Request failed', {
            error: error.message,
            stack: error.stack,
            statusCode,
            path: req.path,
            method: req.method,
            correlationId: req.headers['x-nato-correlation-id']
        });

        // Record error metrics
        this.metrics.recordMetric('error_total', {
            type: error.constructor.name,
            status: statusCode,
            path: req.path
        });

        res.status(statusCode).json(errorResponse);
    };

    public static getInstance(): ErrorMiddleware {
        if (!ErrorMiddleware.instance) {
            ErrorMiddleware.instance = new ErrorMiddleware();
        }
        return ErrorMiddleware.instance;
    }
} 
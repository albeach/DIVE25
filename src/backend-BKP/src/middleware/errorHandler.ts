// src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { BaseError } from '../types/errors';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';

export class ErrorHandler {
    private static instance: ErrorHandler;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    public handleError = (
        error: Error,
        req: Request,
        res: Response,
        _next: NextFunction
    ): void => {
        // Log the error
        this.logger.error('Application error:', {
            error: error.message,
            stack: error.stack,
            path: req.path,
            method: req.method,
            requestId: req.headers['x-request-id']
        });

        // Record metric
        this.metrics.recordOperationError('application_error', error);

        // Handle known errors
        if (error instanceof BaseError) {
            res.status(error.statusCode).json({
                error: error.message,
                code: error.code,
                details: error.details
            });
            return;
        }

        // Handle unknown errors
        res.status(500).json({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            requestId: req.headers['x-request-id']
        });
    };

    public handleNotFound = (
        req: Request,
        res: Response,
        _next: NextFunction
    ): void => {
        const error = {
            message: `Route not found: ${req.method} ${req.path}`,
            code: 'NOT_FOUND',
            requestId: req.headers['x-request-id']
        };

        this.logger.warn('Route not found:', error);
        this.metrics.recordOperationError('route_not_found', new Error(error.message));

        res.status(404).json(error);
    };

    public handleUncaughtException = (error: Error): void => {
        this.logger.error('Uncaught exception:', {
            error: error.message,
            stack: error.stack
        });

        this.metrics.recordOperationError('uncaught_exception', error);

        // Exit process on uncaught exception
        process.exit(1);
    };

    public handleUnhandledRejection = (reason: any): void => {
        this.logger.error('Unhandled rejection:', {
            reason: reason instanceof Error ? reason.message : reason,
            stack: reason instanceof Error ? reason.stack : undefined
        });

        this.metrics.recordOperationError('unhandled_rejection',
            reason instanceof Error ? reason : new Error(String(reason))
        );

        // Exit process on unhandled rejection
        process.exit(1);
    };
}

export default ErrorHandler.getInstance();
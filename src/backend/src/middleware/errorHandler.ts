// src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { AuthError } from '../types';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';

/**
 * Converts an unknown error into a structured `AuthError` object.
 */
export function asAuthError(error: unknown): AuthError {
    const typedError = error instanceof Error ? error : new Error('Unknown error');
    return {
        ...typedError,
        statusCode: (error as AuthError)?.statusCode || 500,
        code: (error as AuthError)?.code || 'INTERNAL_ERROR',
        details: (error as AuthError)?.details || {},
    } as AuthError;
}

export const errorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const logger = LoggerService.getInstance();
    const metrics = MetricsService.getInstance();
    const typedError = error as AuthError;
    
    // Log error with context
    logger.error('Unhandled error:', {
        error: typedError,
        path: req.path,
        method: req.method,
        requestId: req.headers['x-request-id'],
        userId: (req as any).userAttributes?.uniqueIdentifier
    });

    // Record error metric
    metrics.recordOperationError(req.path, error);

    // Determine status code and format error response
    const statusCode = typedError.statusCode || 500;
    const errorCode = typedError.code || 'INTERNAL_ERROR';
    const errorMessage = typedError.message || 'Internal server error';

    // Send formatted error response
    res.status(statusCode).json({
        success: false,
        error: {
            message: errorMessage,
            code: errorCode,
            details: typedError.details,
            status: statusCode
        },
        metadata: {
            timestamp: new Date(),
            requestId: req.headers['x-request-id'],
            path: req.path,
            method: req.method
        }
    });
};

// Add custom error middleware for specific error types
export const notFoundHandler = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const error = new Error('Resource not found') as AuthError;
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    next(error);
};

export const validationErrorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (error.name === 'ValidationError') {
        const typedError = error as AuthError;
        typedError.statusCode = 400;
        typedError.code = 'VALIDATION_ERROR';
    }
    next(error);
};

export const securityErrorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (error.name === 'SecurityError') {
        const typedError = error as AuthError;
        typedError.statusCode = 403;
        typedError.code = 'SECURITY_ERROR';
    }
    next(error);
};
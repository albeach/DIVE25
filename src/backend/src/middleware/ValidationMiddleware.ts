import { Request, Response, NextFunction } from 'express';
import { Schema } from 'joi';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';

export const ValidateRequest = (schema: Schema) => {
    const logger = LoggerService.getInstance();
    const metrics = MetricsService.getInstance();

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const validationOptions = {
                abortEarly: false,
                allowUnknown: true,
                stripUnknown: true
            };

            const value = await schema.validateAsync(req.body, validationOptions);
            req.body = value;
            next();
        } catch (error) {
            logger.error('Request validation failed:', {
                path: req.path,
                method: req.method,
                error: error.message
            });

            metrics.recordOperationError('validation_error', {
                path: req.path,
                method: req.method
            });

            res.status(400).json({
                error: 'Validation error',
                details: error.details?.map((detail: any) => ({
                    message: detail.message,
                    path: detail.path
                }))
            });
        }
    };
}; 
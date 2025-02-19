import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { AuthenticatedRequest } from '../types';

export class AuditMiddleware {
    private static instance: AuditMiddleware;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public auditRequest = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        const startTime = Date.now();
        const correlationId = this.logger.getCorrelationId(req);
        const partnerType = this.logger.getPartnerType(req);

        // Capture original end function
        const originalEnd = res.end;

        // Override end function to capture response
        res.end = function (this: Response, ...args: any[]): Response {
            const duration = Date.now() - startTime;
            const status = res.statusCode;
            const userAttributes = (req as AuthenticatedRequest).userAttributes;

            // Log the completed request
            this.logger.auditAccess(req, status.toString(), {
                userId: userAttributes?.uniqueIdentifier,
                duration,
                classification: req.headers['x-classification'],
                resourceId: req.params.id || req.path,
                status: status < 400 ? 'SUCCESS' : 'FAILURE'
            });

            // Record metrics
            this.metrics.recordMetric('request_duration', {
                method: req.method,
                path: req.path,
                status,
                partner_type: partnerType,
                duration
            });

            // Call original end
            return originalEnd.apply(this, args);
        }.bind(res);

        // Log request start
        this.logger.log('info', 'Request Started', {
            correlationId,
            partnerType,
            method: req.method,
            path: req.path,
            actionType: 'REQUEST_START'
        });

        next();
    };

    public errorHandler = (
        error: Error,
        req: Request,
        res: Response,
        next: NextFunction
    ): void => {
        this.logger.auditError(req, error, {
            userId: (req as AuthenticatedRequest).userAttributes?.uniqueIdentifier
        });

        this.metrics.recordMetric('error_total', {
            method: req.method,
            path: req.path,
            error: error.name,
            partner_type: this.logger.getPartnerType(req)
        });

        next(error);
    };

    public static getInstance(): AuditMiddleware {
        if (!AuditMiddleware.instance) {
            AuditMiddleware.instance = new AuditMiddleware();
        }
        return AuditMiddleware.instance;
    }
} 
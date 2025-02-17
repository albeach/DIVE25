// src/services/LoggerService.ts

import winston from 'winston';
import { MongoDB } from 'winston-mongodb';
import { config } from '../config/config';
import {
    UserAttributes,
    AuditEvent,
    ClearanceLevel
} from '../types';
import { Request } from 'express';

export class LoggerService {
    private static instance: LoggerService;
    private readonly logger: winston.Logger;
    private readonly auditLogger: winston.Logger;

    private readonly LOG_LEVELS = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };

    private readonly AUDIT_RETENTION = {
        ERROR: 365, // days
        SECURITY: 180,
        GENERAL: 90
    };

    private constructor() {
        this.logger = winston.createLogger({
            level: config.env === 'production' ? 'info' : 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
                winston.format.errors({ stack: true }),
                winston.format.metadata({
                    fillExcept: ['message', 'level', 'timestamp', 'label']
                })
            ),
            defaultMeta: {
                service: 'dive25-api'
            },
            transports: this.initializeTransports()
        });

        this.auditLogger = winston.createLogger({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: this.initializeAuditTransports()
        });
    }

    private initializeTransports(): winston.transport[] {
        const transports: winston.transport[] = [
            new winston.transports.Console(),

            new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 5,
                format: winston.format.combine(
                    winston.format.uncolorize(),
                    winston.format.json()
                )
            }),

            new MongoDB({
                db: config.mongo.uri,
                collection: 'system_logs',
                level: 'info',
                options: {
                    useUnifiedTopology: true
                },
                metaKey: 'metadata'
            }) as unknown as winston.transport
        ];

        if (config.env === 'production') {
            transports.push(
                new winston.transports.File({
                    filename: 'logs/combined.log',
                    maxsize: 10485760, // 10MB
                    maxFiles: 5
                })
            );
        }

        return transports;
    }

    private initializeAuditTransports(): winston.transport[] {
        return [
            new winston.transports.File({
                filename: 'logs/audit.log',
                maxsize: 10485760, // 10MB
                maxFiles: 10
            }),

            new MongoDB({
                db: config.mongo.uri,
                collection: 'audit_logs',
                options: {
                    useUnifiedTopology: true
                },
                metaKey: 'metadata'
            }) as unknown as winston.transport
        ];
    }

    public static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    public info(message: string, meta?: any): void {
        this.logger.info(message, { metadata: meta });
    }

    public error(message: string, error?: any): void {
        this.logger.error(message, {
            metadata: error,
            stack: error?.stack
        });
    }

    public warn(message: string, meta?: any): void {
        this.logger.warn(message, { metadata: meta });
    }

    public debug(message: string, meta?: any): void {
        this.logger.debug(message, { metadata: meta });
    }

    public async auditSecurityEvent(
        eventType: string,
        userAttributes: UserAttributes,
        details: Record<string, any>
    ): Promise<void> {
        const auditEvent: AuditEvent = {
            timestamp: new Date(),
            eventType: 'SECURITY',
            userId: userAttributes.uniqueIdentifier,
            userAttributes: userAttributes,
            resourceId: details.resourceId,
            action: details.action,
            status: details.status,
            details
        };

        this.auditLogger.info('Security Event', {
            event: auditEvent,
            retention: this.AUDIT_RETENTION.SECURITY
        });
    }

    public async auditDocumentAccess(
        userAttributes: UserAttributes,
        documentId: string,
        clearance: ClearanceLevel,
        action: string,
        success: boolean,
        details?: Record<string, any>
    ): Promise<void> {
        const auditEvent: AuditEvent = {
            timestamp: new Date(),
            eventType: 'ACCESS',
            userId: userAttributes.uniqueIdentifier,
            userAttributes: {
                ...userAttributes
            },
            resourceId: documentId,
            action,
            status: success ? 'SUCCESS' : 'DENIED',
            details: {
                documentClearance: clearance,
                ...details
            }
        };

        this.auditLogger.info('Document Access', { event: auditEvent });
    }

    public async auditAuthentication(
        userAttributes: UserAttributes,
        partnerId: string | null,
        success: boolean,
        details?: Record<string, any>
    ): Promise<void> {
        const auditEvent: AuditEvent = {
            timestamp: new Date(),
            eventType: 'AUTHENTICATION' as any,
            userId: userAttributes.uniqueIdentifier,
            userAttributes: {
                ...userAttributes
            },
            action: 'LOGIN',
            status: success ? 'SUCCESS' : 'DENIED',
            details: {
                partnerId,
                ...details
            }
        };

        this.auditLogger.info('Authentication', {
            event: auditEvent,
            retention: this.AUDIT_RETENTION.SECURITY
        });
    }

    private sanitizeAuditDetails(details: Record<string, any>): Record<string, any> {
        const sanitized: Record<string, any> = {};
        const sensitiveFields = ['password', 'token', 'secret', 'key'];

        for (const [key, value] of Object.entries(details)) {
            if (!sensitiveFields.includes(key.toLowerCase())) {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    public log(level: string, message: string, meta: any = {}) {
        const correlationId = meta.correlationId || 'NO_CORRELATION_ID';
        const partnerType = meta.partnerType || 'UNKNOWN';

        this.logger.log(level, message, {
            ...meta,
            correlationId,
            partnerType,
            timestamp: new Date().toISOString(),
            nato_audit: {
                federation_id: process.env.FEDERATION_ID,
                correlation_id: correlationId,
                partner_type: partnerType,
                classification: meta.classification || 'UNCLASSIFIED',
                action_type: meta.actionType || 'SYSTEM',
                user_id: meta.userId || 'SYSTEM',
                resource_id: meta.resourceId,
                status: meta.status || 'SUCCESS'
            }
        });
    }

    public getCorrelationId(req: Request): string {
        return req.headers['x-nato-correlation-id'] as string ||
            req.headers['x-correlation-id'] as string ||
            'NO_CORRELATION_ID';
    }

    public getPartnerType(req: Request): string {
        return req.headers['x-federation-partner'] as string || 'UNKNOWN';
    }

    public auditAccess(req: Request, status: string, meta: any = {}) {
        const correlationId = this.getCorrelationId(req);
        const partnerType = this.getPartnerType(req);

        this.log('info', 'Access Audit', {
            correlationId,
            partnerType,
            method: req.method,
            path: req.path,
            status,
            actionType: 'ACCESS',
            userId: meta.userId,
            resourceId: meta.resourceId,
            classification: meta.classification
        });
    }

    public auditAuth(req: Request, status: string, meta: any = {}) {
        const correlationId = this.getCorrelationId(req);
        const partnerType = this.getPartnerType(req);

        this.log('info', 'Authentication Audit', {
            correlationId,
            partnerType,
            status,
            actionType: 'AUTHENTICATION',
            userId: meta.userId
        });
    }

    public auditError(req: Request, error: Error, meta: any = {}) {
        const correlationId = this.getCorrelationId(req);
        const partnerType = this.getPartnerType(req);

        this.log('error', 'Error Audit', {
            correlationId,
            partnerType,
            error: error.message,
            stack: error.stack,
            actionType: 'ERROR',
            userId: meta.userId,
            status: 'FAILURE'
        });
    }
}

export default LoggerService.getInstance();
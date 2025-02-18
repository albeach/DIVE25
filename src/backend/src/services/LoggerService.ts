// src/services/LoggerService.ts

import winston from 'winston';
import { MongoDB } from 'winston-mongodb';
import { config } from '../config/config';
import {
    UserAttributes,
    AuditEvent,
    ClearanceLevel,
    ResourceAttributes,
    OPAResult,
    ValidationResult,
    NATODocument
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
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });

        this.auditLogger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'audit.log' })
            ]
        });

        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.simple()
            }));
        }
    }

    public static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    public info(message: string, meta?: any): void {
        this.logger.info(message, meta);
    }

    public error(message: string, meta?: any): void {
        this.logger.error(message, meta);
    }

    public warn(message: string, meta?: any): void {
        this.logger.warn(message, meta);
    }

    public debug(message: string, meta?: any): void {
        this.logger.debug(message, meta);
    }

    public auditAccess(
        user: UserAttributes,
        resource: string,
        action: string,
        success: boolean,
        details?: Record<string, any>
    ): void {
        this.auditLogger.info('Access Audit', {
            user: user.uniqueIdentifier,
            resource,
            action,
            success,
            details,
            timestamp: new Date().toISOString()
        });
    }

    public auditError(req: Request, error: Error, meta?: any): void {
        this.auditLogger.error('Error Audit', {
            path: req.path,
            method: req.method,
            error: error.message,
            stack: error.stack,
            meta,
            timestamp: new Date().toISOString()
        });
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
}

export default LoggerService.getInstance();
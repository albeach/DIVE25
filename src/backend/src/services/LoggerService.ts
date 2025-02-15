// src/services/LoggerService.ts

import winston from 'winston';
import { MongoDB } from 'winston-mongodb';
import { config } from '../config/config';
import { 
    UserAttributes, 
    AuditEvent, 
    ClearanceLevel 
} from '../types';

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
                winston.format.metadata()
            ),
            defaultMeta: { service: 'dive25' },
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
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }),

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
            })
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
            })
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
            eventType,
            userId: userAttributes.uniqueIdentifier,
            userAttributes: {
                clearance: userAttributes.clearance,
                countryOfAffiliation: userAttributes.countryOfAffiliation,
                coiTags: userAttributes.coiTags,
                lacvCode: userAttributes.lacvCode
            },
            resourceId: details.resourceId,
            action: details.action,
            status: details.status,
            details: this.sanitizeAuditDetails(details)
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
                clearance: userAttributes.clearance,
                countryOfAffiliation: userAttributes.countryOfAffiliation,
                coiTags: userAttributes.coiTags,
                lacvCode: userAttributes.lacvCode
            },
            resourceId: documentId,
            action,
            status: success ? 'SUCCESS' : 'DENIED',
            details: this.sanitizeAuditDetails({
                documentClearance: clearance,
                ...details
            })
        };

        this.auditLogger.info('Document Access', { 
            event: auditEvent,
            retention: this.AUDIT_RETENTION.GENERAL
        });
    }

    public async auditAuthentication(
        userId: string,
        partnerId: string | null,
        success: boolean,
        details?: Record<string, any>
    ): Promise<void> {
        const auditEvent: AuditEvent = {
            timestamp: new Date(),
            eventType: 'AUTHENTICATION',
            userId,
            action: 'LOGIN',
            status: success ? 'SUCCESS' : 'DENIED',
            details: this.sanitizeAuditDetails({
                partnerId,
                ...details
            })
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
// src/services/SecurityMonitoringService.ts

import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import { config } from '../config/config';
import { Redis } from 'ioredis';

export class SecurityMonitoringService {
    private static instance: SecurityMonitoringService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly redis: Redis;

    private readonly ALERT_THRESHOLDS = {
        FAILED_AUTH_LIMIT: 5,
        SUSPICIOUS_IP_LIMIT: 3,
        CLEARANCE_VIOLATION_LIMIT: 2,
        ALERT_WINDOW: 3600 // 1 hour
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.redis = new Redis(config.redis);
    }

    public static getInstance(): SecurityMonitoringService {
        if (!SecurityMonitoringService.instance) {
            SecurityMonitoringService.instance = new SecurityMonitoringService();
        }
        return SecurityMonitoringService.instance;
    }

    async recordSecurityEvent(
        eventType: string,
        details: {
            userId: string;
            ip?: string;
            partnerId?: string;
            resourceId?: string;
            clearance?: string;
            action?: string;
            status: 'success' | 'failure';
            reason?: string;
        }
    ): Promise<void> {
        try {
            // Record event
            const event = {
                ...details,
                timestamp: Date.now(),
                eventType
            };

            await this.redis.zadd(
                `security:events:${details.userId}`,
                event.timestamp,
                JSON.stringify(event)
            );

            // Check for alert conditions
            await this.checkAlertConditions(details.userId, eventType, details);

            // Update metrics
            await this.metrics.recordSecurityEvent(eventType, details);

        } catch (error) {
            this.logger.error('Error recording security event:', {
                error,
                eventType,
                details
            });
        }
    }

    private async checkAlertConditions(
        userId: string,
        eventType: string,
        details: any
    ): Promise<void> {
        const now = Date.now();
        const windowStart = now - (this.ALERT_THRESHOLDS.ALERT_WINDOW * 1000);

        // Get recent events
        const events = await this.redis.zrangebyscore(
            `security:events:${userId}`,
            windowStart,
            now
        );

        // Check for alert conditions
        if (eventType === 'authentication_failure') {
            await this.checkAuthenticationFailures(userId, events);
        }

        if (eventType === 'clearance_violation') {
            await this.checkClearanceViolations(userId, events);
        }

        if (details.ip) {
            await this.checkSuspiciousIP(details.ip, events);
        }
    }

    private async generateSecurityAlert(
        type: string,
        severity: 'low' | 'medium' | 'high',
        details: any
    ): Promise<void> {
        const alert = {
            type,
            severity,
            details,
            timestamp: new Date(),
            status: 'new'
        };

        await this.redis.lpush(
            'security:alerts',
            JSON.stringify(alert)
        );

        this.logger.warn('Security alert generated', { alert });
    }
}
// src/services/MetricsService.ts

import * as prometheus from 'prom-client';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import {
    MetricValue,
    HealthStatus,
    ClearanceLevel,
    UserAttributes
} from '../types';

/**
 * Service responsible for collecting, storing, and analyzing system metrics
 * in accordance with NATO operational requirements. Implements both real-time
 * and historical metric tracking with appropriate security classifications.
 */
export class MetricsService {
    private static instance: MetricsService;
    private readonly redis: Redis;
    private readonly logger: LoggerService;

    // Prometheus metrics collectors for real-time monitoring
    private readonly metrics: {
        httpRequestDuration: prometheus.Histogram;
        activeConnections: prometheus.Gauge;
        totalRequests: prometheus.Counter;
        errorResponses: prometheus.Counter;
        authenticationAttempts: prometheus.Counter;
        failedAuthentications: prometheus.Counter;
        documentAccesses: prometheus.Counter;
        documentModifications: prometheus.Counter;
        securityViolations: prometheus.Counter;
        accessDenials: prometheus.Counter;
        systemLoad: prometheus.Gauge;
        memoryUsage: prometheus.Gauge;
        partnerHealth: prometheus.Gauge;
        partnerResponseTime: prometheus.Histogram;
        databaseStatus: prometheus.Counter;
    };

    // Metric retention configuration for compliance
    private readonly METRIC_RETENTION = {
        REAL_TIME: 3600,      // 1 hour for real-time metrics
        HOURLY: 86400 * 7,    // 7 days for hourly aggregates
        DAILY: 86400 * 90,    // 90 days for daily aggregates
        MONTHLY: 86400 * 365  // 1 year for monthly aggregates
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.redis = new Redis({
            ...config.redis,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy: (times) => Math.min(times * 50, 2000)
        });
        this.metrics = this.initializeMetrics();
        this.initializeErrorHandling();
    }

    private initializeErrorHandling(): void {
        this.redis.on('error', (error) => {
            this.logger.error('Redis metrics connection error:', error);
        });
    }

    private initializeMetrics() {
        return {
            httpRequestDuration: new prometheus.Histogram({
                name: 'http_request_duration_seconds',
                help: 'Duration of HTTP requests in seconds',
                labelNames: ['method', 'path', 'status'],
                buckets: [0.1, 0.5, 1, 2, 5]
            }),
            activeConnections: new prometheus.Gauge({
                name: 'active_connections',
                help: 'Number of active connections'
            }),
            totalRequests: new prometheus.Counter({
                name: 'total_requests',
                help: 'Total number of HTTP requests',
                labelNames: ['method', 'path']
            }),
            errorResponses: new prometheus.Counter({
                name: 'error_responses_total',
                help: 'Total number of error responses',
                labelNames: ['status', 'path']
            }),
            databaseStatus: new prometheus.Counter({
                name: 'database_status',
                help: 'Database connection status',
                labelNames: ['status', 'timestamp']
            }),
            authenticationAttempts: new prometheus.Counter({
                name: 'authentication_attempts_total',
                help: 'Total number of authentication attempts',
                labelNames: ['partner', 'method']
            }),
            failedAuthentications: new prometheus.Counter({
                name: 'failed_authentications_total',
                help: 'Total number of failed authentications',
                labelNames: ['partner', 'reason']
            }),
            documentAccesses: new prometheus.Counter({
                name: 'document_accesses_total',
                help: 'Total number of document access attempts',
                labelNames: ['clearance_level', 'success']
            }),
            documentModifications: new prometheus.Counter({
                name: 'document_modifications_total',
                help: 'Total number of document modifications',
                labelNames: ['type', 'clearance_level']
            }),
            securityViolations: new prometheus.Counter({
                name: 'security_violations_total',
                help: 'Total number of security violations',
                labelNames: ['type', 'severity']
            }),
            accessDenials: new prometheus.Counter({
                name: 'access_denials_total',
                help: 'Total number of access denials',
                labelNames: ['clearance_level', 'reason']
            }),
            systemLoad: new prometheus.Gauge({
                name: 'system_load',
                help: 'System load average'
            }),
            memoryUsage: new prometheus.Gauge({
                name: 'memory_usage_bytes',
                help: 'Memory usage in bytes'
            }),
            partnerHealth: new prometheus.Gauge({
                name: 'partner_health_status',
                help: 'Partner health status (0=down, 1=degraded, 2=healthy)',
                labelNames: ['partner_id']
            }),
            partnerResponseTime: new prometheus.Histogram({
                name: 'partner_response_time_seconds',
                help: 'Partner response time in seconds',
                labelNames: ['partner_id', 'endpoint'],
                buckets: [0.1, 0.5, 1, 2, 5]
            })
        };
    }

    public static getInstance(): MetricsService {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService();
        }
        return MetricsService.instance;
    }

    /**
     * Records document access attempt with security context
     */
    public async recordDocumentAccess(
        clearance: ClearanceLevel,
        success: boolean,
        details?: Record<string, any>
    ): Promise<void> {
        try {
            this.metrics.documentAccesses.inc({
                clearance_level: clearance,
                success: success.toString()
            });

            const metricKey = `document_access:${Date.now()}`;
            await this.redis.setex(
                metricKey,
                this.METRIC_RETENTION.REAL_TIME,
                JSON.stringify({
                    clearance,
                    success,
                    timestamp: new Date(),
                    details
                })
            );
        } catch (error) {
            this.logger.error('Error recording document access metric:', error);
        }
    }

    /**
     * Records security-related operation metrics
     */
    public async recordOperationMetrics(
        operation: string,
        details: Record<string, any>
    ): Promise<void> {
        try {
            const metricKey = `operation:${operation}:${Date.now()}`;
            await this.redis.setex(
                metricKey,
                this.METRIC_RETENTION.HOURLY,
                JSON.stringify({
                    operation,
                    timestamp: new Date(),
                    ...details
                })
            );
        } catch (error) {
            this.logger.error('Error recording operation metric:', error);
        }
    }

    /**
     * Records operation errors with security context
     */
    public async recordOperationError(
        path: string,
        error: Error & { details?: any }
    ): Promise<void> {
        try {
            await this.recordMetric('operation_error', {
                path,
                error: error.message,
                details: error.details,
                timestamp: new Date()
            });

            this.metrics.errorResponses.inc({
                path,
                error_type: error.name
            });
        } catch (err) {
            this.logger.error('Error recording operation error:', err);
        }
    }

    /**
     * Records database connection status
     */
    public async recordDatabaseConnection(status: 'connected' | 'disconnected' | 'failed'): Promise<void> {
        try {
            this.metrics.databaseStatus.inc({
                status,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Error recording database connection:', error);
        }
    }

    /**
     * Records HTTP request metrics with security context
     */
    public recordHttpRequest(
        method: string,
        path: string,
        statusCode: number,
        duration: number
    ): void {
        try {
            this.metrics.httpRequestDuration.observe(
                { method, path, status: statusCode.toString() },
                duration / 1000
            );

            this.metrics.totalRequests.inc({ method, path });

            if (statusCode >= 400) {
                this.metrics.errorResponses.inc({
                    status: statusCode.toString(),
                    path
                });
            }
        } catch (error) {
            this.logger.error('Error recording HTTP request metric:', error);
        }
    }

    /**
     * Records metric with proper retention and security context
     */
    private async recordMetric(
        name: string,
        value: Record<string, any>
    ): Promise<void> {
        try {
            const key = `metric:${name}:${Date.now()}`;
            await this.redis.zadd(
                `metrics:${name}`,
                Date.now(),
                JSON.stringify(value)
            );
        } catch (error) {
            this.logger.error(`Error recording metric ${name}:`, error);
        }
    }

    public async recordSecurityEvent(
        eventType: string,
        details: Record<string, any>
    ): Promise<void> {
        try {
            const metricKey = `security_event:${eventType}:${Date.now()}`;
            await this.redis.setex(
                metricKey,
                this.METRIC_RETENTION.DAILY,
                JSON.stringify({
                    type: eventType,
                    timestamp: new Date(),
                    ...details
                })
            );

            if (details.violation) {
                this.metrics.securityViolations.inc({
                    type: eventType,
                    severity: details.severity || 'medium'
                });
            }
        } catch (error) {
            this.logger.error('Error recording security event:', error);
        }
    }

    public async getFailedAccessCount(
        userId: string,
        documentId: string,
        timeWindow: number
    ): Promise<number> {
        try {
            const now = Date.now();
            const cutoff = now - timeWindow * 1000;

            const key = `access_failures:${userId}:${documentId}`;
            return await this.redis.zcount(key, cutoff, now);
        } catch (error) {
            this.logger.error('Error getting failed access count:', error);
            return 0;
        }
    }

    public async resetMetrics(): Promise<void> {
        try {
            Object.values(this.metrics).forEach(metric => {
                if (typeof metric.reset === 'function') {
                    metric.reset();
                }
            });
            this.logger.info('Metrics reset successfully');
        } catch (error) {
            this.logger.error('Error resetting metrics:', error);
            throw error;
        }
    }

    public async getActiveConnections(): Promise<number> {
        try {
            const value = await this.metrics.activeConnections.get();
            return value.values.reduce((sum, v) => sum + v.value, 0);
        } catch (error) {
            this.logger.error('Error getting active connections:', error);
            return 0;
        }
    }

    public async calculateAverageResponseTime(): Promise<number> {
        try {
            const histogram = this.metrics.httpRequestDuration;
            const values = await histogram.get();
            const count = values.values.reduce((sum, v) => sum + v.value, 0);
            const sum = values.values.reduce((sum, v) => sum + (v.value * v.value), 0);
            return count > 0 ? sum / count : 0;
        } catch (error) {
            this.logger.error('Error calculating average response time:', error);
            return 0;
        }
    }
}

export default MetricsService.getInstance();
// src/services/MetricsService.ts

import * as prometheus from 'prom-client';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import {
    MetricValue,
    HealthStatus,
    ClearanceLevel,
    UserAttributes,
    MetricLabels
} from '../types';
import { Counter, Gauge, Histogram } from 'prom-client';
import { register } from 'prom-client';
import { HealthCheckResult } from './healthCheckService';

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

    // Authentication Metrics
    private readonly authAttempts: Counter;
    private readonly authFailures: Counter;
    private readonly authDuration: Histogram;

    // Policy Evaluation Metrics
    private readonly policyEvaluations: Counter;
    private readonly policyDuration: Histogram;
    private readonly policyFailures: Counter;

    // Partner-Specific Metrics
    private readonly partnerAccess: Counter;
    private readonly partnerDenials: Counter;
    private readonly activePartnerSessions: Gauge;

    // Classification Level Metrics
    private readonly classificationAccess: Counter;
    private readonly classificationDenials: Counter;

    // COI Metrics
    private readonly coiAccess: Counter;
    private readonly coiDenials: Counter;
    private readonly activeCoiUsers: Gauge;

    // LACV Metrics
    private readonly lacvChecks: Counter;
    private readonly lacvDenials: Counter;

    private readonly responseTime: Histogram;
    private readonly healthStatus: Gauge;
    private readonly lastCheckTime: Gauge;

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

        // Authentication Metrics
        this.authAttempts = new Counter({
            name: 'dive25_auth_attempts_total',
            help: 'Total number of authentication attempts',
            labelNames: ['partner_type', 'country']
        });

        this.authFailures = new Counter({
            name: 'dive25_auth_failures_total',
            help: 'Total number of authentication failures',
            labelNames: ['partner_type', 'country', 'reason']
        });

        this.authDuration = new Histogram({
            name: 'dive25_auth_duration_seconds',
            help: 'Authentication duration in seconds',
            labelNames: ['partner_type'],
            buckets: [0.1, 0.5, 1, 2, 5]
        });

        // Policy Evaluation Metrics
        this.policyEvaluations = new Counter({
            name: 'dive25_policy_evaluations_total',
            help: 'Total number of policy evaluations',
            labelNames: ['policy', 'partner_type', 'result']
        });

        this.policyDuration = new Histogram({
            name: 'dive25_policy_duration_seconds',
            help: 'Policy evaluation duration in seconds',
            labelNames: ['policy'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1]
        });

        this.policyFailures = new Counter({
            name: 'dive25_policy_failures_total',
            help: 'Total number of policy evaluation failures',
            labelNames: ['policy', 'reason']
        });

        // Partner Metrics
        this.partnerAccess = new Counter({
            name: 'dive25_partner_access_total',
            help: 'Total number of partner access attempts',
            labelNames: ['partner_type', 'country', 'classification']
        });

        this.partnerDenials = new Counter({
            name: 'dive25_partner_denials_total',
            help: 'Total number of partner access denials',
            labelNames: ['partner_type', 'country', 'reason']
        });

        this.activePartnerSessions = new Gauge({
            name: 'dive25_active_partner_sessions',
            help: 'Current number of active partner sessions',
            labelNames: ['partner_type', 'country']
        });

        // Classification Metrics
        this.classificationAccess = new Counter({
            name: 'dive25_classification_access_total',
            help: 'Total number of classification level accesses',
            labelNames: ['level', 'partner_type']
        });

        this.classificationDenials = new Counter({
            name: 'dive25_classification_denials_total',
            help: 'Total number of classification level denials',
            labelNames: ['requested_level', 'user_level', 'partner_type']
        });

        // COI Metrics
        this.coiAccess = new Counter({
            name: 'dive25_coi_access_total',
            help: 'Total number of COI access attempts',
            labelNames: ['coi_id', 'partner_type']
        });

        this.coiDenials = new Counter({
            name: 'dive25_coi_denials_total',
            help: 'Total number of COI access denials',
            labelNames: ['coi_id', 'partner_type', 'reason']
        });

        this.activeCoiUsers = new Gauge({
            name: 'dive25_active_coi_users',
            help: 'Current number of active users per COI',
            labelNames: ['coi_id', 'partner_type']
        });

        // LACV Metrics
        this.lacvChecks = new Counter({
            name: 'dive25_lacv_checks_total',
            help: 'Total number of LACV code checks',
            labelNames: ['code', 'partner_type']
        });

        this.lacvDenials = new Counter({
            name: 'dive25_lacv_denials_total',
            help: 'Total number of LACV code denials',
            labelNames: ['code', 'partner_type', 'reason']
        });

        // New metrics
        this.responseTime = new Histogram({
            name: 'partner_response_time_seconds',
            help: 'Response time of partner endpoints in seconds',
            labelNames: ['partner_id', 'partner_name'],
            buckets: [0.1, 0.3, 0.5, 0.7, 1, 2, 5]
        });

        this.healthStatus = new Gauge({
            name: 'partner_health_status',
            help: 'Current health status of partner (0=down, 1=degraded, 2=healthy)',
            labelNames: ['partner_id', 'partner_name']
        });

        this.lastCheckTime = new Gauge({
            name: 'partner_last_check_timestamp',
            help: 'Timestamp of last health check',
            labelNames: ['partner_id', 'partner_name']
        });
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

    public recordAuthAttempt(partnerType: string, country: string): void {
        this.authAttempts.inc({ partner_type: partnerType, country });
    }

    public recordAuthFailure(partnerType: string, country: string, reason: string): void {
        this.authFailures.inc({ partner_type: partnerType, country, reason });
    }

    public recordPolicyDecision(labels: {
        policy: string;
        partnerType: string;
        result: boolean;
        classification?: string;
        coiId?: string;
        lacvCode?: string;
    }): void {
        this.policyEvaluations.inc({
            policy: labels.policy,
            partner_type: labels.partnerType,
            result: labels.result ? 'allow' : 'deny'
        });

        if (labels.classification) {
            this.classificationAccess.inc({
                level: labels.classification,
                partner_type: labels.partnerType
            });
        }

        if (labels.coiId) {
            this.coiAccess.inc({
                coi_id: labels.coiId,
                partner_type: labels.partnerType
            });
        }

        if (labels.lacvCode) {
            this.lacvChecks.inc({
                code: labels.lacvCode,
                partner_type: labels.partnerType
            });
        }
    }

    public updateActivePartnerSessions(partnerType: string, country: string, count: number): void {
        this.activePartnerSessions.set({ partner_type: partnerType, country }, count);
    }

    recordHealthCheck(partnerId: string, result: HealthCheckResult) {
        const statusValue =
            result.status === 'healthy' ? 2 :
                result.status === 'degraded' ? 1 : 0;

        this.responseTime.observe(
            { partner_id: partnerId },
            result.responseTime / 1000
        );

        this.healthStatus.set(
            { partner_id: partnerId },
            statusValue
        );

        this.lastCheckTime.set(
            { partner_id: partnerId },
            result.lastChecked.getTime() / 1000
        );
    }

    async getMetrics(): Promise<string> {
        return register.metrics();
    }
}

export default MetricsService.getInstance();
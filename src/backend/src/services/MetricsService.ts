import * as prometheus from 'prom-client';
import { Redis } from 'ioredis';
import { LoggerService } from './LoggerService';
import { config } from '../config/config';
import { MetricValue, HealthStatus, ClearanceLevel, AuthError } from '../types';

/**
 * Service responsible for collecting, storing, and analyzing system metrics
 * in accordance with NATO operational requirements. Implements both real-time
 * and historical metric tracking with appropriate security classifications.
 */
export class MetricsService {
    private static instance: MetricsService;
    private readonly logger: LoggerService;
    private readonly redis: Redis;

    // Prometheus metrics collectors
    private readonly metrics: {
        // HTTP and API metrics
        httpRequestDuration: prometheus.Histogram;
        activeConnections: prometheus.Gauge;
        totalRequests: prometheus.Counter;
        errorResponses: prometheus.Counter;

        // Authentication metrics
        authenticationAttempts: prometheus.Counter;
        failedAuthentications: prometheus.Counter;

        // Document access metrics
        documentAccesses: prometheus.Counter;
        documentModifications: prometheus.Counter;

        // Security metrics
        securityViolations: prometheus.Counter;
        accessDenials: prometheus.Counter;

        // System metrics
        systemLoad: prometheus.Gauge;
        memoryUsage: prometheus.Gauge;
        
        // Partner metrics
        partnerHealth: prometheus.Gauge;
        partnerResponseTime: prometheus.Histogram;

        // Database connection metrics
        databaseStatus: prometheus.Counter;

        // Route error metrics
        routeErrors: prometheus.Counter;
    };

    // Metric retention configuration
    private readonly METRIC_RETENTION = {
        REAL_TIME: 3600,      // 1 hour for real-time metrics
        HOURLY: 86400 * 7,    // 7 days for hourly aggregates
        DAILY: 86400 * 90,    // 90 days for daily aggregates
        MONTHLY: 86400 * 365  // 1 year for monthly aggregates
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.redis = new Redis(config.redis);
        this.metrics = this.initializeMetrics();
        this.registerCustomMetrics();
    }

    public static getInstance(): MetricsService {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService();
        }
        return MetricsService.instance;
    }

    /**
     * Initialize Prometheus metrics collectors with appropriate labels
     * and configuration for NATO operational requirements.
     */
    private initializeMetrics() {
        return {
            httpRequestDuration: new prometheus.Histogram({
                name: 'http_request_duration_seconds',
                help: 'Duration of HTTP requests in seconds',
                labelNames: ['method', 'path', 'status'],
                buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
            }),

            activeConnections: new prometheus.Gauge({
                name: 'active_connections',
                help: 'Number of active connections',
                labelNames: ['type']
            }),

            totalRequests: new prometheus.Counter({
                name: 'total_requests',
                help: 'Total number of HTTP requests',
                labelNames: ['method', 'path']
            }),

            errorResponses: new prometheus.Counter({
                name: 'error_responses_total',
                help: 'Total number of error responses',
                labelNames: ['status', 'code']
            }),

            authenticationAttempts: new prometheus.Counter({
                name: 'authentication_attempts_total',
                help: 'Total number of authentication attempts',
                labelNames: ['success', 'method']
            }),

            failedAuthentications: new prometheus.Counter({
                name: 'failed_authentications_total',
                help: 'Total number of failed authentications',
                labelNames: ['reason']
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
                labelNames: ['reason']
            }),

            systemLoad: new prometheus.Gauge({
                name: 'system_load',
                help: 'System load average',
                labelNames: ['interval']
            }),

            memoryUsage: new prometheus.Gauge({
                name: 'memory_usage_bytes',
                help: 'Memory usage in bytes',
                labelNames: ['type']
            }),

            partnerHealth: new prometheus.Gauge({
                name: 'partner_health_status',
                help: 'Federation partner health status',
                labelNames: ['partner_id', 'status']
            }),

            partnerResponseTime: new prometheus.Histogram({
                name: 'partner_response_time_seconds',
                help: 'Federation partner response time',
                labelNames: ['partner_id', 'operation'],
                buckets: [0.1, 0.5, 1, 2, 5]
            }),

            databaseStatus: new prometheus.Counter({
                name: 'database_connection_status',
                help: 'Database connection status',
                labelNames: ['status', 'timestamp']
            }),

            routeErrors: new prometheus.Counter({
                name: 'route_errors_total',
                help: 'Total number of route errors',
                labelNames: ['path', 'errorType', 'statusCode']
            })
        };
    }

    /**
     * Register custom metrics collectors for NATO-specific requirements
     */
    private registerCustomMetrics(): void {
        // Register default metrics
        prometheus.collectDefaultMetrics();

        // Custom metric collectors can be added here
        this.registerSecurityMetrics();
        this.registerPerformanceMetrics();
        this.registerFederationMetrics();
    }

    /**
     * Records HTTP request metrics including duration and status
     */
    public recordHttpRequest(method: string, path: string, statusCode: number, duration: number): void {
        try {
            this.metrics.httpRequestDuration.observe(
                { method, path, status: statusCode.toString() },
                duration / 1000
            );
            this.metrics.totalRequests.inc({ method, path });
            if (statusCode >= 400) {
                this.metrics.errorResponses.inc({ status: statusCode.toString() });
            }
        } catch (error) {
            this.logger.error('Error recording HTTP metrics:', error);
        }
    }

    /**
     * Records authentication attempts and their outcomes
     */
    public recordAuthentication(
        success: boolean,
        method: string,
        details?: Record<string, any>
    ): void {
        try {
            this.metrics.authenticationAttempts.inc({
                success: success.toString(),
                method
            });

            if (!success) {
                this.metrics.failedAuthentications.inc({
                    reason: details?.reason || 'unknown'
                });
            }

            // Store historical data
            this.storeHistoricalMetric('authentication', {
                success,
                method,
                timestamp: new Date(),
                details
            });

        } catch (error) {
            this.logger.error('Error recording authentication metrics:', error);
        }
    }

    /**
     * Records document access attempts and their outcomes
     */
    public recordDocumentAccess(
        clearanceLevel: string,
        success: boolean,
        details?: Record<string, any>
    ): void {
        try {
            this.metrics.documentAccesses.inc({
                clearance_level: clearanceLevel,
                success: success.toString()
            });

            if (!success) {
                this.metrics.accessDenials.inc({
                    reason: details?.reason || 'unknown'
                });
            }

            // Store historical data
            this.storeHistoricalMetric('document_access', {
                clearanceLevel,
                success,
                timestamp: new Date(),
                details
            });

        } catch (error) {
            this.logger.error('Error recording document access metrics:', error);
        }
    }

    /**
     * Records partner-specific metrics
     */
    public async recordPartnerMetric(
        partnerId: string,
        metricName: string,
        value: number,
        labels?: Record<string, string>
    ): Promise<void> {
        try {
            const metricKey = `partner:${partnerId}:${metricName}`;
            const timestamp = Date.now();

            // Store current value
            await this.redis.zadd(metricKey, timestamp, JSON.stringify({
                value,
                timestamp,
                labels
            }));

            // Update Prometheus metric if applicable
            this.metrics.partnerHealth.remove({ partner_id: partnerId });
            this.metrics.partnerHealth.set(
                { partner_id: partnerId, ...labels },
                value
            );

            // Cleanup old metrics
            await this.redis.zremrangebyscore(
                metricKey,
                0,
                timestamp - this.METRIC_RETENTION.REAL_TIME
            );

        } catch (error) {
            this.logger.error('Error recording partner metric:', error);
        }
    }

    /**
     * Retrieves metrics for a specific time range
     */
    public async getMetrics(
        startTime: Date,
        endTime: Date,
        filter?: {
            types?: string[];
            labels?: Record<string, string>;
        }
    ): Promise<MetricValue[]> {
        try {
            const metrics: MetricValue[] = [];
            const metricKeys = await this.redis.keys('metric:*');

            for (const key of metricKeys) {
                if (filter?.types && !filter.types.some(type => key.includes(type))) {
                    continue;
                }

                const values = await this.redis.zrangebyscore(
                    key,
                    startTime.getTime(),
                    endTime.getTime()
                );

                for (const value of values) {
                    const metric = JSON.parse(value);
                    if (this.matchesLabels(metric.labels, filter?.labels)) {
                        metrics.push(metric);
                    }
                }
            }

            return metrics;

        } catch (error) {
            this.logger.error('Error retrieving metrics:', error);
            throw error;
        }
    }

    /**
     * Retrieves the current health status of the system
     */
    public async getHealthStatus(): Promise<HealthStatus> {
        try {
            const [
                errorRate,
                responseTime,
                failedAuths
            ] = await Promise.all([
                this.calculateErrorRate(),
                this.calculateAverageResponseTime(),
                this.getFailedAuthentications('NATO')
            ]);

            // Determine health status based on thresholds
            const status = this.determineHealthStatus(
                errorRate,
                responseTime,
                failedAuths
            );

            return {
                status,
                lastChecked: new Date(),
                details: {
                    responseTime,
                    errorRate,
                    availability: 1 - errorRate
                }
            };

        } catch (error) {
            this.logger.error('Error getting health status:', error);
            throw error;
        }
    }

    /**
     * Resets metrics for system maintenance or recovery
     */
    public async resetMetrics(): Promise<void> {
        try {
            // Reset Prometheus metrics
            Object.values(this.metrics).forEach(metric => {
                if ('reset' in metric) {
                    metric.reset();
                }
            });

            // Reset Redis metrics
            const metricKeys = await this.redis.keys('metric:*');
            if (metricKeys.length > 0) {
                await this.redis.del(...metricKeys);
            }

            this.logger.info('Metrics reset successfully');

        } catch (error) {
            this.logger.error('Error resetting metrics:', error);
            throw error;
        }
    }

    // Add to src/services/MetricsService.ts

public recordRouteError(path: string, error: Error): void {
    try {
        this.metrics.errorResponses.inc({
            path,
            error_type: error.name,
            code: (error as AuthError).code || 'UNKNOWN'
        });

        // Store error details in Redis for analysis
        const errorKey = `error:${Date.now()}:${path}`;
        const errorData = {
            path,
            error: error.message,
            stack: error.stack,
            timestamp: new Date()
        };

        this.redis.setex(
            errorKey,
            this.METRIC_RETENTION.REAL_TIME,
            JSON.stringify(errorData)
        );

    } catch (err) {
        this.logger.error('Error recording route error:', err);
    }
}

    // Private helper methods

    private async storeHistoricalMetric(
        type: string,
        data: Record<string, any>
    ): Promise<void> {
        const timestamp = Date.now();
        const metricKey = `metric:${type}`;

        await this.redis.zadd(
            metricKey,
            timestamp,
            JSON.stringify({ ...data, timestamp })
        );

        // Aggregate historical data
        await this.aggregateMetrics(type, timestamp);
    }

    private async aggregateMetrics(
        type: string,
        timestamp: number
    ): Promise<void> {
        // Implement metric aggregation logic here
        // This would handle hourly, daily, and monthly aggregates
    }

    private matchesLabels(
        metricLabels?: Record<string, string>,
        filterLabels?: Record<string, string>
    ): boolean {
        if (!filterLabels || !metricLabels) {
            return true;
        }

        return Object.entries(filterLabels).every(
            ([key, value]) => metricLabels[key] === value
        );
    }

    private async calculateErrorRate(): Promise<number> {
        // Implementation for error rate calculation
        return 0;
    }

    public async calculateAverageResponseTime(): Promise<number> {
        try {
            const histogram = await this.metrics.httpRequestDuration.get();
            return Promise.resolve(
                histogram.values.reduce((sum, value) => sum + value.value, 0) / histogram.values.length
            );
        } catch (error) {
            this.logger.error('Error calculating average response time:', error);
            return Promise.resolve(0);
        }
    }

    public getFailedAuthentications(scope: string): Promise<number> {
        try {
            return this.metrics.failedAuthentications
                .get()
                .then(metric => metric.values
                    .filter(v => v.labels.reason === scope)
                    .reduce((sum, value) => sum + value.value, 0)
                );
        } catch (error) {
            this.logger.error('Error getting failed authentications:', error);
            return Promise.resolve(0);
        }
    }

    private determineHealthStatus(
        errorRate: number,
        responseTime: number,
        failedAuths: number
    ): HealthStatus['status'] {
        // Implement health status determination logic
        return 'healthy';
    }

    private registerSecurityMetrics(): void {
        // Implementation for security-specific metrics
    }

    private registerPerformanceMetrics(): void {
        // Implementation for performance-specific metrics
    }

    private registerFederationMetrics(): void {
        // Implementation for federation-specific metrics
    }

    public recordDocumentStorage(clearance: string, size: number): void {
        try {
            this.metrics.documentModifications.inc({
                type: 'storage',
                clearance_level: clearance
            });

            // Store historical data
            this.storeHistoricalMetric('document_storage', {
                clearance,
                size,
                timestamp: new Date()
            });
        } catch (error) {
            this.logger.error('Error recording document storage metrics:', error);
        }
    }

    public recordDocumentRetrieval(clearance: ClearanceLevel): void {
        try {
            this.metrics.documentAccesses.inc({
                clearance_level: clearance,
                success: 'true'
            });
        } catch (error) {
            this.logger.error('Error recording document retrieval:', error);
        }
    }

    public recordDocumentOperation(operation: string, options?: Record<string, any>): void {
        try {
            this.metrics.documentAccesses.inc({
                operation_type: operation,
                success: 'true',
                ...options
            });
        } catch (error) {
            this.logger.error('Error recording document operation:', error);
        }
    }

    public recordDatabaseConnection(status: 'connected' | 'disconnected' | 'failed'): void {
        try {
            this.metrics.databaseStatus.inc({
                status,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Error recording database connection:', error);
        }
    }

    public async recordSystemMetric(name: string, value: number): Promise<void> {
        try {
            if (this.metrics[name as keyof typeof this.metrics] instanceof prometheus.Gauge) {
                (this.metrics[name as keyof typeof this.metrics] as prometheus.Gauge).set(value);
            } else {
                this.logger.error(`Metric ${name} is not a Gauge`);
            }
        } catch (error) {
            this.logger.error(`Error recording system metric ${name}:`, error);
        }
    }

    public getActiveConnections(): Promise<number> {
        try {
            return this.metrics.totalRequests
                .get()
                .then(metric => metric.values.reduce((sum, value) => sum + value.value, 0));
        } catch (error) {
            this.logger.error('Error getting active connections:', error);
            return Promise.resolve(0);
        }
    }

    public getAccessViolations(scope: string): Promise<number> {
        try {
            return Promise.resolve(
                this.metrics.errorResponses
                    .get()
                    .then(metric => metric.values
                        .filter(v => v.labels.status === '403' && v.labels.scope === scope)
                        .reduce((sum, value) => sum + value.value, 0)
                    )
            );
        } catch (error) {
            this.logger.error('Error getting access violations:', error);
            return Promise.resolve(0);
        }
    }

    public recordRouteError(path: string, error: Error): void {
        try {
            this.metrics.routeErrors.inc({
                path,
                errorType: error.name,
                statusCode: (error as any).statusCode || 500
            });
        } catch (err) {
            this.logger.error('Error recording route error metric:', err);
        }
    }
}

export default MetricsService;
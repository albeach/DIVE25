// src/services/MetricsService.ts
import * as prometheus from 'prom-client';
import { LoggerService } from './LoggerService';

export class MetricsService {
    private static instance: MetricsService;
    private readonly logger: LoggerService;
    private readonly metrics: {
        httpRequestDuration: prometheus.Histogram;
        activeConnections: prometheus.Gauge;
        totalRequests: prometheus.Counter;
        errorResponses: prometheus.Counter;
        authenticationAttempts: prometheus.Counter;
        documentAccesses: prometheus.Counter;
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = this.initializeMetrics();
        this.registerCustomMetrics();
    }

    public static getInstance(): MetricsService {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService();
        }
        return MetricsService.instance;
    }

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
                labelNames: ['status', 'error_code']
            }),

            authenticationAttempts: new prometheus.Counter({
                name: 'authentication_attempts_total',
                help: 'Total number of authentication attempts',
                labelNames: ['success']
            }),

            documentAccesses: new prometheus.Counter({
                name: 'document_accesses_total',
                help: 'Total number of document access attempts',
                labelNames: ['clearance_level', 'success']
            })
        };
    }

    private registerCustomMetrics(): void {
        // Register default metrics
        prometheus.collectDefaultMetrics();
    }

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

            this.metrics.totalRequests.inc({
                method,
                path
            });

            if (statusCode >= 400) {
                this.metrics.errorResponses.inc({
                    status: statusCode.toString(),
                    error_code: 'HTTP_ERROR'
                });
            }
        } catch (error) {
            this.logger.error('Error recording HTTP metrics:', error);
        }
    }

    public recordAuthentication(success: boolean): void {
        try {
            this.metrics.authenticationAttempts.inc({
                success: success.toString()
            });
        } catch (error) {
            this.logger.error('Error recording authentication metrics:', error);
        }
    }

    public recordDocumentAccess(
        clearanceLevel: string,
        success: boolean
    ): void {
        try {
            this.metrics.documentAccesses.inc({
                clearance_level: clearanceLevel,
                success: success.toString()
            });
        } catch (error) {
            this.logger.error('Error recording document access metrics:', error);
        }
    }

    public incrementActiveConnections(): void {
        try {
            this.metrics.activeConnections.inc();
        } catch (error) {
            this.logger.error('Error incrementing active connections:', error);
        }
    }

    public decrementActiveConnections(): void {
        try {
            this.metrics.activeConnections.dec();
        } catch (error) {
            this.logger.error('Error decrementing active connections:', error);
        }
    }

    public getMetrics(): Promise<string> {
        return prometheus.register.metrics();
    }

    public resetMetrics(): void {
        try {
            Object.values(this.metrics).forEach(metric => {
                if ('reset' in metric) {
                    metric.reset();
                }
            });
            this.logger.info('Metrics reset successfully');
        } catch (error) {
            this.logger.error('Error resetting metrics:', error);
        }
    }

    public getMetricValue(name: string): number | undefined {
        try {
            const metric = this.metrics[name as keyof typeof this.metrics];
            if (!metric) {
                throw new Error(`Metric ${name} not found`);
            }

            if ('get' in metric) {
                return metric.get().values[0].value;
            }
            return undefined;
        } catch (error) {
            this.logger.error('Error getting metric value:', error);
            return undefined;
        }
    }
}

export default MetricsService;
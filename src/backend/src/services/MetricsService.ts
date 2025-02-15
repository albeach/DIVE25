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

    private readonly SECURITY_METRICS = {
        clearanceViolations: new prometheus.Counter({
            name: 'security_clearance_violations_total',
            help: 'Total number of clearance level access violations'
        }),
        
        coiAccessAttempts: new prometheus.Counter({
            name: 'coi_access_attempts_total',
            help: 'Total number of COI-restricted access attempts',
            labelNames: ['coi', 'success']
        }),
    
        documentModifications: new prometheus.Counter({
            name: 'document_modifications_total',
            help: 'Total number of document modifications',
            labelNames: ['classification', 'operation']
        })
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.redis = new Redis(config.redis);
        this.metrics = this.initializeMetrics();
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
            // Update Prometheus metrics
            this.metrics.documentAccesses.inc({
                clearance_level: clearance,
                success: success.toString()
            });

            // Store detailed access record
            await this.recordMetric('document_access', {
                clearance,
                success,
                timestamp: new Date(),
                details
            });

            if (!success) {
                this.metrics.accessDenials.inc({
                    clearance_level: clearance
                });
            }
        } catch (error) {
            this.logger.error('Error recording document access:', error);
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
            await this.recordMetric(`operation_${operation}`, {
                ...details,
                timestamp: new Date()
            });
        } catch (error) {
            this.logger.error(`Error recording operation metrics for ${operation}:`, error);
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
                    status: statusCode.toString() 
                });
            }
        } catch (error) {
            this.logger.error('Error recording HTTP metrics:', error);
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
    /**
     * Initializes Prometheus metrics collectors
     */

    public async recordSecurityEvent(
        eventType: 'clearance_violation' | 'coi_access' | 'document_modification',
        details: {
            clearance?: ClearanceLevel;
            coi?: string;
            operation?: string;
            success?: boolean;
        }
    ): Promise<void> {
        try {
            switch (eventType) {
                case 'clearance_violation':
                    this.SECURITY_METRICS.clearanceViolations.inc();
                    break;
                case 'coi_access':
                    if (details.coi) {
                        this.SECURITY_METRICS.coiAccessAttempts.inc({
                            coi: details.coi,
                            success: details.success?.toString() || 'false'
                        });
                    }
                    break;
                case 'document_modification':
                    if (details.clearance && details.operation) {
                        this.SECURITY_METRICS.documentModifications.inc({
                            classification: details.clearance,
                            operation: details.operation
                        });
                    }
                    break;
            }
    
            // Record to persistent storage for historical analysis
            await this.recordMetric(`security_${eventType}`, {
                ...details,
                timestamp: new Date()
            });
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

    private initializeMetrics(): typeof MetricsService.prototype.metrics {
        // Implementation of metrics initialization...
        // (I can provide this if needed)
        return {} as any; // Placeholder
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
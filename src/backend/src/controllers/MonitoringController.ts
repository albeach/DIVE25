import { Response } from 'express';
import { FederationMonitoringService } from '../services/FederationMonitoringService';
import { MetricsService } from '../services/MetricsService';
import { LoggerService } from '../services/LoggerService';
import { DatabaseService } from '../services/DatabaseService';
import {
    AuthenticatedRequest,
    AuthError,
    PartnerMetrics,
    HealthStatus,
    ApiResponse
} from '../types';
import { asAuthError } from '../utils/errorUtils';
import { config } from '../config/config';

/**
 * Controller responsible for system monitoring, metrics collection,
 * and health status reporting in accordance with NATO operational requirements.
 */
export class MonitoringController {
    private static instance: MonitoringController;
    private readonly monitoringService: FederationMonitoringService;
    private readonly metricsService: MetricsService;
    private readonly logger: LoggerService;
    private readonly db: DatabaseService;

    // Alert thresholds for system monitoring
    private readonly ALERT_THRESHOLDS = {
        ERROR_RATE: 0.05, // 5% error rate threshold
        RESPONSE_TIME: 5000, // 5 seconds
        SESSION_COUNT_DROP: 0.25, // 25% drop in active sessions
        FAILED_AUTH_THRESHOLD: 10 // Number of failed authentications before alert
    };

    private constructor() {
        this.monitoringService = FederationMonitoringService.getInstance();
        this.metricsService = MetricsService.getInstance();
        this.logger = LoggerService.getInstance();
        this.db = DatabaseService.getInstance();
    }

    public static getInstance(): MonitoringController {
        if (!MonitoringController.instance) {
            MonitoringController.instance = new MonitoringController();
        }
        return MonitoringController.instance;
    }

    /**
     * Retrieves comprehensive metrics for a specific federation partner.
     * Includes authentication, performance, and security metrics.
     */
    public async getPartnerMetrics(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        
        try {
            const { partnerId } = req.params;
            this.validatePartnerId(partnerId);

            // Gather metrics from various sources
            const [metrics, healthStatus, securityMetrics] = await Promise.all([
                this.monitoringService.getPartnerMetrics(partnerId),
                this.monitoringService.getPartnerHealth(partnerId),
                this.collectSecurityMetrics(partnerId)
            ]);

            // Record monitoring access
            this.metricsService.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - startTime
            );

            // Record specific partner metrics
            await this.recordPartnerMetrics(partnerId, metrics);

            // Log the monitoring request
            this.logger.info('Partner metrics accessed', {
                userId: req.userAttributes.uniqueIdentifier,
                partnerId,
                duration: Date.now() - startTime
            });

            const response: ApiResponse<PartnerMetrics & { health: HealthStatus }> = {
                success: true,
                data: {
                    ...metrics,
                    health: healthStatus
                },
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id'] as string
                }
            };

            res.json(response);

        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error fetching partner metrics', {
                error: monitoringError,
                partnerId: req.params.partnerId,
                userId: req.userAttributes.uniqueIdentifier
            });

            const response: ApiResponse<null> = {
                success: false,
                error: {
                    code: monitoringError.code || 'MON001',
                    message: monitoringError.message || 'Failed to fetch partner metrics',
                    details: monitoringError.details
                }
            };

            res.status(monitoringError.statusCode || 500).json(response);
        }
    }

    /**
     * Retrieves current system health alerts and security warnings.
     * Filters alerts based on user's clearance level.
     */
    public async getHealthAlerts(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        const startTime = Date.now();

        try {
            const alerts = await this.monitoringService.getHealthAlerts();

            // Filter alerts based on user's clearance
            const filteredAlerts = this.filterAlertsByClearance(
                alerts,
                req.userAttributes.clearance
            );

            // Record metric access
            this.metricsService.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - startTime
            );

            // Record alert metrics
            await this.metricsService.recordOperationMetrics('system_alerts', {
                count: filteredAlerts.length
            });

            const response: ApiResponse<typeof filteredAlerts> = {
                success: true,
                data: filteredAlerts,
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id'] as string
                }
            };

            res.json(response);

        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error fetching health alerts', {
                error: monitoringError,
                userId: req.userAttributes.uniqueIdentifier
            });

            const response: ApiResponse<null> = {
                success: false,
                error: {
                    code: monitoringError.code || 'MON002',
                    message: monitoringError.message || 'Failed to fetch health alerts',
                    details: monitoringError.details
                }
            };

            res.status(monitoringError.statusCode || 500).json(response);
        }
    }

    /**
     * Retrieves system-wide metrics including performance, security, and operational data.
     * Metrics are aggregated and formatted according to NATO standards.
     */
    public async getSystemMetrics(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        const startTime = Date.now();

        try {
            // Collect metrics from various subsystems
            const [
                performanceMetrics,
                securityMetrics,
                federationMetrics
            ] = await Promise.all([
                this.collectPerformanceMetrics(),
                this.collectSecurityMetrics('system'),
                this.collectFederationMetrics()
            ]);

            // Aggregate metrics
            const aggregatedMetrics = {
                performance: performanceMetrics,
                security: securityMetrics,
                federation: federationMetrics,
                timestamp: new Date(),
                environment: config.env
            };

            // Record metric access
            this.metricsService.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - startTime
            );

            const response: ApiResponse<typeof aggregatedMetrics> = {
                success: true,
                data: aggregatedMetrics,
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id'] as string
                }
            };

            res.json(response);

        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error fetching system metrics', {
                error: monitoringError,
                userId: req.userAttributes.uniqueIdentifier
            });

            const response: ApiResponse<null> = {
                success: false,
                error: {
                    code: monitoringError.code || 'MON003',
                    message: monitoringError.message || 'Failed to fetch system metrics',
                    details: monitoringError.details
                }
            };

            res.status(monitoringError.statusCode || 500).json(response);
        }
    }

    /**
     * Resets metrics for a specific partner or the entire system.
     * Requires elevated privileges and logs the action for audit purposes.
     */
    public async resetMetrics(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        const startTime = Date.now();

        try {
            const { partnerId } = req.params;
            
            // Validate authorization for metric reset
            await this.validateMetricResetAuthorization(
                req.userAttributes,
                partnerId
            );

            // Reset metrics
            await this.monitoringService.clearMetrics(partnerId);
            await this.metricsService.resetMetrics();

            // Log the reset action
            this.logger.info('Metrics reset', {
                userId: req.userAttributes.uniqueIdentifier,
                partnerId,
                timestamp: new Date()
            });

            const response: ApiResponse<{ message: string }> = {
                success: true,
                data: { message: 'Metrics reset successfully' },
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id'] as string
                }
            };

            res.json(response);

        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error resetting metrics', {
                error: monitoringError,
                partnerId: req.params.partnerId,
                userId: req.userAttributes.uniqueIdentifier
            });

            const response: ApiResponse<null> = {
                success: false,
                error: {
                    code: monitoringError.code || 'MON004',
                    message: monitoringError.message || 'Failed to reset metrics',
                    details: monitoringError.details
                }
            };

            res.status(monitoringError.statusCode || 500).json(response);
        }
    }

    // Private helper methods

    private async collectPerformanceMetrics() {
        return {
            responseTime: await this.metricsService.calculateAverageResponseTime(),
            activeConnections: await this.metricsService.getActiveConnections(),
            systemLoad: await this.getSystemLoad(),
            memoryUsage: await this.getMemoryUsage()
        };
    }

    private async collectSecurityMetrics(scope: string) {
        return {
            failedAuthentications: await this.metricsService.getFailedAccessCount(scope, 'authentication', Date.now()),
            accessViolations: await this.metricsService.getFailedAccessCount(scope, 'access_violation', Date.now()),
            activeAlerts: await this.monitoringService.getActiveAlertCount(scope)
        };
    }

    private async collectFederationMetrics() {
        return {
            activePartners: await this.monitoringService.getActivePartners(),
            totalSessions: await this.monitoringService.getTotalSessions(),
            federationHealth: await this.monitoringService.getFederationHealthStatus()
        };
    }

    private validatePartnerId(partnerId: string): void {
        if (!partnerId || typeof partnerId !== 'string') {
            throw this.createError('Invalid partner ID', 400, 'MON005');
        }
    }

    private async validateMetricResetAuthorization(
        userAttributes: AuthenticatedRequest['userAttributes'],
        partnerId: string
    ): Promise<void> {
        const hasPermission = await this.monitoringService.checkResetPermission(
            userAttributes,
            partnerId
        );

        if (!hasPermission) {
            throw this.createError(
                'Insufficient permissions to reset metrics',
                403,
                'MON006'
            );
        }
    }

    private filterAlertsByClearance(alerts: any[], clearance: string) {
        return alerts.filter(alert => 
            this.hasAdequateClearance(clearance, alert.minimumClearance)
        );
    }

    private createError(
        message: string,
        statusCode: number,
        code: string,
        details?: Record<string, unknown>
    ): AuthError {
        const error = new Error(message) as AuthError;
        error.statusCode = statusCode;
        error.code = code;
        if (details) {
            error.details = details;
        }
        return error;
    }

    private async recordPartnerMetrics(
        partnerId: string,
        metrics: PartnerMetrics
    ): Promise<void> {
        const metricsToRecord = [
            ['active_sessions', metrics.totalSessions],
            ['authentication_attempts', metrics.authenticationAttempts],
            ['failed_authentications', metrics.failedAuthentications],
            ['average_response_time', metrics.averageResponseTime]
        ];

        await Promise.all(
            metricsToRecord.map(([name, value]) =>
                this.metricsService.recordOperationMetrics(name as string, { 
                    value: value as number,
                    partnerId 
                })
            )
        );
    }

    private hasAdequateClearance(
        userClearance: string,
        requiredClearance: string
    ): boolean {
        const clearanceLevels: Record<string, number> = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 1,
            'NATO CONFIDENTIAL': 2,
            'NATO SECRET': 3,
            'COSMIC TOP SECRET': 4
        };

        return (clearanceLevels[userClearance] || 0) >= 
               (clearanceLevels[requiredClearance] || 0);
    }

    private async getSystemLoad(): Promise<number> {
        // Implementation would depend on your system monitoring setup
        return 0;
    }

    private async getMemoryUsage(): Promise<{
        total: number;
        used: number;
        free: number;
    }> {
        // Implementation would depend on your system monitoring setup
        return {
            total: 0,
            used: 0,
            free: 0
        };
    }
}

export default MonitoringController.getInstance();
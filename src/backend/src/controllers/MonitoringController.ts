// src/controllers/MonitoringController.ts
import { Response } from 'express';
import { FederationMonitoringService } from '../services/FederationMonitoringService';
import { MetricsService } from '../services/MetricsService';
import { LoggerService } from '../services/LoggerService';
import { AuthenticatedRequest, AuthError } from '../types';
import { asAuthError } from '../utils/errorUtils';

export class MonitoringController {
    private static instance: MonitoringController;
    private readonly monitoringService: FederationMonitoringService;
    private readonly metricsService: MetricsService;
    private readonly logger: LoggerService;

    private constructor() {
        this.monitoringService = FederationMonitoringService.getInstance();
        this.metricsService = MetricsService.getInstance();
        this.logger = LoggerService.getInstance();
    }

    public static getInstance(): MonitoringController {
        if (!MonitoringController.instance) {
            MonitoringController.instance = new MonitoringController();
        }
        return MonitoringController.instance;
    }

    async getPartnerMetrics(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        try {
            const { partnerId } = req.params;

            // Record metric access
            this.metricsService.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - (req.startTime || Date.now())
            );

            const metrics = await this.monitoringService.getPartnerMetrics(partnerId);

            // Record specific partner metrics
            Object.entries(metrics).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    this.metricsService.recordPartnerMetric(partnerId, key, value);
                }
            });

            res.json(metrics);
        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error fetching partner metrics:', {
                error: monitoringError,
                partnerId: req.params.partnerId,
                userId: req.userAttributes.uniqueIdentifier
            });

            res.status(monitoringError.statusCode || 500).json({
                error: monitoringError.message || 'Failed to fetch partner metrics',
                code: monitoringError.code || 'MON001'
            });
        }
    }

    async getHealthAlerts(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        try {
            const alerts = await this.monitoringService.getHealthAlerts();

            // Record metric access
            this.metricsService.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - (req.startTime || Date.now())
            );

            // Record alert metrics
            this.metricsService.recordPartnerMetric(
                'system',
                'active_alerts',
                alerts.length
            );

            res.json(alerts);
        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error fetching health alerts:', {
                error: monitoringError,
                userId: req.userAttributes.uniqueIdentifier
            });

            res.status(monitoringError.statusCode || 500).json({
                error: monitoringError.message || 'Failed to fetch health alerts',
                code: monitoringError.code || 'MON002'
            });
        }
    }

    async getSystemMetrics(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        try {
            const metrics = await this.metricsService.getMetrics();

            res.set('Content-Type', 'text/plain');
            res.send(metrics);
        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error fetching system metrics:', {
                error: monitoringError,
                userId: req.userAttributes.uniqueIdentifier
            });

            res.status(monitoringError.statusCode || 500).json({
                error: monitoringError.message || 'Failed to fetch system metrics',
                code: monitoringError.code || 'MON003'
            });
        }
    }

    async resetMetrics(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        try {
            await this.monitoringService.clearMetrics(req.params.partnerId);
            this.metricsService.resetMetrics();

            res.json({ message: 'Metrics reset successfully' });
        } catch (error) {
            const monitoringError = asAuthError(error);
            
            this.logger.error('Error resetting metrics:', {
                error: monitoringError,
                partnerId: req.params.partnerId,
                userId: req.userAttributes.uniqueIdentifier
            });

            res.status(monitoringError.statusCode || 500).json({
                error: monitoringError.message || 'Failed to reset metrics',
                code: monitoringError.code || 'MON004'
            });
        }
    }
}

export default MonitoringController.getInstance();
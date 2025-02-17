import { Partner } from '@prisma/client';
import { Metrics } from './metricsService';
import { AlertService } from './alertService';
import { logger } from '../utils/logger';

interface FederationMetrics {
    authenticationSuccess: number;
    authenticationFailures: number;
    averageResponseTime: number;
    activeUsers: number;
    tokenValidations: number;
    errorRate: number;
}

export class FederationMonitorService {
    private metrics: Metrics;
    private alertService: AlertService;
    private readonly thresholds = {
        errorRate: 0.05, // 5%
        responseTime: 1000, // 1 second
        failureCount: 5 // consecutive failures
    };

    constructor() {
        this.metrics = new Metrics();
        this.alertService = new AlertService();
        this.startMonitoring();
    }

    private async startMonitoring() {
        setInterval(async () => {
            const partners = await this.getActivePartners();
            for (const partner of partners) {
                await this.checkPartnerHealth(partner);
            }
        }, 60000); // Check every minute
    }

    async checkPartnerHealth(partner: Partner) {
        try {
            const metrics = await this.collectMetrics(partner);
            await this.analyzeMetrics(partner, metrics);
            await this.storeMetrics(partner, metrics);
        } catch (error) {
            logger.error(`Monitoring failed for partner ${partner.name}:`, error);
            await this.alertService.sendAlert({
                level: 'error',
                title: `Federation Monitoring Failed - ${partner.name}`,
                message: error.message
            });
        }
    }

    private async analyzeMetrics(partner: Partner, metrics: FederationMetrics) {
        // Check error rate
        if (metrics.errorRate > this.thresholds.errorRate) {
            await this.alertService.sendAlert({
                level: 'warning',
                title: `High Error Rate - ${partner.name}`,
                message: `Error rate of ${metrics.errorRate * 100}% exceeds threshold`,
                metadata: { metrics }
            });
        }

        // Check response time
        if (metrics.averageResponseTime > this.thresholds.responseTime) {
            await this.alertService.sendAlert({
                level: 'warning',
                title: `High Latency - ${partner.name}`,
                message: `Average response time of ${metrics.averageResponseTime}ms exceeds threshold`,
                metadata: { metrics }
            });
        }
    }

    async getFederationStatus(partner: Partner): Promise<{
        status: 'healthy' | 'degraded' | 'down';
        metrics: FederationMetrics;
        lastChecked: Date;
    }> {
        const metrics = await this.collectMetrics(partner);
        return {
            status: this.determineStatus(metrics),
            metrics,
            lastChecked: new Date()
        };
    }

    // ... implementation details ...
} 
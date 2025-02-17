import { Partner } from '@prisma/client';
import { logger } from '../utils/logger';
import { HealthCheckResult } from './healthCheckService';

export class AlertService {
    private readonly alertThresholds = {
        responseTime: 1000, // 1 second
        degradedDuration: 5 * 60 * 1000, // 5 minutes
        downDuration: 2 * 60 * 1000 // 2 minutes
    };

    private statusHistory: Map<string, {
        lastStatus: HealthCheckResult['status'];
        statusChangedAt: Date;
        alertSent: boolean;
    }> = new Map();

    async handleHealthCheckResult(partner: Partner, result: HealthCheckResult): Promise<void> {
        const previousState = this.statusHistory.get(partner.id);
        const now = new Date();

        // Update status history
        this.statusHistory.set(partner.id, {
            lastStatus: result.status,
            statusChangedAt: previousState?.lastStatus === result.status
                ? previousState.statusChangedAt
                : now,
            alertSent: false
        });

        // Check if we need to send alerts
        await this.checkAndSendAlerts(partner, result, previousState);
    }

    private async checkAndSendAlerts(
        partner: Partner,
        result: HealthCheckResult,
        previousState?: { lastStatus: string; statusChangedAt: Date; alertSent: boolean }
    ): Promise<void> {
        const currentState = this.statusHistory.get(partner.id)!;
        const duration = Date.now() - currentState.statusChangedAt.getTime();

        // Don't send duplicate alerts
        if (currentState.alertSent) return;

        try {
            switch (result.status) {
                case 'down':
                    if (duration >= this.alertThresholds.downDuration) {
                        await this.sendAlert({
                            level: 'critical',
                            title: `Partner ${partner.name} is DOWN`,
                            message: `Partner endpoint has been down for ${Math.floor(duration / 1000)}s. Error: ${result.error}`,
                            metadata: {
                                partnerId: partner.id,
                                partnerName: partner.name,
                                duration,
                                error: result.error
                            }
                        });
                        currentState.alertSent = true;
                    }
                    break;

                case 'degraded':
                    if (duration >= this.alertThresholds.degradedDuration) {
                        await this.sendAlert({
                            level: 'warning',
                            title: `Partner ${partner.name} is DEGRADED`,
                            message: `Partner endpoint has been degraded for ${Math.floor(duration / 1000)}s. Response time: ${result.responseTime}ms`,
                            metadata: {
                                partnerId: partner.id,
                                partnerName: partner.name,
                                duration,
                                responseTime: result.responseTime
                            }
                        });
                        currentState.alertSent = true;
                    }
                    break;

                case 'healthy':
                    // If recovering from degraded/down state, send recovery alert
                    if (previousState?.lastStatus && previousState.lastStatus !== 'healthy') {
                        await this.sendAlert({
                            level: 'info',
                            title: `Partner ${partner.name} has RECOVERED`,
                            message: `Partner endpoint has recovered from ${previousState.lastStatus} state. Current response time: ${result.responseTime}ms`,
                            metadata: {
                                partnerId: partner.id,
                                partnerName: partner.name,
                                previousStatus: previousState.lastStatus,
                                responseTime: result.responseTime
                            }
                        });
                    }
                    break;
            }

            // Check for slow response time
            if (result.responseTime > this.alertThresholds.responseTime) {
                await this.sendAlert({
                    level: 'warning',
                    title: `Partner ${partner.name} - High Latency`,
                    message: `Partner endpoint response time (${result.responseTime}ms) exceeds threshold (${this.alertThresholds.responseTime}ms)`,
                    metadata: {
                        partnerId: partner.id,
                        partnerName: partner.name,
                        responseTime: result.responseTime,
                        threshold: this.alertThresholds.responseTime
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send health check alert:', error);
        }
    }

    private async sendAlert(alert: {
        level: 'info' | 'warning' | 'critical';
        title: string;
        message: string;
        metadata: Record<string, any>;
    }): Promise<void> {
        try {
            // Using your existing alert service
            await this.existingAlertService.send({
                ...alert,
                source: 'partner-health',
                timestamp: new Date(),
                tags: ['partner-health', `partner-${alert.metadata.partnerId}`]
            });

            logger.info(`Sent ${alert.level} alert: ${alert.title}`);
        } catch (error) {
            logger.error('Failed to send alert:', error);
            throw error;
        }
    }
} 
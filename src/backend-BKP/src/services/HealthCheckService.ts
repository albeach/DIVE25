import axios from 'axios';
import { Partner } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { Metrics } from './metricsService';
import { AlertService } from './alertService';

interface HealthCheckResult {
    partnerId: string;
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    lastChecked: Date;
    error?: string;
}

export class HealthCheckService {
    private metrics: Metrics;
    private checkInterval: NodeJS.Timeout;
    private alertService: AlertService;

    constructor() {
        this.metrics = new Metrics();
        this.alertService = new AlertService();
        this.startHealthChecks();
    }

    private async startHealthChecks() {
        this.checkInterval = setInterval(async () => {
            const partners = await prisma.partner.findMany({
                where: { status: 'ACTIVE' }
            });

            for (const partner of partners) {
                await this.checkPartnerHealth(partner);
            }
        }, 60000); // Check every minute
    }

    private async checkPartnerHealth(partner: Partner): Promise<HealthCheckResult> {
        const startTime = Date.now();
        const subdomain = this.getPartnerSubdomain(partner);
        const url = `https://${subdomain}.dive25.com/health`;

        try {
            const response = await axios.get(url, {
                timeout: 5000,
                validateStatus: null
            });

            const responseTime = Date.now() - startTime;
            const status = this.determineStatus(response.status, responseTime);

            const result = {
                partnerId: partner.id,
                status,
                responseTime,
                lastChecked: new Date(),
                error: status !== 'healthy' ? `HTTP ${response.status}` : undefined
            };

            // Update metrics
            this.metrics.recordHealthCheck(partner.id, result);

            // Update partner status in database
            await this.updatePartnerStatus(partner.id, result);

            // Handle alerts
            await this.alertService.handleHealthCheckResult(partner, result);

            return result;
        } catch (error) {
            const result = {
                partnerId: partner.id,
                status: 'down' as const,
                responseTime: Date.now() - startTime,
                lastChecked: new Date(),
                error: error.message
            };

            this.metrics.recordHealthCheck(partner.id, result);
            await this.updatePartnerStatus(partner.id, result);

            return result;
        }
    }

    private determineStatus(httpStatus: number, responseTime: number): HealthCheckResult['status'] {
        if (httpStatus !== 200) return 'down';
        if (responseTime > 1000) return 'degraded';
        return 'healthy';
    }

    private async updatePartnerStatus(partnerId: string, result: HealthCheckResult) {
        await prisma.partnerHealth.upsert({
            where: { partnerId },
            create: {
                partnerId,
                status: result.status,
                responseTime: result.responseTime,
                lastChecked: result.lastChecked,
                error: result.error
            },
            update: {
                status: result.status,
                responseTime: result.responseTime,
                lastChecked: result.lastChecked,
                error: result.error
            }
        });
    }

    private getPartnerSubdomain(partner: Partner): string {
        return partner.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    async getPartnerHealth(partnerId: string): Promise<HealthCheckResult | null> {
        return prisma.partnerHealth.findUnique({
            where: { partnerId }
        }) as Promise<HealthCheckResult | null>;
    }

    async getAllPartnerHealth(): Promise<HealthCheckResult[]> {
        return prisma.partnerHealth.findMany() as Promise<HealthCheckResult[]>;
    }
} 
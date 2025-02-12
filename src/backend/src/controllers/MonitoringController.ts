// src/controllers/MonitoringController.ts

import { Request, Response } from 'express';
import { FederationMonitoringService } from '../services/FederationMonitoringService';
import { LoggerService } from '../services/LoggerService';
import { FederationMetrics, PartnerHealth } from '../types/monitoring';

export class MonitoringController {
    private static instance: MonitoringController;
    private monitoringService: FederationMonitoringService;
    private logger: LoggerService;

    private constructor() {
        this.monitoringService = FederationMonitoringService.getInstance();
        this.logger = LoggerService.getInstance();
    }

    public static getInstance(): MonitoringController {
        if (!MonitoringController.instance) {
            MonitoringController.instance = new MonitoringController();
        }
        return MonitoringController.instance;
    }

    async getPartnerMetrics(req: Request, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            const metrics = await this.monitoringService.getPartnerMetrics(partnerId);
            res.json(metrics);
        } catch (error) {
            this.logger.error('Error fetching partner metrics', { 
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(500).json({
                error: 'Failed to fetch partner metrics',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async getHealthAlerts(req: Request, res: Response): Promise<void> {
        try {
            const alerts = await this.monitoringService.getHealthAlerts();
            res.json(alerts);
        } catch (error) {
            this.logger.error('Error fetching health alerts', { 
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(500).json({
                error: 'Failed to fetch health alerts',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async recordMetric(req: Request, res: Response): Promise<void> {
        try {
            const { partnerId, metricType, value } = req.body;
            
            if (!partnerId || !metricType) {
                res.status(400).json({ error: 'Missing required parameters' });
                return;
            }

            await this.monitoringService.recordMetric(partnerId, metricType, value);
            res.status(200).json({ message: 'Metric recorded successfully' });
        } catch (error) {
            this.logger.error('Error recording metric', { 
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(500).json({
                error: 'Failed to record metric',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
// src/controllers/MonitoringController.ts
import { Request, Response } from 'express';
import { FederationMonitoringService } from '../services/FederationMonitoringService';

export class MonitoringController {
  private static instance: MonitoringController;
  private monitoringService: FederationMonitoringService;

  private constructor() {
    this.monitoringService = FederationMonitoringService.getInstance();
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
      console.error('Error fetching partner metrics:', error);
      res.status(500).json({
        error: 'Failed to fetch partner metrics',
        details: error.message
      });
    }
  }

  async getHealthAlerts(req: Request, res: Response): Promise<void> {
    try {
      const alerts = await this.monitoringService.getHealthAlerts();
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching health alerts:', error);
      res.status(500).json({
        error: 'Failed to fetch health alerts',
        details: error.message
      });
    }
  }
}
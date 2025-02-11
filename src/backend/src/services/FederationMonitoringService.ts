// src/services/FederationMonitoringService.ts
import { Redis } from 'ioredis';
import { Prometheus } from 'prom-client';
import { config } from '../config/config';

export interface FederationMetrics {
  activePartners: number;
  totalSessions: number;
  authenticationAttempts: number;
  failedAuthentications: number;
  averageResponseTime: number;
}

export interface PartnerHealth {
  partnerId: string;
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: Date;
  responseTime: number;
  errorCount: number;
  successRate: number;
}

export class FederationMonitoringService {
  private static instance: FederationMonitoringService;
  private redis: Redis;
  
  // Prometheus metrics
  private authAttempts: Prometheus.Counter;
  private authFailures: Prometheus.Counter;
  private responseTime: Prometheus.Histogram;
  private activeSessions: Prometheus.Gauge;
  private partnerHealth: Prometheus.Gauge;

  private constructor() {
    this.redis = new Redis(config.redis);
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    this.authAttempts = new Prometheus.Counter({
      name: 'federation_auth_attempts_total',
      help: 'Total number of federation authentication attempts',
      labelNames: ['partner_id', 'auth_method']
    });

    this.authFailures = new Prometheus.Counter({
      name: 'federation_auth_failures_total',
      help: 'Total number of failed federation authentications',
      labelNames: ['partner_id', 'failure_reason']
    });

    this.responseTime = new Prometheus.Histogram({
      name: 'federation_response_time_seconds',
      help: 'Federation endpoint response time in seconds',
      labelNames: ['partner_id', 'endpoint'],
      buckets: [0.1, 0.5, 1, 2, 5]
    });

    this.activeSessions = new Prometheus.Gauge({
      name: 'federation_active_sessions',
      help: 'Number of active federated sessions',
      labelNames: ['partner_id']
    });

    this.partnerHealth = new Prometheus.Gauge({
      name: 'federation_partner_health',
      help: 'Federation partner health status (0=down, 1=degraded, 2=healthy)',
      labelNames: ['partner_id']
    });
  }

  public static getInstance(): FederationMonitoringService {
    if (!FederationMonitoringService.instance) {
      FederationMonitoringService.instance = new FederationMonitoringService();
    }
    return FederationMonitoringService.instance;
  }

  async recordAuthenticationAttempt(partnerId: string, authMethod: string, success: boolean, failureReason?: string): Promise<void> {
    this.authAttempts.inc({ partner_id: partnerId, auth_method: authMethod });
    
    if (!success) {
      this.authFailures.inc({ partner_id: partnerId, failure_reason: failureReason });
    }

    // Update Redis for real-time monitoring
    const key = `auth:${partnerId}:${Date.now()}`;
    await this.redis.setex(key, 86400, JSON.stringify({
      timestamp: Date.now(),
      success,
      failureReason,
      authMethod
    }));
  }

  async updatePartnerHealth(partnerId: string, health: PartnerHealth): Promise<void> {
    const healthScore = health.status === 'healthy' ? 2 : health.status === 'degraded' ? 1 : 0;
    this.partnerHealth.set({ partner_id: partnerId }, healthScore);

    // Store detailed health data in Redis
    await this.redis.setex(
      `partner:health:${partnerId}`,
      300,
      JSON.stringify(health)
    );
  }

  async recordResponseTime(partnerId: string, endpoint: string, timeMs: number): Promise<void> {
    this.responseTime.observe({ partner_id: partnerId, endpoint }, timeMs / 1000);

    // Store in Redis for trend analysis
    const key = `response:${partnerId}:${endpoint}:${Date.now()}`;
    await this.redis.setex(key, 3600, timeMs.toString());
  }

  async updateSessionCount(partnerId: string, count: number): Promise<void> {
    this.activeSessions.set({ partner_id: partnerId }, count);
  }

  async getPartnerMetrics(partnerId: string): Promise<FederationMetrics> {
    // Aggregate metrics for the partner
    const [
      sessions,
      authAttempts,
      failures,
      responseTimes
    ] = await Promise.all([
      this.redis.keys(`session:${partnerId}:*`),
      this.redis.keys(`auth:${partnerId}:*`),
      this.redis.keys(`auth:${partnerId}:*:failure`),
      this.redis.keys(`response:${partnerId}:*`)
    ]);

    // Calculate average response time
    const times = await Promise.all(
      responseTimes.map(key => this.redis.get(key))
    );
    const avgResponseTime = times.length > 0
      ? times.reduce((acc, time) => acc + parseInt(time || '0'), 0) / times.length
      : 0;

    return {
      activePartners: 1,
      totalSessions: sessions.length,
      authenticationAttempts: authAttempts.length,
      failedAuthentications: failures.length,
      averageResponseTime: avgResponseTime
    };
  }

  async getHealthAlerts(): Promise<any[]> {
    const alerts = [];
    const partners = await this.redis.keys('partner:health:*');
    
    for (const partnerKey of partners) {
      const healthData = await this.redis.get(partnerKey);
      if (healthData) {
        const health: PartnerHealth = JSON.parse(healthData);
        if (health.status !== 'healthy') {
          alerts.push({
            partnerId: health.partnerId,
            status: health.status,
            lastChecked: health.lastChecked,
            errorCount: health.errorCount
          });
        }
      }
    }
    
    return alerts;
  }
}
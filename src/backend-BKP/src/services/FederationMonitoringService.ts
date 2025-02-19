// At the top of files using MongoDB types
import { Db, Collection, Document, ObjectId, WithId, MongoClient } from 'mongodb';
import * as prometheus from 'prom-client';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { asAuthError } from '../middleware/errorHandler';
import { HealthStatus, UserAttributes } from '../types';

export interface PartnerHealth {
   partnerId: string;
   status: 'healthy' | 'degraded' | 'down';
   lastChecked: Date;
   responseTime: number;
   errorCount: number;
   successRate: number;
}

export interface PartnerMetrics {
   activePartners: number;
   totalSessions: number;
   authenticationAttempts: number;
   failedAuthentications: number;
   averageResponseTime: number;
}

interface MetricsRecord {
   timestamp: number;
   success: boolean;
   failureReason?: string;
   authMethod: string;
}

interface HealthAlert {
   partnerId: string;
   status: PartnerHealth['status'];
   timestamp: Date;
   message: string;
   severity: 'warning' | 'critical';
}

export class FederationMonitoringService {
   private static instance: FederationMonitoringService;
   private readonly redis: Redis;
   private readonly logger: LoggerService;
   private readonly metrics: {
       authAttempts: prometheus.Counter;
       authFailures: prometheus.Counter;
       responseTime: prometheus.Histogram;
       activeSessions: prometheus.Gauge;
       partnerHealth: prometheus.Gauge;
   };
   private readonly db: Promise<Db>;

   private constructor() {
       this.redis = new Redis(config.redis);
       this.logger = LoggerService.getInstance();
       this.metrics = this.initializeMetrics();
       this.db = MongoClient.connect(config.mongo.uri).then((client: MongoClient) => client.db('federation'));
   }

   public static getInstance(): FederationMonitoringService {
       if (!FederationMonitoringService.instance) {
           FederationMonitoringService.instance = new FederationMonitoringService();
       }
       return FederationMonitoringService.instance;
   }

   private initializeMetrics() {
       return {
           authAttempts: new prometheus.Counter({
               name: 'federation_auth_attempts_total',
               help: 'Total number of federation authentication attempts',
               labelNames: ['partner_id', 'auth_method']
           }),

           authFailures: new prometheus.Counter({
               name: 'federation_auth_failures_total',
               help: 'Total number of failed federation authentications',
               labelNames: ['partner_id', 'failure_reason']
           }),

           responseTime: new prometheus.Histogram({
               name: 'federation_response_time_seconds',
               help: 'Federation endpoint response time in seconds',
               labelNames: ['partner_id', 'endpoint'],
               buckets: [0.1, 0.5, 1, 2, 5]
           }),

           activeSessions: new prometheus.Gauge({
               name: 'federation_active_sessions',
               help: 'Number of active federated sessions',
               labelNames: ['partner_id']
           }),

           partnerHealth: new prometheus.Gauge({
               name: 'federation_partner_health',
               help: 'Federation partner health status (0=down, 1=degraded, 2=healthy)',
               labelNames: ['partner_id']
           })
       };
   }

   public async recordAuthenticationAttempt(
       partnerId: string,
       authMethod: string,
       success: boolean,
       failureReason?: string
   ): Promise<void> {
       try {
           this.metrics.authAttempts.inc({ 
               partner_id: partnerId, 
               auth_method: authMethod 
           });
           
           if (!success) {
               this.metrics.authFailures.inc({ 
                   partner_id: partnerId, 
                   failure_reason: failureReason || 'unknown'
               });
           }

           const record: MetricsRecord = {
               timestamp: Date.now(),
               success,
               failureReason,
               authMethod
           };

           const key = `auth:${partnerId}:${Date.now()}`;
           await this.redis.setex(key, 86400, JSON.stringify(record));

           this.logger.info('Authentication attempt recorded', {
               partnerId,
               success,
               authMethod,
               failureReason
           });
       } catch (error) {
           this.logger.error('Error recording authentication attempt:', error);
           throw asAuthError(error);
       }
   }

   public async updatePartnerHealth(partnerId: string, health: PartnerHealth): Promise<void> {
       try {
           const healthScore = this.getHealthScore(health.status);
           this.metrics.partnerHealth.set({ partner_id: partnerId }, healthScore);

           await this.redis.setex(
               `partner:health:${partnerId}`,
               300,
               JSON.stringify(health)
           );

           if (health.status !== 'healthy') {
               await this.generateHealthAlert(partnerId, health);
           }

           this.logger.info('Partner health updated', {
               partnerId,
               status: health.status,
               metrics: health
           });
       } catch (error) {
           this.logger.error('Error updating partner health:', error);
           throw asAuthError(error);
       }
   }

   private getHealthScore(status: PartnerHealth['status']): number {
       const scores: Record<PartnerHealth['status'], number> = {
           healthy: 2,
           degraded: 1,
           down: 0
       };
       return scores[status];
   }

   public async recordResponseTime(
       partnerId: string, 
       endpoint: string, 
       timeMs: number
   ): Promise<void> {
       try {
           this.metrics.responseTime.observe(
               { partner_id: partnerId, endpoint }, 
               timeMs / 1000
           );

           const key = `response:${partnerId}:${endpoint}:${Date.now()}`;
           await this.redis.setex(key, 3600, timeMs.toString());

           this.logger.error('Response time recorded', {
               partnerId,
               endpoint,
               timeMs
           });
       } catch (error) {
           this.logger.error('Error recording response time:', error);
           throw asAuthError(error);
       }
   }

   public async updateSessionCount(partnerId: string, count: number): Promise<void> {
       try {
           this.metrics.activeSessions.set({ partner_id: partnerId }, count);
           
           await this.redis.setex(
               `sessions:${partnerId}`,
               300,
               count.toString()
           );

           this.logger.info('Session count updated', {
               partnerId,
               count
           });
       } catch (error) {
           this.logger.error('Error updating session count:', error);
           throw asAuthError(error);
       }
   }

   public async getPartnerMetrics(partnerId: string): Promise<PartnerMetrics> {
       try {
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
       } catch (error) {
           this.logger.error('Error getting partner metrics:', error);
           throw asAuthError(error);
       }
   }

   public async getHealthAlerts(): Promise<HealthAlert[]> {
       try {
           const alerts: HealthAlert[] = [];
           const partners = await this.redis.keys('partner:health:*');
           
           for (const partnerKey of partners) {
               const healthData = await this.redis.get(partnerKey);
               if (healthData) {
                   const health = JSON.parse(healthData) as PartnerHealth;
                   if (health.status !== 'healthy') {
                       alerts.push(await this.createHealthAlert(health));
                   }
               }
           }
           
           return alerts;
       } catch (error) {
           this.logger.error('Error getting health alerts:', error);
           throw asAuthError(error);
       }
   }

   private async createHealthAlert(health: PartnerHealth): Promise<HealthAlert> {
       const severity = health.status === 'down' ? 'critical' : 'warning';
       const message = this.generateAlertMessage(health);

       return {
           partnerId: health.partnerId,
           status: health.status,
           timestamp: new Date(),
           message,
           severity
       };
   }

   private async generateHealthAlert(
       partnerId: string, 
       health: PartnerHealth
   ): Promise<void> {
       const alert = await this.createHealthAlert(health);

       await this.redis.setex(
           `alert:${partnerId}:${Date.now()}`,
           3600,
           JSON.stringify(alert)
       );

       this.logger.warn('Health alert generated', {
           partnerId,
           alert
       });
   }

   private generateAlertMessage(health: PartnerHealth): string {
       const statusMessages: Record<PartnerHealth['status'], string> = {
           down: 'Partner is unreachable',
           degraded: 'Partner is experiencing issues',
           healthy: 'Partner is operating normally'
       };

       return `${statusMessages[health.status]} - Success rate: ${
           health.successRate.toFixed(2)
       }%, Response time: ${
           health.responseTime
       }ms, Errors: ${
           health.errorCount
       }`;
   }

   public async clearMetrics(partnerId: string): Promise<void> {
       try {
           const keys = await this.redis.keys(`*:${partnerId}:*`);
           if (keys.length > 0) {
               await this.redis.del(...keys);
           }
           
           // Reset Prometheus metrics for this partner
           Object.values(this.metrics).forEach(metric => {
               if ('reset' in metric) {
                   metric.reset();
               }
           });
           
           this.logger.info('Metrics cleared for partner', { partnerId });
       } catch (error) {
           this.logger.error('Error clearing metrics:', error);
           throw asAuthError(error);
       }
   }

   public async getPartnerHealthStatus(partnerId: string): Promise<HealthStatus> {
       try {
           const metrics = await this.getPartnerMetrics(partnerId);
           return {
               status: this.calculateHealthStatus(metrics),
               lastChecked: new Date(),
               details: {
                   responseTime: metrics.averageResponseTime,
                   errorRate: metrics.failedAuthentications / metrics.authenticationAttempts,
                   availability: 1 - (metrics.failedAuthentications / metrics.authenticationAttempts)
               }
           };
       } catch (error) {
           this.logger.error('Error getting partner health status:', error);
           throw error;
       }
   }

   private calculateHealthStatus(metrics: PartnerMetrics): PartnerHealth['status'] {
       if (metrics.failedAuthentications / metrics.authenticationAttempts > 0.5) {
           return 'down';
       } else if (metrics.averageResponseTime > 5000) {
           return 'degraded';
       }
       return 'healthy';
   }

   public async getActiveAlertCount(scope: string): Promise<number> {
       try {
           const alerts = await this.getHealthAlerts();
           return alerts.filter(alert => 
               alert.partnerId === scope && 
               alert.severity === 'critical'
           ).length;
       } catch (error) {
           this.logger.error('Error getting active alert count:', error);
           return 0;
       }
   }

   public async getActivePartners(): Promise<number> {
       try {
           const partners = await (await this.db).collection('partners').find({ status: 'active' }).toArray();
           return partners.length;
       } catch (error) {
           this.logger.error('Error getting active partners count:', error);
           return 0;
       }
   }

   public async getTotalSessions(): Promise<number> {
       try {
           const sessions = await (await this.db).collection('sessions').countDocuments({ active: true });
           return sessions;
       } catch (error) {
           this.logger.error('Error getting total active sessions:', error);
           return 0;
       }
   }

   public async getFederationHealthStatus(): Promise<HealthStatus> {
       try {
           const [activePartners, totalSessions, metrics] = await Promise.all([
               this.getActivePartners(),
               this.getTotalSessions(),
               this.getPartnerMetrics('federation')
           ]);

           return {
               status: this.calculateHealthStatus(metrics),
               lastChecked: new Date(),
               details: {
                   responseTime: metrics.averageResponseTime,
                   errorRate: metrics.failedAuthentications / metrics.authenticationAttempts,
                   availability: activePartners > 0 ? 100 : 0
               }
           };
       } catch (error) {
           this.logger.error('Error getting federation health status:', error);
           throw error;
       }
   }

   public async checkResetPermission(userAttributes: UserAttributes, partnerId: string): Promise<boolean> {
       try {
           // NATO SECRET clearance can reset any metrics
           if (userAttributes.clearance === 'NATO SECRET') {
               return true;
           }

           // Partner admins can only reset their own metrics
           const partner = await (await this.db).collection('partners').findOne({ 
               partnerId,
               'admins': userAttributes.uniqueIdentifier 
           });
            
           return !!partner;
       } catch (error) {
           this.logger.error('Error checking reset permission:', error);
           return false;
       }
   }

   public async getPartnerHealth(partnerId: string): Promise<HealthStatus> {
       try {
           const metrics = await (await this.db).collection('partnerHealth')
               .findOne({ partnerId });
           return {
               status: metrics?.status || 'UNKNOWN',
               lastChecked: metrics?.lastChecked || new Date(),
               details: metrics?.details || {}
           };
       } catch (error) {
           this.logger.error('Error getting partner health:', error);
           throw error;
       }
   }
}

export default FederationMonitoringService;
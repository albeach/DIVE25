// src/services/SessionManagementService.ts
import axios from 'axios';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { MongoClient } from 'mongodb';
import { Db } from 'mongodb';

export interface SessionMetadata {
  sessionId: string;
  userId: string;
  created: number;
  lastAccessed: number;
  expiresAt: number;
  partnerIdp?: string;
  authenticationMethod: string;
  securityContext: {
    clearance: string;
    coiTags?: string[];
    lacvCode?: string;
  };
}

export interface SessionStats {
  activeSessions: number;
  averageDuration: number;
  lastActivity: Date | null;
}

export class SessionManagementService {
  private static instance: SessionManagementService;
  private redis: Redis;
  private baseUrl: string;
  private db: Promise<Db>;

  private constructor() {
    this.redis = new Redis(config.redis);
    this.baseUrl = config.pingFederate.baseUrl;
    this.db = MongoClient.connect(config.mongo.uri).then(client => client.db('federation'));
  }

  public static getInstance(): SessionManagementService {
    if (!SessionManagementService.instance) {
      SessionManagementService.instance = new SessionManagementService();
    }
    return SessionManagementService.instance;
  }

  async createSession(userInfo: any, accessToken: string): Promise<SessionMetadata> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: SessionMetadata = {
      sessionId,
      userId: userInfo.uniqueIdentifier,
      created: Date.now(),
      lastAccessed: Date.now(),
      expiresAt: Date.now() + (config.pingFederate.sessionValidation.timeoutMinutes * 60 * 1000),
      partnerIdp: userInfo.partnerIdp,
      authenticationMethod: userInfo.authMethod,
      securityContext: {
        clearance: userInfo.clearance,
        coiTags: userInfo.coiTags,
        lacvCode: userInfo.lacvCode
      }
    };

    // Store session in Redis
    await this.redis.setex(
      `session:${sessionId}`,
      config.pingFederate.sessionValidation.timeoutMinutes * 60,
      JSON.stringify(session)
    );

    // Store token to session mapping
    await this.redis.setex(
      `token:${accessToken}`,
      config.pingFederate.sessionValidation.timeoutMinutes * 60,
      sessionId
    );

    return session;
  }

  async validateSession(accessToken: string): Promise<SessionMetadata | null> {
    const sessionId = await this.redis.get(`token:${accessToken}`);
    if (!sessionId) return null;

    const sessionData = await this.redis.get(`session:${sessionId}`);
    if (!sessionData) return null;

    const session: SessionMetadata = JSON.parse(sessionData);
    if (Date.now() > session.expiresAt) {
      await this.terminateSession(sessionId);
      return null;
    }

    // Update last accessed time
    session.lastAccessed = Date.now();
    await this.redis.setex(
      `session:${sessionId}`,
      config.pingFederate.sessionValidation.timeoutMinutes * 60,
      JSON.stringify(session)
    );

    return session;
  }

  async terminateSession(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
    // Optionally notify PingFederate of session termination
    try {
      await axios.post(`${this.baseUrl}/pf-ws/session-management/end-session`, {
        sessionId
      });
    } catch (error) {
      console.error('Error notifying PingFederate of session termination:', error);
    }
  }

  public async terminatePartnerSessions(partnerId: string): Promise<void> {
    try {
      await this.db.then(db => db.collection('sessions').updateMany(
        { partnerId, active: true },
        { 
          $set: { 
            active: false,
            terminatedAt: new Date(),
            terminationReason: 'partner_deactivated'
          }
        }
      ));
    } catch (error) {
      console.error('Error terminating partner sessions:', error);
      throw error;
    }
  }

  public async getPartnerSessionStats(partnerId: string): Promise<SessionStats> {
    try {
      const sessions = await this.db.then(db => db.collection('sessions').find({ 
        partnerId,
        active: true 
      }).toArray());

      return {
        activeSessions: sessions.length,
        averageDuration: this.calculateAverageSessionDuration(sessions),
        lastActivity: sessions.length ? new Date(Math.max(...sessions.map(s => s.lastActivity))) : null
      };
    } catch (error) {
      console.error('Error getting partner session stats:', error);
      throw error;
    }
  }

  private calculateAverageSessionDuration(sessions: any[]): number {
    if (sessions.length === 0) return 0;
    
    const now = Date.now();
    const totalDuration = sessions.reduce((sum, session) => {
      const duration = session.expiresAt ? 
        session.expiresAt - session.created : 
        now - session.created;
      return sum + duration;
    }, 0);
    
    return Math.floor(totalDuration / sessions.length);
  }
}
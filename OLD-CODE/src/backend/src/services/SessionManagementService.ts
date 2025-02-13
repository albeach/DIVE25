// src/services/SessionManagementService.ts
import axios from 'axios';
import { Redis } from 'ioredis';
import { config } from '../config/config';

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

export class SessionManagementService {
  private static instance: SessionManagementService;
  private redis: Redis;
  private baseUrl: string;

  private constructor() {
    this.redis = new Redis(config.redis);
    this.baseUrl = config.pingFederate.baseUrl;
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
}
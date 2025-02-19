// src/types/monitoring/index.d.ts

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

export interface AuditEvent {
    timestamp: Date;
    eventType: 'UPLOAD' | 'ACCESS' | 'SEARCH' | 'MODIFY';
    userId: string;
    userOrganization: string;
    documentId?: string;
    documentClassification?: string;
    action: string;
    status: 'SUCCESS' | 'DENIED' | 'ERROR';
    reason?: string;
    metadata?: any;
}
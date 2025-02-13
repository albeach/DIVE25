import { Request } from 'express';
import { ObjectId } from 'mongodb';

// Security-related types
export type ClearanceLevel = 
    | 'UNCLASSIFIED'
    | 'RESTRICTED'
    | 'NATO CONFIDENTIAL'
    | 'NATO SECRET'
    | 'COSMIC TOP SECRET';

export type ReleasabilityMarker = 
    | 'NATO'
    | 'EU'
    | 'FVEY'
    | 'PARTNERX';

export type CoiTag = 'OpAlpha' | 'OpBravo' | 'OpGamma' | 'MissionX' | 'MissionZ';

export type LacvCode = 
    | 'LACV001'
    | 'LACV002'
    | 'LACV003'
    | 'LACV004';

// User-related interfaces
export interface UserAttributes {
    uniqueIdentifier: string;
    countryOfAffiliation: string;
    clearance: ClearanceLevel;
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
    organizationalAffiliation?: string;
}

export interface AuthenticatedRequest extends Request {
    userAttributes: UserAttributes;
    startTime?: number;
    document?: NATODocument;
}

export interface RequestWithFederation extends Request {
    federationInfo?: {
        partnerId: string;
        partnerType: string;
        issuer: string;
    };
}

// Document-related interfaces
export interface DocumentMetadata {
    createdAt: Date;
    createdBy: string;
    lastModified: Date;
    version: number;
    mimeType: string;
    lastModifiedBy?: string;
    originalFileName?: string;
}

export interface DocumentContent {
    data?: Buffer;
    location: string;
    mimeType?: string;
    size?: number;
    hash: string;
}

export interface NATODocument {
    _id?: ObjectId;
    title: string;
    clearance: ClearanceLevel;
    releasableTo: ReleasabilityMarker[];
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
    metadata: DocumentMetadata;
    content: DocumentContent;
}

export interface DocumentResponse<T> {
    success: boolean;
    data: T;
    metadata: {
        timestamp: Date;
        requestId: string;
    };
}

export interface SearchResult<T> {
    documents: T[];
    total: number;
}

export interface DocumentSearchOptions {
    page: number;
    limit: number;
    sort?: {
        field: string;
        order: 'asc' | 'desc';
    };
}

export interface DocumentVersionInfo {
    version: number;
    timestamp: Date;
    modifiedBy: string;
    changes: string[];
}

// Search and pagination interfaces
export interface DocumentSearchQuery {
    clearance?: ClearanceLevel;
    releasableTo?: ReleasabilityMarker[];
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
    dateRange?: {
        start: Date;
        end: Date;
    };
    keywords?: string;
    maxClearance?: ClearanceLevel;
}

export interface PaginationOptions {
    page: number;
    limit: number;
    sort?: {
        field: keyof NATODocument;
        order: 'asc' | 'desc';
    };
}

export interface PaginatedResponse<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

// Error handling interfaces
export interface AuthError extends Error {
    statusCode: number;
    code?: string;
    details?: any;
}

// Monitoring interfaces
export interface MetricValue {
    value: number;
    timestamp: Date;
    labels?: Record<string, string>;
}

export interface PartnerMetrics {
    activePartners: number;
    totalSessions: number;
    authenticationAttempts: number;
    failedAuthentications: number;
    averageResponseTime: number;
}

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'down';
    lastChecked: Date;
    details: {
        responseTime: number;
        errorRate: number;
        availability: number;
    };
}

// Federation interfaces
export interface FederationPartner {
    partnerId: string;
    partnerType: 'SAML' | 'OIDC';
    entityId: string;
    metadata: {
        url: string;
        lastUpdated: Date;
    };
    status: 'active' | 'inactive' | 'pending';
    clearanceLevel: ClearanceLevel;
    allowedReleasabilityMarkers: ReleasabilityMarker[];
    healthStatus: HealthStatus;
}

// API Response interfaces
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    metadata?: {
        timestamp: Date;
        requestId: string;
    };
}

// Validation interfaces
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}

// Audit interfaces
export interface AuditEvent {
    timestamp: Date;
    eventType: 'ACCESS' | 'MODIFY' | 'DELETE' | 'SEARCH';
    userId: string;
    userAttributes: UserAttributes;
    resourceId?: string;
    action: string;
    status: 'SUCCESS' | 'DENIED' | 'ERROR';
    details?: Record<string, any>;
}

// Export utility type helpers
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export interface AuditLogDocument {
    _id?: ObjectId;
    documentId: ObjectId | null;
    action: string;
    timestamp: Date;
    details?: Record<string, any>;
}
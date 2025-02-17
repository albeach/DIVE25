import { Request } from 'express';
import { ObjectId } from 'mongodb';

const id = new ObjectId();

// Fix SearchResult type
export interface SearchResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}

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

// Add missing types for MongoDB
export interface MongoDocument {
    _id?: ObjectId;
    [key: string]: any;
}

export interface DocumentSearchParams {
    query: DocumentSearchQuery;
    options: DocumentSearchOptions;
}

export interface DocumentOperationResult<T> {
    success: boolean;
    data: T;
    metadata: {
        timestamp: Date;
        requestId: string;
    };
}

// User-related interfaces
export interface COIAccess {
    id: string;
    name: string;
    level: string;
    validFrom: Date;
    validTo?: Date;
}

export interface UserAttributes {
    uniqueIdentifier: string;
    organization: string;
    clearance: string;
    coiAccess: COIAccess[];  // Array of COI objects with metadata
    releasabilityAccess: string[];
    metadata?: {
        lastLogin?: Date;
        accessLevel?: string;
        partnerType?: string;
        federationId?: string;
    };
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
    _id?: ObjectId | string;
    title: string;
    clearance: ClearanceLevel;
    releasableTo: ReleasabilityMarker[];
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
    metadata: DocumentMetadata;
    content: DocumentContent;
    deleted?: boolean;
}

export interface DocumentResponse<T> {
    success: boolean;
    data: T;
    metadata: {
        timestamp: Date;
        requestId: string;
    };
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
    userAttributes?: UserAttributes;
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
        field: keyof NATODocument | "metadata.createdAt";
        order: 'asc' | 'desc';
    };
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

// Error handling interfaces
export interface AuthError extends Error {
    statusCode?: number;
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

// Update ValidationResult type
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
    missingAttributes?: string[];
}

export interface PartnerConfig {
    partnerId: string;
    partnerName: string;
    federationType: 'SAML' | 'OIDC';
    metadata: {
        url?: string;
        content?: string;
    };
    attributeMapping: {
        [key: string]: string;
    };
    contactInfo: {
        technical: {
            name: string;
            email: string;
        };
        administrative: {
            name: string;
            email: string;
        };
    };
}

export interface Partner extends PartnerConfig {
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
    oauthClientId: string;
    createdAt: Date;
    createdBy: string;
    lastModified: Date;
    lastModifiedBy?: string;
    deactivatedAt?: Date;
    deactivatedBy?: string;
    deactivationReason?: string;
}

export interface FederationPartner extends Partner, PartnerConfig {
    entityId: string;
    metadata: {
        url: string;
        lastUpdated: Date;
    };
    clearanceLevel: ClearanceLevel;
    allowedReleasabilityMarkers: ReleasabilityMarker[];
    healthStatus: HealthStatus;
}

// Audit interfaces
export interface AuditEvent {
    timestamp: Date;
    eventType: 'ACCESS' | 'MODIFY' | 'DELETE' | 'SEARCH' | 'AUTHENTICATION' | 'SECURITY';
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

export interface ResourceAttributes {
    path: string;
    method: string;
    resourceType?: string;
    classification?: string;
    coi?: string[];
    releasability?: string[];
}

export interface OPAResult {
    allow: boolean;
    reason?: string;
}

export interface MetricLabels {
    [key: string]: string | number;
}
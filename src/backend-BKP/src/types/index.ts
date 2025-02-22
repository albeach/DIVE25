import { Request } from 'express';
import { ObjectId } from 'mongodb';

const id = new ObjectId();

// Fix SearchResult type
export interface SearchResult<T> {
    items: T[];
    total: number;
    page: number;
    pages: number;
}

// Security-related types
export type ReleasabilityMarker =
    | 'NATO'
    | 'EU'
    | 'FVEY'
    | 'PARTNERX';

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
    countryOfAffiliation: string;
    clearance: ClearanceLevel;
    coiTags: string[];
    caveats: string[];
    lacvCode?: string;
    organizationalAffiliation?: string;
}

export interface AuthenticatedRequest extends Request {
    document?: IDocument;
    user: Express.User;  // Now TypeScript knows about the user property
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
    author: string;
    version: number;
    lastModifiedBy: string;
    classification: ClearanceLevel;
    releasableTo: string[];
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
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
    title?: string;
    classification?: ClearanceLevel;
    coiTags?: CoiTag[];
    dateRange?: {
        start: Date;
        end: Date;
    };
    page?: number;
    limit?: number;
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

// Consolidate duplicate interfaces into a single location
export interface OPAResult {
    allow: boolean;
    reason?: string;
}

export interface ExistingAlertService {
    send(alert: {
        level: string;
        title: string;
        message: string;
        metadata: Record<string, any>;
        source: string;
        timestamp: Date;
        tags: string[];
    }): Promise<void>;
}

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    lastChecked: Date;
    error?: string;
}

export interface PartnerHealth {
    partnerId: string;
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    errorCount: number;
    successRate: number;
    lastChecked: Date;
}

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
    classification: string;
    releasableTo: string[];
    coiTags?: string[];
    lacvCode?: string;
}

export interface MetricLabels {
    [key: string]: string | number;
}
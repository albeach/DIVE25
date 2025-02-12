// src/types/index.ts
import { Request } from 'express';
import { 
    Document, 
    DocumentMetadata, 
    ClearanceLevel, 
    ReleasabilityMarker, 
    CoiTag, 
    LacvCode 
} from '../models/Document';

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
}

export interface RequestWithFederation extends Request {
    federationInfo?: {
        partnerId: string;
        partnerType: string;
        issuer: string;
    };
}

export interface AuthError extends Error {
    statusCode: number;
    code?: string;
    details?: any;
}

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
    page?: number;
    limit?: number;
    sort?: {
        field: keyof Document;
        order: 'asc' | 'desc';
    };
}

export interface PaginationOptions {
    page: number;
    limit: number;
    sort?: {
        [key: string]: 1 | -1;
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

export {
    Document,
    DocumentMetadata,
    ClearanceLevel,
    ReleasabilityMarker,
    CoiTag,
    LacvCode
} from '../models/Document';
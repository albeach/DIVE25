// src/models/Document.ts
import { ObjectId } from 'mongodb';

export const ValidClearanceLevels = [
    'UNCLASSIFIED',
    'RESTRICTED',
    'NATO CONFIDENTIAL',
    'NATO SECRET',
    'COSMIC TOP SECRET'
] as const;

export const ValidReleasabilityMarkers = [
    'NATO',
    'EU',
    'FVEY',
    'PARTNERX'
] as const;

export const ValidCoiTags = [
    'OpAlpha',
    'OpBravo',
    'OpGamma',
    'MissionX',
    'MissionZ'
] as const;

export const ValidLacvCodes = [
    'LACV001',
    'LACV002',
    'LACV003',
    'LACV004'
] as const;

export type ClearanceLevel = typeof ValidClearanceLevels[number];
export type ReleasabilityMarker = typeof ValidReleasabilityMarkers[number];
export type CoiTag = typeof ValidCoiTags[number];
export type LacvCode = typeof ValidLacvCodes[number];

export interface DocumentMetadata {
    createdAt: Date;
    createdBy: string;
    lastModified: Date;
    version: number;
    lastModifiedBy?: string;
}

export interface DocumentContent {
    location: string;
    hash: string;
}

export interface Document {
    _id?: ObjectId;
    title: string;
    clearance: ClearanceLevel;
    releasableTo: ReleasabilityMarker[];
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
    metadata: DocumentMetadata;
    content: DocumentContent;
}

export interface NewDocument extends Omit<Document, '_id'> {
    metadata: DocumentMetadata;
    content: DocumentContent;
}

export interface DocumentUpdate {
    title?: string;
    clearance?: ClearanceLevel;
    releasableTo?: ReleasabilityMarker[];
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
    content?: Partial<DocumentContent>;
}

export interface DocumentSearchOptions {
    clearance?: ClearanceLevel;
    releasableTo?: ReleasabilityMarker[];
    coiTags?: CoiTag[];
    lacvCode?: LacvCode;
    dateRange?: {
        start: Date;
        end: Date;
    };
    page?: number;
    limit?: number;
    sort?: {
        field: keyof Document;
        order: 'asc' | 'desc';
    };
}

export interface DocumentAccessControl {
    userClearance: ClearanceLevel;
    userCoiTags?: CoiTag[];
    userLacvCode?: LacvCode;
    documentClearance: ClearanceLevel;
    documentCoiTags?: CoiTag[];
    documentLacvCode?: LacvCode;
}

export const clearanceLevels: { [key in ClearanceLevel]: number } = {
    'UNCLASSIFIED': 0,
    'RESTRICTED': 1,
    'NATO CONFIDENTIAL': 2,
    'NATO SECRET': 3,
    'COSMIC TOP SECRET': 4
};

export type Classification = ClearanceLevel;
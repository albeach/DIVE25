import
import mongoose, { Schema, Document as MongoDocument } from 'mongoose';

export enum Classification {
    UNCLASSIFIED = 'UNCLASSIFIED',
    RESTRICTED = 'RESTRICTED',
    CONFIDENTIAL = 'CONFIDENTIAL',
    SECRET = 'SECRET',
    TOP_SECRET = 'TOP_SECRET'
}

export enum Clearance {
    UNCLASSIFIED = 'UNCLASSIFIED',
    RESTRICTED = 'RESTRICTED',
    CONFIDENTIAL = 'CONFIDENTIAL',
    SECRET = 'SECRET',
    TOP_SECRET = 'TOP_SECRET'
}

export enum ReleasabilityMarker {
    NATO = 'NATO',
    FVEY = 'FVEY',
    NOFORN = 'NOFORN'
}

export interface DocumentContent {
    content: Buffer;
    mimeType: string;
    location: string;
}

export interface DocumentMetadata {
    title: string;
    classification: Classification;
    releasableTo: string[];
    lastModified: Date;
    version: number;
    checksum: string;
}

export interface ResourceAttributes {
    path: string;
    method: string;
    classification: Classification;
    releasableTo: string[];
    coiTags?: string[];
    lacvCode?: string;
    clearance: string;
}

export interface UserAttributes {
    clearance: Clearance;
    countryOfAffiliation: string;
    coiTags: string[];
    lacvCode: string;
    caveats: string[];
}

export interface OPAResult {
    allow: boolean;
    reason: string;
}

export interface NATODocument extends MongooseDocument {
    _id: string;
    title: string;
    classification: Classification;
    releasableTo: string[];
    coiTags: string[];
    lacvCode?: string;
    storageLocation: string;
    metadata: DocumentMetadata;
    content?: DocumentContent;
}

const documentSchema = new Schema<NATODocument>({
    title: { type: String, required: true },
    classification: {
        type: String,
        enum: Object.values(Classification),
        required: true
    },
    releasableTo: [{ type: String }],
    coiTags: [{ type: String }],
    lacvCode: String,
    storageLocation: String,
    metadata: {
        title: String,
        classification: String,
        releasableTo: [String],
        lastModified: Date,
        version: Number,
        checksum: String
    }
});

export const Document = model<NATODocument>('Document', documentSchema);

export const ValidClearanceLevels = Object.values(Clearance);
export const ValidReleasabilityMarkers = Object.values(ReleasabilityMarker);
export const ValidCoiTags = ['NATO', 'EU', 'FVEY', 'CCEB'];
export const ValidLacvCodes = ['LAC1', 'LAC2', 'LAC3', 'LAC4'];

// Helper function to validate classification levels
export function isValidClassification(value: string): value is Classification {
    return Object.values(Classification).includes(value as Classification);
}

// Helper function to validate clearance levels
export function isValidClearance(value: string): value is Clearance {
    return Object.values(Clearance).includes(value as Clearance);
}

// Helper function to check if clearance is sufficient for classification
export function hasSufficientClearance(clearance: Clearance, classification: Classification): boolean {
    const levels = Object.values(Classification);
    return levels.indexOf(clearance) >= levels.indexOf(classification);
}

export interface IDocument {
    // Add any necessary properties for the IDocument interface
} 
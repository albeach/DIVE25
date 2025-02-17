import { Schema, model, Document as MongooseDocument } from 'mongoose';

export enum ClearanceLevel {
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
    classification: ClearanceLevel;
    releasableTo: string[];
    lastModified: Date;
    version: number;
    checksum: string;
}

export interface NATODocument extends MongooseDocument {
    _id: string;
    title: string;
    classification: ClearanceLevel;
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
        enum: Object.values(ClearanceLevel),
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

export const ValidClearanceLevels = Object.values(ClearanceLevel);
export const ValidReleasabilityMarkers = Object.values(ReleasabilityMarker);
export const ValidCoiTags = ['NATO', 'EU', 'FVEY', 'CCEB'];
export const ValidLacvCodes = ['LAC1', 'LAC2', 'LAC3', 'LAC4']; 
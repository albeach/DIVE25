// src/backend/src/models/Document.ts

import { ObjectId } from 'mongodb';

export interface Document {
    _id?: ObjectId;
    title: string;
    content: {
        data: Buffer,         // The actual document content stored in MongoDB
        mimeType: string,
        size: number,
        hash: string         // For integrity verification
    };
    metadata: {
        createdAt: Date;
        createdBy: string;
        lastModified: Date;
        version: number;
        originalFileName: string;
    };
    security: {
        classification: Classification;
        caveats: string[];
        releasability: string[];
        coiTags: string[];
        lacvCode?: string;
    };
    accessControl: {
        ownerOrganization: string;
        accessGroups: string[];
        handlingInstructions?: string;
    };
}

export enum Classification {
    UNCLASSIFIED = "UNCLASSIFIED",
    RESTRICTED = "RESTRICTED",
    NATO_CONFIDENTIAL = "NATO CONFIDENTIAL",
    NATO_SECRET = "NATO SECRET",
    COSMIC_TOP_SECRET = "COSMIC TOP SECRET"
}

export const ValidClassifications = Object.values(Classification);

export const ValidReleasabilityMarkers = [
    "NATO",
    "EU",
    "FVEY",
    "CCEB",
    "ACGU"
] as const;

export const ValidCoiTags = [
    "OpAlpha",
    "OpBravo",
    "OpCharlie",
    "MissionX",
    "MissionY"
] as const;
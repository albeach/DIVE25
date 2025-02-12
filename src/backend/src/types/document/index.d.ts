// src/types/document/index.d.ts

import { ObjectId } from 'mongodb';

export interface Document {
    _id?: ObjectId;
    title: string;
    content: {
        data: Buffer;
        mimeType: string;
        size: number;
        hash: string;
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
}

export enum Classification {
    UNCLASSIFIED = "UNCLASSIFIED",
    RESTRICTED = "RESTRICTED",
    NATO_CONFIDENTIAL = "NATO CONFIDENTIAL",
    NATO_SECRET = "NATO SECRET",
    COSMIC_TOP_SECRET = "COSMIC TOP SECRET"
}

export interface DocumentSearchQuery {
    searchText?: string;
    classification?: Classification;
    coiTags?: string[];
    limit?: number;
}
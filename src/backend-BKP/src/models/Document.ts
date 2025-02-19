// src/models/Document.ts
import mongoose, { Schema, Document as MongoDocument } from 'mongoose';

export interface IDocument extends MongoDocument {
    title: string;
    description?: string;
    classification: string;
    releasableTo: string[];
    coiTags: string[];
    lacvCode?: string;
    metadata: {
        createdBy: string;
        createdAt: Date;
        lastModifiedBy: string;
        lastModifiedAt: Date;
        version: number;
        checksum: string;
        mimeType: string;
        size: number;
    };
    storageLocation: {
        bucket: string;
        key: string;
    };
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

const DocumentSchema = new Schema<IDocument>({
    title: {
        type: String,
        required: true,
        index: true
    },
    description: {
        type: String
    },
    classification: {
        type: String,
        required: true,
        enum: ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET'],
        index: true
    },
    releasableTo: [{
        type: String,
        required: true,
        enum: ['NATO', 'FVEY', 'EU', 'PARTNERX']
    }],
    coiTags: [{
        type: String,
        validate: {
            validator: function (v: string) {
                return ['OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'].includes(v);
            },
            message: (props: any) => `${props.value} is not a valid COI tag`
        }
    }],
    lacvCode: {
        type: String,
        sparse: true
    },
    metadata: {
        createdBy: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        lastModifiedBy: { type: String, required: true },
        lastModifiedAt: { type: Date, default: Date.now },
        version: { type: Number, default: 1 },
        checksum: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true }
    },
    storageLocation: {
        bucket: { type: String, required: true },
        key: { type: String, required: true }
    },
    status: {
        type: String,
        enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
        default: 'DRAFT',
        required: true,
        index: true
    }
}, {
    timestamps: true,
    collection: 'documents'
});

// Indexes for common queries
DocumentSchema.index({ classification: 1, releasableTo: 1 });
DocumentSchema.index({ coiTags: 1 });
DocumentSchema.index({ 'metadata.createdBy': 1 });
DocumentSchema.index({ status: 1, classification: 1 });

export const Document = mongoose.model<IDocument>('Document', DocumentSchema);
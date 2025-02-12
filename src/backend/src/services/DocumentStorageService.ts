// src/services/DocumentStorageService.ts
import { Collection, ObjectId } from 'mongodb';
import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';
import { Document, DocumentContent, DocumentMetadata } from '../models/Document';
import { StorageError } from '../utils/errors';

interface StorageQuery {
    clearance?: string;
    releasableTo?: string[];
    coiTags?: string[];
    lacvCode?: string;
    text?: string;
    dateRange?: {
        start: Date;
        end: Date;
    };
}

export class DocumentStorageService {
    private static instance: DocumentStorageService;
    private readonly dbService: DatabaseService;
    private readonly logger: LoggerService;
    private collection: Collection<Document>;

    private constructor() {
        this.dbService = DatabaseService.getInstance();
        this.logger = LoggerService.getInstance();
        this.initializeCollection();
    }

    private async initializeCollection(): Promise<void> {
        try {
            this.collection = await this.dbService.getCollection<Document>('documents');
            await this.createIndexes();
        } catch (error) {
            this.logger.error('Failed to initialize document collection:', error);
            throw new StorageError('Failed to initialize storage service', { cause: error });
        }
    }

    public static getInstance(): DocumentStorageService {
        if (!DocumentStorageService.instance) {
            DocumentStorageService.instance = new DocumentStorageService();
        }
        return DocumentStorageService.instance;
    }

    private async createIndexes(): Promise<void> {
        try {
            await this.collection.createIndexes([
                { key: { clearance: 1 } },
                { key: { releasableTo: 1 } },
                { key: { coiTags: 1 } },
                { key: { lacvCode: 1 } },
                { key: { 'metadata.createdAt': 1 } },
                {
                    key: { title: 'text', 'metadata.keywords': 'text' },
                    weights: { title: 10, 'metadata.keywords': 5 }
                }
            ]);
        } catch (error) {
            this.logger.error('Failed to create indexes:', error);
            throw new StorageError('Failed to create storage indexes', { cause: error });
        }
    }

    async storeDocument(document: Omit<Document, '_id'>): Promise<Document> {
        try {
            const content: DocumentContent = {
                location: document.content.location,
                hash: document.content.hash
            };

            const metadata: DocumentMetadata = {
                createdAt: new Date(),
                createdBy: document.metadata.createdBy,
                lastModified: new Date(),
                version: 1
            };

            const result = await this.collection.insertOne({
                ...document,
                content,
                metadata
            } as Document);

            const stored = await this.collection.findOne({ _id: result.insertedId });
            if (!stored) {
                throw new StorageError('Failed to retrieve stored document');
            }

            return stored;
        } catch (error) {
            this.logger.error('Failed to store document:', error);
            throw new StorageError('Failed to store document', { cause: error });
        }
    }

    async searchDocuments(query: StorageQuery): Promise<Document[]> {
        try {
            const mongoQuery = this.buildMongoQuery(query);
            return await this.collection.find(mongoQuery).toArray();
        } catch (error) {
            this.logger.error('Failed to search documents:', error);
            throw new StorageError('Failed to search documents', { cause: error });
        }
    }

    private buildMongoQuery(query: StorageQuery): Record<string, any> {
        const mongoQuery: Record<string, any> = {};

        if (query.clearance) {
            mongoQuery.clearance = query.clearance;
        }

        if (query.releasableTo?.length) {
            mongoQuery.releasableTo = { $in: query.releasableTo };
        }

        if (query.coiTags?.length) {
            mongoQuery.coiTags = { $all: query.coiTags };
        }

        if (query.lacvCode) {
            mongoQuery.lacvCode = query.lacvCode;
        }

        if (query.text) {
            mongoQuery.$text = { $search: query.text };
        }

        if (query.dateRange) {
            mongoQuery['metadata.createdAt'] = {
                $gte: query.dateRange.start,
                $lte: query.dateRange.end
            };
        }

        return mongoQuery;
    }

    async getDocument(id: string): Promise<Document | null> {
        try {
            if (!ObjectId.isValid(id)) {
                throw new StorageError('Invalid document ID');
            }

            return await this.collection.findOne({ _id: new ObjectId(id) });
        } catch (error) {
            this.logger.error('Failed to retrieve document:', error);
            throw new StorageError('Failed to retrieve document', { cause: error });
        }
    }

    async updateDocument(id: string, update: Partial<Document>): Promise<Document> {
        try {
            if (!ObjectId.isValid(id)) {
                throw new StorageError('Invalid document ID');
            }

            const result = await this.collection.findOneAndUpdate(
                { _id: new ObjectId(id) },
                { 
                    $set: {
                        ...update,
                        'metadata.lastModified': new Date(),
                        'metadata.version': { $inc: 1 }
                    }
                },
                { returnDocument: 'after' }
            );

            if (!result) {
                throw new StorageError('Document not found');
            }

            return result;
        } catch (error) {
            this.logger.error('Failed to update document:', error);
            throw new StorageError('Failed to update document', { cause: error });
        }
    }

    async deleteDocument(id: string): Promise<boolean> {
        try {
            if (!ObjectId.isValid(id)) {
                throw new StorageError('Invalid document ID');
            }

            const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
            return result.deletedCount === 1;
        } catch (error) {
            this.logger.error('Failed to delete document:', error);
            throw new StorageError('Failed to delete document', { cause: error });
        }
    }
}

export default DocumentStorageService;
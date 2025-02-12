// src/backend/src/services/DocumentStorageService.ts

import { Collection, ObjectId } from 'mongodb';
import { createHash } from 'crypto';
import { Document } from '../models/Document';
import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';

export class DocumentStorageService {
    private static instance: DocumentStorageService;
    private db: DatabaseService;
    private logger: LoggerService;
    private collection: Collection<Document>;

    private constructor() {
        this.db = DatabaseService.getInstance();
        this.logger = LoggerService.getInstance();
        this.collection = this.db.getCollection('documents');
        
        // Create indexes for efficient querying
        this.setupIndexes();
    }

    private async setupIndexes(): Promise<void> {
        await this.collection.createIndex({ 'security.classification': 1 });
        await this.collection.createIndex({ 'security.coiTags': 1 });
        await this.collection.createIndex({ 'metadata.createdAt': 1 });
        await this.collection.createIndex({ 
            title: 'text',
            'metadata.originalFileName': 'text'
        });
    }

    public static getInstance(): DocumentStorageService {
        if (!DocumentStorageService.instance) {
            DocumentStorageService.instance = new DocumentStorageService();
        }
        return DocumentStorageService.instance;
    }

    async storeDocument(
        content: Buffer,
        metadata: any,
        userInfo: any
    ): Promise<Document> {
        try {
            // Generate content hash for integrity
            const hash = createHash('sha256').update(content).digest('hex');
            
            const document: Document = {
                title: metadata.title,
                content: {
                    data: content,
                    mimeType: metadata.mimeType,
                    size: content.length,
                    hash: hash
                },
                metadata: {
                    createdAt: new Date(),
                    createdBy: userInfo.uniqueIdentifier,
                    lastModified: new Date(),
                    version: 1,
                    originalFileName: metadata.originalFileName
                },
                security: {
                    classification: metadata.classification,
                    caveats: metadata.caveats || [],
                    releasability: metadata.releasability || [],
                    coiTags: metadata.coiTags || [],
                    lacvCode: metadata.lacvCode
                },
                accessControl: {
                    ownerOrganization: userInfo.organizationalAffiliation,
                    accessGroups: metadata.accessGroups || [],
                    handlingInstructions: metadata.handlingInstructions
                }
            };

            const result = await this.collection.insertOne(document);

            this.logger.info('Document stored successfully', {
                documentId: result.insertedId,
                classification: document.security.classification
            });

            return { ...document, _id: result.insertedId };
        } catch (error) {
            this.logger.error('Error storing document', { error });
            throw error;
        }
    }

    async retrieveDocument(documentId: string): Promise<Document> {
        try {
            const document = await this.collection.findOne({
                _id: new ObjectId(documentId)
            });

            if (!document) {
                throw new Error('Document not found');
            }

            // Verify document integrity
            const hash = createHash('sha256')
                .update(document.content.data)
                .digest('hex');

            if (hash !== document.content.hash) {
                this.logger.error('Document integrity check failed', { documentId });
                throw new Error('Document integrity check failed');
            }

            return document;
        } catch (error) {
            this.logger.error('Error retrieving document', { error });
            throw error;
        }
    }

    async searchDocuments(query: any, userInfo: any): Promise<Document[]> {
        try {
            // Build search criteria based on user's clearance and other attributes
            const searchCriteria = {
                $and: [
                    { 'security.classification': { $lte: userInfo.clearance } },
                    { 
                        $or: [
                            { 'security.releasability': { $in: userInfo.releasabilityAccess } },
                            { 'security.releasability': { $size: 0 } }
                        ]
                    }
                ]
            };

            // Add text search if provided
            if (query.searchText) {
                searchCriteria['$text'] = { $search: query.searchText };
            }

            // Add classification filter if provided
            if (query.classification) {
                searchCriteria['security.classification'] = query.classification;
            }

            // Add COI filter if provided
            if (query.coiTags && query.coiTags.length > 0) {
                searchCriteria['security.coiTags'] = { $all: query.coiTags };
            }

            const documents = await this.collection
                .find(searchCriteria)
                .sort({ 'metadata.createdAt': -1 })
                .limit(query.limit || 50)
                .toArray();

            return documents;
        } catch (error) {
            this.logger.error('Error searching documents', { error });
            throw error;
        }
    }
}
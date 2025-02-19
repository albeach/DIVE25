import { Collection, Db, MongoClient, ObjectId, WithId } from 'mongodb';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import {
    NATODocument,
    DocumentSearchQuery,
    PaginationOptions,
    SearchResult,
    DocumentMetadata,
    ClearanceLevel,
    AuthError
} from '../types';
import { config } from '../config/config';

export class DatabaseService {
    private static instance: DatabaseService;
    private client: MongoClient;
    private db: Db;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private isConnected: boolean = false;

    private readonly collections: {
        documents: Collection<NATODocument>;
        audit: Collection<any>;
    };

    // Database configuration
    private readonly DB_CONFIG = {
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000,
        CONNECTION_TIMEOUT: 30000,
        OPERATION_TIMEOUT: 10000,
        BATCH_SIZE: 100,
        INDEX_OPTIONS: {
            background: true,
            sparse: true
        }
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.client = new MongoClient(config.mongodb.uri, {
            maxPoolSize: 50,
            connectTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    public async connect(): Promise<void> {
        if (this.isConnected) {
            return;
        }

        try {
            await this.client.connect();
            this.db = this.client.db(config.mongodb.dbName);
            this.isConnected = true;

            // Initialize collections with schemas
            await this.initializeCollections();

            this.logger.info('Successfully connected to database');
            this.metrics.recordOperationMetrics('database_connection', {
                duration: 0,
                success: true
            });
        } catch (error) {
            this.logger.error('Database connection error:', error);
            this.metrics.recordOperationError('database_connection', error);
            throw error;
        }
    }

    private async initializeCollections(): Promise<void> {
        try {
            // Create collections if they don't exist
            if (!await this.collectionExists('documents')) {
                await this.db.createCollection('documents');
                await this.createDocumentIndexes();
            }

            if (!await this.collectionExists('audit')) {
                await this.db.createCollection('audit');
                await this.createAuditIndexes();
            }

            // Initialize collection references
            this.collections.documents = this.db.collection('documents');
            this.collections.audit = this.db.collection('audit');
        } catch (error) {
            this.logger.error('Failed to initialize collections:', error);
            throw error;
        }
    }

    private async createDocumentIndexes(): Promise<void> {
        await this.collections.documents.createIndexes([
            { key: { title: 1 } },
            { key: { classification: 1 } },
            { key: { coiTags: 1 } },
            { key: { createdAt: 1 } },
            { key: { "metadata.author": 1 } }
        ]);
    }

    private async createAuditIndexes(): Promise<void> {
        await this.collections.audit.createIndexes([
            { key: { timestamp: 1 } },
            { key: { "user.uniqueIdentifier": 1 } },
            { key: { action: 1 } },
            { key: { resource: 1 } }
        ]);
    }

    private async collectionExists(name: string): Promise<boolean> {
        const collections = await this.db.listCollections().toArray();
        return collections.some(col => col.name === name);
    }

    public getCollection<T>(name: string): Collection<T> {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
        return this.db.collection<T>(name);
    }

    public async disconnect(): Promise<void> {
        if (this.client && this.isConnected) {
            await this.client.close();
            this.isConnected = false;
            this.logger.info('Disconnected from database');
        }
    }

    public async healthCheck(): Promise<boolean> {
        try {
            await this.db.command({ ping: 1 });
            return true;
        } catch (error) {
            this.logger.error('Database health check failed:', error);
            return false;
        }
    }

    public async searchDocuments(
        query: DocumentSearchQuery,
        options: PaginationOptions
    ): Promise<SearchResult<NATODocument>> {
        this.validateConnection();
        const startTime = Date.now();

        try {
            const searchQuery = this.buildSearchQuery(query);
            const sort = this.buildSortOptions(options.sort);

            const [documents, total] = await Promise.all([
                this.collections.documents.find(searchQuery)
                    .sort(sort)
                    .skip((options.page - 1) * options.limit)
                    .limit(options.limit)
                    .toArray(),
                this.collections.documents.countDocuments(searchQuery)
            ]);

            // Record metrics
            this.metrics.recordOperationMetrics('document_search', {
                duration: Date.now() - startTime,
                resultCount: documents.length,
                totalResults: total
            });

            return {
                data: this.convertDocuments(documents),
                total,
                page: options.page,
                limit: options.limit
            };

        } catch (error) {
            this.logger.error('Document search error:', error);
            this.metrics.recordOperationError('document_search', error);
            throw this.createDatabaseError('Failed to search documents', error);
        }
    }

    public async getDocument(id: string): Promise<NATODocument | null> {
        this.validateConnection();

        try {
            if (!ObjectId.isValid(id)) return null;

            const doc = await this.collections.documents.findOne({
                _id: new ObjectId(id),
                deleted: { $ne: true }
            });

            return doc ? this.convertDocument(doc) : null;

        } catch (error) {
            this.logger.error('Document retrieval error:', error);
            this.metrics.recordOperationError('document_get', error);
            throw this.createDatabaseError('Failed to retrieve document', error);
        }
    }

    public async getDb(): Promise<Db> {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        return this.db;
    }

    public async createDocument(document: Omit<NATODocument, '_id'>): Promise<NATODocument> {
        this.validateConnection();

        try {
            const result = await this.collections.documents.insertOne(document as NATODocument);
            const created = await this.getDocument(result.insertedId.toString());

            if (!created) {
                throw new Error('Failed to retrieve created document');
            }

            this.metrics.recordOperationMetrics('document_create', {
                documentId: created._id,
                clearance: created.clearance
            });

            return created;

        } catch (error) {
            this.logger.error('Document creation error:', error);
            this.metrics.recordOperationError('document_create', error);
            throw this.createDatabaseError('Failed to create document', error);
        }
    }

    public async updateDocument(
        id: string,
        update: Partial<NATODocument>
    ): Promise<NATODocument | null> {
        this.validateConnection();
        const result = await this.collections.documents.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: update },
            { returnDocument: 'after' }
        );

        if (!result) return null;

        // Convert WithId<NATODocument> to NATODocument
        return {
            ...result,
            _id: result._id.toString()
        } as NATODocument;
    }

    public async deleteDocument(id: string): Promise<boolean> {
        this.validateConnection();
        const result = await this.collections.documents.updateOne(
            { _id: new ObjectId(id) },
            { $set: { deleted: true } }
        );
        return result.modifiedCount > 0;
    }

    public async countDocuments(query: DocumentSearchQuery): Promise<number> {
        this.validateConnection();
        return this.collections.documents.countDocuments(this.buildSearchQuery(query));
    }

    /**
     * Retrieves all versions of a document by its ID
     * @param id The document ID to retrieve versions for
     * @returns Array of document versions with metadata
     */
    public async getDocumentVersions(id: string): Promise<DocumentMetadata[]> {
        try {
            const versions = await this.collections.documents
                .find({ documentId: new ObjectId(id) })
                .sort({ 'metadata.version': -1 })
                .toArray();

            return versions.map(v => v.metadata);
        } catch (error) {
            this.logger.error('Error retrieving document versions:', error);
            throw new Error('Failed to retrieve document versions');
        }
    }

    private validateConnection(): void {
        if (!this.db) {
            throw new Error('Database not connected');
        }
    }

    private buildSearchQuery(query: DocumentSearchQuery): Record<string, any> {
        const searchQuery: Record<string, any> = { deleted: { $ne: true } };
        if (query.clearance) searchQuery.clearance = query.clearance;
        if (query.releasableTo?.length) searchQuery.releasableTo = { $in: query.releasableTo };
        if (query.coiTags?.length) searchQuery.coiTags = { $all: query.coiTags };
        if (query.lacvCode) searchQuery.lacvCode = query.lacvCode;
        return searchQuery;
    }

    private buildSortOptions(sort?: PaginationOptions['sort']): Record<string, 1 | -1> {
        if (!sort) return { 'metadata.createdAt': -1 };
        return { [sort.field]: sort.order === 'desc' ? -1 : 1 };
    }

    private createDatabaseError(message: string, originalError: unknown): AuthError {
        const error = new Error(message) as AuthError;
        error.statusCode = 500;
        error.code = 'DATABASE_ERROR';
        error.details = {
            originalError: originalError instanceof Error ? originalError.message : 'Unknown error',
            timestamp: new Date()
        };
        return error;
    }

    private convertDocument(doc: WithId<NATODocument>): NATODocument {
        return {
            ...doc,
            _id: doc._id.toString()
        };
    }

    private convertDocuments(docs: WithId<NATODocument>[]): NATODocument[] {
        return docs.map(doc => this.convertDocument(doc));
    }
}

export default DatabaseService.getInstance();
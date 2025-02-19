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
    private db: Db | null = null;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private collection!: Collection<NATODocument>;

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

        const uri = process.env.MONGODB_URI || 'mongodb://mongodb:27017/dive25';
        this.client = new MongoClient(uri, {
            maxPoolSize: 50,
            minPoolSize: 10,
            maxConnecting: 10,
            connectTimeoutMS: this.DB_CONFIG.CONNECTION_TIMEOUT,
            socketTimeoutMS: this.DB_CONFIG.OPERATION_TIMEOUT,
            retryWrites: true,
            retryReads: true
        });
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    public async connect(): Promise<void> {
        try {
            await this.client.connect();
            this.db = this.client.db();
            this.collection = this.db.collection('documents');

            await this.createIndexes();
            await this.validateCollections();

            this.logger.info('Connected to MongoDB');

        } catch (error) {
            this.logger.error('MongoDB connection error:', error);
            this.metrics.recordOperationError('db_connection', error);
            throw error;
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
                this.collection.find(searchQuery)
                    .sort(sort)
                    .skip((options.page - 1) * options.limit)
                    .limit(options.limit)
                    .toArray(),
                this.collection.countDocuments(searchQuery)
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

            const doc = await this.collection.findOne({
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

    public getDb(): Db {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        return this.db;
    }

    public async createDocument(document: Omit<NATODocument, '_id'>): Promise<NATODocument> {
        this.validateConnection();

        try {
            const result = await this.collection.insertOne(document as NATODocument);
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
        const result = await this.collection.findOneAndUpdate(
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
        const result = await this.collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { deleted: true } }
        );
        return result.modifiedCount > 0;
    }

    public async countDocuments(query: DocumentSearchQuery): Promise<number> {
        this.validateConnection();
        return this.collection.countDocuments(this.buildSearchQuery(query));
    }

    /**
     * Retrieves all versions of a document by its ID
     * @param id The document ID to retrieve versions for
     * @returns Array of document versions with metadata
     */
    public async getDocumentVersions(id: string): Promise<DocumentMetadata[]> {
        try {
            const versions = await this.collection
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

    public async disconnect(): Promise<void> {
        try {
            await this.client.close();
            this.db = null;
            this.logger.info('Database disconnected');
        } catch (error) {
            this.logger.error('Error disconnecting from database:', error);
            throw error;
        }
    }

    private async createIndexes(): Promise<void> {
        await this.collection.createIndexes([
            {
                key: { clearance: 1 },
                ...this.DB_CONFIG.INDEX_OPTIONS
            },
            {
                key: { releasableTo: 1 },
                ...this.DB_CONFIG.INDEX_OPTIONS
            },
            {
                key: { coiTags: 1 },
                ...this.DB_CONFIG.INDEX_OPTIONS
            },
            {
                key: { 'metadata.createdAt': 1 },
                ...this.DB_CONFIG.INDEX_OPTIONS
            },
            {
                key: { deleted: 1 },
                ...this.DB_CONFIG.INDEX_OPTIONS
            }
        ]);
    }

    private async validateCollections(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        // Validate required collections exist
        const collections = await this.db.listCollections().toArray();
        const requiredCollections = ['documents', 'audit_logs', 'system_logs'];

        for (const collection of requiredCollections) {
            if (!collections.find(c => c.name === collection)) {
                await this.db.createCollection(collection);
            }
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
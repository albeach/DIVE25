import { Collection, Db, MongoClient, ObjectId, WithId } from 'mongodb';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import { 
    NATODocument,
    DocumentSearchQuery,
    PaginationOptions,
    SearchResult,
    DocumentMetadata,
    ClearanceLevel
} from '../types';
import { config } from '../config/config';

export class DatabaseService {
    private static instance: DatabaseService;
    private client: MongoClient;
    private db: Db | null = null;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private collection!: Collection<NATODocument>;

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.client = new MongoClient(config.mongo.uri);
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
            this.db = this.client.db('dive25');
            this.collection = this.db.collection('documents');
            await this.createIndexes();
        } catch (error) {
            this.logger.error('MongoDB connection error:', error);
            throw error;
        }
    }

    public async searchDocuments(
        query: DocumentSearchQuery,
        options: PaginationOptions
    ): Promise<SearchResult<NATODocument>> {
        this.validateConnection();
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

        // Convert WithId<NATODocument> to NATODocument
        const convertedDocs = documents.map(doc => ({
            ...doc,
            _id: doc._id.toString()
        })) as NATODocument[];

        return {
            data: convertedDocs,
            total,
            page: options.page,
            limit: options.limit
        };
    }

    public async getDocument(id: string): Promise<NATODocument | null> {
        this.validateConnection();
        if (!ObjectId.isValid(id)) return null;
        const doc = await this.collection.findOne({ _id: new ObjectId(id) });
        if (!doc) return null;
        
        // Convert WithId<NATODocument> to NATODocument
        return {
            ...doc,
            _id: doc._id.toString()
        } as NATODocument;
    }

    public async createDocument(document: Omit<NATODocument, '_id'>): Promise<NATODocument> {
        this.validateConnection();
        const result = await this.collection.insertOne(document as NATODocument);
        const created = await this.getDocument(result.insertedId.toString());
        if (!created) throw new Error('Failed to retrieve created document');
        return created;
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
        if (!this.db) throw new Error('Database not connected');
    }

    private async createIndexes(): Promise<void> {
        await this.collection.createIndex({ clearance: 1 });
        await this.collection.createIndex({ releasableTo: 1 });
        await this.collection.createIndex({ coiTags: 1 });
        await this.collection.createIndex({ 'metadata.createdAt': 1 });
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
}

export default DatabaseService.getInstance();
// src/services/DatabaseService.ts - Part 1: Imports and Class Setup

import { 
  MongoClient, 
  Db, 
  Collection, 
  ObjectId,
  IndexSpecification,
  FindOptions,
  UpdateOptions,
  DeleteOptions,
  Sort,
  FindOneAndUpdateOptions,
  IndexDescription
} from 'mongodb';
import { config } from '../config/config';
import { 
  NATODocument, 
  DocumentSearchQuery,
  DocumentSearchOptions,
  SearchResult,
  DocumentMetadata,
  AuthError,
  AuditLogDocument,
  DocumentVersionInfo,
  ValidationResult
} from '../types';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';

export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient;
  private db: Db | null = null;
  private readonly logger: LoggerService;
  private readonly metrics: MetricsService;

  private readonly COLLECTIONS = {
      DOCUMENTS: 'documents',
      VERSIONS: 'document_versions',
      AUDIT_LOGS: 'audit_logs',
      SECURITY_METADATA: 'security_metadata'
  };

  // Index configurations
  private readonly INDEXES: Record<string, IndexDescription[]> = {
      documents: [
          { 
              key: { clearance: 1 },
              name: 'idx_clearance'
          },
          { 
              key: { releasableTo: 1 },
              name: 'idx_releasability'
          },
          { 
              key: { coiTags: 1 },
              name: 'idx_coi_tags'
          },
          { 
              key: { lacvCode: 1 },
              name: 'idx_lacv'
          },
          { 
              key: { 'metadata.createdAt': 1 },
              name: 'idx_created_at'
          },
          { 
              key: { title: 'text', 'metadata.keywords': 'text' },
              name: 'idx_text_search'
          },
          {
              key: { deleted: 1 },
              name: 'idx_deleted'
          }
      ],
      versions: [
          {
              key: { documentId: 1, 'metadata.version': -1 },
              name: 'idx_doc_version'
          }
      ],
      audit_logs: [
          {
              key: { timestamp: 1 },
              name: 'idx_timestamp'
          },
          {
              key: { documentId: 1 },
              name: 'idx_document'
          }
      ]
  };

  private constructor() {
      this.client = new MongoClient(config.mongo.uri, {
          ssl: config.env === 'production',
          retryWrites: true,
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          maxPoolSize: 50,
          minPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
      });

      this.logger = LoggerService.getInstance();
      this.metrics = MetricsService.getInstance();
  }

  public static getInstance(): DatabaseService {
      if (!DatabaseService.instance) {
          DatabaseService.instance = new DatabaseService();
      }
      return DatabaseService.instance;
  }

  // src/services/DatabaseService.ts - Part 2: Connection Management and Database Initialization

  public async connect(): Promise<void> {
    try {
        await this.client.connect();
        this.db = this.client.db('dive25');
        
        this.logger.info('Connected to MongoDB', {
            host: config.mongo.uri.split('@')[1],
            environment: config.env
        });

        await this.initializeDatabase();
        this.metrics.recordDatabaseConnection('connected');

    } catch (error) {
        this.logger.error('MongoDB connection error:', error);
        this.metrics.recordDatabaseConnection('failed');
        throw this.createDatabaseError(error, 'Failed to connect to database');
    }
}

public async disconnect(): Promise<void> {
    try {
        await this.client.close();
        this.db = null;
        this.logger.info('Disconnected from MongoDB');
        this.metrics.recordDatabaseConnection('disconnected');
    } catch (error) {
        this.logger.error('MongoDB disconnection error:', error);
        throw this.createDatabaseError(error, 'Failed to disconnect from database');
    }
}

private async initializeDatabase(): Promise<void> {
    try {
        // Create collections if they don't exist
        for (const collectionName of Object.values(this.COLLECTIONS)) {
            if (!(await this.collectionExists(collectionName))) {
                await this.db!.createCollection(collectionName);
                this.logger.info(`Created collection: ${collectionName}`);
            }
        }

        // Create indexes for each collection
        for (const [collectionName, indexes] of Object.entries(this.INDEXES)) {
            const collection = this.db!.collection(collectionName);
            
            for (const index of indexes) {
                await collection.createIndex(index.key, {
                    name: index.name,
                    background: true
                });
            }
            
            this.logger.info(`Created indexes for collection: ${collectionName}`);
        }

        // Verify database health
        await this.verifyDatabaseHealth();

    } catch (error) {
        this.logger.error('Database initialization error:', error);
        throw this.createDatabaseError(error, 'Failed to initialize database');
    }
}

private async collectionExists(collectionName: string): Promise<boolean> {
    const collections = await this.db!.listCollections().toArray();
    return collections.some(col => col.name === collectionName);
}

private async verifyDatabaseHealth(): Promise<void> {
    try {
        // Check basic connectivity
        await this.db!.command({ ping: 1 });

        // Verify write access
        const testCollection = this.db!.collection('health_check');
        const testDoc = { _id: 'health_check', timestamp: new Date() };
        await testCollection.updateOne(
            { _id: 'health_check' },
            { $set: testDoc },
            { upsert: true }
        );

        // Verify indexes
        for (const [collectionName, indexes] of Object.entries(this.INDEXES)) {
            const collection = this.db!.collection(collectionName);
            const existingIndexes = await collection.indexes();
            
            for (const index of indexes) {
                if (!existingIndexes.some(ei => ei.name === index.name)) {
                    throw new Error(`Missing index ${index.name} in collection ${collectionName}`);
                }
            }
        }

        this.logger.info('Database health check passed');
    } catch (error) {
        this.logger.error('Database health check failed:', error);
        throw this.createDatabaseError(error, 'Database health check failed');
    }
}

private validateDatabaseConnection(): void {
    if (!this.db) {
        throw new Error('Database not connected');
    }
}

public async getCollection<T extends { _id?: any }>(name: string): Promise<Collection<T>> {
    if (!this.db) {
        throw new Error('Database not initialized');
    }
    return this.db.collection<T>(name);
}

// src/services/DatabaseService.ts - Part 3: Document Operations

public async searchDocuments(
  query: DocumentSearchQuery,
  options: DocumentSearchOptions
): Promise<SearchResult<NATODocument>> {
  try {
      this.validateDatabaseConnection();
      
      const collection = await this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      const searchQuery = this.buildSearchQuery(query);
      
      const skip = (options.page - 1) * options.limit;
      const sort: Sort = options.sort ? 
          { [options.sort.field]: options.sort.order === 'desc' ? -1 : 1 } :
          { 'metadata.createdAt': -1 };

      const [documents, total] = await Promise.all([
          collection
              .find(searchQuery)
              .sort(sort)
              .skip(skip)
              .limit(options.limit)
              .toArray(),
          collection.countDocuments(searchQuery)
      ]);

      await this.recordDocumentAccess(null, 'search', { 
          query: searchQuery,
          resultCount: documents.length
      });

      return {
          documents: documents as NATODocument[],
          total
      };

  } catch (error) {
      this.logger.error('Error searching documents:', error);
      throw this.createDatabaseError(error, 'Failed to search documents');
  }
}

public async getDocument(id: string): Promise<NATODocument | null> {
  try {
      this.validateDatabaseConnection();

      if (!ObjectId.isValid(id)) {
          throw new Error('Invalid document ID format');
      }

      const collection = await this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      const document = await collection.findOne({ 
          _id: new ObjectId(id),
          deleted: { $ne: true }
      });

      if (document) {
          await this.recordDocumentAccess(id, 'read');
      }

      return document;

  } catch (error) {
      this.logger.error('Error retrieving document:', error);
      throw this.createDatabaseError(error, 'Failed to retrieve document');
  }
}

public async createDocument(document: Omit<NATODocument, '_id'>): Promise<NATODocument> {
  try {
      this.validateDatabaseConnection();
      this.validateDocumentStructure(document);

      const collection = await this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      
      const documentToInsert = {
          ...document,
          metadata: {
              ...document.metadata,
              createdAt: new Date(),
              lastModified: new Date(),
              version: 1
          }
      };

      const result = await collection.insertOne(documentToInsert);
      const createdDocument = await this.getDocument(result.insertedId.toString());
      
      if (!createdDocument) {
          throw new Error('Failed to retrieve created document');
      }

      await this.recordDocumentAccess(
          result.insertedId.toString(),
          'create',
          { clearance: createdDocument.clearance }
      );

      return createdDocument;

  } catch (error) {
      this.logger.error('Error creating document:', error);
      throw this.createDatabaseError(error, 'Failed to create document');
  }
}

public async updateDocument(
  id: string,
  update: Partial<NATODocument>,
  options: UpdateOptions = {}
): Promise<NATODocument | null> {
  try {
      this.validateDatabaseConnection();

      if (!ObjectId.isValid(id)) {
          throw new Error('Invalid document ID format');
      }

      const currentDocument = await this.getDocument(id);
      if (!currentDocument) {
          throw new Error('Document not found');
      }

      this.validateSecurityChanges(currentDocument, update);

      const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
      const versionsCollection = await this.getCollection(this.COLLECTIONS.VERSIONS);

      // Store current version
      await versionsCollection.insertOne({
          documentId: new ObjectId(id),
          ...currentDocument,
          _id: new ObjectId()
      });

      // Update document
      const updateResult = await collection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { 
              $set: {
                  ...update,
                  'metadata.lastModified': new Date(),
                  'metadata.version': currentDocument.metadata.version + 1
              }
          },
          { ...options, returnDocument: 'after' } as FindOneAndUpdateOptions
      );

      if (updateResult) {
          await this.recordDocumentAccess(id, 'update', {
              oldVersion: currentDocument.metadata.version,
              newVersion: (updateResult as unknown as NATODocument).metadata.version
          });
      }

      return updateResult as unknown as NATODocument;

  } catch (error) {
      this.logger.error('Error updating document:', error);
      throw this.createDatabaseError(error, 'Failed to update document');
  }
}

// src/services/DatabaseService.ts - Part 4: Delete Operations, Version Management, and Utilities

public async deleteDocument(id: string): Promise<boolean> {
  try {
      this.validateDatabaseConnection();

      if (!ObjectId.isValid(id)) {
          throw new Error('Invalid document ID format');
      }

      const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
      const versionsCollection = await this.getCollection(this.COLLECTIONS.VERSIONS);

      // Store final version before deletion
      const document = await this.getDocument(id);
      if (document) {
          await versionsCollection.insertOne({
              documentId: new ObjectId(id),
              ...document,
              _id: new ObjectId(),
              deletedAt: new Date()
          });
      }

      // Perform soft delete
      const result = await collection.updateOne(
          { _id: new ObjectId(id) },
          { 
              $set: { 
                  deleted: true,
                  deletedAt: new Date()
              }
          }
      );

      if (result.modifiedCount > 0) {
          await this.recordDocumentAccess(id, 'delete');
      }

      return result.modifiedCount === 1;

  } catch (error) {
      this.logger.error('Error deleting document:', error);
      throw this.createDatabaseError(error, 'Failed to delete document');
  }
}

public async getDocumentVersions(id: string): Promise<DocumentVersionInfo[]> {
  try {
      this.validateDatabaseConnection();

      if (!ObjectId.isValid(id)) {
          throw new Error('Invalid document ID format');
      }

      const versionsCollection = await this.getCollection(this.COLLECTIONS.VERSIONS);
      const versions = await versionsCollection
          .find({ documentId: new ObjectId(id) })
          .sort({ 'metadata.version': -1 })
          .toArray();

      return versions.map(v => ({
          version: v.metadata.version,
          timestamp: v.metadata.lastModified,
          modifiedBy: v.metadata.lastModifiedBy,
          changes: v.metadata.changes || [],
          deletedAt: v.deletedAt
      }));

  } catch (error) {
      this.logger.error('Error retrieving document versions:', error);
      throw this.createDatabaseError(error, 'Failed to retrieve document versions');
  }
}

private buildSearchQuery(query: DocumentSearchQuery): any {
  const searchQuery: any = {
      deleted: { $ne: true }
  };

  if (query.clearance) {
      searchQuery.clearance = query.clearance;
  }

  if (query.releasableTo?.length) {
      searchQuery.releasableTo = { $in: query.releasableTo };
  }

  if (query.coiTags?.length) {
      searchQuery.coiTags = { $all: query.coiTags };
  }

  if (query.lacvCode) {
      searchQuery.lacvCode = query.lacvCode;
  }

  if (query.dateRange) {
      searchQuery['metadata.createdAt'] = {
          $gte: new Date(query.dateRange.start),
          $lte: new Date(query.dateRange.end)
      };
  }

  if (query.keywords) {
      searchQuery.$text = { $search: query.keywords };
  }

  // Apply maxClearance filter if specified
  if (query.maxClearance) {
      searchQuery.clearance = {
          $in: this.getClearanceLevelsUpTo(query.maxClearance)
      };
  }

  return searchQuery;
}

private getClearanceLevelsUpTo(maxClearance: string): string[] {
  const levels = [
      'UNCLASSIFIED',
      'RESTRICTED',
      'NATO CONFIDENTIAL',
      'NATO SECRET',
      'COSMIC TOP SECRET'
  ];
  const maxIndex = levels.indexOf(maxClearance);
  return levels.slice(0, maxIndex + 1);
}

private async recordDocumentAccess(
  documentId: string | null,
  action: string,
  details?: Record<string, any>
): Promise<void> {
  try {
      const collection = await this.getCollection<AuditLogDocument>(this.COLLECTIONS.AUDIT_LOGS);
      
      await collection.insertOne({
          documentId: documentId ? new ObjectId(documentId) : null,
          action,
          timestamp: new Date(),
          details
      });

      // Record metric
      this.metrics.recordDocumentOperation(action, {
          documentId,
          ...details
      });

  } catch (error) {
      this.logger.error('Error recording document access:', error);
      // Don't throw - we don't want audit logging to break main operations
  }
}

// src/services/DatabaseService.ts - Part 5: Validation Methods and Error Handling

private validateDocumentStructure(document: Omit<NATODocument, '_id'>): void {
  const requiredFields = ['title', 'clearance', 'releasableTo', 'metadata'];
  
  for (const field of requiredFields) {
      if (!(field in document)) {
          throw new Error(`Missing required field: ${field}`);
      }
  }

  // Validate metadata structure
  const requiredMetadata = ['createdBy'];
  if (!document.metadata) {
      throw new Error('Missing metadata object');
  }
  
  for (const field of requiredMetadata) {
      if (!(field in document.metadata)) {
          throw new Error(`Missing required metadata field: ${field}`);
      }
  }

  // Validate clearance level
  if (!this.isValidClearanceLevel(document.clearance)) {
      throw new Error('Invalid clearance level');
  }

  // Validate releasability markers
  if (!Array.isArray(document.releasableTo) || document.releasableTo.length === 0) {
      throw new Error('Document must have at least one releasability marker');
  }

  // Validate COI tags if present
  if (document.coiTags && !this.validateCoiTags(document.coiTags)) {
      throw new Error('Invalid COI tags');
  }

  // Validate LACV code if present
  if (document.lacvCode && !this.validateLacvCode(document.lacvCode)) {
      throw new Error('Invalid LACV code');
  }
}

private validateSecurityChanges(
  currentDocument: NATODocument,
  update: Partial<NATODocument>
): void {
  if (update.clearance) {
      const currentLevel = this.getClearanceLevel(currentDocument.clearance);
      const newLevel = this.getClearanceLevel(update.clearance);
      
      if (newLevel < currentLevel) {
          throw new Error('Cannot downgrade document security classification');
      }
  }

  // Validate releasability changes
  if (update.releasableTo && update.releasableTo.length === 0) {
      throw new Error('Document must maintain at least one releasability marker');
  }
}

private isValidClearanceLevel(clearance: string): boolean {
  const validLevels = [
      'UNCLASSIFIED',
      'RESTRICTED',
      'NATO CONFIDENTIAL',
      'NATO SECRET',
      'COSMIC TOP SECRET'
  ];
  return validLevels.includes(clearance);
}

private validateCoiTags(tags: string[]): boolean {
  const validTags = [
      'OpAlpha',
      'OpBravo',
      'OpGamma',
      'MissionX',
      'MissionZ'
  ];
  return tags.every(tag => validTags.includes(tag));
}

private validateLacvCode(code: string): boolean {
  const validCodes = [
      'LACV001',
      'LACV002',
      'LACV003',
      'LACV004'
  ];
  return validCodes.includes(code);
}

private getClearanceLevel(clearance: string): number {
  const levels: Record<string, number> = {
      'UNCLASSIFIED': 0,
      'RESTRICTED': 1,
      'NATO CONFIDENTIAL': 2,
      'NATO SECRET': 3,
      'COSMIC TOP SECRET': 4
  };
  return levels[clearance] || 0;
}

private createDatabaseError(error: unknown, message: string): AuthError {
  const dbError = new Error(message) as AuthError;
  
  if (error instanceof Error) {
      dbError.statusCode = 500;
      dbError.code = this.getDatabaseErrorCode(error);
      dbError.details = {
          originalError: error.message,
          timestamp: new Date(),
          operation: message
      };
  } else {
      dbError.statusCode = 500;
      dbError.code = 'DB_UNKNOWN_ERROR';
      dbError.details = {
          timestamp: new Date(),
          operation: message
      };
  }

  return dbError;
}

private getDatabaseErrorCode(error: Error): string {
  const errorMessage = error.message.toLowerCase();
  
  // Map common MongoDB errors to specific codes
  if (errorMessage.includes('duplicate key')) {
      return 'DB_DUPLICATE_KEY';
  }
  if (errorMessage.includes('validation failed')) {
      return 'DB_VALIDATION_ERROR';
  }
  if (errorMessage.includes('not found')) {
      return 'DB_NOT_FOUND';
  }
  if (errorMessage.includes('timeout')) {
      return 'DB_TIMEOUT';
  }
  if (errorMessage.includes('authentication failed')) {
      return 'DB_AUTH_ERROR';
  }

  return 'DB_INTERNAL_ERROR';
}

public async healthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'down';
  details: Record<string, any>;
}> {
  try {
      this.validateDatabaseConnection();
      
      // Check basic connectivity
      await this.db!.command({ ping: 1 });
      
      // Get database stats
      const stats = await this.db!.stats();
      
      // Check replication status if applicable
      let replicationStatus = null;
      if (config.mongo.replicaSet) {
          replicationStatus = await this.db!.admin().replSetGetStatus();
      }

      return {
          status: 'healthy',
          details: {
              stats,
              replicationStatus,
              timestamp: new Date()
          }
      };

  } catch (error) {
      this.logger.error('Database health check failed:', error);
      
      return {
          status: 'down',
          details: {
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date()
          }
      };
  }
}
}

export default DatabaseService.getInstance();
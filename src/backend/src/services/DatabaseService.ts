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
  PaginationOptions,
  DocumentMetadata,
  AuthError,
  AuditLogDocument,
  DocumentVersionInfo
} from '../types';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';

/**
* Service responsible for all database operations in the NATO document system.
* Implements secure document storage, retrieval, and querying while maintaining
* NATO security classifications and access controls.
*/
export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient;
  private db: Db | null = null;
  private readonly logger: LoggerService;
  private readonly metrics: MetricsService;

  // Collection names - keeping them as constants for consistency
  private readonly COLLECTIONS = {
      DOCUMENTS: 'documents',
      AUDIT_LOGS: 'audit_logs',
      SECURITY_METADATA: 'security_metadata'
  };

  private constructor() {
      // Initialize MongoDB client with proper security options
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

  /**
   * Establishes connection to MongoDB and initializes required indexes
   * for optimal query performance and security enforcement.
   */
  public async connect(): Promise<void> {
      try {
          await this.client.connect();
          this.db = this.client.db('dive25');
          
          this.logger.info('Connected to MongoDB', {
              host: config.mongo.uri.split('@')[1]
          });

          // Initialize database indexes and schemas
          await this.initializeDatabase();
          
          // Record successful connection
          this.metrics.recordDatabaseConnection('connected');

      } catch (error) {
          this.logger.error('MongoDB connection error:', error);
          this.metrics.recordDatabaseConnection('failed');
          throw new Error('Failed to connect to database');
      }
  }

  /**
   * Gracefully closes database connection, ensuring all operations
   * are properly completed before shutdown.
   */
  public async disconnect(): Promise<void> {
      try {
          await this.client.close();
          this.db = null;
          this.logger.info('Disconnected from MongoDB');
          this.metrics.recordDatabaseConnection('disconnected');
      } catch (error) {
          this.logger.error('MongoDB disconnection error:', error);
          throw new Error('Failed to disconnect from database');
      }
  }

  /**
   * Retrieves a document by ID with proper security metadata.
   * Includes versioning information and audit trail.
   */
  public async getDocument(id: string): Promise<NATODocument | null> {
      try {
          this.validateDatabaseConnection();

          if (!ObjectId.isValid(id)) {
              throw new Error('Invalid document ID format');
          }

          const collection = await this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
          const document = await collection.findOne({ _id: new ObjectId(id) });

          if (document) {
              // Record successful retrieval
              await this.recordDocumentAccess(id, 'read');
          }

          return document as NATODocument | null;

      } catch (error) {
          this.logger.error('Error retrieving document:', error);
          throw this.createDatabaseError(error, 'Failed to retrieve document');
      }
  }

  /**
   * Searches for documents based on provided criteria with pagination.
   * Enforces security classifications in query results.
   */
  public async searchDocuments(
      query: DocumentSearchQuery,
      options: PaginationOptions
  ): Promise<NATODocument[]> {
      try {
          this.validateDatabaseConnection();
          
          const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
          const searchQuery = this.buildSearchQuery(query);
          
          const {
              page = 1,
              limit = 10,
              sort = { 'metadata.createdAt': -1 }
          } = options;

          // Execute search with proper indexing
          const documents = await collection
              .find(searchQuery)
              .sort(sort as Sort)
              .skip((page - 1) * limit)
              .limit(limit)
              .toArray();

          // Record search operation
          await this.recordDocumentAccess(null, 'search', { query });

          return documents as NATODocument[];

      } catch (error) {
          this.logger.error('Error searching documents:', error);
          throw this.createDatabaseError(error, 'Failed to search documents');
      }
  }

  /**
   * Creates a new document with proper security metadata and versioning.
   * Ensures all required security attributes are present.
   */
  public async createDocument(
      document: Omit<NATODocument, '_id'>
  ): Promise<NATODocument> {
      try {
          this.validateDatabaseConnection();
          
          // Validate document structure
          this.validateDocumentStructure(document);

          const collection = await this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
          
          // Add system metadata
          const documentToInsert = {
              ...document,
              metadata: {
                  ...document.metadata,
                  version: 1,
                  createdAt: new Date(),
                  lastModified: new Date()
              }
          };

          const result = await collection.insertOne(documentToInsert);
          
          // Retrieve the created document
          const createdDocument = await this.getDocument(result.insertedId.toString());
          if (!createdDocument) {
              throw new Error('Failed to retrieve created document');
          }

          // Record creation in audit log
          await this.recordDocumentAccess(
              createdDocument._id!.toString(),
              'create',
              { clearance: createdDocument.clearance }
          );

          return createdDocument;

      } catch (error) {
          this.logger.error('Error creating document:', error);
          throw this.createDatabaseError(error, 'Failed to create document');
      }
  }

  /**
   * Updates an existing document while maintaining version history.
   * Ensures security classifications cannot be downgraded.
   */
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

          const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
          
          // Get current document for version tracking
          const currentDocument = await this.getDocument(id);
          if (!currentDocument) {
              throw new Error('Document not found');
          }

          // Validate security classification changes
          this.validateSecurityChanges(currentDocument, update);

          // Prepare update with version increment
          const updateDocument = {
              ...update,
              'metadata.lastModified': new Date(),
              'metadata.version': currentDocument.metadata.version + 1
          };

          const result = await (await collection).findOneAndUpdate(
              { _id: new ObjectId(id) },
              { $set: updateDocument },
              { ...options, returnDocument: 'after' } as FindOneAndUpdateOptions
          );

          // Record update in audit log
          if (result) {
              await this.recordDocumentAccess(id, 'update', { 
                  oldVersion: currentDocument.metadata.version,
                  newVersion: (result as unknown as NATODocument).metadata.version
              });
          }

          return result as NATODocument | null;

      } catch (error) {
          this.logger.error('Error updating document:', error);
          throw this.createDatabaseError(error, 'Failed to update document');
      }
  }

  // src/services/DatabaseService.ts

public async getDocumentVersions(id: string): Promise<DocumentVersionInfo[]> {
  try {
      this.validateDatabaseConnection();
      
      if (!ObjectId.isValid(id)) {
          throw new Error('Invalid document ID format');
      }

      const collection = await this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      const versionsCollection = await this.getCollection('document_versions');

      const versions = await versionsCollection
          .find({ documentId: new ObjectId(id) })
          .sort({ 'metadata.version': -1 })
          .toArray();

      return versions.map(v => ({
          version: (v as unknown as NATODocument).metadata.version,
          timestamp: (v as unknown as NATODocument).metadata.lastModified,
          modifiedBy: (v as unknown as NATODocument).metadata.lastModifiedBy,
          changes: (v as unknown as NATODocument).metadata.changes || []
      }));

  } catch (error) {
      this.logger.error('Error retrieving document versions:', error);
      throw this.createDatabaseError(error, 'Failed to retrieve document versions');
  }
}

  /**
   * Marks a document as deleted while maintaining audit trail.
   * Implements soft delete for compliance with NATO regulations.
   */
  public async deleteDocument(
      id: string,
      options: DeleteOptions = {}
  ): Promise<boolean> {
      try {
          this.validateDatabaseConnection();

          if (!ObjectId.isValid(id)) {
              throw new Error('Invalid document ID format');
          }

          // Implement soft delete instead of actual deletion
          const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
          const result = await (await collection).updateOne(
              { _id: new ObjectId(id) },
              { 
                  $set: { 
                      deleted: true,
                      deletedAt: new Date()
                  }
              }
          );

          // Record deletion in audit log
          if (result.modifiedCount > 0) {
              await this.recordDocumentAccess(id, 'delete');
          }

          return result.modifiedCount === 1;

      } catch (error) {
          this.logger.error('Error deleting document:', error);
          throw this.createDatabaseError(error, 'Failed to delete document');
      }
  }

  /**
   * Counts documents matching search criteria.
   * Used for pagination and metrics.
   */
  public async countDocuments(query: DocumentSearchQuery): Promise<number> {
      try {
          this.validateDatabaseConnection();
          const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
          const searchQuery = this.buildSearchQuery(query);
          return await (await collection).countDocuments(searchQuery);
      } catch (error) {
          this.logger.error('Error counting documents:', error);
          throw this.createDatabaseError(error, 'Failed to count documents');
      }
  }

  // Private helper methods

  /**
   * Initializes database with required indexes and schemas.
   */
  private async initializeDatabase(): Promise<void> {
      try {
          const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
          
          // Create indexes for optimal query performance
          const indexes: IndexDescription[] = [
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
              }
          ];

          // Create indexes in background
          await Promise.all(
              indexes.map(index => 
                  collection.createIndex(index.key, {
                      background: true,
                      name: index.name
                  })
              )
          );

          this.logger.info('Database indexes created successfully');

      } catch (error) {
          this.logger.error('Error creating database indexes:', error);
          throw new Error('Failed to initialize database');
      }
  }

  /**
   * Builds MongoDB query from search parameters.
   */
  private buildSearchQuery(query: DocumentSearchQuery): any {
      const searchQuery: any = {};

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

      // Exclude deleted documents by default
      searchQuery.deleted = { $ne: true };

      return searchQuery;
  }

  /**
   * Records document access in audit trail.
   */
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

          // Update metrics
          this.metrics.recordDocumentOperation(action);

      } catch (error) {
          this.logger.error('Error recording document access:', error);
          // Don't throw - we don't want audit logging to break main operations
      }
  }

  /**
   * Validates document structure before database operations.
   */
  private validateDocumentStructure(document: Omit<NATODocument, '_id'>): void {
      const requiredFields = ['title', 'clearance', 'releasableTo', 'metadata'];
      
      for (const field of requiredFields) {
          if (!(field in document)) {
              throw new Error(`Missing required field: ${field}`);
          }
      }

      // Validate metadata structure
      const requiredMetadata = ['createdBy'];
      for (const field of requiredMetadata) {
          if (!(field in document.metadata)) {
              throw new Error(`Missing required metadata field: ${field}`);
          }
      }
  }

  /**
   * Validates security classification changes during updates.
   */
  private validateSecurityChanges(
      currentDocument: NATODocument,
      update: Partial<NATODocument>
  ): void {
      if (update.clearance) {
          const currentLevel = this.getSecurityLevel(currentDocument.clearance);
          const newLevel = this.getSecurityLevel(update.clearance);
          
          if (newLevel < currentLevel) {
              throw new Error('Cannot downgrade document security classification');
          }
      }
  }

  /**
   * Gets numeric security level for comparison.
   */
  private getSecurityLevel(clearance: string): number {
      const levels: Record<string, number> = {
          'UNCLASSIFIED': 0,
          'RESTRICTED': 1,
          'NATO CONFIDENTIAL': 2,
          'NATO SECRET': 3,
          'COSMIC TOP SECRET': 4
      };
      return levels[clearance] || 0;
  }

  /**
   * Validates database connection exists.
   */
  private validateDatabaseConnection(): void {
      if (!this.db) {
          throw new Error('Database not connected');
      }
  }

  /**
   * Gets collection with proper typing.
   */
  public async getCollection<T extends { _id?: any }>(name: string): Promise<Collection<T>> {
      if (!this.db) {
          throw new Error('Database not initialized');
      }
      return this.db.collection<T>(name);
  }

  /**
   * Creates typed database error.
   */
/**
     * Creates typed database error with proper error codes and metadata.
     */
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

/**
* Maps database errors to specific error codes for better error handling.
*/
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

/**
* Performs database health check.
*/
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

/**
* Validates and repairs database consistency if needed.
* Should be run during maintenance windows.
*/
public async validateDatabaseIntegrity(): Promise<{
  success: boolean;
  issues: string[];
  repaired: string[];
}> {
  try {
      this.validateDatabaseConnection();
      
      const issues: string[] = [];
      const repaired: string[] = [];

      // Check document integrity
      const collection = await this.getCollection(this.COLLECTIONS.DOCUMENTS);
      const documents = await collection
          .find({})
          .toArray();

      for (const doc of documents) {
          // Check required fields
          if (!this.validateDocumentIntegrity(doc)) {
              issues.push(`Document ${doc._id} missing required fields`);
              
              // Attempt repair if possible
              if (await this.repairDocument(doc._id)) {
                  repaired.push(`Document ${doc._id} repaired`);
              }
          }
      }

      return {
          success: issues.length === 0 || repaired.length === issues.length,
          issues,
          repaired
      };

  } catch (error) {
      this.logger.error('Database integrity check failed:', error);
      throw this.createDatabaseError(error, 'Failed to validate database integrity');
  }
}

/**
* Validates individual document integrity.
*/
private validateDocumentIntegrity(document: any): boolean {
  // Check required fields
  const requiredFields = [
      'title',
      'clearance',
      'releasableTo',
      'metadata.createdAt',
      'metadata.createdBy',
      'metadata.version'
  ];

  return requiredFields.every(field => {
      const value = field.split('.').reduce((obj, key) => obj?.[key], document);
      return value !== undefined && value !== null;
  });
}

/**
* Attempts to repair document integrity issues.
*/
private async repairDocument(documentId: ObjectId): Promise<boolean> {
  try {
      const collection = await this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      const document = await collection.findOne({ _id: documentId });

      if (!document) {
          return false;
      }

      // Apply repair operations
      const updates: Record<string, any> = {};

      // Ensure metadata exists
      if (!document.metadata) {
          updates.metadata = {
              createdAt: new Date(),
              createdBy: 'system_repair',
              version: 1,
              lastModified: new Date()
          };
      }

      // Ensure required fields have default values
      if (!document.clearance) {
          updates.clearance = 'UNCLASSIFIED';
      }
      if (!document.releasableTo) {
          updates.releasableTo = ['NATO'];
      }

      // Apply repairs if needed
      if (Object.keys(updates).length > 0) {
          await collection.updateOne(
              { _id: documentId },
              { $set: updates }
          );

          // Record repair in audit log
          await this.recordDocumentAccess(
              documentId.toString(),
              'repair',
              { updates }
          );

          return true;
      }

      return false;

  } catch (error) {
      this.logger.error('Document repair failed:', error);
      return false;
  }
}
}

export default DatabaseService.getInstance();